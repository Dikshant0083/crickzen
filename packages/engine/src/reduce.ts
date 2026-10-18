import { inningsCount } from './config.js';
import { err, ok } from './result.js';
import { addExtras, attributeDelivery } from './rules/attribution.js';
import { bowlerIsCredited, resolveEnds } from './rules/dismissal.js';
import { computeResult, terminalResult } from './rules/outcome.js';
import {
  allOutWicketCount,
  currentInnings,
  initialState,
  newBatter,
  newBowler,
  newInnings,
  otherTeam,
  squadOf,
} from './state.js';
import type {
  BallRecord,
  BatterState,
  BowlerState,
  Delivery,
  InningsCloseReason,
  InningsState,
  MatchEvent,
  MatchState,
  Partnership,
  PlayerId,
  Result,
  RuleViolation,
} from './types.js';
import { validate } from './validate.js';

/**
 * Apply one event. Pure, total and deterministic.
 *
 * Pass `null` as state for the first event, which must be `match.created`.
 *
 * Corrections and voids rewrite history and are rejected here — they go
 * through `replay()` (ARCHITECTURE §3.5).
 */
export function reduce(
  state: MatchState | null,
  event: MatchEvent,
): Result<MatchState, RuleViolation> {
  if (state?.appliedEventIds.includes(event.id)) {
    return err('DUPLICATE_EVENT_ID', `Event ${event.id} was already applied`, event.id);
  }

  const violations = validate(state, event.payload);
  const first = violations[0];
  if (first !== undefined) {
    return err(first.code, first.detail, event.id);
  }

  const payload = event.payload;

  if (payload.kind === 'match.created') {
    const created = initialState(payload.config);
    return ok({ ...created, appliedEventIds: [event.id] });
  }

  if (state === null) {
    return err('MATCH_NOT_IN_SETUP', `${payload.kind} before match.created`, event.id);
  }

  const next = applied(state, event.id);

  switch (payload.kind) {
    case 'squad.set':
      return ok({
        ...next,
        squads: {
          ...next.squads,
          [payload.teamId]: {
            teamId: payload.teamId,
            playingXI: [...payload.playingXI],
            captainId: payload.captainId,
            keeperId: payload.keeperId,
          },
        },
      });

    case 'toss.recorded':
      return ok({
        ...next,
        status: 'toss_done',
        toss: { winnerTeamId: payload.winnerTeamId, choice: payload.choice },
      });

    case 'innings.opened':
      return openInnings(next, payload);

    case 'delivery.recorded':
      return applyDelivery(next, event.id, payload.delivery);

    case 'delivery.corrected':
    case 'delivery.voided':
      return err(
        'REQUIRES_REPLAY',
        `${payload.kind} rewrites history — apply it with replay()`,
        event.id,
      );

    case 'bowler.changed':
      return mapInnings(next, (innings) => ({ ...innings, bowlerId: payload.bowlerId }));

    case 'strike.swapped':
      return mapInnings(next, (innings) => ({
        ...innings,
        strikerId: innings.nonStrikerId,
        nonStrikerId: innings.strikerId,
      }));

    case 'batter.replaced':
      return replaceBatter(next, payload.outgoingId, payload.incomingId, payload.reason);

    case 'penalty.awarded':
      return applyPenalty(next, payload.teamId, payload.runs);

    case 'interruption.started':
      return mapInnings(next, (innings) => ({ ...innings, interruptionActive: true }));

    case 'interruption.ended':
      return mapInnings(next, (innings) => ({
        ...innings,
        interruptionActive: false,
        oversLost: innings.oversLost + payload.oversLost,
        totalOvers: innings.totalOvers - payload.oversLost,
      }));

    case 'target.revised':
      return mapInnings(next, (innings) => ({
        ...innings,
        revisedTarget: { runs: payload.runs, overs: payload.overs, method: payload.method },
        totalOvers: payload.overs,
      }));

    case 'innings.closed':
      return ok(closeInnings(next, payload.reason));

    case 'match.status.changed':
      return applyStatusChange(next, payload.status);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function applied(state: MatchState, eventId: string): MatchState {
  return { ...state, appliedEventIds: [...state.appliedEventIds, eventId] };
}

/** Replace the current innings, which validation has already proven open. */
function mapInnings(
  state: MatchState,
  fn: (innings: InningsState) => InningsState,
): Result<MatchState, RuleViolation> {
  const index = state.currentInningsIndex;
  const innings = currentInnings(state);
  if (index === null || innings === null) {
    return err('NO_CURRENT_INNINGS', 'No innings is open');
  }
  const updated = [...state.innings];
  updated[index] = fn(innings);
  return ok({ ...state, innings: updated });
}

function openInnings(
  state: MatchState,
  payload: Extract<MatchEvent['payload'], { kind: 'innings.opened' }>,
): Result<MatchState, RuleViolation> {
  const bowlingTeamId = otherTeam(state.config, payload.battingTeamId);
  const previous = state.innings[state.innings.length - 1];
  const target = previous === undefined ? null : previous.runs + 1;

  const innings = newInnings({
    inningsNo: payload.inningsNo,
    battingTeamId: payload.battingTeamId,
    bowlingTeamId,
    strikerId: payload.strikerId,
    nonStrikerId: payload.nonStrikerId,
    bowlerId: payload.bowlerId,
    totalOvers: state.config.totalOvers,
    target,
  });

  // Credit any penalty runs awarded to this side while they were fielding.
  const pending = state.pendingPenalties[payload.battingTeamId] ?? 0;
  const credited: InningsState =
    pending === 0
      ? innings
      : {
          ...innings,
          runs: pending,
          extras: { ...innings.extras, penalties: pending },
        };

  const pendingPenalties = { ...state.pendingPenalties };
  delete pendingPenalties[payload.battingTeamId];

  return ok({
    ...state,
    status: 'live',
    innings: [...state.innings, credited],
    currentInningsIndex: state.innings.length,
    pendingPenalties,
  });
}

function applyPenalty(
  state: MatchState,
  teamId: string,
  runs: number,
): Result<MatchState, RuleViolation> {
  const innings = currentInnings(state);

  if (innings !== null && !innings.closed && innings.battingTeamId === teamId) {
    return mapInnings(state, (current) => ({
      ...current,
      runs: current.runs + runs,
      extras: { ...current.extras, penalties: current.extras.penalties + runs },
    }));
  }

  // Awarded to the side that is not batting: hold it until their innings opens.
  const existingInnings = state.innings.findIndex((i) => i.battingTeamId === teamId);
  if (existingInnings >= 0) {
    const updated = [...state.innings];
    const target = state.innings[existingInnings];
    if (target !== undefined) {
      updated[existingInnings] = {
        ...target,
        runs: target.runs + runs,
        extras: { ...target.extras, penalties: target.extras.penalties + runs },
      };
    }
    return ok({ ...state, innings: updated });
  }

  return ok({
    ...state,
    pendingPenalties: {
      ...state.pendingPenalties,
      [teamId]: (state.pendingPenalties[teamId] ?? 0) + runs,
    },
  });
}

function applyStatusChange(
  state: MatchState,
  status: 'paused' | 'resumed' | 'abandoned' | 'cancelled',
): Result<MatchState, RuleViolation> {
  switch (status) {
    case 'paused':
      return ok({ ...state, status: 'paused' });
    case 'resumed':
      return ok({ ...state, status: currentInnings(state) === null ? 'toss_done' : 'live' });
    case 'abandoned':
      return ok({
        ...state,
        status: 'abandoned',
        result: terminalResult('abandoned', 'Match abandoned'),
      });
    case 'cancelled':
      return ok({
        ...state,
        status: 'cancelled',
        result: terminalResult('cancelled', 'Match cancelled'),
      });
  }
}

function replaceBatter(
  state: MatchState,
  outgoingId: PlayerId,
  incomingId: PlayerId,
  reason: 'retired_hurt' | 'retired_out' | 'substitute',
): Result<MatchState, RuleViolation> {
  return mapInnings(state, (innings) => {
    const outgoing = innings.batters[outgoingId];
    const isWicket = reason === 'retired_out';

    const batters: Record<PlayerId, BatterState> = { ...innings.batters };
    if (outgoing !== undefined) {
      batters[outgoingId] = {
        ...outgoing,
        status: reason === 'retired_out' ? 'retired_out' : 'retired_hurt',
        dismissal: isWicket
          ? {
              kind: 'retired_out',
              bowlerId: null,
              fielderIds: [],
              atRuns: innings.runs,
              atLegalBalls: innings.legalBalls,
            }
          : outgoing.dismissal,
      };
    }
    batters[incomingId] = newBatter(incomingId, innings.battingOrder.length + 1);

    const wickets = isWicket ? innings.wickets + 1 : innings.wickets;
    const surviving = innings.strikerId === outgoingId ? innings.nonStrikerId : innings.strikerId;

    return {
      ...innings,
      batters,
      battingOrder: [...innings.battingOrder, incomingId],
      wickets,
      strikerId: innings.strikerId === outgoingId ? incomingId : innings.strikerId,
      nonStrikerId: innings.nonStrikerId === outgoingId ? incomingId : innings.nonStrikerId,
      fallOfWickets: isWicket
        ? [
            ...innings.fallOfWickets,
            {
              wicketNo: wickets,
              playerOutId: outgoingId,
              atRuns: innings.runs,
              atLegalBalls: innings.legalBalls,
            },
          ]
        : innings.fallOfWickets,
      partnerships: breakPartnership(innings.partnerships, wickets, surviving, incomingId),
    };
  });
}

function breakPartnership(
  partnerships: readonly Partnership[],
  wicketsAfter: number,
  survivingId: PlayerId | null,
  incomingId: PlayerId | null,
): Partnership[] {
  const updated = partnerships.map((p) => (p.unbroken ? { ...p, unbroken: false } : p));
  if (survivingId === null || incomingId === null) return updated;
  updated.push({
    forWicket: wicketsAfter + 1,
    batterIds: [survivingId, incomingId],
    runs: 0,
    balls: 0,
    unbroken: true,
  });
  return updated;
}

// ---------------------------------------------------------------------------
// The delivery
// ---------------------------------------------------------------------------

function applyDelivery(
  state: MatchState,
  eventId: string,
  delivery: Delivery,
): Result<MatchState, RuleViolation> {
  const index = state.currentInningsIndex;
  const innings = currentInnings(state);
  if (index === null || innings === null) {
    return err('NO_CURRENT_INNINGS', 'No innings is open', eventId);
  }

  const strikerId = innings.strikerId;
  const nonStrikerId = innings.nonStrikerId;
  const bowlerId = innings.bowlerId;
  if (strikerId === null || nonStrikerId === null || bowlerId === null) {
    return err('NO_BOWLER_SELECTED', 'Ends and bowler must be set', eventId);
  }

  const attribution = attributeDelivery(delivery, state.config.rules);
  const legalBallsBefore = innings.legalBalls;
  const legalBallsAfter = legalBallsBefore + (attribution.legal ? 1 : 0);
  const overNo = Math.floor(legalBallsBefore / 6);
  const overCompleted = attribution.legal && legalBallsAfter % 6 === 0;

  const wicket = delivery.wicket;
  const bowlerCredited = wicket !== undefined && bowlerIsCredited(wicket.kind);

  const ball: BallRecord = {
    eventId,
    inningsNo: innings.inningsNo,
    overNo,
    ballInOver: (legalBallsBefore % 6) + 1,
    legal: attribution.legal,
    strikerId,
    nonStrikerId,
    bowlerId,
    runsOffBat: delivery.runsOffBat,
    overthrowRuns: delivery.overthrowRuns ?? 0,
    extra: delivery.extra ?? null,
    wicket: wicket === undefined ? null : { ...wicket, bowlerCredited },
    teamRuns: attribution.teamRuns,
    bowlerRuns: attribution.bowlerRuns,
    wasFreeHit: innings.freeHit,
  };

  const balls = [...innings.balls, ball];
  const runs = innings.runs + attribution.teamRuns;
  const wickets = innings.wickets + (wicket === undefined ? 0 : 1);

  // --- striker ---
  const batters: Record<PlayerId, BatterState> = { ...innings.batters };
  const striker = batters[strikerId];
  if (striker !== undefined) {
    batters[strikerId] = {
      ...striker,
      runs: striker.runs + attribution.batterRuns,
      balls: striker.balls + (attribution.batterFacedBall ? 1 : 0),
      fours: striker.fours + (attribution.isFour ? 1 : 0),
      sixes: striker.sixes + (attribution.isSix ? 1 : 0),
    };
  }

  // --- bowler ---
  const bowlers: Record<PlayerId, BowlerState> = { ...innings.bowlers };
  const bowler = bowlers[bowlerId] ?? newBowler(bowlerId);
  const maidenEarned =
    overCompleted &&
    balls
      .filter((b) => b.overNo === overNo && b.bowlerId === bowlerId)
      .every((b) => b.bowlerRuns === 0);

  bowlers[bowlerId] = {
    ...bowler,
    balls: bowler.balls + (attribution.legal ? 1 : 0),
    runs: bowler.runs + attribution.bowlerRuns,
    wickets: bowler.wickets + (bowlerCredited ? 1 : 0),
    maidens: bowler.maidens + (maidenEarned ? 1 : 0),
    dots: bowler.dots + (attribution.legal && attribution.teamRuns === 0 ? 1 : 0),
    wides: bowler.wides + attribution.extras.wides,
    noballs: bowler.noballs + attribution.extras.noballs,
    completedOvers: bowler.completedOvers + (overCompleted ? 1 : 0),
  };

  // --- dismissal ---
  const battingOrder = [...innings.battingOrder];
  let fallOfWickets = innings.fallOfWickets;
  let partnerships = innings.partnerships.map((p) =>
    p.unbroken
      ? {
          ...p,
          runs: p.runs + attribution.teamRuns,
          balls: p.balls + (attribution.legal ? 1 : 0),
        }
      : p,
  );

  const incomingBatterId = wicket?.incomingBatterId ?? null;

  if (wicket !== undefined) {
    const outgoing = batters[wicket.playerOutId];
    if (outgoing !== undefined) {
      batters[wicket.playerOutId] = {
        ...outgoing,
        status: 'out',
        dismissal: {
          kind: wicket.kind,
          bowlerId: bowlerCredited ? bowlerId : null,
          fielderIds: [...(wicket.fielderIds ?? [])],
          atRuns: runs,
          atLegalBalls: legalBallsAfter,
        },
      };
    }

    fallOfWickets = [
      ...fallOfWickets,
      {
        wicketNo: wickets,
        playerOutId: wicket.playerOutId,
        atRuns: runs,
        atLegalBalls: legalBallsAfter,
      },
    ];

    const survivingId = wicket.playerOutId === strikerId ? nonStrikerId : strikerId;
    partnerships = breakPartnership(partnerships, wickets, survivingId, incomingBatterId);

    if (incomingBatterId !== null) {
      batters[incomingBatterId] = newBatter(incomingBatterId, battingOrder.length + 1);
      battingOrder.push(incomingBatterId);
    }
  }

  // --- ends ---
  const ends = resolveEnds({
    before: { strikerId, nonStrikerId },
    runsRun: attribution.runsRun,
    overCompleted,
    wicket,
    incomingBatterId,
    rules: state.config.rules,
  });

  // --- free hit (DOMAIN-RULES §4) ---
  const freeHit =
    delivery.extra?.type === 'noball' && state.config.rules.freeHitOnNoBall
      ? true
      : attribution.legal
        ? false
        : innings.freeHit;

  const updatedInnings: InningsState = {
    ...innings,
    runs,
    wickets,
    legalBalls: legalBallsAfter,
    extras: addExtras(innings.extras, attribution.extras),
    strikerId: ends.strikerId,
    nonStrikerId: ends.nonStrikerId,
    // A completed over clears the bowler: the scorer must choose the next one,
    // which is what enforces the consecutive-overs rule.
    bowlerId: overCompleted ? null : bowlerId,
    lastOverBowlerId: overCompleted ? bowlerId : innings.lastOverBowlerId,
    freeHit,
    batters,
    bowlers,
    battingOrder,
    balls,
    partnerships,
    fallOfWickets,
  };

  const withInnings = [...state.innings];
  withInnings[index] = updatedInnings;
  const nextState: MatchState = { ...state, innings: withInnings };

  const closeReason = inningsCloseReason(nextState, updatedInnings);
  return ok(closeReason === null ? nextState : closeInnings(nextState, closeReason));
}

/** DOMAIN-RULES §5, in precedence order. */
function inningsCloseReason(state: MatchState, innings: InningsState): InningsCloseReason | null {
  const target = innings.revisedTarget?.runs ?? innings.target;
  if (target !== null && innings.runs >= target) return 'target_reached';
  if (innings.wickets >= allOutWicketCount(state, innings)) return 'all_out';
  if (innings.legalBalls >= innings.totalOvers * 6) return 'overs';
  return null;
}

function closeInnings(state: MatchState, reason: InningsCloseReason): MatchState {
  const index = state.currentInningsIndex;
  const innings = currentInnings(state);
  if (index === null || innings === null) return state;

  const batters: Record<PlayerId, BatterState> = {};
  for (const [playerId, batter] of Object.entries(innings.batters)) {
    batters[playerId] = batter.status === 'at_crease' ? { ...batter, status: 'not_out' } : batter;
  }

  const closed: InningsState = {
    ...innings,
    closed: true,
    closeReason: reason,
    batters,
    partnerships: innings.partnerships.map((p) => (p.unbroken ? { ...p, unbroken: false } : p)),
  };

  const updated = [...state.innings];
  updated[index] = closed;

  const isFinalInnings = updated.length >= inningsCount(state.config);
  const withClosed: MatchState = {
    ...state,
    innings: updated,
    currentInningsIndex: index,
    status: isFinalInnings ? 'complete' : 'innings_break',
  };

  if (!isFinalInnings) return withClosed;

  return {
    ...withClosed,
    result: computeResult({
      config: withClosed.config,
      innings: withClosed.innings,
      allOutWickets: (teamId) => {
        const squad = squadOf(withClosed, teamId);
        return (squad?.playingXI.length ?? withClosed.config.playersPerSide) - 1;
      },
    }),
  };
}
