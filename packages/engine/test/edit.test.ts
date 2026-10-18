import { beforeEach, describe, expect, it } from 'vitest';
import { reduce, replay, voidLastDelivery } from '../src/index.js';
import { event, resetIds, Scorer } from './helpers.js';

beforeEach(resetIds);

describe('undo (DOMAIN-RULES §3, spec §3 "undo last delivery")', () => {
  it('removes the last delivery and everything it caused', () => {
    const scorer = Scorer.live().runs(4).runs(1);
    const target = scorer.lastId();

    expect(scorer.innings().runs).toBe(5);
    expect(scorer.innings().strikerId).toBe('a2');

    const undone = scorer.push({ kind: 'delivery.voided', targetEventId: target }).innings();

    expect(undone.runs).toBe(4);
    expect(undone.legalBalls).toBe(1);
    expect(undone.strikerId).toBe('a1');
    expect(undone.balls).toHaveLength(1);
  });

  it('undoes a wicket, restoring the dismissed batter', () => {
    const scorer = Scorer.live().runs(2).wicket('bowled', 'a1', { incoming: 'a3' });
    const target = scorer.lastId();

    expect(scorer.innings().wickets).toBe(1);
    expect(scorer.innings().batters['a1']?.status).toBe('out');

    const undone = scorer.push({ kind: 'delivery.voided', targetEventId: target }).innings();

    expect(undone.wickets).toBe(0);
    expect(undone.batters['a1']?.status).toBe('at_crease');
    expect(undone.batters['a3']).toBeUndefined();
    expect(undone.fallOfWickets).toHaveLength(0);
    expect(undone.bowlers['b1']?.wickets).toBe(0);
  });

  it('names the ball to undo from state', () => {
    const scorer = Scorer.live().runs(4).runs(1);
    const target = voidLastDelivery(scorer.expectState());

    expect(target?.targetEventId).toBe(scorer.lastId());
  });

  it('returns null when there is nothing to undo', () => {
    expect(voidLastDelivery(Scorer.live().expectState())).toBeNull();
  });
});

describe('correcting an earlier delivery (ARCHITECTURE §3.3)', () => {
  it('replays downstream strike assignments consistently', () => {
    // Over: 1, 0, 0, 0, 0, 0 — the single on ball 1 puts a2 on strike.
    const scorer = Scorer.live();
    scorer.runs(1);
    const firstBallId = scorer.lastId();
    scorer.runs(0).runs(0).runs(0).runs(0).runs(0);

    const before = scorer.innings();
    expect(before.runs).toBe(1);
    expect(before.batters['a1']?.runs).toBe(1);
    expect(before.batters['a1']?.balls).toBe(1);
    expect(before.batters['a2']?.balls).toBe(5);

    // Correct ball 1 from a single to two runs. a1 now keeps strike and faces
    // the whole over — every downstream ball is re-attributed.
    const after = scorer
      .push({
        kind: 'delivery.corrected',
        targetEventId: firstBallId,
        delivery: { runsOffBat: 2 },
      })
      .innings();

    expect(after.runs).toBe(2);
    expect(after.batters['a1']?.runs).toBe(2);
    expect(after.batters['a1']?.balls).toBe(6);
    expect(after.batters['a2']?.balls).toBe(0);
    expect(after.legalBalls).toBe(6);
  });

  it('lets a later correction supersede an earlier one', () => {
    const scorer = Scorer.live();
    scorer.runs(1);
    const ballId = scorer.lastId();

    const innings = scorer
      .push({ kind: 'delivery.corrected', targetEventId: ballId, delivery: { runsOffBat: 2 } })
      .push({ kind: 'delivery.corrected', targetEventId: ballId, delivery: { runsOffBat: 6 } })
      .innings();

    expect(innings.runs).toBe(6);
    expect(innings.batters['a1']?.sixes).toBe(1);
    expect(innings.batters['a1']?.fours).toBe(0);
  });

  it('lets a void win over a correction on the same ball', () => {
    const scorer = Scorer.live();
    scorer.runs(1);
    const ballId = scorer.lastId();

    const innings = scorer
      .push({ kind: 'delivery.corrected', targetEventId: ballId, delivery: { runsOffBat: 6 } })
      .push({ kind: 'delivery.voided', targetEventId: ballId })
      .innings();

    expect(innings.runs).toBe(0);
    expect(innings.balls).toHaveLength(0);
  });

  it('corrects a wide into a legal ball, shifting the whole over', () => {
    const scorer = Scorer.live();
    scorer.wide();
    const wideId = scorer.lastId();
    scorer.dot().dot().dot().dot().dot();

    expect(scorer.innings().legalBalls).toBe(5);
    expect(scorer.innings().runs).toBe(1);

    const after = scorer
      .push({
        kind: 'delivery.corrected',
        targetEventId: wideId,
        delivery: { runsOffBat: 0 },
      })
      .innings();

    expect(after.legalBalls).toBe(6);
    expect(after.runs).toBe(0);
    expect(after.extras.wides).toBe(0);
    expect(after.bowlerId).toBeNull();
    expect(after.bowlers['b1']?.maidens).toBe(1);
  });

  it('rejects a correction that targets something other than a delivery', () => {
    const error = Scorer.live()
      .runs(1)
      .push({ kind: 'delivery.corrected', targetEventId: 'nope', delivery: { runsOffBat: 2 } })
      .expectError();

    expect(error.code).toBe('TARGET_EVENT_NOT_A_DELIVERY');
  });

  it('rejects correcting a ball that was already voided', () => {
    const scorer = Scorer.live();
    scorer.runs(1);
    const ballId = scorer.lastId();

    const error = scorer
      .push({ kind: 'delivery.voided', targetEventId: ballId })
      .push({ kind: 'delivery.corrected', targetEventId: ballId, delivery: { runsOffBat: 2 } })
      .expectError();

    expect(error.code).toBe('TARGET_EVENT_ALREADY_VOIDED');
  });

  it('reports the voided balls on the state', () => {
    const scorer = Scorer.live();
    scorer.runs(1);
    const ballId = scorer.lastId();

    const state = scorer.push({ kind: 'delivery.voided', targetEventId: ballId }).expectState();

    expect(state.voidedEventIds).toEqual([ballId]);
  });
});

describe('reduce vs replay', () => {
  it('rejects a correction passed to reduce, directing the caller to replay', () => {
    const scorer = Scorer.live();
    scorer.runs(1);
    const ballId = scorer.lastId();

    const result = scorer.reduceOnce({
      kind: 'delivery.corrected',
      targetEventId: ballId,
      delivery: { runsOffBat: 2 },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('REQUIRES_REPLAY');
  });

  it('rejects a duplicate event id — the idempotency guarantee', () => {
    const scorer = Scorer.live().runs(1);
    const state = scorer.expectState();
    const duplicate = event({ kind: 'delivery.recorded', delivery: { runsOffBat: 1 } });
    const firstPass = reduce(state, duplicate);
    expect(firstPass.ok).toBe(true);

    if (firstPass.ok) {
      const secondPass = reduce(firstPass.value, duplicate);
      expect(secondPass.ok).toBe(false);
      if (!secondPass.ok) expect(secondPass.error.code).toBe('DUPLICATE_EVENT_ID');
    }
  });

  it('refuses an empty log', () => {
    const result = replay([]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('MATCH_NOT_IN_SETUP');
  });

  it('refuses a log that does not start with match.created', () => {
    const result = replay([event({ kind: 'toss.recorded', winnerTeamId: 'IND', choice: 'bat' })]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('MATCH_NOT_IN_SETUP');
  });
});
