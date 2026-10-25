/**
 * Core domain types for the Criczen scoring engine.
 *
 * See docs/ARCHITECTURE.md §3 and docs/DOMAIN-RULES.md.
 *
 * Invariants for this package:
 *   - pure: no I/O, no clock, no randomness
 *   - total: never throws on bad input; returns Result
 *   - deterministic: replay(events) is identical on device and server
 */

export type PlayerId = string;
export type TeamId = string;
export type UserId = string;
export type MatchId = string;

export type InningsNo = 1 | 2 | 3 | 4;

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

// ---------------------------------------------------------------------------
// Rule violations
// ---------------------------------------------------------------------------

export type ViolationCode =
  | 'MATCH_NOT_IN_SETUP'
  | 'MATCH_ALREADY_CONCLUDED'
  | 'MATCH_NOT_LIVE'
  | 'TOSS_NOT_RECORDED'
  | 'TOSS_ALREADY_RECORDED'
  | 'SQUAD_NOT_SET'
  | 'SQUAD_ALREADY_SET'
  | 'UNKNOWN_TEAM'
  | 'UNKNOWN_PLAYER'
  | 'PLAYER_NOT_IN_XI'
  | 'XI_SIZE_INVALID'
  | 'DUPLICATE_PLAYER_IN_XI'
  | 'NO_CURRENT_INNINGS'
  | 'INNINGS_ALREADY_OPEN'
  | 'INNINGS_CLOSED'
  | 'INNINGS_NOT_CLOSED'
  | 'INNINGS_SEQUENCE_INVALID'
  | 'BATTER_UNAVAILABLE'
  | 'BATTER_ALREADY_AT_CREASE'
  | 'SAME_BATTER_BOTH_ENDS'
  | 'BOWLER_FROM_BATTING_SIDE'
  | 'BOWLER_CONSECUTIVE_OVERS'
  | 'BOWLER_OVER_LIMIT_REACHED'
  | 'OVER_IN_PROGRESS'
  | 'NO_BOWLER_SELECTED'
  | 'RUNS_OFF_BAT_ON_WIDE'
  | 'RUNS_OFF_BAT_INVALID'
  | 'EXTRA_RUNS_NEGATIVE'
  | 'OVERTHROW_NEGATIVE'
  | 'DISMISSAL_IMPOSSIBLE_ON_NO_BALL'
  | 'DISMISSAL_IMPOSSIBLE_ON_FREE_HIT'
  | 'DISMISSAL_NOT_SUPPORTED'
  | 'DISMISSED_PLAYER_NOT_AT_CREASE'
  | 'DISMISSAL_REQUIRES_FIELDER'
  | 'DISMISSAL_REQUIRES_CROSSED_FLAG'
  | 'KEEPER_REQUIRED_FOR_STUMPING'
  | 'FIELDER_FROM_BATTING_SIDE'
  | 'TARGET_EVENT_NOT_FOUND'
  | 'TARGET_EVENT_NOT_A_DELIVERY'
  | 'TARGET_EVENT_ALREADY_VOIDED'
  | 'PENALTY_RUNS_INVALID'
  | 'OVERS_LOST_INVALID'
  | 'REVISED_TARGET_INVALID'
  | 'NOT_CHASING_INNINGS'
  | 'INTERRUPTION_ALREADY_ACTIVE'
  | 'NO_ACTIVE_INTERRUPTION'
  | 'DUPLICATE_EVENT_ID'
  | 'EVENT_OUT_OF_ORDER'
  | 'INCOMING_BATTER_REQUIRED'
  | 'INCOMING_BATTER_UNAVAILABLE'
  /** Corrections and voids rewrite history; they must go through replay(). */
  | 'REQUIRES_REPLAY'
  | 'UNSUPPORTED_IN_PHASE_0';

export interface RuleViolation {
  code: ViolationCode;
  /** Human-readable, for logs and developer surfaces — not for end users. */
  detail: string;
  /** The event that could not be applied, when known. */
  eventId?: string;
}

// ---------------------------------------------------------------------------
// Match configuration
// ---------------------------------------------------------------------------

export type MatchFormat = 'T10' | 'T20' | 'ODI' | 'TEST' | 'CUSTOM';
export type BallType = 'leather' | 'tennis';

export interface OverRange {
  /** Inclusive, zero-indexed over number. */
  from: number;
  /** Exclusive. */
  to: number;
}

export interface MatchRules {
  /** Runs awarded for a wide, before any runs the batters run. */
  widePenalty: number;
  /** Runs awarded for a no-ball, before runs off the bat. */
  noBallPenalty: number;
  /** Whether a no-ball grants a free hit on the following delivery. */
  freeHitOnNoBall: boolean;
  /** Maximum overs per bowler. Null means derive as ceil(totalOvers / 5). */
  maxOversPerBowler: number | null;
  /**
   * MCC Law 18.11 (2022): on a catch, the incoming batter takes strike
   * regardless of whether the batters crossed. Configurable because local
   * tennis-ball competitions predate and sometimes ignore the change.
   */
  newBatterTakesStrikeOnCatch: boolean;
  /** A tie triggers a super over (modelled as a separate linked match). */
  superOverOnTie: boolean;
}

export interface MatchConfig {
  matchId: MatchId;
  format: MatchFormat;
  ballType: BallType;
  /** Overs per innings. Ignored for TEST (deferred — DOMAIN-RULES §11). */
  totalOvers: number;
  /** Players per side. Usually 11; local games vary. */
  playersPerSide: number;
  /** Caps wickets per innings below XI - 1: a super over is all out at 2. */
  wicketsPerInnings?: number;
  teams: readonly [TeamId, TeamId];
  powerplays: readonly OverRange[];
  rules: MatchRules;
}

// ---------------------------------------------------------------------------
// Deliveries — observed facts only (ARCHITECTURE §3.3)
// ---------------------------------------------------------------------------

export type ExtraType = 'wide' | 'noball' | 'bye' | 'legbye';

export interface Extra {
  type: ExtraType;
  /**
   * Runs in ADDITION to the penalty, for wide/noball — i.e. runs the batters
   * ran, or byes conceded off a no-ball. For bye/legbye, the runs run.
   */
  runs: number;
}

export type DismissalKind =
  | 'bowled'
  | 'caught'
  | 'caught_and_bowled'
  | 'lbw'
  | 'run_out'
  | 'stumped'
  | 'hit_wicket'
  | 'obstructing'
  | 'hit_twice';

export interface WicketInput {
  kind: DismissalKind;
  /** Explicit, never inferred — on a run out this is frequently the non-striker. */
  playerOutId: PlayerId;
  fielderIds?: readonly PlayerId[];
  /** Required for run_out: did the batters cross before the dismissal? */
  battersCrossed?: boolean;
  /**
   * The batter arriving at the crease. A scorer decision, not an observed
   * fact, but it belongs on the ball: recording it here keeps replay stable
   * and the audit trail complete. Omitted when no batter is left to come.
   */
  incomingBatterId?: PlayerId;
}

export interface Delivery {
  runsOffBat: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  extra?: Extra;
  overthrowRuns?: number;
  wicket?: WicketInput;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type ReplacementReason = 'retired_hurt' | 'retired_out' | 'substitute';
export type InterruptionReason = 'rain' | 'light' | 'other';
export type InningsCloseReason = 'overs' | 'all_out' | 'target_reached' | 'declared' | 'abandoned';
export type MatchStatusChange = 'paused' | 'resumed' | 'abandoned' | 'cancelled';

export type Payload =
  | { kind: 'match.created'; config: MatchConfig }
  | {
      kind: 'squad.set';
      teamId: TeamId;
      playingXI: readonly PlayerId[];
      captainId: PlayerId;
      keeperId: PlayerId;
    }
  | { kind: 'toss.recorded'; winnerTeamId: TeamId; choice: 'bat' | 'bowl' }
  | {
      kind: 'innings.opened';
      inningsNo: InningsNo;
      battingTeamId: TeamId;
      strikerId: PlayerId;
      nonStrikerId: PlayerId;
      bowlerId: PlayerId;
    }
  | { kind: 'delivery.recorded'; delivery: Delivery }
  | { kind: 'delivery.corrected'; targetEventId: string; delivery: Delivery }
  | { kind: 'delivery.voided'; targetEventId: string; reason?: string }
  | { kind: 'bowler.changed'; bowlerId: PlayerId }
  | { kind: 'strike.swapped'; reason?: string }
  | {
      kind: 'batter.replaced';
      outgoingId: PlayerId;
      incomingId: PlayerId;
      reason: ReplacementReason;
    }
  | { kind: 'penalty.awarded'; teamId: TeamId; runs: number; reason: string }
  | { kind: 'interruption.started'; reason: InterruptionReason }
  | { kind: 'interruption.ended'; oversLost: number }
  | { kind: 'target.revised'; runs: number; overs: number; method: 'manual' }
  | { kind: 'innings.closed'; reason: InningsCloseReason }
  | { kind: 'match.status.changed'; status: MatchStatusChange };

export type PayloadKind = Payload['kind'];

export interface MatchEvent {
  /** UUIDv7, generated on the device. The idempotency key. */
  id: string;
  matchId: MatchId;
  /** Device-monotonic, orders the offline queue. */
  localSeq: number;
  /** Assigned by the server on accept; null while pending. */
  serverSeq: number | null;
  /** Who recorded it (§10 audit). */
  actorId: UserId;
  deviceId: string;
  /** ISO timestamp from the recording device. The engine's only source of time. */
  at: string;
  payload: Payload;
}

// ---------------------------------------------------------------------------
// Derived state
// ---------------------------------------------------------------------------

export type MatchStatus =
  | 'setup'
  | 'toss_done'
  | 'live'
  | 'innings_break'
  | 'paused'
  | 'complete'
  | 'abandoned'
  | 'cancelled';

export type BatterStatus =
  | 'did_not_bat'
  | 'at_crease'
  | 'out'
  | 'retired_hurt'
  | 'retired_out'
  | 'not_out';

export interface Dismissal {
  kind: DismissalKind | 'retired_out';
  /** Null for run out, obstructing, hit twice and retired out. */
  bowlerId: PlayerId | null;
  fielderIds: readonly PlayerId[];
  /** Team score when the wicket fell. */
  atRuns: number;
  /** Legal balls bowled when the wicket fell. */
  atLegalBalls: number;
}

export interface BatterState {
  playerId: PlayerId;
  /** 1-based order of arrival at the crease. */
  position: number;
  runs: number;
  /** Legal balls plus no-balls faced; wides are not faced. */
  balls: number;
  fours: number;
  sixes: number;
  status: BatterStatus;
  dismissal: Dismissal | null;
}

export interface BowlerState {
  playerId: PlayerId;
  /** Legal balls only. Display overs are derived. */
  balls: number;
  /** Runs charged to the bowler: off the bat, wides and no-balls. */
  runs: number;
  wickets: number;
  maidens: number;
  dots: number;
  wides: number;
  noballs: number;
  /** Completed overs bowled, used for the per-bowler limit. */
  completedOvers: number;
}

export interface ExtrasBreakdown {
  wides: number;
  noballs: number;
  byes: number;
  legbyes: number;
  penalties: number;
}

export interface BallRecord {
  /** The event this ball was derived from. */
  eventId: string;
  inningsNo: InningsNo;
  /** Zero-indexed over. */
  overNo: number;
  /** 1-based position within the over, in standard notation. */
  ballInOver: number;
  legal: boolean;
  strikerId: PlayerId;
  nonStrikerId: PlayerId;
  bowlerId: PlayerId;
  runsOffBat: number;
  overthrowRuns: number;
  extra: Extra | null;
  wicket: (WicketInput & { bowlerCredited: boolean }) | null;
  /** Total runs added to the team from this delivery. */
  teamRuns: number;
  /** Runs charged to the bowler from this delivery. */
  bowlerRuns: number;
  wasFreeHit: boolean;
}

export interface Partnership {
  /** Wicket number this partnership precedes: 1 for the opening stand. */
  forWicket: number;
  batterIds: readonly [PlayerId, PlayerId];
  runs: number;
  balls: number;
  /** True while this is the live partnership. */
  unbroken: boolean;
}

export interface FallOfWicket {
  wicketNo: number;
  playerOutId: PlayerId;
  atRuns: number;
  atLegalBalls: number;
}

export interface InningsState {
  inningsNo: InningsNo;
  battingTeamId: TeamId;
  bowlingTeamId: TeamId;
  runs: number;
  wickets: number;
  legalBalls: number;
  extras: ExtrasBreakdown;
  /** May be reduced below config.totalOvers by interruptions. */
  totalOvers: number;
  /** Runs needed to win. Set for the chasing innings only. */
  target: number | null;
  strikerId: PlayerId | null;
  nonStrikerId: PlayerId | null;
  bowlerId: PlayerId | null;
  /** Bowler of the previous completed over, to block consecutive overs. */
  lastOverBowlerId: PlayerId | null;
  freeHit: boolean;
  batters: Record<PlayerId, BatterState>;
  bowlers: Record<PlayerId, BowlerState>;
  /** Order of arrival at the crease. */
  battingOrder: PlayerId[];
  balls: BallRecord[];
  partnerships: Partnership[];
  fallOfWickets: FallOfWicket[];
  closed: boolean;
  closeReason: InningsCloseReason | null;
  interruptionActive: boolean;
  /** Overs lost to interruptions in this innings. */
  oversLost: number;
  revisedTarget: { runs: number; overs: number; method: 'manual' } | null;
}

export interface Squad {
  teamId: TeamId;
  playingXI: readonly PlayerId[];
  captainId: PlayerId;
  keeperId: PlayerId;
}

export type ResultKind =
  | 'won_by_runs'
  | 'won_by_wickets'
  | 'tie'
  | 'no_result'
  | 'abandoned'
  | 'cancelled';

export interface MatchResult {
  kind: ResultKind;
  winnerTeamId: TeamId | null;
  margin: number | null;
  /** 'runs' | 'wickets' | null — the unit the margin is expressed in. */
  marginUnit: 'runs' | 'wickets' | null;
  /** Rendered sentence is a UI concern; this is the structured fact. */
  description: string;
}

export interface MatchState {
  matchId: MatchId;
  config: MatchConfig;
  status: MatchStatus;
  toss: { winnerTeamId: TeamId; choice: 'bat' | 'bowl' } | null;
  squads: Record<TeamId, Squad>;
  innings: InningsState[];
  /** Index into innings, or null between innings and before the first. */
  currentInningsIndex: number | null;
  result: MatchResult | null;
  /** Applied event ids, for duplicate detection and void targeting. */
  appliedEventIds: string[];
  /** Event ids voided by delivery.voided — their balls are excluded. */
  voidedEventIds: string[];
  /**
   * Penalty runs awarded to a side that is not currently batting. Credited to
   * their innings when it opens.
   */
  pendingPenalties: Record<TeamId, number>;
}
