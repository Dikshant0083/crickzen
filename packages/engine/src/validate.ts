import { maxOversPerBowler } from './config.js';
import { violation } from './result.js';
import { possibleOffNoBall, requiresFielder } from './rules/dismissal.js';
import {
  allOutWicketCount,
  availableBatters,
  ballsInCurrentOver,
  ballsRemaining,
  currentInnings,
  otherTeam,
  squadOf,
} from './state.js';
import type {
  Delivery,
  InningsState,
  MatchState,
  Payload,
  PlayerId,
  RuleViolation,
  TeamId,
} from './types.js';

/**
 * Rule violations that would block `payload` from being applied to `state`.
 * Empty means the event is applicable.
 *
 * Called twice for every ball: by the app to grey out impossible inputs, and
 * by the server to reject a stale or malicious write (ARCHITECTURE §3.4).
 */
export function validate(state: MatchState | null, payload: Payload): RuleViolation[] {
  if (state === null) {
    return payload.kind === 'match.created'
      ? []
      : [violation('MATCH_NOT_IN_SETUP', `${payload.kind} before match.created`)];
  }

  if (state.status === 'complete' && payload.kind !== 'match.status.changed') {
    return [violation('MATCH_ALREADY_CONCLUDED', `${payload.kind} after the match concluded`)];
  }

  switch (payload.kind) {
    case 'match.created':
      return [violation('MATCH_NOT_IN_SETUP', 'match.created applied twice')];

    case 'squad.set':
      return validateSquadSet(state, payload);

    case 'toss.recorded':
      return validateToss(state, payload);

    case 'innings.opened':
      return validateInningsOpen(state, payload);

    case 'delivery.recorded':
      return validateDelivery(state, payload.delivery);

    case 'delivery.corrected':
    case 'delivery.voided':
      return [
        violation(
          'REQUIRES_REPLAY',
          `${payload.kind} rewrites history — apply it with replay(), not reduce()`,
        ),
      ];

    case 'bowler.changed':
      return validateBowlerChange(state, payload.bowlerId);

    case 'strike.swapped':
      return requireLiveInnings(state).violations;

    case 'batter.replaced':
      return validateBatterReplaced(state, payload.outgoingId, payload.incomingId);

    case 'penalty.awarded':
      return validatePenalty(state, payload.teamId, payload.runs);

    case 'interruption.started': {
      const { innings, violations } = requireLiveInnings(state);
      if (innings === null) return violations;
      return innings.interruptionActive
        ? [violation('INTERRUPTION_ALREADY_ACTIVE', 'An interruption is already active')]
        : [];
    }

    case 'interruption.ended':
      return validateInterruptionEnd(state, payload.oversLost);

    case 'target.revised':
      return validateTargetRevision(state, payload.runs, payload.overs);

    case 'innings.closed': {
      const { innings, violations } = requireLiveInnings(state);
      if (innings === null) return violations;
      return [];
    }

    case 'match.status.changed':
      return [];
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function validateSquadSet(
  state: MatchState,
  payload: Extract<Payload, { kind: 'squad.set' }>,
): RuleViolation[] {
  const out: RuleViolation[] = [];

  if (!state.config.teams.includes(payload.teamId)) {
    out.push(violation('UNKNOWN_TEAM', `${payload.teamId} is not in this match`));
    return out;
  }

  if (state.innings.length > 0) {
    out.push(violation('SQUAD_ALREADY_SET', 'Squads cannot change once an innings has opened'));
    return out;
  }

  const xi = payload.playingXI;
  if (xi.length < 2 || xi.length > state.config.playersPerSide) {
    out.push(
      violation(
        'XI_SIZE_INVALID',
        `Playing XI must hold 2..${state.config.playersPerSide} players, got ${xi.length}`,
      ),
    );
  }

  if (new Set(xi).size !== xi.length) {
    out.push(violation('DUPLICATE_PLAYER_IN_XI', 'The same player appears twice in the XI'));
  }

  if (!xi.includes(payload.captainId)) {
    out.push(violation('PLAYER_NOT_IN_XI', 'Captain is not in the playing XI'));
  }

  if (!xi.includes(payload.keeperId)) {
    out.push(violation('PLAYER_NOT_IN_XI', 'Wicketkeeper is not in the playing XI'));
  }

  return out;
}

function validateToss(
  state: MatchState,
  payload: Extract<Payload, { kind: 'toss.recorded' }>,
): RuleViolation[] {
  if (state.toss !== null) {
    return [violation('TOSS_ALREADY_RECORDED', 'The toss has already been recorded')];
  }
  if (!state.config.teams.includes(payload.winnerTeamId)) {
    return [violation('UNKNOWN_TEAM', `${payload.winnerTeamId} is not in this match`)];
  }
  const missing = state.config.teams.filter((t) => squadOf(state, t) === null);
  if (missing.length > 0) {
    return [violation('SQUAD_NOT_SET', `Squad not set for ${missing.join(', ')}`)];
  }
  return [];
}

function validateInningsOpen(
  state: MatchState,
  payload: Extract<Payload, { kind: 'innings.opened' }>,
): RuleViolation[] {
  const out: RuleViolation[] = [];

  if (state.toss === null) {
    out.push(violation('TOSS_NOT_RECORDED', 'The toss must be recorded before play'));
    return out;
  }

  if (payload.inningsNo !== state.innings.length + 1) {
    out.push(
      violation(
        'INNINGS_SEQUENCE_INVALID',
        `Expected innings ${state.innings.length + 1}, got ${payload.inningsNo}`,
      ),
    );
    return out;
  }

  const open = state.innings.find((i) => !i.closed);
  if (open !== undefined) {
    out.push(violation('INNINGS_ALREADY_OPEN', `Innings ${open.inningsNo} is still open`));
    return out;
  }

  if (!state.config.teams.includes(payload.battingTeamId)) {
    out.push(violation('UNKNOWN_TEAM', `${payload.battingTeamId} is not in this match`));
    return out;
  }

  const battingSquad = squadOf(state, payload.battingTeamId);
  const bowlingSquad = squadOf(state, otherTeam(state.config, payload.battingTeamId));
  if (battingSquad === null || bowlingSquad === null) {
    out.push(violation('SQUAD_NOT_SET', 'Both squads must be set before an innings opens'));
    return out;
  }

  if (payload.strikerId === payload.nonStrikerId) {
    out.push(violation('SAME_BATTER_BOTH_ENDS', 'Striker and non-striker must differ'));
  }
  for (const id of [payload.strikerId, payload.nonStrikerId]) {
    if (!battingSquad.playingXI.includes(id)) {
      out.push(violation('PLAYER_NOT_IN_XI', `${id} is not in the batting XI`));
    }
  }
  if (!bowlingSquad.playingXI.includes(payload.bowlerId)) {
    out.push(violation('PLAYER_NOT_IN_XI', `${payload.bowlerId} is not in the bowling XI`));
  }

  return out;
}

// ---------------------------------------------------------------------------
// Live play
// ---------------------------------------------------------------------------

interface LiveInnings {
  innings: InningsState | null;
  violations: RuleViolation[];
}

function requireLiveInnings(state: MatchState): LiveInnings {
  const innings = currentInnings(state);
  if (innings === null) {
    return { innings: null, violations: [violation('NO_CURRENT_INNINGS', 'No innings is open')] };
  }
  if (innings.closed) {
    return {
      innings: null,
      violations: [violation('INNINGS_CLOSED', `Innings ${innings.inningsNo} is closed`)],
    };
  }
  return { innings, violations: [] };
}

function validateDelivery(state: MatchState, delivery: Delivery): RuleViolation[] {
  const { innings, violations } = requireLiveInnings(state);
  if (innings === null) return violations;

  const out: RuleViolation[] = [];
  const { strikerId, nonStrikerId, bowlerId } = innings;

  if (strikerId === null || nonStrikerId === null) {
    out.push(violation('BATTER_UNAVAILABLE', 'Both ends must be occupied'));
  }
  if (bowlerId === null) {
    out.push(violation('NO_BOWLER_SELECTED', 'Select a bowler for the new over'));
  }
  if (out.length > 0) return out;

  if (delivery.runsOffBat < 0 || delivery.runsOffBat > 6) {
    out.push(violation('RUNS_OFF_BAT_INVALID', `runsOffBat ${delivery.runsOffBat} out of range`));
  }
  if (delivery.extra !== undefined && delivery.extra.runs < 0) {
    out.push(violation('EXTRA_RUNS_NEGATIVE', 'Extra runs cannot be negative'));
  }
  if (delivery.overthrowRuns !== undefined && delivery.overthrowRuns < 0) {
    out.push(violation('OVERTHROW_NEGATIVE', 'Overthrow runs cannot be negative'));
  }
  if (delivery.extra?.type === 'wide' && delivery.runsOffBat > 0) {
    out.push(violation('RUNS_OFF_BAT_ON_WIDE', 'Nothing can be scored off the bat on a wide'));
  }

  if (delivery.wicket !== undefined) {
    out.push(...validateWicket(state, innings, delivery));
  }

  return out;
}

function validateWicket(
  state: MatchState,
  innings: InningsState,
  delivery: Delivery,
): RuleViolation[] {
  const wicket = delivery.wicket;
  if (wicket === undefined) return [];

  const out: RuleViolation[] = [];
  const isNoBall = delivery.extra?.type === 'noball';

  if (isNoBall && !possibleOffNoBall(wicket.kind)) {
    out.push(
      violation('DISMISSAL_IMPOSSIBLE_ON_NO_BALL', `${wicket.kind} is not possible off a no-ball`),
    );
  }
  if (innings.freeHit && !isNoBall && !possibleOffNoBall(wicket.kind)) {
    out.push(
      violation('DISMISSAL_IMPOSSIBLE_ON_FREE_HIT', `${wicket.kind} is not possible on a free hit`),
    );
  }

  if (wicket.playerOutId !== innings.strikerId && wicket.playerOutId !== innings.nonStrikerId) {
    out.push(
      violation('DISMISSED_PLAYER_NOT_AT_CREASE', `${wicket.playerOutId} is not at the crease`),
    );
  }

  const fielders = wicket.fielderIds ?? [];
  if (requiresFielder(wicket.kind) && fielders.length === 0) {
    out.push(
      violation('DISMISSAL_REQUIRES_FIELDER', `${wicket.kind} requires at least one fielder`),
    );
  }

  const bowlingSquad = squadOf(state, innings.bowlingTeamId);
  if (bowlingSquad !== null) {
    for (const fielderId of fielders) {
      if (!bowlingSquad.playingXI.includes(fielderId)) {
        out.push(violation('FIELDER_FROM_BATTING_SIDE', `${fielderId} is not in the fielding XI`));
      }
    }
    if (wicket.kind === 'stumped' && !fielders.includes(bowlingSquad.keeperId)) {
      out.push(
        violation('KEEPER_REQUIRED_FOR_STUMPING', 'A stumping must credit the wicketkeeper'),
      );
    }
  }

  if (wicket.kind === 'run_out' && wicket.battersCrossed === undefined) {
    out.push(
      violation(
        'DISMISSAL_REQUIRES_CROSSED_FLAG',
        'A run out must record whether the batters crossed — it cannot be inferred',
      ),
    );
  }

  out.push(...validateIncomingBatter(state, innings, wicket.incomingBatterId));

  return out;
}

function validateIncomingBatter(
  state: MatchState,
  innings: InningsState,
  incomingBatterId: PlayerId | undefined,
): RuleViolation[] {
  const isFinalWicket = innings.wickets + 1 >= allOutWicketCount(state, innings);

  if (incomingBatterId === undefined) {
    return isFinalWicket
      ? []
      : [
          violation(
            'INCOMING_BATTER_REQUIRED',
            'Record which batter comes in — the engine does not choose',
          ),
        ];
  }

  if (isFinalWicket) {
    return [
      violation(
        'INCOMING_BATTER_UNAVAILABLE',
        'No batter is left to come in — this is the final wicket',
      ),
    ];
  }

  if (!availableBatters(state, innings).includes(incomingBatterId)) {
    return [
      violation('INCOMING_BATTER_UNAVAILABLE', `${incomingBatterId} cannot come to the crease`),
    ];
  }

  return [];
}

function validateBowlerChange(state: MatchState, bowlerId: PlayerId): RuleViolation[] {
  const { innings, violations } = requireLiveInnings(state);
  if (innings === null) return violations;

  const out: RuleViolation[] = [];

  if (ballsInCurrentOver(innings) !== 0) {
    out.push(violation('OVER_IN_PROGRESS', 'A bowler can only be changed at the end of an over'));
  }

  const bowlingSquad = squadOf(state, innings.bowlingTeamId);
  if (bowlingSquad === null) {
    out.push(violation('SQUAD_NOT_SET', 'Bowling squad is not set'));
    return out;
  }
  if (!bowlingSquad.playingXI.includes(bowlerId)) {
    out.push(violation('BOWLER_FROM_BATTING_SIDE', `${bowlerId} is not in the bowling XI`));
    return out;
  }

  if (innings.lastOverBowlerId === bowlerId) {
    out.push(violation('BOWLER_CONSECUTIVE_OVERS', `${bowlerId} bowled the previous over`));
  }

  const bowler = innings.bowlers[bowlerId];
  const limit = maxOversPerBowler(state.config);
  if (bowler !== undefined && bowler.completedOvers >= limit) {
    out.push(violation('BOWLER_OVER_LIMIT_REACHED', `${bowlerId} has bowled their ${limit} overs`));
  }

  return out;
}

function validateBatterReplaced(
  state: MatchState,
  outgoingId: PlayerId,
  incomingId: PlayerId,
): RuleViolation[] {
  const { innings, violations } = requireLiveInnings(state);
  if (innings === null) return violations;

  const out: RuleViolation[] = [];

  if (outgoingId !== innings.strikerId && outgoingId !== innings.nonStrikerId) {
    out.push(violation('DISMISSED_PLAYER_NOT_AT_CREASE', `${outgoingId} is not at the crease`));
  }
  if (incomingId === innings.strikerId || incomingId === innings.nonStrikerId) {
    out.push(violation('BATTER_ALREADY_AT_CREASE', `${incomingId} is already at the crease`));
  }
  if (!availableBatters(state, innings).includes(incomingId)) {
    out.push(violation('BATTER_UNAVAILABLE', `${incomingId} cannot come to the crease`));
  }

  return out;
}

function validatePenalty(state: MatchState, teamId: TeamId, runs: number): RuleViolation[] {
  const out: RuleViolation[] = [];
  if (!state.config.teams.includes(teamId)) {
    out.push(violation('UNKNOWN_TEAM', `${teamId} is not in this match`));
  }
  if (!Number.isInteger(runs) || runs <= 0) {
    out.push(violation('PENALTY_RUNS_INVALID', 'Penalty runs must be a positive integer'));
  }
  return out;
}

function validateInterruptionEnd(state: MatchState, oversLost: number): RuleViolation[] {
  const { innings, violations } = requireLiveInnings(state);
  if (innings === null) return violations;

  const out: RuleViolation[] = [];
  if (!innings.interruptionActive) {
    out.push(violation('NO_ACTIVE_INTERRUPTION', 'No interruption is active'));
  }
  if (!Number.isInteger(oversLost) || oversLost < 0) {
    out.push(violation('OVERS_LOST_INVALID', 'Overs lost must be a non-negative integer'));
  } else if (oversLost * 6 > ballsRemaining(innings)) {
    out.push(
      violation(
        'OVERS_LOST_INVALID',
        `Cannot lose ${oversLost} overs — only ${ballsRemaining(innings) / 6} remain`,
      ),
    );
  }
  return out;
}

function validateTargetRevision(state: MatchState, runs: number, overs: number): RuleViolation[] {
  const { innings, violations } = requireLiveInnings(state);
  if (innings === null) return violations;

  const out: RuleViolation[] = [];
  if (innings.inningsNo === 1) {
    out.push(
      violation('NOT_CHASING_INNINGS', 'A target can only be revised for the chasing innings'),
    );
  }
  if (!Number.isInteger(runs) || runs <= 0) {
    out.push(violation('REVISED_TARGET_INVALID', 'Revised target must be a positive integer'));
  }
  if (!Number.isFinite(overs) || overs <= 0) {
    out.push(violation('REVISED_TARGET_INVALID', 'Revised overs must be positive'));
  }
  return out;
}
