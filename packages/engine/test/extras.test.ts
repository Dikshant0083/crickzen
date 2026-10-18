import { beforeEach, describe, expect, it } from 'vitest';
import { resetIds, Scorer } from './helpers.js';

beforeEach(resetIds);

describe('extras attribution (DOMAIN-RULES §2)', () => {
  it('charges a plain wide to the team and the bowler, not the batter', () => {
    const innings = Scorer.live().wide().innings();

    expect(innings.runs).toBe(1);
    expect(innings.extras.wides).toBe(1);
    expect(innings.legalBalls).toBe(0);
    expect(innings.batters['a1']?.runs).toBe(0);
    expect(innings.batters['a1']?.balls).toBe(0);
    expect(innings.bowlers['b1']?.runs).toBe(1);
    expect(innings.bowlers['b1']?.balls).toBe(0);
  });

  it('records runs run off a wide as wides, not byes (checklist #2)', () => {
    const innings = Scorer.live().wide(2).innings();

    expect(innings.runs).toBe(3);
    expect(innings.extras.wides).toBe(3);
    expect(innings.extras.byes).toBe(0);
    expect(innings.bowlers['b1']?.runs).toBe(3);
  });

  it('credits runs off the bat on a no-ball to the batter, and the penalty to the bowler', () => {
    const innings = Scorer.live().noball(4).innings();

    expect(innings.runs).toBe(5);
    expect(innings.extras.noballs).toBe(1);
    expect(innings.batters['a1']?.runs).toBe(4);
    expect(innings.batters['a1']?.fours).toBe(1);
    // A no-ball IS a ball faced, unlike a wide.
    expect(innings.batters['a1']?.balls).toBe(1);
    expect(innings.bowlers['b1']?.runs).toBe(5);
    expect(innings.legalBalls).toBe(0);
  });

  it('does not charge byes off a no-ball to the bowler', () => {
    const innings = Scorer.live().noball(0, 2).innings();

    expect(innings.runs).toBe(3);
    expect(innings.extras.noballs).toBe(1);
    expect(innings.extras.byes).toBe(2);
    expect(innings.bowlers['b1']?.runs).toBe(1);
  });

  it('counts byes as a legal ball faced, charged to nobody', () => {
    const innings = Scorer.live().bye(2).innings();

    expect(innings.runs).toBe(2);
    expect(innings.extras.byes).toBe(2);
    expect(innings.legalBalls).toBe(1);
    expect(innings.batters['a1']?.balls).toBe(1);
    expect(innings.batters['a1']?.runs).toBe(0);
    expect(innings.bowlers['b1']?.runs).toBe(0);
    expect(innings.bowlers['b1']?.balls).toBe(1);
  });

  it('distinguishes leg-byes from byes', () => {
    const innings = Scorer.live().legbye(1).innings();

    expect(innings.extras.legbyes).toBe(1);
    expect(innings.extras.byes).toBe(0);
  });

  it('credits overthrows off the bat to the batter but not as a boundary', () => {
    const innings = Scorer.live().ball({ runsOffBat: 2, overthrowRuns: 4 }).innings();

    expect(innings.runs).toBe(6);
    expect(innings.batters['a1']?.runs).toBe(6);
    expect(innings.batters['a1']?.fours).toBe(0);
    expect(innings.batters['a1']?.sixes).toBe(0);
  });

  it('adds overthrows on a bye to the byes', () => {
    const innings = Scorer.live()
      .ball({ runsOffBat: 0, extra: { type: 'bye', runs: 1 }, overthrowRuns: 4 })
      .innings();

    expect(innings.runs).toBe(5);
    expect(innings.extras.byes).toBe(5);
    expect(innings.bowlers['b1']?.runs).toBe(0);
  });

  it('counts boundaries off the bat', () => {
    const innings = Scorer.live().runs(4).runs(6).runs(4).innings();

    expect(innings.runs).toBe(14);
    expect(innings.batters['a1']?.fours).toBe(2);
    expect(innings.batters['a1']?.sixes).toBe(1);
  });

  it('adds penalty runs to the batting side without touching the bowler', () => {
    const innings = Scorer.live()
      .push({ kind: 'penalty.awarded', teamId: 'IND', runs: 5, reason: 'fielding infringement' })
      .innings();

    expect(innings.runs).toBe(5);
    expect(innings.extras.penalties).toBe(5);
    // Penalties are nobody's fault: the bowler's figures are untouched.
    expect(innings.bowlers['b1']?.runs).toBe(0);
  });

  it('holds a penalty awarded to the fielding side until their innings opens', () => {
    const scorer = Scorer.live()
      .push({ kind: 'penalty.awarded', teamId: 'AUS', runs: 5, reason: 'time wasting' })
      .runs(1)
      .push({ kind: 'innings.closed', reason: 'declared' })
      .open(2, 'AUS');

    expect(scorer.innings(1).runs).toBe(5);
    expect(scorer.innings(1).extras.penalties).toBe(5);
  });
});

describe('tennis-ball rule overrides', () => {
  it('applies a configurable wide penalty', () => {
    const innings = Scorer.live({ ballType: 'tennis', rules: { widePenalty: 2 } })
      .wide()
      .innings();

    expect(innings.runs).toBe(2);
    expect(innings.extras.wides).toBe(2);
  });
});
