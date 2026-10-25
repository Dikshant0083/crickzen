import { type MatchEvent, type MatchState, type Payload, replay } from '@criczen/engine';
import { describe, expect, it } from 'vitest';
import { buildDelivery, type Runs, setupPayloads } from '../src/match';
import {
  type Fixture,
  firstFixtures,
  nextStep,
  type Played,
  playerOfMatch,
  pointsTable,
  type Tournament,
} from '../src/tournament';

const dot: Payload = { kind: 'delivery.recorded', delivery: buildDelivery('none', 0) };
const hit = (r: Runs): Payload => ({
  kind: 'delivery.recorded',
  delivery: buildDelivery('none', r),
});

/** A 1-over match: `home` bats first and scores `h` off ball one, `away` replies with `a`. */
function play(home: string, away: string, h: Runs, a: Runs): MatchState {
  const ids = (t: string) => [`${t}1`, `${t}2`];
  const payloads: Payload[] = [
    ...setupPayloads({
      matchId: 'm',
      teams: [home, away],
      squads: [
        { ids: ids(home), names: {}, captainId: `${home}1`, keeperId: `${home}1` },
        { ids: ids(away), names: {}, captainId: `${away}1`, keeperId: `${away}1` },
      ],
      overs: 1,
      tennisBall: true,
      tossWinner: 0,
      tossChoice: 'bat',
    }),
    {
      kind: 'innings.opened',
      inningsNo: 1,
      battingTeamId: home,
      strikerId: `${home}1`,
      nonStrikerId: `${home}2`,
      bowlerId: `${away}1`,
    },
    hit(h),
    dot,
    dot,
    dot,
    dot,
    dot,
    {
      kind: 'innings.opened',
      inningsNo: 2,
      battingTeamId: away,
      strikerId: `${away}1`,
      nonStrikerId: `${away}2`,
      bowlerId: `${home}1`,
    },
    hit(a),
  ];
  // The chase stops early once the target is passed; pad with dots otherwise.
  let state: MatchState | null = null;
  for (let extra = 0; extra <= 5; extra += 1) {
    const r = replay(log([...payloads, ...Array(extra).fill(dot)]));
    if (!r.ok) break;
    state = r.value;
    if (state.result !== null) break;
  }
  if (state === null) throw new Error('match did not replay');
  return state;
}

function log(payloads: Payload[]): MatchEvent[] {
  return payloads.map((payload, i) => ({
    id: `e${i}`,
    matchId: 'm',
    localSeq: i,
    serverSeq: null,
    actorId: 'local',
    deviceId: 'local',
    at: '2026-10-25T10:00:00.000Z',
    payload,
  }));
}

function tournament(
  format: Tournament['format'],
  names: string[],
  playoffs: Tournament['playoffs'] = 'none',
): Tournament {
  return {
    id: 't',
    name: 'Cup',
    format,
    legs: 1,
    playoffs,
    overs: 1,
    ball: 'tennis',
    teams: names.map((n) => ({ id: n, name: n })),
    createdAt: '',
  };
}

/** Fixtures as stored, and a scorer who plays each one: the alphabetically first side always wins by 4. */
class Season {
  fixtures: Fixture[] = [];
  played = new Map<string, Played>();
  constructor(readonly t: Tournament) {
    this.add(firstFixtures(t));
  }
  add(next: Omit<Fixture, 'id' | 'tournamentId' | 'seq' | 'matchId'>[]) {
    for (const f of next) {
      this.fixtures.push({
        ...f,
        id: `f${this.fixtures.length}`,
        tournamentId: 't',
        seq: this.fixtures.length,
        matchId: null,
      });
    }
  }
  playAll(
    score: (home: string, away: string) => [Runs, Runs] = (h, a) => (h < a ? [4, 0] : [0, 4]),
  ) {
    for (const f of this.fixtures) {
      if (f.matchId !== null || f.away === null) continue;
      f.matchId = `m-${f.id}`;
      const [h, a] = score(f.home, f.away);
      this.played.set(f.matchId, { state: play(f.home, f.away, h, a) });
    }
  }
  next() {
    return nextStep(this.t, this.fixtures, this.played);
  }
}

describe('league with semi-finals', () => {
  it('runs from the round robin to a champion', () => {
    const s = new Season(tournament('league', ['A', 'B', 'C', 'D'], 'semis'));
    expect(s.fixtures).toHaveLength(6);
    expect(s.next()).toEqual({ kind: 'waiting' });

    s.playAll();
    expect(pointsTable(s.t, s.fixtures, s.played).map((r) => [r.team, r.points])).toEqual([
      ['A', 6],
      ['B', 4],
      ['C', 2],
      ['D', 0],
    ]);

    const semis = s.next();
    expect(semis.kind === 'create' && semis.fixtures.map((f) => `${f.home}v${f.away}`)).toEqual([
      'AvD',
      'BvC',
    ]);
    if (semis.kind === 'create') s.add(semis.fixtures);

    s.playAll();
    const final = s.next();
    expect(final.kind === 'create' && final.fixtures).toEqual([
      { stage: 'final', round: 5, home: 'A', away: 'B' },
    ]);
    if (final.kind === 'create') s.add(final.fixtures);

    s.playAll();
    expect(s.next()).toEqual({ kind: 'champion', team: 'A' });
  });
});

describe('knockout', () => {
  it('gives the top seed a bye and waits on a tie until its super over is played', () => {
    const s = new Season(tournament('knockout', ['A', 'B', 'C']));
    expect(s.fixtures.map((f) => `${f.home}v${f.away}`)).toEqual(['Avnull', 'BvC']);

    s.playAll(() => [4, 4]); // B v C tied
    expect(s.next()).toEqual({ kind: 'waiting' });

    const tied = s.fixtures[1];
    const p = tied?.matchId === null || tied === undefined ? undefined : s.played.get(tied.matchId);
    if (p === undefined || tied?.matchId == null) throw new Error('fixture not played');
    s.played.set(tied.matchId, { ...p, superOver: play('C', 'B', 6, 0) });

    const final = s.next();
    expect(final.kind === 'create' && final.fixtures).toEqual([
      { stage: 'final', round: 2, home: 'A', away: 'C' },
    ]);
  });
});

describe('playerOfMatch', () => {
  it('goes to the best impact once there is a result', () => {
    const won = play('A', 'B', 6, 4); // A1 hit 6, B1 hit 4
    expect(playerOfMatch(won)).toBe('A1');
    expect(playerOfMatch({ ...won, result: null })).toBeNull();
  });

  it('breaks a level score in favour of the winning side', () => {
    const level = play('A', 'B', 4, 4); // A1 and B1 both hit 4
    const winBy = (team: string) => ({
      ...level,
      result: {
        kind: 'won_by_runs' as const,
        winnerTeamId: team,
        margin: 1,
        marginUnit: 'runs' as const,
        description: '',
      },
    });
    expect(playerOfMatch(winBy('A'))).toBe('A1');
    expect(playerOfMatch(winBy('B'))).toBe('B1');
  });
});
