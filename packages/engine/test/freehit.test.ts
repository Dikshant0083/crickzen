import { beforeEach, describe, expect, it } from 'vitest';
import { resetIds, Scorer } from './helpers.js';

beforeEach(resetIds);

describe('free hit (DOMAIN-RULES §4)', () => {
  it('arms a free hit on the delivery after a no-ball', () => {
    expect(Scorer.live().noball().innings().freeHit).toBe(true);
  });

  it('clears the free hit after the next legal delivery', () => {
    expect(Scorer.live().noball().dot().innings().freeHit).toBe(false);
  });

  it('persists the free hit through a wide (checklist #4)', () => {
    expect(Scorer.live().noball().wide().innings().freeHit).toBe(true);
  });

  it('persists the free hit through a second no-ball', () => {
    expect(Scorer.live().noball().noball().innings().freeHit).toBe(true);
  });

  it('records on the ball whether it was a free hit', () => {
    const innings = Scorer.live().noball().runs(4).dot().innings();

    expect(innings.balls.map((b) => b.wasFreeHit)).toEqual([false, true, false]);
  });

  it('does not arm a free hit when the format switches it off', () => {
    const innings = Scorer.live({ rules: { freeHitOnNoBall: false } })
      .noball()
      .innings();

    expect(innings.freeHit).toBe(false);
  });

  it('rejects a bowled dismissal off a no-ball', () => {
    const error = Scorer.live()
      .wicket('bowled', 'a1', { incoming: 'a3', extra: { type: 'noball', runs: 0 } })
      .expectError();

    expect(error.code).toBe('DISMISSAL_IMPOSSIBLE_ON_NO_BALL');
  });

  it('rejects a caught dismissal on a free hit', () => {
    const error = Scorer.live()
      .noball()
      .wicket('caught', 'a1', { incoming: 'a3', fielders: ['b5'] })
      .expectError();

    expect(error.code).toBe('DISMISSAL_IMPOSSIBLE_ON_FREE_HIT');
  });

  it('allows a run out on a free hit', () => {
    const innings = Scorer.live()
      .noball()
      .wicket('run_out', 'a1', { incoming: 'a3', fielders: ['b4'], crossed: false })
      .innings();

    expect(innings.wickets).toBe(1);
    expect(innings.bowlers['b1']?.wickets).toBe(0);
  });

  it('offers only the possible dismissals while a free hit is live', () => {
    const scorer = Scorer.live().noball();
    const inputs = scorer.expectState();
    const innings = inputs.innings[0];

    expect(innings?.freeHit).toBe(true);
  });
});
