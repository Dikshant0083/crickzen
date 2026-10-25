import type { BallType, MatchConfig, MatchFormat, MatchRules, OverRange, TeamId } from './types.js';

/** Leather-ball rules per the Laws of Cricket, as used in limited-overs play. */
export const LEATHER_BALL_RULES: MatchRules = {
  widePenalty: 1,
  noBallPenalty: 1,
  freeHitOnNoBall: true,
  maxOversPerBowler: null,
  newBatterTakesStrikeOnCatch: true,
  superOverOnTie: false,
};

/**
 * Tennis-ball/local defaults. Two deliberate differences: no free hit (most
 * gully and box-cricket competitions do not play it), and the law-18.11 strike
 * rule off, since local scoring predates the 2022 change.
 *
 * These are defaults, not rules — every one is overridable per match, which is
 * the whole reason they live in config rather than in the reducer.
 */
export const TENNIS_BALL_RULES: MatchRules = {
  widePenalty: 1,
  noBallPenalty: 1,
  freeHitOnNoBall: false,
  maxOversPerBowler: null,
  newBatterTakesStrikeOnCatch: false,
  superOverOnTie: true,
};

const FORMAT_OVERS: Record<MatchFormat, number> = {
  T10: 10,
  T20: 20,
  ODI: 50,
  // Deferred (DOMAIN-RULES §11). Present so the type is total; not playable yet.
  TEST: 0,
  CUSTOM: 20,
};

/** Standard powerplay over ranges, zero-indexed and end-exclusive. */
const FORMAT_POWERPLAYS: Record<MatchFormat, readonly OverRange[]> = {
  T10: [{ from: 0, to: 3 }],
  T20: [{ from: 0, to: 6 }],
  ODI: [
    { from: 0, to: 10 },
    { from: 10, to: 40 },
    { from: 40, to: 50 },
  ],
  TEST: [],
  CUSTOM: [],
};

export interface CreateConfigInput {
  matchId: string;
  format: MatchFormat;
  teams: readonly [TeamId, TeamId];
  ballType?: BallType;
  /** Required for CUSTOM; otherwise overrides the format default. */
  totalOvers?: number;
  playersPerSide?: number;
  wicketsPerInnings?: number;
  powerplays?: readonly OverRange[];
  rules?: Partial<MatchRules>;
}

export function createMatchConfig(input: CreateConfigInput): MatchConfig {
  const ballType = input.ballType ?? 'leather';
  const base = ballType === 'tennis' ? TENNIS_BALL_RULES : LEATHER_BALL_RULES;
  const totalOvers = input.totalOvers ?? FORMAT_OVERS[input.format];

  return {
    matchId: input.matchId,
    format: input.format,
    ballType,
    totalOvers,
    playersPerSide: input.playersPerSide ?? 11,
    teams: input.teams,
    powerplays: input.powerplays ?? FORMAT_POWERPLAYS[input.format],
    rules: { ...base, ...input.rules },
    ...(input.wicketsPerInnings === undefined
      ? {}
      : { wicketsPerInnings: input.wicketsPerInnings }),
  };
}

/**
 * Maximum overs one bowler may bowl. Defaults to ceil(totalOvers / 5), which
 * gives the familiar 4 in a T20 and 10 in an ODI.
 */
export function maxOversPerBowler(config: MatchConfig): number {
  return config.rules.maxOversPerBowler ?? Math.ceil(config.totalOvers / 5);
}

/** Number of innings in the match. Four for Test, two otherwise. */
export function inningsCount(config: MatchConfig): number {
  return config.format === 'TEST' ? 4 : 2;
}

/** Which powerplay a given zero-indexed over falls in, or null. */
export function powerplayIndexForOver(config: MatchConfig, overNo: number): number | null {
  for (let i = 0; i < config.powerplays.length; i += 1) {
    const range = config.powerplays[i];
    if (range !== undefined && overNo >= range.from && overNo < range.to) return i;
  }
  return null;
}
