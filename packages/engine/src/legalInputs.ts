import { maxOversPerBowler } from './config.js';
import { possibleOffNoBall } from './rules/dismissal.js';
import {
  availableBatters,
  ballsInCurrentOver,
  ballsRemaining,
  currentInnings,
  currentOverNo,
  requiredRunRate,
  runRate,
  squadOf,
} from './state.js';
import type { DismissalKind, ExtraType, MatchState, PlayerId } from './types.js';

const ALL_DISMISSALS: readonly DismissalKind[] = [
  'bowled',
  'caught',
  'caught_and_bowled',
  'lbw',
  'run_out',
  'stumped',
  'hit_wicket',
  'obstructing',
  'hit_twice',
];

/**
 * What the scorer may do right now. Drives button enable/disable so the UI
 * never offers an input the reducer would reject (ARCHITECTURE §3.4).
 */
export interface InputAffordances {
  canScore: boolean;
  /** Why not, when canScore is false. */
  blockedBy:
    | 'no_innings'
    | 'innings_closed'
    | 'match_complete'
    | 'needs_bowler'
    | 'needs_batter'
    | null;
  needsBowler: boolean;
  needsBatter: boolean;
  availableExtras: readonly ExtraType[];
  availableDismissals: readonly DismissalKind[];
  eligibleBowlers: readonly PlayerId[];
  availableBatters: readonly PlayerId[];
  freeHit: boolean;
  overNo: number;
  ballsInOver: number;
  ballsRemaining: number;
  runsRequired: number | null;
  currentRunRate: number;
  requiredRunRate: number | null;
}

export function legalInputs(state: MatchState): InputAffordances {
  const innings = currentInnings(state);

  const base = {
    needsBowler: false,
    needsBatter: false,
    availableExtras: [] as readonly ExtraType[],
    availableDismissals: [] as readonly DismissalKind[],
    eligibleBowlers: [] as readonly PlayerId[],
    availableBatters: [] as readonly PlayerId[],
    freeHit: false,
    overNo: 0,
    ballsInOver: 0,
    ballsRemaining: 0,
    runsRequired: null,
    currentRunRate: 0,
    requiredRunRate: null,
  };

  if (state.status === 'complete' || state.status === 'abandoned' || state.status === 'cancelled') {
    return { ...base, canScore: false, blockedBy: 'match_complete' };
  }
  if (innings === null) {
    return { ...base, canScore: false, blockedBy: 'no_innings' };
  }
  if (innings.closed) {
    return { ...base, canScore: false, blockedBy: 'innings_closed' };
  }

  const needsBowler = innings.bowlerId === null;
  const needsBatter = innings.strikerId === null || innings.nonStrikerId === null;
  const target = innings.revisedTarget?.runs ?? innings.target;

  const extras: ExtraType[] = ['wide', 'noball', 'bye', 'legbye'];
  const dismissals = innings.freeHit ? ALL_DISMISSALS.filter(possibleOffNoBall) : ALL_DISMISSALS;

  return {
    canScore: !needsBowler && !needsBatter,
    blockedBy: needsBowler ? 'needs_bowler' : needsBatter ? 'needs_batter' : null,
    needsBowler,
    needsBatter,
    availableExtras: extras,
    availableDismissals: dismissals,
    eligibleBowlers: eligibleBowlers(state),
    availableBatters: availableBatters(state, innings),
    freeHit: innings.freeHit,
    overNo: currentOverNo(innings),
    ballsInOver: ballsInCurrentOver(innings),
    ballsRemaining: ballsRemaining(innings),
    runsRequired: target === null ? null : Math.max(0, target - innings.runs),
    currentRunRate: runRate(innings),
    requiredRunRate: requiredRunRate(innings),
  };
}

/** Bowlers who may legally bowl the next over. */
export function eligibleBowlers(state: MatchState): PlayerId[] {
  const innings = currentInnings(state);
  if (innings === null) return [];
  const squad = squadOf(state, innings.bowlingTeamId);
  if (squad === null) return [];

  const limit = maxOversPerBowler(state.config);
  return squad.playingXI.filter((playerId) => {
    if (playerId === innings.lastOverBowlerId) return false;
    const bowler = innings.bowlers[playerId];
    if (bowler === undefined) return true;
    return bowler.completedOvers < limit;
  });
}
