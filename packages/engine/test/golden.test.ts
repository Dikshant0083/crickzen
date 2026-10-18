import { beforeEach, describe, expect, it } from 'vitest';
import { totalExtras } from '../src/index.js';
import { resetIds, Scorer } from './helpers.js';

beforeEach(resetIds);

/**
 * GOLDEN FIXTURE — two overs, scored ball by ball, with every figure computed
 * by hand below so the expectations are independent of the implementation.
 *
 * These are hand-constructed, not transcribed from a published match.
 * Transcribing real scorecards is a Phase 0 follow-up (see ROADMAP) and is
 * what will catch rules we have modelled plausibly but wrongly.
 *
 * OVER 1 — b1 bowling, a1 on strike
 *   1  dot                a1 1 ball
 *   2  four (a1)          a1 5 runs... (4), 2 balls, 1x4
 *   3  one  (a1)          a1 5 runs, 3 balls — odd, a2 takes strike
 *   4  wide               +1, not a legal ball, no rotation
 *   4  dot  (a2)          a2 1 ball
 *   5  two  (a2)          a2 2 runs, 2 balls — even, no rotation
 *   6  dot  (a2)          a2 3 balls — over ends, ends swap, a1 on strike
 *   over total 8    bowler b1: 6 balls, runs 4+1+2 off bat +1 wide = 8, 3 dots
 *
 * OVER 2 — b2 must bowl (b1 cannot bowl consecutively), a1 on strike
 *   1  no-ball            +1, a1 faces it (4 balls), free hit armed
 *   2  six  (a1)          a1 11 runs, 5 balls, 1x6 — free hit cleared
 *   3  run out (a2)       non-striker out backing up, a3 in at the far end
 *   4  bowled (a1)        a1 out, 7 balls; a4 in on strike
 *   5  one  (a4)          a4 1 run, 1 ball — odd, a3 takes strike
 *   6  dot  (a3)          a3 1 ball
 *   7  four (a3)          a3 4 runs, 2 balls — over ends, ends swap
 *   over total 12   bowler b2: 6 balls, runs 6+1+4 off bat +1 no-ball = 12
 *
 * CLOSING TOTALS
 *   team           20 / 2 in 2.0 overs
 *   batters        a1 11 (7b, 1x4, 1x6)   a2 2 (3b)   a3 4 (2b, 1x4)   a4 1 (1b)
 *   batter runs    11 + 2 + 4 + 1 = 18
 *   extras         1 wide + 1 no-ball = 2
 *   reconciles     18 + 2 = 20 ✓
 */
function goldenInnings(): Scorer {
  const scorer = Scorer.live();

  // Over 1
  scorer.dot().runs(4).runs(1).wide().dot().runs(2).dot();

  // Over 2
  scorer
    .bowler('b2')
    .noball()
    .runs(6)
    .wicket('run_out', 'a2', { incoming: 'a3', fielders: ['b4'], crossed: false })
    .wicket('bowled', 'a1', { incoming: 'a4' })
    .runs(1)
    .dot()
    .runs(4);

  return scorer;
}

describe('golden fixture: two overs, hand-computed', () => {
  it('reaches the hand-computed team total', () => {
    const innings = goldenInnings().innings();

    expect(innings.runs).toBe(20);
    expect(innings.wickets).toBe(2);
    expect(innings.legalBalls).toBe(12);
  });

  it('reconciles the total against batter runs plus extras', () => {
    const innings = goldenInnings().innings();
    const batterRuns = Object.values(innings.batters).reduce((sum, b) => sum + b.runs, 0);

    expect(batterRuns).toBe(18);
    expect(totalExtras(innings.extras)).toBe(2);
    expect(batterRuns + totalExtras(innings.extras)).toBe(innings.runs);
  });

  it('produces the hand-computed batting card', () => {
    const { batters } = goldenInnings().innings();

    expect(batters['a1']).toMatchObject({
      runs: 11,
      balls: 7,
      fours: 1,
      sixes: 1,
      status: 'out',
      position: 1,
    });
    expect(batters['a1']?.dismissal).toMatchObject({ kind: 'bowled', bowlerId: 'b2' });

    expect(batters['a2']).toMatchObject({ runs: 2, balls: 3, status: 'out', position: 2 });
    expect(batters['a2']?.dismissal).toMatchObject({ kind: 'run_out', bowlerId: null });

    expect(batters['a3']).toMatchObject({ runs: 4, balls: 2, fours: 1, status: 'at_crease' });
    expect(batters['a4']).toMatchObject({ runs: 1, balls: 1, status: 'at_crease' });
  });

  it('produces the hand-computed bowling card', () => {
    const { bowlers } = goldenInnings().innings();

    expect(bowlers['b1']).toMatchObject({
      balls: 6,
      runs: 8,
      wickets: 0,
      dots: 3,
      wides: 1,
      noballs: 0,
      maidens: 0,
      completedOvers: 1,
    });

    expect(bowlers['b2']).toMatchObject({
      balls: 6,
      runs: 12,
      wickets: 1,
      dots: 3,
      wides: 0,
      noballs: 1,
      maidens: 0,
      completedOvers: 1,
    });
  });

  it('charges the bowlers exactly the runs that are theirs', () => {
    const innings = goldenInnings().innings();
    const bowlerRuns = Object.values(innings.bowlers).reduce((sum, b) => sum + b.runs, 0);

    // Everything except byes, leg-byes and penalties — of which this innings
    // has none, so the bowlers carry the full total.
    expect(bowlerRuns).toBe(20);
  });

  it('records the fall of wickets at the right score', () => {
    const innings = goldenInnings().innings();

    expect(innings.fallOfWickets).toEqual([
      { wicketNo: 1, playerOutId: 'a2', atRuns: 15, atLegalBalls: 8 },
      { wicketNo: 2, playerOutId: 'a1', atRuns: 15, atLegalBalls: 9 },
    ]);
  });

  it('tracks the three partnerships', () => {
    const innings = goldenInnings().innings();

    expect(innings.partnerships).toHaveLength(3);
    expect(innings.partnerships[0]).toMatchObject({
      forWicket: 1,
      batterIds: ['a1', 'a2'],
      runs: 15,
      balls: 8,
      unbroken: false,
    });
    expect(innings.partnerships[1]).toMatchObject({
      forWicket: 2,
      batterIds: ['a1', 'a3'],
      runs: 0,
      balls: 1,
      unbroken: false,
    });
    expect(innings.partnerships[2]).toMatchObject({
      forWicket: 3,
      batterIds: ['a3', 'a4'],
      runs: 5,
      balls: 3,
      unbroken: true,
    });
  });

  it('ends with the right players at the right ends', () => {
    const innings = goldenInnings().innings();

    expect(innings.strikerId).toBe('a4');
    expect(innings.nonStrikerId).toBe('a3');
    // The over completed, so the next bowler must be chosen.
    expect(innings.bowlerId).toBeNull();
    expect(innings.lastOverBowlerId).toBe('b2');
  });

  it('records a complete ball-by-ball history', () => {
    const innings = goldenInnings().innings();

    expect(innings.balls).toHaveLength(14);
    expect(innings.balls.filter((b) => b.legal)).toHaveLength(12);
    expect(innings.balls.map((b) => b.teamRuns).reduce((a, b) => a + b, 0)).toBe(20);
    // Every ball is traceable to the event that recorded it (§10 audit).
    expect(new Set(innings.balls.map((b) => b.eventId)).size).toBe(14);
  });
});
