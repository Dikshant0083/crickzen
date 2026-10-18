import { beforeEach, describe, expect, it } from 'vitest';
import { createMatchConfig, legalInputs, validate } from '../src/index.js';
import { resetIds, Scorer, squadA, TEAM_A } from './helpers.js';

beforeEach(resetIds);

describe('setup validation', () => {
  it('rejects anything before match.created', () => {
    const violations = validate(null, {
      kind: 'toss.recorded',
      winnerTeamId: TEAM_A,
      choice: 'bat',
    });

    expect(violations[0]?.code).toBe('MATCH_NOT_IN_SETUP');
  });

  it('accepts match.created as the first event', () => {
    const config = createMatchConfig({ matchId: 'm1', format: 'T20', teams: ['IND', 'AUS'] });
    expect(validate(null, { kind: 'match.created', config })).toEqual([]);
  });

  it('rejects a second match.created', () => {
    const config = createMatchConfig({ matchId: 'm1', format: 'T20', teams: ['IND', 'AUS'] });
    const error = new Scorer().push({ kind: 'match.created', config }).expectError();

    expect(error.code).toBe('MATCH_NOT_IN_SETUP');
  });

  it('rejects replaying the same event id twice', () => {
    const scorer = Scorer.live().runs(1);
    const duplicate = scorer.events[scorer.events.length - 1];
    if (duplicate === undefined) throw new Error('no events');
    scorer.events.push(duplicate);

    expect(scorer.expectError().code).toBe('DUPLICATE_EVENT_ID');
  });

  it('rejects a squad for a team not in the match', () => {
    const error = new Scorer()
      .push({
        kind: 'squad.set',
        teamId: 'ENG',
        playingXI: squadA,
        captainId: 'a1',
        keeperId: 'a2',
      })
      .expectError();

    expect(error.code).toBe('UNKNOWN_TEAM');
  });

  it('rejects an XI with a duplicate player', () => {
    const error = new Scorer()
      .push({
        kind: 'squad.set',
        teamId: TEAM_A,
        playingXI: ['a1', 'a1', 'a3'],
        captainId: 'a1',
        keeperId: 'a3',
      })
      .expectError();

    expect(error.code).toBe('DUPLICATE_PLAYER_IN_XI');
  });

  it('rejects an oversized XI', () => {
    const error = new Scorer({ xiSize: 3 })
      .push({
        kind: 'squad.set',
        teamId: TEAM_A,
        playingXI: squadA,
        captainId: 'a1',
        keeperId: 'a2',
      })
      .expectError();

    expect(error.code).toBe('XI_SIZE_INVALID');
  });

  it('rejects a captain who is not in the XI', () => {
    const error = new Scorer()
      .push({
        kind: 'squad.set',
        teamId: TEAM_A,
        playingXI: squadA,
        captainId: 'zz',
        keeperId: 'a2',
      })
      .expectError();

    expect(error.code).toBe('PLAYER_NOT_IN_XI');
  });

  it('rejects play before the toss', () => {
    const error = new Scorer().open().expectError();
    expect(error.code).toBe('TOSS_NOT_RECORDED');
  });

  it('rejects a second toss', () => {
    const error = new Scorer().toss().toss().expectError();
    expect(error.code).toBe('TOSS_ALREADY_RECORDED');
  });

  it('rejects an out-of-sequence innings', () => {
    const error = new Scorer().toss().open(2, TEAM_A).expectError();
    expect(error.code).toBe('INNINGS_SEQUENCE_INVALID');
  });

  it('rejects opening an innings while one is already open', () => {
    const error = Scorer.live().open(2, 'AUS').expectError();
    expect(error.code).toBe('INNINGS_ALREADY_OPEN');
  });

  it('rejects the same batter at both ends', () => {
    const error = new Scorer().toss().open(1, TEAM_A, 'a1', 'a1', 'b1').expectError();
    expect(error.code).toBe('SAME_BATTER_BOTH_ENDS');
  });

  it('rejects a bowler who is not in the fielding XI', () => {
    const error = new Scorer().toss().open(1, TEAM_A, 'a1', 'a2', 'a3').expectError();
    expect(error.code).toBe('PLAYER_NOT_IN_XI');
  });

  it('rejects a squad change once an innings has opened', () => {
    const error = Scorer.live()
      .push({
        kind: 'squad.set',
        teamId: TEAM_A,
        playingXI: squadA,
        captainId: 'a3',
        keeperId: 'a4',
      })
      .expectError();

    expect(error.code).toBe('SQUAD_ALREADY_SET');
  });
});

describe('delivery validation', () => {
  it('rejects runs off the bat on a wide', () => {
    const error = Scorer.live()
      .ball({ runsOffBat: 4, extra: { type: 'wide', runs: 0 } })
      .expectError();

    expect(error.code).toBe('RUNS_OFF_BAT_ON_WIDE');
  });

  it('rejects negative extra runs', () => {
    const error = Scorer.live()
      .ball({ runsOffBat: 0, extra: { type: 'bye', runs: -1 } })
      .expectError();

    expect(error.code).toBe('EXTRA_RUNS_NEGATIVE');
  });

  it('rejects negative overthrows', () => {
    const error = Scorer.live().ball({ runsOffBat: 1, overthrowRuns: -2 }).expectError();
    expect(error.code).toBe('OVERTHROW_NEGATIVE');
  });

  it('rejects dismissing a player who is not at the crease', () => {
    const error = Scorer.live().wicket('bowled', 'a7', { incoming: 'a3' }).expectError();
    expect(error.code).toBe('DISMISSED_PLAYER_NOT_AT_CREASE');
  });

  it('requires a fielder for a catch', () => {
    const error = Scorer.live().wicket('caught', 'a1', { incoming: 'a3' }).expectError();
    expect(error.code).toBe('DISMISSAL_REQUIRES_FIELDER');
  });

  it('requires the keeper on a stumping', () => {
    const error = Scorer.live()
      .wicket('stumped', 'a1', { incoming: 'a3', fielders: ['b5'] })
      .expectError();

    expect(error.code).toBe('KEEPER_REQUIRED_FOR_STUMPING');
  });

  it('rejects a fielder from the batting side', () => {
    const error = Scorer.live()
      .wicket('caught', 'a1', { incoming: 'a3', fielders: ['a5'] })
      .expectError();

    expect(error.code).toBe('FIELDER_FROM_BATTING_SIDE');
  });

  it('requires the crossed flag on a run out — it cannot be inferred', () => {
    const error = Scorer.live()
      .wicket('run_out', 'a1', { incoming: 'a3', fielders: ['b4'] })
      .expectError();

    expect(error.code).toBe('DISMISSAL_REQUIRES_CROSSED_FLAG');
  });

  it('rejects an incoming batter who is already at the crease', () => {
    const error = Scorer.live().wicket('bowled', 'a1', { incoming: 'a2' }).expectError();
    expect(error.code).toBe('INCOMING_BATTER_UNAVAILABLE');
  });
});

describe('replacement and penalty validation', () => {
  it('rejects replacing a batter who is not at the crease', () => {
    const error = Scorer.live()
      .push({
        kind: 'batter.replaced',
        outgoingId: 'a7',
        incomingId: 'a3',
        reason: 'retired_hurt',
      })
      .expectError();

    expect(error.code).toBe('DISMISSED_PLAYER_NOT_AT_CREASE');
  });

  it('rejects bringing in a batter who is already at the crease', () => {
    const error = Scorer.live()
      .push({
        kind: 'batter.replaced',
        outgoingId: 'a1',
        incomingId: 'a2',
        reason: 'retired_hurt',
      })
      .expectError();

    expect(error.code).toBe('BATTER_ALREADY_AT_CREASE');
  });

  it('rejects a non-positive penalty', () => {
    const error = Scorer.live()
      .push({ kind: 'penalty.awarded', teamId: TEAM_A, runs: 0, reason: 'nothing' })
      .expectError();

    expect(error.code).toBe('PENALTY_RUNS_INVALID');
  });

  it('rejects a penalty for a team not in the match', () => {
    const error = Scorer.live()
      .push({ kind: 'penalty.awarded', teamId: 'ENG', runs: 5, reason: 'x' })
      .expectError();

    expect(error.code).toBe('UNKNOWN_TEAM');
  });

  it('rejects ending an interruption that never started', () => {
    const error = Scorer.live().push({ kind: 'interruption.ended', oversLost: 1 }).expectError();

    expect(error.code).toBe('NO_ACTIVE_INTERRUPTION');
  });

  it('rejects a second simultaneous interruption', () => {
    const error = Scorer.live()
      .push({ kind: 'interruption.started', reason: 'rain' })
      .push({ kind: 'interruption.started', reason: 'light' })
      .expectError();

    expect(error.code).toBe('INTERRUPTION_ALREADY_ACTIVE');
  });
});

describe('match status', () => {
  it('pauses and resumes', () => {
    const scorer = Scorer.live().runs(1).push({ kind: 'match.status.changed', status: 'paused' });

    expect(scorer.expectState().status).toBe('paused');

    const resumed = scorer.push({ kind: 'match.status.changed', status: 'resumed' });
    expect(resumed.expectState().status).toBe('live');
  });

  it('abandons a match and records a no-result', () => {
    const state = Scorer.live()
      .runs(1)
      .push({ kind: 'match.status.changed', status: 'abandoned' })
      .expectState();

    expect(state.status).toBe('abandoned');
    expect(state.result?.kind).toBe('abandoned');
    expect(legalInputs(state).canScore).toBe(false);
    expect(legalInputs(state).blockedBy).toBe('match_complete');
  });

  it('cancels a match', () => {
    const state = Scorer.live()
      .push({ kind: 'match.status.changed', status: 'cancelled' })
      .expectState();

    expect(state.status).toBe('cancelled');
    expect(state.result?.kind).toBe('cancelled');
  });
});

describe('affordances', () => {
  it('reports no innings before play starts', () => {
    const state = new Scorer().toss().expectState();
    const inputs = legalInputs(state);

    expect(inputs.canScore).toBe(false);
    expect(inputs.blockedBy).toBe('no_innings');
  });

  it('reports the chase requirement', () => {
    const state = Scorer.live({ format: 'CUSTOM', totalOvers: 1 })
      .runs(6)
      .dot()
      .dot()
      .dot()
      .dot()
      .dot()
      .open(2, 'AUS')
      .runs(2)
      .expectState();

    const inputs = legalInputs(state);
    expect(inputs.runsRequired).toBe(5);
    expect(inputs.ballsRemaining).toBe(5);
    expect(inputs.requiredRunRate).toBeCloseTo(6, 5);
    expect(inputs.currentRunRate).toBeCloseTo(12, 5);
  });

  it('narrows the dismissal options on a free hit', () => {
    const state = Scorer.live().noball().expectState();
    const inputs = legalInputs(state);

    expect(inputs.freeHit).toBe(true);
    expect(inputs.availableDismissals).toEqual(['run_out', 'obstructing', 'hit_twice']);
  });

  it('reports innings closed after the last ball', () => {
    const state = Scorer.live({ format: 'CUSTOM', totalOvers: 1 })
      .dot()
      .dot()
      .dot()
      .dot()
      .dot()
      .dot()
      .expectState();

    expect(legalInputs(state).blockedBy).toBe('innings_closed');
  });
});
