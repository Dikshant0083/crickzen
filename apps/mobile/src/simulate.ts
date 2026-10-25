import {
  allOutWicketCount,
  currentInnings,
  type Delivery,
  legalInputs,
  type MatchState,
  otherTeam,
  type Payload,
  reduce,
  squadOf,
} from '@criczen/engine';

/** Small seeded PRNG (mulberry32), so demo matches come out the same every time. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Rough local-T20 odds per ball; the rest is a dot.
const OUTCOMES: readonly [number, Delivery | 'wicket'][] = [
  [0.3, { runsOffBat: 1 }],
  [0.1, { runsOffBat: 2 }],
  [0.02, { runsOffBat: 3 }],
  [0.11, { runsOffBat: 4 }],
  [0.05, { runsOffBat: 6 }],
  [0.03, { runsOffBat: 0, extra: { type: 'wide', runs: 0 } }],
  [0.01, { runsOffBat: 0, extra: { type: 'noball', runs: 0 } }],
  [0.02, { runsOffBat: 0, extra: { type: 'legbye', runs: 1 } }],
  [0.08, 'wicket'],
];

/**
 * Plays a whole match after its setup payloads: batting order is the XI
 * order, the last five of the XI share the bowling. Returns every payload,
 * setup included, ready for createMatch.
 */
export function simulate(setup: readonly Payload[], random: () => number): Payload[] {
  const out: Payload[] = [];
  let state: MatchState | null = null;
  const apply = (payload: Payload) => {
    const r = reduce(state, {
      id: `sim-${out.length}`,
      matchId: 'sim',
      localSeq: out.length,
      serverSeq: null,
      actorId: 'demo',
      deviceId: 'demo',
      at: '2026-10-25T10:00:00.000Z',
      payload,
    });
    if (!r.ok) return false;
    state = r.value;
    out.push(payload);
    return true;
  };
  for (const p of setup) if (!apply(p)) throw new Error('demo setup rejected');

  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)] as T;

  for (let guard = 0; guard < 2000; guard += 1) {
    const s = state as MatchState | null;
    if (s === null || s.result !== null || s.status === 'complete') break;

    if (s.status === 'toss_done' || s.status === 'innings_break') {
      const prev = s.innings.at(-1);
      const toss = s.toss;
      const batting =
        prev !== undefined
          ? prev.bowlingTeamId
          : toss === null || toss.choice === 'bat'
            ? (toss?.winnerTeamId ?? s.config.teams[0])
            : otherTeam(s.config, toss.winnerTeamId);
      const bat = squadOf(s, batting)?.playingXI ?? [];
      const bowl = squadOf(s, otherTeam(s.config, batting))?.playingXI ?? [];
      apply({
        kind: 'innings.opened',
        inningsNo: prev === undefined ? 1 : 2,
        battingTeamId: batting,
        strikerId: bat[0] ?? '',
        nonStrikerId: bat[1] ?? '',
        bowlerId: bowl.at(-1) ?? '',
      });
      continue;
    }

    const innings = currentInnings(s);
    if (innings === null) break;
    const inputs = legalInputs(s);

    if (inputs.needsBowler) {
      const bowlers = (squadOf(s, innings.bowlingTeamId)?.playingXI ?? []).slice(-5);
      const choice =
        inputs.eligibleBowlers
          .filter((b) => bowlers.includes(b))
          .sort((a, b) => (innings.bowlers[a]?.balls ?? 0) - (innings.bowlers[b]?.balls ?? 0))[0] ??
        inputs.eligibleBowlers[0];
      if (choice === undefined) break;
      apply({ kind: 'bowler.changed', bowlerId: choice });
      continue;
    }

    let roll = random();
    let delivery: Delivery = { runsOffBat: 0 };
    for (const [p, outcome] of OUTCOMES) {
      if (roll < p) {
        if (outcome === 'wicket') {
          const fielders = squadOf(s, innings.bowlingTeamId)?.playingXI ?? [];
          const kind = pick(['bowled', 'caught', 'caught', 'lbw'] as const);
          const last = innings.wickets + 1 >= allOutWicketCount(s, innings);
          const incoming = inputs.availableBatters[0];
          delivery = {
            runsOffBat: 0,
            wicket: {
              kind,
              playerOutId: innings.strikerId ?? '',
              ...(kind === 'caught' ? { fielderIds: [pick(fielders)] } : {}),
              ...(last || incoming === undefined ? {} : { incomingBatterId: incoming }),
            },
          };
        } else {
          delivery = outcome;
        }
        break;
      }
      roll -= p;
    }
    if (!apply({ kind: 'delivery.recorded', delivery }))
      apply({ kind: 'delivery.recorded', delivery: { runsOffBat: 0 } });
  }
  return out;
}
