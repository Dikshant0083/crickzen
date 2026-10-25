import { type MatchEvent, type Payload, replay } from '@criczen/engine';
import { describe, expect, it } from 'vitest';
import {
  ballLabel,
  buildDelivery,
  howOut,
  oversText,
  type Squad,
  setupPayloads,
} from '../src/match';

function squad(names: string[], prefix: string): Squad {
  const ids = names.map((_, i) => `${prefix}${i + 1}`);
  const first = ids[0] ?? '';
  return {
    ids,
    names: Object.fromEntries(ids.map((id, i) => [id, names[i] ?? id])),
    captainId: first,
    keeperId: ids.at(-1) ?? first,
  };
}

function log(payloads: Payload[]): MatchEvent[] {
  return payloads.map((payload, i) => ({
    id: `e${i}`,
    matchId: 'm',
    localSeq: i,
    serverSeq: null,
    actorId: 'local',
    deviceId: 'local',
    at: '2026-10-24T10:00:00.000Z',
    payload,
  }));
}

describe('a full match through the engine', () => {
  // Two 1-over innings, three players a side (so two wickets is all out).
  const a = squad(['A one', 'A two', 'A three'], 'A');
  const b = squad(['B one', 'B two', 'B three'], 'B');
  const setup = setupPayloads({
    matchId: 'm',
    teams: ['Lions', 'Tigers'],
    squads: [a, b],
    overs: 1,
    tennisBall: false,
    tossWinner: 0,
    tossChoice: 'bat',
  });
  const ball = (p: Parameters<typeof buildDelivery>): Payload => ({
    kind: 'delivery.recorded',
    delivery: buildDelivery(...p),
  });

  const payloads: Payload[] = [
    ...setup,
    {
      kind: 'innings.opened',
      inningsNo: 1,
      battingTeamId: 'Lions',
      strikerId: 'A1',
      nonStrikerId: 'A2',
      bowlerId: 'B1',
    },
    ball(['none', 4]),
    ball(['wide', 0]),
    ball(['noball', 1]),
    ball(['none', 6]),
    ball(['legbye', 1]),
    ball([
      'none',
      0,
      { kind: 'caught', playerOutId: 'A2', fielderIds: ['B2'], incomingBatterId: 'A3' },
    ]),
    ball(['bye', 2]),
    ball(['none', 1]),
    {
      kind: 'innings.opened',
      inningsNo: 2,
      battingTeamId: 'Tigers',
      strikerId: 'B1',
      nonStrikerId: 'B2',
      bowlerId: 'A1',
    },
    ball(['none', 0, { kind: 'bowled', playerOutId: 'B1', incomingBatterId: 'B3' }]),
    ball([
      'none',
      0,
      { kind: 'run_out', playerOutId: 'B3', fielderIds: ['A3'], battersCrossed: false },
    ]),
  ];

  it('is accepted, totals reconcile, and the result is decided', () => {
    const result = replay(log(payloads));
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.detail}`);
    const [first, second] = result.value.innings;

    // 4 + (1 wd) + (1 nb + 1) + 6 + 1 lb + 0 + 2 b + 1 = 17
    expect(first?.runs).toBe(17);
    expect(oversText(first?.legalBalls ?? 0)).toBe('1.0');
    expect(first?.balls.map(ballLabel)).toEqual(['4', 'Wd', '1Nb', '6', '1Lb', 'W', '2B', '1']);
    expect(second?.wickets).toBe(2);
    expect(result.value.result?.description).toBe('Lions won by 17 runs');

    const name = (id: string) => ({ ...a.names, ...b.names })[id] ?? id;
    expect(howOut(first as NonNullable<typeof first>, 'A2', name)).toBe('c B two b B one');
    expect(howOut(second as NonNullable<typeof second>, 'B3', name)).toBe('run out (A three)');
    expect(howOut(first as NonNullable<typeof first>, 'A3', name)).toBe('not out');
  });
});
