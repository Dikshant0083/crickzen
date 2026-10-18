import type { InningsState, MatchConfig, MatchResult, TeamId } from '../types.js';

export interface OutcomeInput {
  config: MatchConfig;
  innings: readonly InningsState[];
  /** Wickets that would constitute all out, per batting side. */
  allOutWickets: (teamId: TeamId) => number;
}

/**
 * The match result once every innings is closed. DOMAIN-RULES §6.
 *
 * Limited-overs only; a Test draw is not computed here (DOMAIN-RULES §11).
 */
export function computeResult(input: OutcomeInput): MatchResult {
  const first = input.innings[0];
  const second = input.innings[1];

  if (first === undefined || second === undefined) {
    return noResult('Match ended before both innings were played');
  }

  const defendingTeamId = first.battingTeamId;
  const chasingTeamId = second.battingTeamId;

  if (second.closeReason === 'abandoned') {
    return noResult('Abandoned with no result');
  }

  if (second.runs > first.runs) {
    const wicketsLeft = input.allOutWickets(chasingTeamId) - second.wickets;
    return {
      kind: 'won_by_wickets',
      winnerTeamId: chasingTeamId,
      margin: wicketsLeft,
      marginUnit: 'wickets',
      description: `${chasingTeamId} won by ${wicketsLeft} wicket${wicketsLeft === 1 ? '' : 's'}`,
    };
  }

  if (first.runs > second.runs) {
    const margin = first.runs - second.runs;
    return {
      kind: 'won_by_runs',
      winnerTeamId: defendingTeamId,
      margin,
      marginUnit: 'runs',
      description: `${defendingTeamId} won by ${margin} run${margin === 1 ? '' : 's'}`,
    };
  }

  // Scores level with the chase complete.
  return {
    kind: 'tie',
    winnerTeamId: null,
    margin: null,
    marginUnit: null,
    description: input.config.rules.superOverOnTie
      ? 'Match tied — super over required'
      : 'Match tied',
  };
}

export function noResult(description: string): MatchResult {
  return {
    kind: 'no_result',
    winnerTeamId: null,
    margin: null,
    marginUnit: null,
    description,
  };
}

export function terminalResult(kind: 'abandoned' | 'cancelled', description: string): MatchResult {
  return { kind, winnerTeamId: null, margin: null, marginUnit: null, description };
}

/**
 * Net run rate. DOMAIN-RULES §7 — the two rules implementations get wrong:
 * a side bowled out counts as having faced its FULL quota, and overs are
 * divided as balls, never as the decimal "19.3".
 */
export interface NrrInningsInput {
  runs: number;
  legalBalls: number;
  /** True when the side was dismissed, or otherwise did not use its quota. */
  allOut: boolean;
  /** The quota in overs for that innings, after any interruption reduction. */
  quotaOvers: number;
}

export function inningsRunRate(innings: NrrInningsInput): number {
  const overs = innings.allOut ? innings.quotaOvers : innings.legalBalls / 6;
  if (overs === 0) return 0;
  return innings.runs / overs;
}

export function netRunRate(
  scored: readonly NrrInningsInput[],
  conceded: readonly NrrInningsInput[],
): number {
  const forRuns = scored.reduce((sum, i) => sum + i.runs, 0);
  const forOvers = scored.reduce((sum, i) => sum + (i.allOut ? i.quotaOvers : i.legalBalls / 6), 0);
  const againstRuns = conceded.reduce((sum, i) => sum + i.runs, 0);
  const againstOvers = conceded.reduce(
    (sum, i) => sum + (i.allOut ? i.quotaOvers : i.legalBalls / 6),
    0,
  );

  const forRate = forOvers === 0 ? 0 : forRuns / forOvers;
  const againstRate = againstOvers === 0 ? 0 : againstRuns / againstOvers;
  return forRate - againstRate;
}
