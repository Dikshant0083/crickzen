import {
  type CreateConfigInput,
  createMatchConfig,
  type Delivery,
  type DismissalKind,
  type MatchEvent,
  type MatchState,
  type Payload,
  type PlayerId,
  type Result,
  type RuleViolation,
  reduce,
  replay,
} from '../src/index.js';

export const TEAM_A = 'IND';
export const TEAM_B = 'AUS';

export const squadA: PlayerId[] = Array.from({ length: 11 }, (_, i) => `a${i + 1}`);
export const squadB: PlayerId[] = Array.from({ length: 11 }, (_, i) => `b${i + 1}`);

let counter = 0;

/** Deterministic, ordered ids — the engine never generates its own. */
export function nextId(): string {
  counter += 1;
  return `e${String(counter).padStart(5, '0')}`;
}

export function resetIds(): void {
  counter = 0;
}

export function event(payload: Payload, id: string = nextId()): MatchEvent {
  return {
    id,
    matchId: 'm1',
    localSeq: counter,
    serverSeq: null,
    actorId: 'scorer1',
    deviceId: 'device1',
    at: '2026-10-18T10:00:00.000Z',
    payload,
  };
}

export interface ScorerOptions extends Partial<CreateConfigInput> {
  /** Sizes both XIs down to this many players, for fast all-out tests. */
  xiSize?: number;
}

/**
 * A terse way to drive the engine in tests. Accumulates the event log and
 * replays it, so every assertion is also an assertion about replay.
 */
export class Scorer {
  readonly events: MatchEvent[] = [];

  constructor(options: ScorerOptions = {}) {
    const xiSize = options.xiSize ?? 11;
    const config = createMatchConfig({
      matchId: 'm1',
      format: options.format ?? 'T20',
      teams: [TEAM_A, TEAM_B],
      playersPerSide: xiSize,
      ...options,
    });

    this.push({ kind: 'match.created', config });
    this.push({
      kind: 'squad.set',
      teamId: TEAM_A,
      playingXI: squadA.slice(0, xiSize),
      captainId: 'a1',
      keeperId: 'a2',
    });
    this.push({
      kind: 'squad.set',
      teamId: TEAM_B,
      playingXI: squadB.slice(0, xiSize),
      captainId: 'b1',
      keeperId: 'b2',
    });
  }

  push(payload: Payload, id?: string): this {
    this.events.push(id === undefined ? event(payload) : event(payload, id));
    return this;
  }

  /** Id of the most recently pushed event. */
  lastId(): string {
    const last = this.events[this.events.length - 1];
    if (last === undefined) throw new Error('no events');
    return last.id;
  }

  toss(winnerTeamId = TEAM_A, choice: 'bat' | 'bowl' = 'bat'): this {
    return this.push({ kind: 'toss.recorded', winnerTeamId, choice });
  }

  open(
    inningsNo: 1 | 2 | 3 | 4 = 1,
    battingTeamId = TEAM_A,
    striker?: PlayerId,
    nonStriker?: PlayerId,
    bowler?: PlayerId,
  ): this {
    const batting = battingTeamId === TEAM_A ? squadA : squadB;
    const bowling = battingTeamId === TEAM_A ? squadB : squadA;
    return this.push({
      kind: 'innings.opened',
      inningsNo,
      battingTeamId,
      strikerId: striker ?? batting[0] ?? 'a1',
      nonStrikerId: nonStriker ?? batting[1] ?? 'a2',
      bowlerId: bowler ?? bowling[0] ?? 'b1',
    });
  }

  /** Setup through to the first ball of innings 1. */
  static live(options: ScorerOptions = {}): Scorer {
    return new Scorer(options).toss().open();
  }

  ball(delivery: Delivery): this {
    return this.push({ kind: 'delivery.recorded', delivery });
  }

  runs(n: 0 | 1 | 2 | 3 | 4 | 5 | 6): this {
    return this.ball({ runsOffBat: n });
  }

  dot(): this {
    return this.runs(0);
  }

  wide(extraRuns = 0): this {
    return this.ball({ runsOffBat: 0, extra: { type: 'wide', runs: extraRuns } });
  }

  noball(runsOffBat: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0, byes = 0): this {
    return this.ball({ runsOffBat, extra: { type: 'noball', runs: byes } });
  }

  bye(runs: number): this {
    return this.ball({ runsOffBat: 0, extra: { type: 'bye', runs } });
  }

  legbye(runs: number): this {
    return this.ball({ runsOffBat: 0, extra: { type: 'legbye', runs } });
  }

  wicket(
    kind: DismissalKind,
    playerOutId: PlayerId,
    opts: {
      incoming?: PlayerId;
      fielders?: PlayerId[];
      crossed?: boolean;
      runsOffBat?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
      extra?: Delivery['extra'];
    } = {},
  ): this {
    const delivery: Delivery = {
      runsOffBat: opts.runsOffBat ?? 0,
      wicket: {
        kind,
        playerOutId,
        ...(opts.fielders === undefined ? {} : { fielderIds: opts.fielders }),
        ...(opts.crossed === undefined ? {} : { battersCrossed: opts.crossed }),
        ...(opts.incoming === undefined ? {} : { incomingBatterId: opts.incoming }),
      },
      ...(opts.extra === undefined ? {} : { extra: opts.extra }),
    };
    return this.ball(delivery);
  }

  bowler(bowlerId: PlayerId): this {
    return this.push({ kind: 'bowler.changed', bowlerId });
  }

  /** Bowl `count` dot balls, rotating bowlers between overs automatically. */
  dots(count: number, bowlers: readonly PlayerId[] = ['b1', 'b2']): this {
    for (let i = 0; i < count; i += 1) {
      const state = this.expectState();
      const innings = state.innings[state.currentInningsIndex ?? 0];
      if (innings === undefined || innings.closed) break;
      if (innings.bowlerId === null) {
        const next = bowlers.find((b) => b !== innings.lastOverBowlerId) ?? 'b1';
        this.bowler(next);
      }
      this.dot();
    }
    return this;
  }

  result(): Result<MatchState, RuleViolation> {
    return replay(this.events);
  }

  expectState(): MatchState {
    const result = this.result();
    if (!result.ok) {
      throw new Error(`replay failed: ${result.error.code} — ${result.error.detail}`);
    }
    return result.value;
  }

  expectError(): RuleViolation {
    const result = this.result();
    if (result.ok) throw new Error('expected replay to fail, but it succeeded');
    return result.error;
  }

  innings(index = 0) {
    const innings = this.expectState().innings[index];
    if (innings === undefined) throw new Error(`no innings at index ${index}`);
    return innings;
  }

  /** Apply one more payload incrementally, bypassing replay. */
  reduceOnce(payload: Payload): Result<MatchState, RuleViolation> {
    return reduce(this.expectState(), event(payload));
  }
}
