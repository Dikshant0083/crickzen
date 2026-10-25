import type { MatchState } from '@criczen/engine';
import type { Player, Role } from './db';
import { type Career, careerStats, impact, normalizeMobile } from './stats';
import type { IconName } from './ui';

export const ROLE: Record<Role, { label: string; icon: IconName }> = {
  batter: { label: 'Batter', icon: 'baseball' },
  bowler: { label: 'Bowler', icon: 'radio-button-on' },
  allrounder: { label: 'All-rounder', icon: 'star' },
  keeper: { label: 'Wicketkeeper', icon: 'hand-left' },
};

/**
 * Matches a name fragment, or a complete mobile number. Partial numbers never
 * match, so the directory cannot be used to guess someone's number.
 */
export function matchesQuery(p: Player, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  if (p.name.toLowerCase().includes(q)) return true;
  const digits = /^[\d\s+()-]+$/.test(q) ? normalizeMobile(q) : null;
  return digits !== null && digits.length === 10 && p.mobile === digits;
}

/** Last four digits only, enough to tell two same-named players apart. */
export function maskMobile(mobile: string | null): string {
  return mobile === null ? '' : `••••••${mobile.slice(-4)}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

export type RankBy = 'overall' | 'batting' | 'bowling';

export interface RankedPlayer extends Player {
  career: Career;
}

/** Best performers first; players with no matches yet go last, by name. */
export function rankPlayers(
  players: readonly Player[],
  states: readonly MatchState[],
  by: RankBy = 'overall',
): RankedPlayer[] {
  const key = (c: Career) =>
    by === 'batting' ? c.batting.runs : by === 'bowling' ? c.bowling.wickets : impact(c);
  return players
    .map((p) => ({ ...p, career: careerStats(states, p.id) }))
    .sort(
      (a, b) =>
        key(b.career) - key(a.career) ||
        b.career.matches - a.career.matches ||
        a.name.localeCompare(b.name),
    );
}
