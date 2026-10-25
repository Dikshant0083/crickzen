import type { InningsState, MatchResult, TeamId } from '../types.js';
import { type NrrInningsInput, netRunRate } from './outcome.js';

/** DOMAIN-RULES §7: a win is 2, a tie or no result 1, a loss 0. */
export const POINTS = { win: 2, tie: 1, noResult: 1, loss: 0 } as const;

export interface Pairing {
  round: number;
  home: TeamId;
  away: TeamId;
}

/**
 * Round-robin fixtures by the circle method: every side meets every other
 * side once per leg, nobody plays twice in a round, an odd count gives one
 * side a bye each round. The second leg reverses home and away.
 */
export function roundRobin(teams: readonly TeamId[], legs: 1 | 2 = 1): Pairing[] {
  const slots: (TeamId | null)[] = teams.length % 2 === 0 ? [...teams] : [...teams, null];
  const n = slots.length;
  const out: Pairing[] = [];
  if (n < 2) return out;

  for (let round = 0; round < n - 1; round += 1) {
    for (let i = 0; i < n / 2; i += 1) {
      const a = slots[i] ?? null;
      const b = slots[n - 1 - i] ?? null;
      if (a === null || b === null) continue;
      // Alternate the fixed side's home/away so nobody is always "home".
      const swap = i === 0 && round % 2 === 1;
      out.push({ round: round + 1, home: swap ? b : a, away: swap ? a : b });
    }
    // Keep slot 0 fixed, rotate the rest one place clockwise.
    const last = slots.pop() ?? null;
    slots.splice(1, 0, last);
  }

  if (legs === 1) return out;
  const firstLegRounds = n - 1;
  return [
    ...out,
    ...out.map((p) => ({ round: p.round + firstLegRounds, home: p.away, away: p.home })),
  ];
}

export interface KnockoutPair {
  home: TeamId;
  /** Null is a bye: home goes through. */
  away: TeamId | null;
}

/**
 * One knockout round from seeded sides (best first). The field is padded to
 * a power of two with byes, which go to the top seeds; seed 1 meets the
 * lowest remaining seed.
 */
export function knockoutRound(seeds: readonly TeamId[]): KnockoutPair[] {
  let size = 1;
  while (size < seeds.length) size *= 2;
  const out: KnockoutPair[] = [];
  for (let i = 0; i < size / 2; i += 1) {
    const home = seeds[i];
    if (home === undefined) continue;
    out.push({ home, away: seeds[size - 1 - i] ?? null });
  }
  return out;
}

export interface StandingsMatch {
  teams: readonly [TeamId, TeamId];
  /** Null while the match is unfinished; it is then ignored. */
  result: MatchResult | null;
  innings: readonly InningsState[];
  /** A tie settled by a super over counts as a win for this side. */
  superOverWinner?: TeamId;
}

export interface StandingsRow {
  team: TeamId;
  played: number;
  won: number;
  lost: number;
  tied: number;
  noResult: number;
  points: number;
  nrr: number;
}

function nrrInput(innings: InningsState): NrrInningsInput {
  return {
    runs: innings.runs,
    legalBalls: innings.legalBalls,
    allOut: innings.closeReason === 'all_out',
    quotaOvers: innings.totalOvers,
  };
}

/**
 * The points table, sorted by points, then wins, then net run rate, then
 * name. No-result matches give points but stay out of NRR (DOMAIN-RULES §7).
 */
export function standings(
  teams: readonly TeamId[],
  matches: readonly StandingsMatch[],
): StandingsRow[] {
  const rows = new Map<TeamId, StandingsRow>(
    teams.map((team) => [
      team,
      { team, played: 0, won: 0, lost: 0, tied: 0, noResult: 0, points: 0, nrr: 0 },
    ]),
  );
  const scored = new Map<TeamId, NrrInningsInput[]>();
  const conceded = new Map<TeamId, NrrInningsInput[]>();

  for (const m of matches) {
    const r = m.result;
    if (r === null) continue;
    const decided = r.kind === 'won_by_runs' || r.kind === 'won_by_wickets' || r.kind === 'tie';
    const winner = r.kind === 'tie' ? (m.superOverWinner ?? null) : r.winnerTeamId;

    for (const team of m.teams) {
      const row = rows.get(team);
      if (row === undefined) continue;
      row.played += 1;
      if (!decided) {
        row.noResult += 1;
        row.points += POINTS.noResult;
      } else if (winner === null) {
        row.tied += 1;
        row.points += POINTS.tie;
      } else if (winner === team) {
        row.won += 1;
        row.points += POINTS.win;
      } else {
        row.lost += 1;
        row.points += POINTS.loss;
      }

      if (decided) {
        for (const innings of m.innings) {
          const bucket = innings.battingTeamId === team ? scored : conceded;
          bucket.set(team, [...(bucket.get(team) ?? []), nrrInput(innings)]);
        }
      }
    }
  }

  for (const row of rows.values()) {
    row.nrr = netRunRate(scored.get(row.team) ?? [], conceded.get(row.team) ?? []);
  }

  return [...rows.values()].sort(
    (a, b) => b.points - a.points || b.won - a.won || b.nrr - a.nrr || a.team.localeCompare(b.team),
  );
}
