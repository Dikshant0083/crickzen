import { beforeEach, describe, expect, it } from 'vitest';
import { resetIds, Scorer } from './helpers.js';

beforeEach(resetIds);

describe('bowler credit (DOMAIN-RULES §3)', () => {
  it('credits the bowler for a bowled dismissal', () => {
    const innings = Scorer.live().wicket('bowled', 'a1', { incoming: 'a3' }).innings();

    expect(innings.wickets).toBe(1);
    expect(innings.bowlers['b1']?.wickets).toBe(1);
    expect(innings.batters['a1']?.status).toBe('out');
    expect(innings.batters['a1']?.dismissal?.bowlerId).toBe('b1');
  });

  it('does NOT credit the bowler for a run out (checklist #3)', () => {
    const innings = Scorer.live()
      .wicket('run_out', 'a1', { incoming: 'a3', fielders: ['b4'], crossed: false })
      .innings();

    expect(innings.wickets).toBe(1);
    expect(innings.bowlers['b1']?.wickets).toBe(0);
    expect(innings.batters['a1']?.dismissal?.bowlerId).toBeNull();
    expect(innings.batters['a1']?.dismissal?.fielderIds).toEqual(['b4']);
  });

  it('does not credit the bowler for obstructing the field', () => {
    const innings = Scorer.live().wicket('obstructing', 'a1', { incoming: 'a3' }).innings();

    expect(innings.bowlers['b1']?.wickets).toBe(0);
  });

  it('credits the bowler for a stumping and records the keeper', () => {
    const innings = Scorer.live()
      .wicket('stumped', 'a1', { incoming: 'a3', fielders: ['b2'] })
      .innings();

    expect(innings.bowlers['b1']?.wickets).toBe(1);
    expect(innings.batters['a1']?.dismissal?.fielderIds).toEqual(['b2']);
  });

  it('counts the ball faced on a dismissal off a legal delivery', () => {
    const innings = Scorer.live().wicket('bowled', 'a1', { incoming: 'a3' }).innings();

    expect(innings.batters['a1']?.balls).toBe(1);
    expect(innings.legalBalls).toBe(1);
  });

  it('does not count a ball faced on a run out off a wide (checklist #7)', () => {
    const innings = Scorer.live()
      .wicket('run_out', 'a1', {
        incoming: 'a3',
        fielders: ['b4'],
        crossed: false,
        extra: { type: 'wide', runs: 0 },
      })
      .innings();

    expect(innings.batters['a1']?.balls).toBe(0);
    expect(innings.legalBalls).toBe(0);
    expect(innings.wickets).toBe(1);
    expect(innings.extras.wides).toBe(1);
  });

  it('records the fall of wicket at the score it fell', () => {
    const innings = Scorer.live().runs(4).runs(2).wicket('lbw', 'a1', { incoming: 'a3' }).innings();

    expect(innings.fallOfWickets).toEqual([
      { wicketNo: 1, playerOutId: 'a1', atRuns: 6, atLegalBalls: 3 },
    ]);
  });
});

describe('ends after a dismissal (DOMAIN-RULES §3)', () => {
  it('puts the new batter on strike when the striker is bowled', () => {
    const innings = Scorer.live().wicket('bowled', 'a1', { incoming: 'a3' }).innings();

    expect(innings.strikerId).toBe('a3');
    expect(innings.nonStrikerId).toBe('a2');
  });

  it('gives the new batter strike on a catch, per law 18.11', () => {
    const innings = Scorer.live()
      .wicket('caught', 'a1', { incoming: 'a3', fielders: ['b5'] })
      .innings();

    expect(innings.strikerId).toBe('a3');
    expect(innings.nonStrikerId).toBe('a2');
  });

  it('gives the new batter strike on a catch even when the batters crossed (law 18.11)', () => {
    const innings = Scorer.live()
      .wicket('caught', 'a1', { incoming: 'a3', fielders: ['b5'], crossed: true })
      .innings();

    expect(innings.strikerId).toBe('a3');
    expect(innings.nonStrikerId).toBe('a2');
  });

  it('sends the new batter to the far end on a crossed catch under the pre-2022 law', () => {
    const innings = Scorer.live({ rules: { newBatterTakesStrikeOnCatch: false } })
      .wicket('caught', 'a1', { incoming: 'a3', fielders: ['b5'], crossed: true })
      .innings();

    expect(innings.strikerId).toBe('a2');
    expect(innings.nonStrikerId).toBe('a3');
  });

  it('replaces the non-striker at their own end on a run out (checklist #9)', () => {
    const innings = Scorer.live()
      .wicket('run_out', 'a2', { incoming: 'a3', fielders: ['b4'], crossed: false })
      .innings();

    expect(innings.strikerId).toBe('a1');
    expect(innings.nonStrikerId).toBe('a3');
  });

  it('accounts for the batters crossing on a run out', () => {
    // a1 struck and they crossed, so a1 is now at the non-striker end and the
    // dismissed a1 vacates that end; a2 keeps strike and a3 comes in at the
    // far end.
    const innings = Scorer.live()
      .wicket('run_out', 'a1', { incoming: 'a3', fielders: ['b4'], crossed: true })
      .innings();

    expect(innings.strikerId).toBe('a2');
    expect(innings.nonStrikerId).toBe('a3');
  });

  it('counts completed runs before a run out', () => {
    const innings = Scorer.live()
      .wicket('run_out', 'a2', {
        incoming: 'a3',
        fielders: ['b4'],
        crossed: false,
        runsOffBat: 1,
      })
      .innings();

    expect(innings.runs).toBe(1);
    expect(innings.batters['a1']?.runs).toBe(1);
    expect(innings.wickets).toBe(1);
  });
});

describe('retirements (DOMAIN-RULES §10)', () => {
  it('treats retired hurt as no wicket, and lets the batter return', () => {
    const scorer = Scorer.live().push({
      kind: 'batter.replaced',
      outgoingId: 'a1',
      incomingId: 'a3',
      reason: 'retired_hurt',
    });
    const innings = scorer.innings();

    expect(innings.wickets).toBe(0);
    expect(innings.batters['a1']?.status).toBe('retired_hurt');
    expect(innings.strikerId).toBe('a3');

    // Eligible to come back later.
    const after = scorer
      .push({
        kind: 'batter.replaced',
        outgoingId: 'a3',
        incomingId: 'a1',
        reason: 'retired_hurt',
      })
      .innings();
    expect(after.strikerId).toBe('a1');
  });

  it('counts retired out as a wicket with no bowler credit', () => {
    const innings = Scorer.live()
      .push({
        kind: 'batter.replaced',
        outgoingId: 'a1',
        incomingId: 'a3',
        reason: 'retired_out',
      })
      .innings();

    expect(innings.wickets).toBe(1);
    expect(innings.batters['a1']?.status).toBe('retired_out');
    expect(innings.batters['a1']?.dismissal?.bowlerId).toBeNull();
    expect(innings.bowlers['b1']?.wickets).toBe(0);
    expect(innings.fallOfWickets).toHaveLength(1);
  });
});
