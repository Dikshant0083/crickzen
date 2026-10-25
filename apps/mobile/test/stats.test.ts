import { type MatchEvent, type Payload, replay } from '@criczen/engine';
import { describe, expect, it } from 'vitest';
import { buildDelivery, setupPayloads } from '../src/match';
import { careerStats, isValidMobile, normalizeMobile, teamRecord } from '../src/stats';

function state(payloads: Payload[]) {
  const result = replay(
    payloads.map((payload, i) => ({
      id: `e${i}`,
      matchId: 'm',
      localSeq: i,
      serverSeq: null,
      actorId: 'local',
      deviceId: 'local',
      at: '2026-10-24T10:00:00.000Z',
      payload,
    })) satisfies MatchEvent[],
  );
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.detail}`);
  return result.value;
}

const ball = (...p: Parameters<typeof buildDelivery>): Payload => ({
  kind: 'delivery.recorded',
  delivery: buildDelivery(...p),
});

describe('normalizeMobile', () => {
  it('treats formatted, country-coded and bare numbers as the same player', () => {
    expect(normalizeMobile('+91 98765-43210')).toBe('9876543210');
    expect(normalizeMobile('09876543210')).toBe('9876543210');
    expect(normalizeMobile('  ')).toBeNull();
    expect(isValidMobile(normalizeMobile('12345'))).toBe(false);
    expect(isValidMobile(null)).toBe(true);
  });
});

describe('careerStats', () => {
  // p1 bats in both matches; p4 bowls and catches. Same ids across matches, like the directory.
  const match = (runs: number[]) =>
    state([
      ...setupPayloads({
        matchId: 'm',
        teams: ['Lions', 'Tigers'],
        squads: [
          { ids: ['p1', 'p2', 'p3'], names: {}, captainId: 'p1', keeperId: 'p2' },
          { ids: ['p4', 'p5', 'p6'], names: {}, captainId: 'p4', keeperId: 'p5' },
        ],
        overs: 2,
        tennisBall: true,
        tossWinner: 0,
        tossChoice: 'bat',
      }),
      {
        kind: 'innings.opened',
        inningsNo: 1,
        battingTeamId: 'Lions',
        strikerId: 'p1',
        nonStrikerId: 'p2',
        bowlerId: 'p4',
      },
      ...runs.map((r) => ball('none', r as 0)),
      ball('none', 0, {
        kind: 'caught',
        playerOutId: 'p1',
        fielderIds: ['p4'],
        incomingBatterId: 'p3',
      }),
    ]);

  it('adds up batting, bowling and fielding across matches', () => {
    const states = [match([4, 6, 0, 2]), match([0])];
    const c = careerStats(states, 'p1');
    expect(c.matches).toBe(2);
    expect(c.batting).toMatchObject({
      innings: 2,
      runs: 12,
      balls: 7,
      notOuts: 0,
      fours: 1,
      sixes: 1,
      ducks: 1,
      highest: 12,
    });

    const b = careerStats(states, 'p4');
    expect(b.bowling).toMatchObject({
      innings: 2,
      wickets: 2,
      runs: 12,
      bestWickets: 1,
      bestRuns: 0,
    });
    expect(b.fielding.catches).toBe(2);
    expect(careerStats(states, 'nobody').matches).toBe(0);
  });

  it('counts only finished matches in a team record', () => {
    const live = match([4]);
    expect(teamRecord([live], 'lions').played).toBe(0);
    const done = {
      ...live,
      status: 'complete' as const,
      result: {
        kind: 'won_by_runs' as const,
        winnerTeamId: 'Lions',
        margin: 4,
        marginUnit: 'runs' as const,
        description: '',
      },
    };
    expect(teamRecord([done, done], 'LIONS')).toMatchObject({ played: 2, won: 2, lost: 0 });
    expect(teamRecord([done], 'Tigers')).toMatchObject({ played: 1, lost: 1 });
  });
});
