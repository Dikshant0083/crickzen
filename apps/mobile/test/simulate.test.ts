import { type MatchEvent, replay } from '@criczen/engine';
import { liveSnapshotSchema } from '@criczen/shared';
import { describe, expect, it } from 'vitest';
import { liveSnapshot, milestone, setupPayloads } from '../src/match';
import { rng, simulate } from '../src/simulate';

describe('simulate', () => {
  it('plays a full, engine-valid match, the same way every time', () => {
    const squad = (t: string) => {
      const ids = Array.from({ length: 11 }, (_, i) => `${t}${i}`);
      return { ids, names: {}, captainId: `${t}0`, keeperId: `${t}2` };
    };
    const setup = setupPayloads({
      matchId: 'm',
      teams: ['Lions', 'Tigers'],
      squads: [squad('L'), squad('T')],
      overs: 10,
      tennisBall: true,
      tossWinner: 0,
      tossChoice: 'bat',
    });
    const run = () => simulate(setup, rng(7));
    const payloads = run();
    const events: MatchEvent[] = payloads.map((payload, i) => ({
      id: `e${i}`,
      matchId: 'm',
      localSeq: i,
      serverSeq: null,
      actorId: 'demo',
      deviceId: 'demo',
      at: '2026-10-25T10:00:00.000Z',
      payload,
    }));
    const result = replay(events);
    if (!result.ok) throw new Error(result.error.detail);
    expect(result.value.result).not.toBeNull();
    expect(result.value.innings).toHaveLength(2);
    expect(run()).toEqual(payloads);
  });

  it('turns a finished match into a live snapshot the API accepts', () => {
    const squad = (t: string) => {
      const ids = Array.from({ length: 11 }, (_, i) => `${t}${i}`);
      return { ids, names: {}, captainId: `${t}0`, keeperId: `${t}2` };
    };
    const setup = setupPayloads({
      matchId: 'm',
      teams: ['Lions', 'Tigers'],
      squads: [squad('L'), squad('T')],
      overs: 10,
      tennisBall: true,
      tossWinner: 0,
      tossChoice: 'bat',
    });
    const events: MatchEvent[] = simulate(setup, rng(7)).map((payload, i) => ({
      id: `e${i}`,
      matchId: 'm',
      localSeq: i,
      serverSeq: null,
      actorId: 'demo',
      deviceId: 'demo',
      at: '2026-10-25T10:00:00.000Z',
      payload,
    }));
    const result = replay(events);
    if (!result.ok) throw new Error(result.error.detail);
    const snap = liveSnapshotSchema.parse(liveSnapshot(result.value, (id) => `Player ${id}`));
    expect(snap.innings).toHaveLength(2);
    expect(snap.result).not.toBeNull();
    expect(snap.innings[0]?.batters.some((b) => b.out !== null)).toBe(true);
    // Newest ball first, from the innings in progress (here the last one).
    expect(snap.commentary).toHaveLength(30);
    const last = result.value.innings[1]?.balls.at(-1);
    expect(snap.commentary[0]?.over).toBe(`${last?.overNo}.${last?.ballInOver}`);
  });
});

describe('milestone', () => {
  it('reports exactly the milestones each ball reaches, checked against the state before it', () => {
    const squad = (t: string) => {
      const ids = Array.from({ length: 11 }, (_, i) => `${t}${i}`);
      return { ids, names: {}, captainId: `${t}0`, keeperId: `${t}2` };
    };
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const setup = setupPayloads({
        matchId: 'm',
        teams: ['Lions', 'Tigers'],
        squads: [squad('L'), squad('T')],
        overs: 20,
        tennisBall: true,
        tossWinner: 0,
        tossChoice: 'bat',
      });
      const events: MatchEvent[] = simulate(setup, rng(seed)).map((payload, i) => ({
        id: `e${i}`,
        matchId: 'm',
        localSeq: i,
        serverSeq: null,
        actorId: 'demo',
        deviceId: 'demo',
        at: '2026-10-25T10:00:00.000Z',
        payload,
      }));
      let prev = replay(events.slice(0, 1));
      for (let i = 2; i <= events.length; i++) {
        const now = replay(events.slice(0, i));
        if (!now.ok || !prev.ok) throw new Error('replay failed');
        const inn = now.value.innings.at(-1);
        const before = prev.value.innings.find((x) => x.inningsNo === inn?.inningsNo);
        prev = now;
        if (inn === undefined || events[i - 1]?.payload.kind !== 'delivery.recorded') continue;
        const ball = inn.balls.at(-1);
        if (ball === undefined) continue;
        const h = milestone(inn, (id) => id);
        const runsBefore = (id: string) => before?.batters[id]?.runs ?? 0;
        const batter = inn.batters[ball.strikerId];
        const crossed50 =
          batter !== undefined && runsBefore(batter.playerId) < 50 && batter.runs >= 50;
        const teamBefore = before?.runs ?? 0;
        if (h !== null) {
          seen.add(h.text.split('!')[0] ?? '');
          expect(h.id).toBe(ball.eventId);
          if (h.text.startsWith('FIFTY')) expect(crossed50).toBe(true);
          if (h.text.includes('UP!'))
            expect(Math.floor(teamBefore / 50)).toBeLessThan(Math.floor(inn.runs / 50));
          if (h.text.startsWith('5 WICKETS')) expect(inn.bowlers[ball.bowlerId]?.wickets).toBe(5);
        }
        // A real fifty is never missed (unless a bigger milestone landed on the same ball).
        if (crossed50 && batter !== undefined && batter.runs < 100) {
          expect(h?.text).toMatch(/^(FIFTY|HAT-TRICK|5 WICKETS)/);
        }
      }
    }
    // The simulated matches cover the common milestones.
    expect(seen).toContain('100 UP');
  });
});
