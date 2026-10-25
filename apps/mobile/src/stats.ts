import type { MatchState, PlayerId } from '@criczen/engine';

/**
 * Digits only, last 10 kept, so "+91 98765-43210" and "9876543210" match.
 * shortcut: assumes 10-digit national numbers (India); store E.164 once accounts exist.
 */
export function normalizeMobile(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (digits === '') return null;
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export function isValidMobile(mobile: string | null): boolean {
  return mobile === null || /^\d{10}$/.test(mobile);
}

export interface Batting {
  innings: number;
  notOuts: number;
  runs: number;
  balls: number;
  highest: number;
  highestNotOut: boolean;
  fifties: number;
  hundreds: number;
  fours: number;
  sixes: number;
  ducks: number;
}

export interface Bowling {
  innings: number;
  balls: number;
  runs: number;
  wickets: number;
  maidens: number;
  bestWickets: number;
  bestRuns: number;
}

export interface Fielding {
  catches: number;
  stumpings: number;
  runOuts: number;
}

export interface Career {
  matches: number;
  batting: Batting;
  bowling: Bowling;
  fielding: Fielding;
}

/** Career figures for one player across every match they were picked in. */
export function careerStats(states: readonly MatchState[], playerId: PlayerId): Career {
  const batting: Batting = {
    innings: 0,
    notOuts: 0,
    runs: 0,
    balls: 0,
    highest: 0,
    highestNotOut: false,
    fifties: 0,
    hundreds: 0,
    fours: 0,
    sixes: 0,
    ducks: 0,
  };
  const bowling: Bowling = {
    innings: 0,
    balls: 0,
    runs: 0,
    wickets: 0,
    maidens: 0,
    bestWickets: 0,
    bestRuns: 0,
  };
  const fielding: Fielding = { catches: 0, stumpings: 0, runOuts: 0 };
  let matches = 0;

  for (const state of states) {
    const picked = Object.values(state.squads).some((s) => s.playingXI.includes(playerId));
    if (!picked) continue;
    matches += 1;

    for (const innings of state.innings) {
      const bat = innings.batters[playerId];
      if (bat !== undefined && bat.status !== 'did_not_bat') {
        const notOut = bat.dismissal === null && bat.status !== 'retired_out';
        batting.innings += 1;
        batting.runs += bat.runs;
        batting.balls += bat.balls;
        batting.fours += bat.fours;
        batting.sixes += bat.sixes;
        if (notOut) batting.notOuts += 1;
        if (bat.runs >= 100) batting.hundreds += 1;
        else if (bat.runs >= 50) batting.fifties += 1;
        if (bat.runs === 0 && bat.dismissal !== null) batting.ducks += 1;
        if (
          bat.runs > batting.highest ||
          (bat.runs === batting.highest && notOut && !batting.highestNotOut)
        ) {
          batting.highest = bat.runs;
          batting.highestNotOut = notOut;
        }
      }

      const bowl = innings.bowlers[playerId];
      if (bowl !== undefined && (bowl.balls > 0 || bowl.runs > 0)) {
        bowling.innings += 1;
        bowling.balls += bowl.balls;
        bowling.runs += bowl.runs;
        bowling.wickets += bowl.wickets;
        bowling.maidens += bowl.maidens;
        const better =
          bowl.wickets > bowling.bestWickets ||
          (bowl.wickets === bowling.bestWickets &&
            (bowling.innings === 1 || bowl.runs < bowling.bestRuns));
        if (better) {
          bowling.bestWickets = bowl.wickets;
          bowling.bestRuns = bowl.runs;
        }
      }

      for (const ball of innings.balls) {
        const w = ball.wicket;
        if (w === null) continue;
        const byMe = w.fielderIds?.includes(playerId) === true;
        if (w.kind === 'caught' && byMe) fielding.catches += 1;
        if (w.kind === 'caught_and_bowled' && ball.bowlerId === playerId) fielding.catches += 1;
        if (w.kind === 'stumped' && byMe) fielding.stumpings += 1;
        if (w.kind === 'run_out' && byMe) fielding.runOuts += 1;
      }
    }
  }

  return { matches, batting, bowling, fielding };
}

/** One number for "how much did they contribute": runs, 20 a wicket, 10 a dismissal in the field. */
export function impact(c: Career): number {
  const f = c.fielding;
  return c.batting.runs + 20 * c.bowling.wickets + 10 * (f.catches + f.stumpings + f.runOuts);
}

export function average(runs: number, outs: number): string {
  return outs === 0 ? '-' : (runs / outs).toFixed(2);
}

export function rate(numerator: number, balls: number, per: number): string {
  return balls === 0 ? '-' : ((numerator * per) / balls).toFixed(2);
}

export interface TeamRecord {
  played: number;
  won: number;
  lost: number;
  tied: number;
  noResult: number;
}

/** Finished matches only; team names are team ids, compared without case. */
export function teamRecord(states: readonly MatchState[], team: string): TeamRecord {
  const record: TeamRecord = { played: 0, won: 0, lost: 0, tied: 0, noResult: 0 };
  const key = team.toLowerCase();
  for (const s of states) {
    const mine = s.config.teams.find((t) => t.toLowerCase() === key);
    if (mine === undefined) continue;
    if (s.result === null && s.status !== 'abandoned') continue;
    record.played += 1;
    const r = s.result;
    if (r === null || r.kind === 'no_result' || r.kind === 'abandoned' || r.kind === 'cancelled')
      record.noResult += 1;
    else if (r.kind === 'tie') record.tied += 1;
    else if (r.winnerTeamId === mine) record.won += 1;
    else record.lost += 1;
  }
  return record;
}
