import { type Payload, replay } from '@criczen/engine';
import { describe, expect, it } from 'vitest';
import { buildDelivery, setupPayloads } from '../src/match';
import { maskMobile, matchesQuery, rankPlayers } from '../src/people';

const rahul = { id: '1', name: 'Rahul Kumar', mobile: '9876543210', role: 'batter' as const };

describe('matchesQuery', () => {
  it('finds a player by name or by a formatted mobile number', () => {
    expect(matchesQuery(rahul, 'rahul')).toBe(true);
    expect(matchesQuery(rahul, '+91 98765 43210')).toBe(true);
  });

  it('never matches a partial number, so numbers cannot be guessed', () => {
    expect(matchesQuery(rahul, '43210')).toBe(false);
    expect(matchesQuery(rahul, '987654321')).toBe(false);
  });

  it('does not treat digits inside a name search as a number search', () => {
    expect(matchesQuery(rahul, 'Amit 9')).toBe(false);
    expect(matchesQuery({ ...rahul, mobile: null }, '9876543210')).toBe(false);
  });
});

describe('maskMobile', () => {
  it('shows only the last four digits', () => {
    expect(maskMobile('9876543210')).toBe('••••••3210');
    expect(maskMobile(null)).toBe('');
  });
});

describe('rankPlayers', () => {
  // Lions bat: L1 hits a six then is caught by T1 off T1's bowling. Tigers have not batted.
  const payloads: Payload[] = [
    ...setupPayloads({
      matchId: 'm',
      teams: ['Lions', 'Tigers'],
      squads: [
        { ids: ['L1', 'L2', 'L3'], names: {}, captainId: 'L1', keeperId: 'L1' },
        { ids: ['T1', 'T2', 'T3'], names: {}, captainId: 'T1', keeperId: 'T1' },
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
      strikerId: 'L1',
      nonStrikerId: 'L2',
      bowlerId: 'T1',
    },
    { kind: 'delivery.recorded', delivery: buildDelivery('none', 6) },
    {
      kind: 'delivery.recorded',
      delivery: buildDelivery('none', 0, {
        kind: 'caught',
        playerOutId: 'L1',
        fielderIds: ['T1'],
        incomingBatterId: 'L3',
      }),
    },
  ];
  const result = replay(
    payloads.map((payload, i) => ({
      id: `e${i}`,
      matchId: 'm',
      localSeq: i,
      serverSeq: null,
      actorId: 'a',
      deviceId: 'd',
      at: '',
      payload,
    })),
  );
  if (!result.ok) throw new Error(result.error.detail);
  const states = [result.value];
  const p = (id: string, name: string) => ({ id, name, mobile: null, role: 'batter' as const });
  const players = [p('X', 'Aaron (no matches)'), p('L1', 'Lion One'), p('T1', 'Tiger One')];

  it('ranks by overall impact, batting runs or wickets, unplayed players last', () => {
    // T1: 1 wicket (20) + 1 catch (10) = 30 beats L1's 6 runs.
    expect(rankPlayers(players, states).map((x) => x.id)).toEqual(['T1', 'L1', 'X']);
    expect(rankPlayers(players, states, 'batting')[0]?.id).toBe('L1');
    expect(rankPlayers(players, states, 'bowling')[0]?.id).toBe('T1');
  });
});
