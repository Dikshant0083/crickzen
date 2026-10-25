import {
  knockoutRound,
  type MatchState,
  type PlayerId,
  roundRobin,
  type StandingsRow,
  standings,
} from '@criczen/engine';
import { careerStats, impact } from './stats';

export type Format = 'league' | 'knockout';
export type Playoffs = 'none' | 'final' | 'semis';
export type Stage = 'league' | 'knockout' | 'semi' | 'final';

export interface Tournament {
  id: string;
  name: string;
  format: Format;
  legs: 1 | 2;
  playoffs: Playoffs;
  overs: number;
  ball: 'tennis' | 'leather';
  /** Saved-team ids with the names used as team ids in every match. */
  teams: { id: string; name: string }[];
  createdAt: string;
}

export interface Fixture {
  id: string;
  tournamentId: string;
  stage: Stage;
  round: number;
  seq: number;
  home: string;
  /** Null is a knockout bye. */
  away: string | null;
  matchId: string | null;
}

/** A played fixture's match, with the super over that settled it if it was tied. */
export interface Played {
  state: MatchState;
  superOver?: MatchState;
}

type NewFixture = Omit<Fixture, 'id' | 'tournamentId' | 'seq' | 'matchId'>;

export function firstFixtures(t: Tournament): NewFixture[] {
  const names = t.teams.map((x) => x.name);
  if (t.format === 'league') {
    return roundRobin(names, t.legs).map((p) => ({
      stage: 'league',
      round: p.round,
      home: p.home,
      away: p.away,
    }));
  }
  const pairs = knockoutRound(names);
  return pairs.map((p) => ({
    stage: pairs.length === 1 ? 'final' : 'knockout',
    round: 1,
    home: p.home,
    away: p.away,
  }));
}

/**
 * Who goes through. A bye sends home through; a tie goes to its super over;
 * a no result sends the higher seed (home) through.
 */
export function fixtureWinner(f: Fixture, played: Played | undefined): string | null {
  if (f.away === null) return f.home;
  const r = played?.state.result ?? null;
  if (r === null) return played?.state.status === 'abandoned' ? f.home : null;
  if (r.kind === 'won_by_runs' || r.kind === 'won_by_wickets') return r.winnerTeamId;
  if (r.kind === 'tie') {
    const so = played?.superOver?.result;
    if (so === undefined || so === null) return null;
    return so.winnerTeamId ?? f.home;
  }
  return f.home;
}

export function isDone(f: Fixture, played: Played | undefined): boolean {
  if (f.away === null) return true;
  const s = played?.state;
  if (s === undefined) return false;
  if (s.status === 'abandoned') return true;
  if (s.result === null) return false;
  return s.result.kind !== 'tie' || fixtureWinner(f, played) !== null || f.stage === 'league';
}

export function pointsTable(
  t: Tournament,
  fixtures: readonly Fixture[],
  played: ReadonlyMap<string, Played>,
): StandingsRow[] {
  const matches = fixtures
    .filter((f) => f.stage === 'league' && f.away !== null)
    .flatMap((f) => {
      const p = f.matchId === null ? undefined : played.get(f.matchId);
      if (p === undefined) return [];
      const so = p.superOver?.result?.winnerTeamId ?? null;
      return [
        {
          teams: p.state.config.teams,
          result:
            p.state.status === 'abandoned' && p.state.result === null ? noResult : p.state.result,
          innings: p.state.innings,
          ...(so === null ? {} : { superOverWinner: so }),
        },
      ];
    });
  return standings(
    t.teams.map((x) => x.name),
    matches,
  );
}

const noResult = {
  kind: 'abandoned' as const,
  winnerTeamId: null,
  margin: null,
  marginUnit: null,
  description: 'Abandoned',
};

export type Next =
  | { kind: 'create'; label: string; fixtures: NewFixture[] }
  | { kind: 'champion'; team: string }
  | { kind: 'waiting' };

/** What happens once the current stage is finished: the next round, or the champion. */
export function nextStep(
  t: Tournament,
  fixtures: readonly Fixture[],
  played: ReadonlyMap<string, Played>,
): Next {
  const get = (f: Fixture) => (f.matchId === null ? undefined : played.get(f.matchId));
  const final = fixtures.find((f) => f.stage === 'final');
  if (final !== undefined) {
    const winner = isDone(final, get(final)) ? fixtureWinner(final, get(final)) : null;
    return winner === null ? { kind: 'waiting' } : { kind: 'champion', team: winner };
  }

  const lastRound = Math.max(...fixtures.map((f) => f.round));
  const stage = fixtures.find((f) => f.round === lastRound)?.stage ?? 'league';
  const current = fixtures.filter((f) =>
    stage === 'league' ? f.stage === 'league' : f.round === lastRound,
  );
  if (!current.every((f) => isDone(f, get(f)))) return { kind: 'waiting' };

  if (stage === 'league') {
    const table = pointsTable(t, fixtures, played).map((r) => r.team);
    const round = lastRound + 1;
    if (t.playoffs === 'none') return { kind: 'champion', team: table[0] ?? '' };
    if (t.playoffs === 'semis' && table.length >= 4) {
      const [a, b, c, d] = table as [string, string, string, string];
      return {
        kind: 'create',
        label: 'Create semi-finals',
        fixtures: [
          { stage: 'semi', round, home: a, away: d },
          { stage: 'semi', round, home: b, away: c },
        ],
      };
    }
    const [a, b] = table;
    if (a === undefined || b === undefined) return { kind: 'waiting' };
    return {
      kind: 'create',
      label: 'Create final',
      fixtures: [{ stage: 'final', round, home: a, away: b }],
    };
  }

  const winners = current.map((f) => fixtureWinner(f, get(f))).filter((w) => w !== null);
  if (winners.length === 1) return { kind: 'champion', team: winners[0] ?? '' };
  const pairs = knockoutRound(winners);
  const last = pairs.length === 1;
  return {
    kind: 'create',
    label: last ? 'Create final' : 'Create next round',
    fixtures: pairs.map((p) => ({
      stage: last ? 'final' : 'knockout',
      round: lastRound + 1,
      home: p.home,
      away: p.away,
    })),
  };
}

export function stageLabel(f: Fixture, fixtures: readonly Fixture[]): string {
  if (f.stage === 'league') return `Round ${f.round}`;
  if (f.stage === 'semi') return 'Semi-finals';
  if (f.stage === 'final') return 'Final';
  const size = fixtures.filter((x) => x.round === f.round).length;
  return size === 2 ? 'Semi-finals' : size === 4 ? 'Quarter-finals' : `Round ${f.round}`;
}

export interface Leader {
  playerId: PlayerId;
  value: number;
  detail: string;
}

/** Top run-scorers and wicket-takers across the tournament's matches. */
export function leaders(
  states: readonly MatchState[],
  limit = 5,
): { runs: Leader[]; wickets: Leader[] } {
  const ids = new Set(states.flatMap((s) => Object.values(s.squads).flatMap((q) => q.playingXI)));
  const all = [...ids].map((id) => ({ id, c: careerStats(states, id) }));
  return {
    runs: all
      .filter((x) => x.c.batting.runs > 0)
      .sort((a, b) => b.c.batting.runs - a.c.batting.runs)
      .slice(0, limit)
      .map((x) => ({
        playerId: x.id,
        value: x.c.batting.runs,
        detail: `${x.c.batting.innings} inns · HS ${x.c.batting.highest}`,
      })),
    wickets: all
      .filter((x) => x.c.bowling.wickets > 0)
      .sort(
        (a, b) => b.c.bowling.wickets - a.c.bowling.wickets || a.c.bowling.runs - b.c.bowling.runs,
      )
      .slice(0, limit)
      .map((x) => ({
        playerId: x.id,
        value: x.c.bowling.wickets,
        detail: `${x.c.bowling.runs} runs conceded`,
      })),
  };
}

/**
 * A starting suggestion for Player of the Match: runs, plus 20 per wicket
 * and 10 per catch, stumping or run out. The scorer can pick someone else.
 */
export function suggestPlayerOfMatch(state: MatchState): PlayerId | null {
  let best: PlayerId | null = null;
  let bestScore = -1;
  for (const squad of Object.values(state.squads)) {
    for (const id of squad.playingXI) {
      const score = impact(careerStats([state], id));
      if (score > bestScore) {
        best = id;
        bestScore = score;
      }
    }
  }
  return best;
}
