import { beforeEach, describe, expect, it } from 'vitest';
import { legalInputs } from '../src/index.js';
import { resetIds, Scorer } from './helpers.js';

beforeEach(resetIds);

/** Six legal dots, which completes an over. */
function over(scorer: Scorer): Scorer {
  return scorer.dot().dot().dot().dot().dot().dot();
}

describe('over progression and bowler selection', () => {
  it('clears the bowler at the end of an over so the scorer must choose', () => {
    const innings = over(Scorer.live()).innings();

    expect(innings.bowlerId).toBeNull();
    expect(innings.lastOverBowlerId).toBe('b1');
    expect(innings.bowlers['b1']?.completedOvers).toBe(1);
  });

  it('blocks scoring until a bowler is selected', () => {
    const error = over(Scorer.live()).dot().expectError();
    expect(error.code).toBe('NO_BOWLER_SELECTED');
  });

  it('rejects the same bowler bowling consecutive overs', () => {
    const error = over(Scorer.live()).bowler('b1').expectError();
    expect(error.code).toBe('BOWLER_CONSECUTIVE_OVERS');
  });

  it('accepts a different bowler for the new over', () => {
    const innings = over(Scorer.live()).bowler('b2').dot().innings();

    expect(innings.bowlerId).toBe('b2');
    expect(innings.legalBalls).toBe(7);
  });

  it('rejects a bowler change mid-over', () => {
    const error = Scorer.live().dot().dot().bowler('b2').expectError();
    expect(error.code).toBe('OVER_IN_PROGRESS');
  });

  it('enforces the per-bowler over limit, defaulting to ceil(totalOvers / 5)', () => {
    // T10 gives a limit of 2 overs per bowler.
    let scorer = Scorer.live({ format: 'T10' });
    scorer = over(scorer).bowler('b2');
    scorer = over(scorer).bowler('b1');
    scorer = over(scorer).bowler('b2');
    scorer = over(scorer);

    expect(scorer.innings().bowlers['b1']?.completedOvers).toBe(2);

    const error = scorer.bowler('b1').expectError();
    expect(error.code).toBe('BOWLER_OVER_LIMIT_REACHED');
  });

  it('excludes ineligible bowlers from the affordances', () => {
    const state = over(Scorer.live({ format: 'T10' })).expectState();
    const inputs = legalInputs(state);

    expect(inputs.needsBowler).toBe(true);
    expect(inputs.canScore).toBe(false);
    expect(inputs.eligibleBowlers).not.toContain('b1');
    expect(inputs.eligibleBowlers).toContain('b2');
  });
});

describe('bowler figures', () => {
  it('counts a maiden for a wicketless, runless over', () => {
    const innings = over(Scorer.live()).innings();

    expect(innings.bowlers['b1']?.maidens).toBe(1);
    expect(innings.bowlers['b1']?.dots).toBe(6);
  });

  it('does not count a maiden when the over contained a wide (checklist #8)', () => {
    const innings = Scorer.live().dot().dot().wide().dot().dot().dot().dot().innings();

    expect(innings.legalBalls).toBe(6);
    expect(innings.bowlers['b1']?.maidens).toBe(0);
  });

  it('still counts a maiden when the only runs were byes', () => {
    // Byes are not charged to the bowler, so the over is still a maiden.
    const innings = Scorer.live().dot().dot().bye(1).dot().dot().dot().innings();

    expect(innings.legalBalls).toBe(6);
    expect(innings.runs).toBe(1);
    expect(innings.bowlers['b1']?.runs).toBe(0);
    expect(innings.bowlers['b1']?.maidens).toBe(1);
  });

  it('tracks wides and no-balls separately on the bowler', () => {
    const innings = Scorer.live().wide(2).noball(1).innings();

    expect(innings.bowlers['b1']?.wides).toBe(3);
    expect(innings.bowlers['b1']?.noballs).toBe(1);
    expect(innings.bowlers['b1']?.runs).toBe(5);
  });

  it('counts dot balls only on legal deliveries', () => {
    const innings = Scorer.live().dot().wide().noball().dot().innings();

    expect(innings.bowlers['b1']?.dots).toBe(2);
  });
});
