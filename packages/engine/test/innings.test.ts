import { beforeEach, describe, expect, it } from 'vitest';
import { resetIds, Scorer } from './helpers.js';

beforeEach(resetIds);

describe('innings end conditions (DOMAIN-RULES §5)', () => {
  it('closes the innings when the overs run out', () => {
    const scorer = Scorer.live({ format: 'CUSTOM', totalOvers: 1 });
    const innings = scorer.dot().dot().dot().dot().dot().dot().innings();

    expect(innings.closed).toBe(true);
    expect(innings.closeReason).toBe('overs');
    expect(scorer.expectState().status).toBe('innings_break');
  });

  it('marks batters still at the crease as not out when the innings closes', () => {
    const innings = Scorer.live({ format: 'CUSTOM', totalOvers: 1 })
      .runs(2)
      .dot()
      .dot()
      .dot()
      .dot()
      .dot()
      .innings();

    expect(innings.batters['a1']?.status).toBe('not_out');
    expect(innings.batters['a2']?.status).toBe('not_out');
  });

  it('closes the innings when the side is all out', () => {
    // A 3-player side is all out at 2 wickets.
    const scorer = Scorer.live({ xiSize: 3 })
      .wicket('bowled', 'a1', { incoming: 'a3' })
      .wicket('bowled', 'a3');

    const innings = scorer.innings();
    expect(innings.wickets).toBe(2);
    expect(innings.closed).toBe(true);
    expect(innings.closeReason).toBe('all_out');
  });

  it('requires an incoming batter until the final wicket', () => {
    const error = Scorer.live({ xiSize: 3 }).wicket('bowled', 'a1').expectError();
    expect(error.code).toBe('INCOMING_BATTER_REQUIRED');
  });

  it('rejects an incoming batter on the final wicket', () => {
    const error = Scorer.live({ xiSize: 3 })
      .wicket('bowled', 'a1', { incoming: 'a3' })
      .wicket('bowled', 'a3', { incoming: 'a2' })
      .expectError();

    expect(error.code).toBe('INCOMING_BATTER_UNAVAILABLE');
  });

  it('closes the chase as soon as the target is passed', () => {
    const scorer = Scorer.live({ format: 'CUSTOM', totalOvers: 2 })
      .runs(4)
      .dot()
      .dot()
      .dot()
      .dot()
      .dot()
      .push({ kind: 'innings.closed', reason: 'declared' })
      .open(2, 'AUS');

    expect(scorer.innings(1).target).toBe(5);

    const chased = scorer.runs(6).innings(1);
    expect(chased.runs).toBe(6);
    expect(chased.closed).toBe(true);
    expect(chased.closeReason).toBe('target_reached');
  });

  it('ends the innings when the winning run arrives as a leg-bye (checklist #10)', () => {
    const scorer = Scorer.live({ format: 'CUSTOM', totalOvers: 2 })
      .runs(2)
      .push({ kind: 'innings.closed', reason: 'declared' })
      .open(2, 'AUS')
      .runs(2);

    expect(scorer.innings(1).closed).toBe(false);

    const chased = scorer.legbye(1).innings(1);
    expect(chased.runs).toBe(3);
    expect(chased.closed).toBe(true);
    expect(chased.closeReason).toBe('target_reached');
  });

  it('refuses further deliveries once the innings is closed', () => {
    const error = Scorer.live({ format: 'CUSTOM', totalOvers: 1 })
      .dot()
      .dot()
      .dot()
      .dot()
      .dot()
      .dot()
      .dot()
      .expectError();

    expect(error.code).toBe('INNINGS_CLOSED');
  });
});

describe('match results (DOMAIN-RULES §6)', () => {
  function playTwoInnings(
    firstRuns: 0 | 1 | 2 | 3 | 4 | 5 | 6,
    secondRuns: 0 | 1 | 2 | 3 | 4 | 5 | 6,
  ) {
    return Scorer.live({ format: 'CUSTOM', totalOvers: 1 })
      .runs(firstRuns)
      .dot()
      .dot()
      .dot()
      .dot()
      .dot()
      .open(2, 'AUS')
      .runs(secondRuns)
      .dot()
      .dot()
      .dot()
      .dot()
      .dot();
  }

  it('awards a win by runs to the defending side', () => {
    const state = playTwoInnings(6, 2).expectState();

    expect(state.status).toBe('complete');
    expect(state.result?.kind).toBe('won_by_runs');
    expect(state.result?.winnerTeamId).toBe('IND');
    expect(state.result?.margin).toBe(4);
  });

  it('awards a win by wickets to the chasing side', () => {
    const state = Scorer.live({ format: 'CUSTOM', totalOvers: 1 })
      .runs(2)
      .dot()
      .dot()
      .dot()
      .dot()
      .dot()
      .open(2, 'AUS')
      .runs(4)
      .expectState();

    expect(state.result?.kind).toBe('won_by_wickets');
    expect(state.result?.winnerTeamId).toBe('AUS');
    expect(state.result?.margin).toBe(10);
  });

  it('declares a tie when the scores finish level', () => {
    const state = playTwoInnings(4, 4).expectState();

    expect(state.result?.kind).toBe('tie');
    expect(state.result?.winnerTeamId).toBeNull();
  });

  it('flags that a super over is required when configured', () => {
    const state = Scorer.live({
      format: 'CUSTOM',
      totalOvers: 1,
      rules: { superOverOnTie: true },
    })
      .runs(4)
      .dot()
      .dot()
      .dot()
      .dot()
      .dot()
      .open(2, 'AUS')
      .runs(4)
      .dot()
      .dot()
      .dot()
      .dot()
      .dot()
      .expectState();

    expect(state.result?.kind).toBe('tie');
    expect(state.result?.description).toContain('super over');
  });

  it('refuses events after the match concludes', () => {
    const error = playTwoInnings(6, 2).runs(1).expectError();
    expect(error.code).toBe('MATCH_ALREADY_CONCLUDED');
  });
});

describe('interruptions and revised targets (DOMAIN-RULES §9)', () => {
  it('reduces the innings overs by the overs lost', () => {
    const innings = Scorer.live({ format: 'CUSTOM', totalOvers: 20 })
      .push({ kind: 'interruption.started', reason: 'rain' })
      .push({ kind: 'interruption.ended', oversLost: 5 })
      .innings();

    expect(innings.totalOvers).toBe(15);
    expect(innings.oversLost).toBe(5);
    expect(innings.interruptionActive).toBe(false);
  });

  it('rejects losing more overs than remain', () => {
    const error = Scorer.live({ format: 'CUSTOM', totalOvers: 2 })
      .push({ kind: 'interruption.started', reason: 'rain' })
      .push({ kind: 'interruption.ended', oversLost: 5 })
      .expectError();

    expect(error.code).toBe('OVERS_LOST_INVALID');
  });

  it('applies a manually entered revised target to the chase', () => {
    const scorer = Scorer.live({ format: 'CUSTOM', totalOvers: 2 })
      .runs(6)
      .dot()
      .dot()
      .dot()
      .dot()
      .dot()
      .bowler('b2')
      .dot()
      .dot()
      .dot()
      .dot()
      .dot()
      .dot()
      .open(2, 'AUS')
      .push({ kind: 'target.revised', runs: 4, overs: 1, method: 'manual' });

    const innings = scorer.innings(1);
    expect(innings.revisedTarget).toEqual({ runs: 4, overs: 1, method: 'manual' });
    expect(innings.totalOvers).toBe(1);

    const chased = scorer.runs(4).innings(1);
    expect(chased.closeReason).toBe('target_reached');
  });

  it('refuses to revise a target in the first innings', () => {
    const error = Scorer.live()
      .push({ kind: 'target.revised', runs: 100, overs: 10, method: 'manual' })
      .expectError();

    expect(error.code).toBe('NOT_CHASING_INNINGS');
  });
});

describe('wicketsPerInnings (super over)', () => {
  it('closes the innings at the cap and counts wickets left against it', () => {
    const scorer = Scorer.live({ format: 'CUSTOM', totalOvers: 1, wicketsPerInnings: 2 });
    scorer.runs(4).wicket('bowled', 'a1', { incoming: 'a3' }).wicket('bowled', 'a3');

    const first = scorer.innings(0);
    expect(first.closed).toBe(true);
    expect(first.closeReason).toBe('all_out');

    scorer.open(2, 'AUS', 'b1', 'b2', 'a1').runs(6);
    const state = scorer.expectState();
    expect(state.result?.description).toBe('AUS won by 2 wickets');
  });
});
