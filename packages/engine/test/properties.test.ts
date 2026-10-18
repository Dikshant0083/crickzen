import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  availableBatters,
  type Delivery,
  eligibleBowlers,
  type MatchEvent,
  type MatchState,
  reduce,
  replay,
  totalExtras,
} from '../src/index.js';
import { event, resetIds, Scorer } from './helpers.js';

/** A scoring intent, resolved against live state into a legal event. */
type Command =
  | { t: 'runs'; n: 0 | 1 | 2 | 3 | 4 | 5 | 6 }
  | { t: 'wide'; extra: number }
  | { t: 'noball'; off: 0 | 1 | 2 | 3 | 4 | 5 | 6; byes: number }
  | { t: 'bye'; n: number }
  | { t: 'legbye'; n: number }
  | {
      t: 'wicket';
      kind: 'bowled' | 'caught' | 'run_out';
      outNonStriker: boolean;
      crossed: boolean;
    };

const command: fc.Arbitrary<Command> = fc.oneof(
  {
    weight: 10,
    arbitrary: fc.record({
      t: fc.constant('runs' as const),
      n: fc.constantFrom(0, 1, 2, 3, 4, 6) as fc.Arbitrary<0 | 1 | 2 | 3 | 4 | 5 | 6>,
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      t: fc.constant('wide' as const),
      extra: fc.integer({ min: 0, max: 4 }),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      t: fc.constant('noball' as const),
      off: fc.constantFrom(0, 1, 2, 4, 6) as fc.Arbitrary<0 | 1 | 2 | 3 | 4 | 5 | 6>,
      byes: fc.integer({ min: 0, max: 2 }),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({ t: fc.constant('bye' as const), n: fc.integer({ min: 1, max: 4 }) }),
  },
  {
    weight: 2,
    arbitrary: fc.record({ t: fc.constant('legbye' as const), n: fc.integer({ min: 1, max: 4 }) }),
  },
  {
    weight: 3,
    arbitrary: fc.record({
      t: fc.constant('wicket' as const),
      kind: fc.constantFrom('bowled' as const, 'caught' as const, 'run_out' as const),
      outNonStriker: fc.boolean(),
      crossed: fc.boolean(),
    }),
  },
);

/**
 * Drive the engine with a command stream, resolving each command against live
 * state so only legal events are produced. Stops when the innings closes.
 */
function scoreInnings(commands: readonly Command[], xiSize = 11): Scorer {
  const scorer = Scorer.live({ format: 'T20', xiSize });

  for (const cmd of commands) {
    const state = scorer.expectState();
    const index = state.currentInningsIndex;
    if (index === null) break;
    const innings = state.innings[index];
    if (innings === undefined || innings.closed) break;

    if (innings.bowlerId === null) {
      const next = eligibleBowlers(state)[0];
      if (next === undefined) break;
      scorer.bowler(next);
    }

    const delivery = resolveCommand(cmd, state);
    if (delivery === null) continue;
    scorer.ball(delivery);
  }

  return scorer;
}

function resolveCommand(cmd: Command, state: MatchState): Delivery | null {
  const innings = state.innings[state.currentInningsIndex ?? 0];
  if (innings === undefined) return null;
  const { strikerId, nonStrikerId, freeHit } = innings;
  if (strikerId === null || nonStrikerId === null) return null;

  switch (cmd.t) {
    case 'runs':
      return { runsOffBat: cmd.n };
    case 'wide':
      return { runsOffBat: 0, extra: { type: 'wide', runs: cmd.extra } };
    case 'noball':
      return { runsOffBat: cmd.off, extra: { type: 'noball', runs: cmd.byes } };
    case 'bye':
      return { runsOffBat: 0, extra: { type: 'bye', runs: cmd.n } };
    case 'legbye':
      return { runsOffBat: 0, extra: { type: 'legbye', runs: cmd.n } };
    case 'wicket': {
      // Only a run out is possible on a free hit.
      const kind = freeHit ? 'run_out' : cmd.kind;
      const playerOutId = cmd.outNonStriker && kind === 'run_out' ? nonStrikerId : strikerId;
      const incoming = availableBatters(state, innings)[0];
      // The fielder must actually be in the fielding XI, which is smaller than
      // eleven in some of these runs.
      const fielder = state.squads[innings.bowlingTeamId]?.playingXI.find(
        (id) => id !== innings.bowlerId,
      );
      if (kind !== 'bowled' && fielder === undefined) return { runsOffBat: 0 };

      return {
        runsOffBat: 0,
        wicket: {
          kind,
          playerOutId,
          ...(kind === 'bowled' || fielder === undefined ? {} : { fielderIds: [fielder] }),
          ...(kind === 'run_out' ? { battersCrossed: cmd.crossed } : {}),
          ...(incoming === undefined ? {} : { incomingBatterId: incoming }),
        },
      };
    }
  }
}

const commandStream = fc.array(command, { minLength: 1, maxLength: 160 });

describe('invariants over arbitrary innings (ARCHITECTURE §8)', () => {
  it('reconciles the team total against batter runs, extras and penalties', () => {
    fc.assert(
      fc.property(commandStream, (commands) => {
        resetIds();
        const innings = scoreInnings(commands).innings();
        const batterRuns = Object.values(innings.batters).reduce((sum, b) => sum + b.runs, 0);

        expect(batterRuns + totalExtras(innings.extras)).toBe(innings.runs);
      }),
      { numRuns: 200 },
    );
  });

  it('matches legal balls bowled against the sum over bowlers', () => {
    fc.assert(
      fc.property(commandStream, (commands) => {
        resetIds();
        const innings = scoreInnings(commands).innings();
        const bowlerBalls = Object.values(innings.bowlers).reduce((sum, b) => sum + b.balls, 0);

        expect(bowlerBalls).toBe(innings.legalBalls);
      }),
      { numRuns: 200 },
    );
  });

  it('never lets wickets exceed the playing XI less one', () => {
    fc.assert(
      fc.property(commandStream, fc.integer({ min: 3, max: 11 }), (commands, xiSize) => {
        resetIds();
        const innings = scoreInnings(commands, xiSize).innings();

        expect(innings.wickets).toBeLessThanOrEqual(xiSize - 1);
        expect(innings.fallOfWickets).toHaveLength(innings.wickets);
      }),
      { numRuns: 150 },
    );
  });

  it('never bowls more legal balls than the innings allows', () => {
    fc.assert(
      fc.property(commandStream, (commands) => {
        resetIds();
        const innings = scoreInnings(commands).innings();

        expect(innings.legalBalls).toBeLessThanOrEqual(innings.totalOvers * 6);
      }),
      { numRuns: 150 },
    );
  });

  it('keeps the two ends occupied by different players while the innings is open', () => {
    fc.assert(
      fc.property(commandStream, (commands) => {
        resetIds();
        const innings = scoreInnings(commands).innings();
        if (innings.closed) return;

        expect(innings.strikerId).not.toBe(innings.nonStrikerId);
      }),
      { numRuns: 150 },
    );
  });

  it('charges each bowler no more than the runs that passed through their overs', () => {
    fc.assert(
      fc.property(commandStream, (commands) => {
        resetIds();
        const innings = scoreInnings(commands).innings();
        const bowlerRuns = Object.values(innings.bowlers).reduce((sum, b) => sum + b.runs, 0);

        // Byes, leg-byes and penalties are charged to nobody.
        const notTheBowlers =
          innings.extras.byes + innings.extras.legbyes + innings.extras.penalties;
        expect(bowlerRuns).toBe(innings.runs - notTheBowlers);
      }),
      { numRuns: 200 },
    );
  });

  it('counts every batter dismissal against a fall of wicket', () => {
    fc.assert(
      fc.property(commandStream, (commands) => {
        resetIds();
        const innings = scoreInnings(commands).innings();
        const dismissed = Object.values(innings.batters).filter((b) => b.status === 'out');

        expect(dismissed).toHaveLength(innings.fallOfWickets.length);
      }),
      { numRuns: 150 },
    );
  });
});

describe('determinism and replay equivalence (ARCHITECTURE §3.4)', () => {
  it('produces identical state when the same log is replayed twice', () => {
    fc.assert(
      fc.property(commandStream, (commands) => {
        resetIds();
        const events = scoreInnings(commands).events;

        const first = replay(events);
        const second = replay(events);

        expect(first).toEqual(second);
      }),
      { numRuns: 100 },
    );
  });

  it('agrees with incrementally chaining reduce', () => {
    fc.assert(
      fc.property(commandStream, (commands) => {
        resetIds();
        const events = scoreInnings(commands).events;

        let incremental: MatchState | null = null;
        for (const e of events) {
          const result = reduce(incremental, e);
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          incremental = result.value;
        }

        const replayed = replay(events);
        expect(replayed.ok).toBe(true);
        if (replayed.ok) expect(replayed.value).toEqual(incremental);
      }),
      { numRuns: 100 },
    );
  });

  it('returns to the same state when a ball is voided and re-recorded', () => {
    fc.assert(
      fc.property(commandStream, (commands) => {
        resetIds();
        const scorer = scoreInnings(commands);
        const state = scorer.expectState();
        const innings = state.innings[state.currentInningsIndex ?? 0];
        const lastBall = innings?.balls[innings.balls.length - 1];
        if (lastBall === undefined || innings === undefined || innings.closed) return;

        const baseline = replay(scorer.events);
        expect(baseline.ok).toBe(true);
        if (!baseline.ok) return;

        // Void the last ball, then record an identical one.
        const source = scorer.events.find((e) => e.id === lastBall.eventId);
        if (source === undefined || source.payload.kind !== 'delivery.recorded') return;

        const rebuilt: MatchEvent[] = [
          ...scorer.events,
          event({ kind: 'delivery.voided', targetEventId: lastBall.eventId }),
          event({ kind: 'delivery.recorded', delivery: source.payload.delivery }),
        ];

        const after = replay(rebuilt);
        expect(after.ok).toBe(true);
        if (!after.ok) return;

        const strip = (s: MatchState) => ({
          ...s,
          appliedEventIds: [],
          voidedEventIds: [],
          innings: s.innings.map((i) => ({
            ...i,
            balls: i.balls.map((b) => ({ ...b, eventId: '' })),
          })),
        });

        expect(strip(after.value)).toEqual(strip(baseline.value));
      }),
      { numRuns: 100 },
    );
  });
});
