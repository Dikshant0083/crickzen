import { type MatchEvent, replay } from '@criczen/engine';
import { describe, expect, it } from 'vitest';
import { setupPayloads } from '../src/match';
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
});
