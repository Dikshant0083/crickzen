import { reduce } from './reduce.js';
import { err, ok, violation } from './result.js';
import type { Delivery, MatchEvent, MatchState, Result, RuleViolation } from './types.js';

/**
 * Rebuild match state from the event log.
 *
 * Corrections and voids are resolved here rather than in `reduce`, because
 * both rewrite history: a corrected ball changes every downstream striker
 * assignment, so the only consistent answer is to substitute the delivery and
 * fold the log again (ARCHITECTURE §3.5).
 *
 * Replay is cheap — a T20 innings is ~130 events — so this is the normal path
 * after any edit, not a fallback.
 */
export function replay(events: readonly MatchEvent[]): Result<MatchState, RuleViolation> {
  const plan = resolveHistory(events);
  if (plan.kind === 'error') return { ok: false, error: plan.error };

  let state: MatchState | null = null;
  for (const event of plan.events) {
    const result = reduce(state, event);
    if (!result.ok) return result;
    state = result.value;
  }

  if (state === null) {
    return err('MATCH_NOT_IN_SETUP', 'Event log is empty');
  }

  return ok({ ...state, voidedEventIds: [...plan.voided] });
}

type HistoryPlan =
  | { kind: 'plan'; events: MatchEvent[]; voided: Set<string> }
  | { kind: 'error'; error: RuleViolation };

/**
 * Flatten corrections and voids into a forward-only event list.
 *
 * A later correction supersedes an earlier one for the same ball. A void wins
 * over any correction: an undone ball is gone whatever was done to it first.
 */
function resolveHistory(events: readonly MatchEvent[]): HistoryPlan {
  const corrections = new Map<string, Delivery>();
  const voided = new Set<string>();
  const deliveryIds = new Set<string>();

  for (const event of events) {
    if (event.payload.kind === 'delivery.recorded') {
      deliveryIds.add(event.id);
    }
  }

  for (const event of events) {
    const payload = event.payload;
    if (payload.kind === 'delivery.corrected') {
      if (!deliveryIds.has(payload.targetEventId)) {
        return {
          kind: 'error',
          error: violation(
            'TARGET_EVENT_NOT_A_DELIVERY',
            `Correction targets ${payload.targetEventId}, which is not a recorded delivery`,
            event.id,
          ),
        };
      }
      if (voided.has(payload.targetEventId)) {
        return {
          kind: 'error',
          error: violation(
            'TARGET_EVENT_ALREADY_VOIDED',
            `Cannot correct ${payload.targetEventId} — it was voided`,
            event.id,
          ),
        };
      }
      corrections.set(payload.targetEventId, payload.delivery);
    } else if (payload.kind === 'delivery.voided') {
      if (!deliveryIds.has(payload.targetEventId)) {
        return {
          kind: 'error',
          error: violation(
            'TARGET_EVENT_NOT_A_DELIVERY',
            `Void targets ${payload.targetEventId}, which is not a recorded delivery`,
            event.id,
          ),
        };
      }
      voided.add(payload.targetEventId);
      corrections.delete(payload.targetEventId);
    }
  }

  const plan: MatchEvent[] = [];
  for (const event of events) {
    const payload = event.payload;

    if (payload.kind === 'delivery.corrected' || payload.kind === 'delivery.voided') {
      continue;
    }

    if (payload.kind === 'delivery.recorded') {
      if (voided.has(event.id)) continue;
      const corrected = corrections.get(event.id);
      if (corrected !== undefined) {
        plan.push({ ...event, payload: { kind: 'delivery.recorded', delivery: corrected } });
        continue;
      }
    }

    plan.push(event);
  }

  return { kind: 'plan', events: plan, voided };
}

/**
 * Convenience for the common edit operations, returning the event payloads to
 * append. The caller supplies ids, actor and timestamps — the engine has no
 * clock and no id generator.
 */
export function voidLastDelivery(state: MatchState): { targetEventId: string } | null {
  const innings = state.innings[state.currentInningsIndex ?? -1];
  if (innings === undefined) return null;
  const last = innings.balls[innings.balls.length - 1];
  if (last === undefined) return null;
  return { targetEventId: last.eventId };
}
