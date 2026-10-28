import {
  type BallRecord,
  createMatchConfig,
  type Delivery,
  type DismissalKind,
  type InningsState,
  type MatchConfig,
  type MatchFormat,
  type MatchState,
  type Payload,
  type PlayerId,
  type WicketInput,
} from '@criczen/engine';
import type { LiveSnapshot } from '@criczen/shared';

/** Display data the engine does not hold: it only knows ids. */
export interface MatchMeta {
  names: Record<PlayerId, string>;
  /** Set on a super over: the tied match it decides. */
  superOverOf?: string;
  /** Set once the scorer shares the match live; every later ball is sent to it. */
  liveCode?: string;
}

export interface Squad {
  ids: PlayerId[];
  names: Record<PlayerId, string>;
  captainId: PlayerId;
  keeperId: PlayerId;
}

const FORMAT_BY_OVERS: Record<number, MatchFormat> = { 10: 'T10', 20: 'T20', 50: 'ODI' };

export interface SetupInput {
  matchId: string;
  teams: [string, string];
  squads: [Squad, Squad];
  overs: number;
  tennisBall: boolean;
  tossWinner: 0 | 1;
  tossChoice: 'bat' | 'bowl';
  /** Super overs only: all out at 2. */
  wicketsPerInnings?: number;
}

/** The opening events of a match, up to the toss. Team names double as team ids. */
export function setupPayloads(input: SetupInput): Payload[] {
  const [a, b] = input.squads;
  const config: MatchConfig = createMatchConfig({
    matchId: input.matchId,
    format: FORMAT_BY_OVERS[input.overs] ?? 'CUSTOM',
    teams: input.teams,
    ballType: input.tennisBall ? 'tennis' : 'leather',
    totalOvers: input.overs,
    playersPerSide: Math.max(a.ids.length, b.ids.length),
    ...(input.wicketsPerInnings === undefined
      ? {}
      : { wicketsPerInnings: input.wicketsPerInnings }),
  });
  return [
    { kind: 'match.created', config },
    ...input.squads.map(
      (squad, i): Payload => ({
        kind: 'squad.set',
        teamId: input.teams[i] ?? '',
        playingXI: squad.ids,
        captainId: squad.captainId,
        keeperId: squad.keeperId,
      }),
    ),
    {
      kind: 'toss.recorded',
      winnerTeamId: input.teams[input.tossWinner],
      choice: input.tossChoice,
    },
  ];
}

/** Legal balls as cricket overs: 15 balls is "2.3". */
export function oversText(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

export const DISMISSAL_LABEL: Record<DismissalKind, string> = {
  bowled: 'Bowled',
  caught: 'Caught',
  caught_and_bowled: 'Caught & bowled',
  lbw: 'LBW',
  run_out: 'Run out',
  stumped: 'Stumped',
  hit_wicket: 'Hit wicket',
  obstructing: 'Obstructing',
  hit_twice: 'Hit twice',
};

/** Scorecard dismissal line, e.g. "c Smith b Jones". */
export function howOut(innings: InningsState, playerId: PlayerId, name: (id: string) => string) {
  const batter = innings.batters[playerId];
  if (batter === undefined) return '';
  if (batter.status === 'not_out' || batter.status === 'at_crease') return 'not out';
  if (batter.status === 'retired_hurt') return 'retired hurt';
  const d = batter.dismissal;
  if (d === null) return 'out';
  const b = d.bowlerId === null ? '' : name(d.bowlerId);
  const f = d.fielderIds.map(name).join('/');
  switch (d.kind) {
    case 'bowled':
      return `b ${b}`;
    case 'caught':
      return `c ${f} b ${b}`;
    case 'caught_and_bowled':
      return `c & b ${b}`;
    case 'lbw':
      return `lbw b ${b}`;
    case 'stumped':
      return `st ${f} b ${b}`;
    case 'hit_wicket':
      return `hit wicket b ${b}`;
    case 'run_out':
      return f === '' ? 'run out' : `run out (${f})`;
    case 'retired_out':
      return 'retired out';
    default:
      return DISMISSAL_LABEL[d.kind].toLowerCase();
  }
}

export type ExtraMode = 'none' | 'wide' | 'noball' | 'bye' | 'legbye';
export type Runs = Delivery['runsOffBat'];

/** Everything the scorer can say about one ball, in the shape the forms edit. */
export interface Draft {
  bat: Runs;
  extra: ExtraMode;
  extraRuns: number;
  overthrows: number;
  wicket: WicketInput | null;
}

export function draftDelivery(d: Draft): Delivery {
  return {
    runsOffBat: d.extra === 'none' || d.extra === 'noball' ? d.bat : 0,
    ...(d.extra === 'none' ? {} : { extra: { type: d.extra, runs: d.extraRuns } }),
    ...(d.overthrows > 0 ? { overthrowRuns: d.overthrows } : {}),
    ...(d.wicket === null ? {} : { wicket: d.wicket }),
  };
}

export function draftFrom(ball: BallRecord): Draft {
  let wicket: WicketInput | null = null;
  if (ball.wicket !== null) {
    const { bowlerCredited: _, ...rest } = ball.wicket;
    wicket = rest;
  }
  return {
    bat: ball.runsOffBat as Runs,
    extra: ball.extra?.type ?? 'none',
    extraRuns: ball.extra?.runs ?? 0,
    overthrows: ball.overthrowRuns,
    wicket,
  };
}

/**
 * The delivery for one tap. `runs` means what the batters scored: off the bat
 * normally and on a no-ball, otherwise the extra runs run.
 */
export function buildDelivery(mode: ExtraMode, runs: Runs, wicket?: WicketInput): Delivery {
  const batRuns = mode === 'none' || mode === 'noball';
  return draftDelivery({
    bat: batRuns ? runs : 0,
    extra: mode,
    extraRuns: batRuns ? 0 : runs,
    overthrows: 0,
    wicket: wicket ?? null,
  });
}

/** Over-timeline label: "4", "W", "Wd", "1Nb", "2B". */
export function ballLabel(ball: BallRecord): string {
  if (ball.wicket !== null) return 'W';
  const extra = ball.extra;
  if (extra === null) return String(ball.runsOffBat);
  const runs = extra.type === 'noball' ? ball.runsOffBat : extra.runs;
  const tag = { wide: 'Wd', noball: 'Nb', bye: 'B', legbye: 'Lb' }[extra.type];
  return runs === 0 ? tag : `${runs}${tag}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "Bumrah to Kohli, FOUR" style line for the ball-by-ball feed. */
export function commentary(ball: BallRecord, name: (id: PlayerId) => string): string {
  const parts: string[] = [];
  const extra = ball.extra;
  if (ball.wicket !== null)
    parts.push(`OUT! ${DISMISSAL_LABEL[ball.wicket.kind]} (${name(ball.wicket.playerOutId)})`);
  if (extra?.type === 'wide')
    parts.push(extra.runs === 0 ? 'wide' : `wide, ${plural(extra.runs, 'run')}`);
  if (extra?.type === 'noball') parts.push('no ball');
  if (extra?.type === 'bye' || extra?.type === 'legbye') {
    parts.push(plural(extra.runs, extra.type === 'bye' ? 'bye' : 'leg bye'));
  }
  if (extra === null || extra.type === 'noball') {
    const bat = ball.runsOffBat;
    if (bat === 4) parts.push('FOUR');
    else if (bat === 6) parts.push('SIX');
    else if (bat > 0) parts.push(plural(bat, 'run'));
    else if (ball.wicket === null && extra === null) parts.push('no run');
  }
  if (ball.overthrowRuns > 0) parts.push(`+${ball.overthrowRuns} overthrow`);
  return `${name(ball.bowlerId)} to ${name(ball.strikerId)}, ${parts.join(', ')}`;
}

export interface OverTotal {
  over: number;
  runs: number;
  wickets: number;
}

/** Runs and wickets per over, for the Manhattan and worm charts. */
export function overTotals(innings: InningsState): OverTotal[] {
  const out: OverTotal[] = [];
  for (const ball of innings.balls) {
    let row = out[ball.overNo];
    if (row === undefined) {
      for (let o = out.length; o <= ball.overNo; o += 1)
        out.push({ over: o + 1, runs: 0, wickets: 0 });
      row = out[ball.overNo] as OverTotal;
    }
    row.runs += ball.teamRuns;
    if (ball.wicket !== null) row.wickets += 1;
  }
  return out;
}

/** A WhatsApp-friendly summary of the match. */
export function shareText(state: MatchState, name: (id: PlayerId) => string): string {
  const lines = [`🏏 ${state.config.teams.join(' vs ')} · ${state.config.totalOvers} overs`, ''];
  for (const inn of state.innings) {
    lines.push(
      `*${inn.battingTeamId} ${inn.runs}/${inn.wickets}* (${oversText(inn.legalBalls)} ov)`,
    );
    const bats = Object.values(inn.batters)
      .filter((b) => b.balls > 0 || b.runs > 0)
      .sort((x, y) => y.runs - x.runs)
      .slice(0, 3);
    for (const b of bats) {
      lines.push(`  ${name(b.playerId)} ${b.runs}${b.dismissal === null ? '*' : ''} (${b.balls})`);
    }
    const bowls = Object.values(inn.bowlers)
      .filter((b) => b.balls > 0)
      .sort((x, y) => y.wickets - x.wickets || x.runs - y.runs)
      .slice(0, 2);
    for (const b of bowls) {
      lines.push(`  ${name(b.playerId)} ${b.wickets}/${b.runs} (${oversText(b.balls)})`);
    }
    lines.push('');
  }
  lines.push(state.result?.description ?? 'Match in progress');
  lines.push('', 'Scored with CrickScorer');
  return lines.join('\n');
}

/** Opening events of the super over that settles a tied match (DOMAIN-RULES §6). */
export function superOverPayloads(state: MatchState, matchId: string): Payload[] {
  const teams = [...state.config.teams] as [string, string];
  const squad = (team: string): Squad => {
    const s = state.squads[team];
    return {
      ids: [...(s?.playingXI ?? [])],
      names: {},
      captainId: s?.captainId ?? '',
      keeperId: s?.keeperId ?? '',
    };
  };
  // The side that batted second bats first in the super over.
  const chasing = state.innings[1]?.battingTeamId ?? teams[1];
  return setupPayloads({
    matchId,
    teams,
    squads: [squad(teams[0]), squad(teams[1])],
    overs: 1,
    tennisBall: state.config.ballType === 'tennis',
    tossWinner: chasing === teams[0] ? 0 : 1,
    tossChoice: 'bat',
    wicketsPerInnings: 2,
  });
}

/** What spectators see at the share link, rebuilt from the whole state after every ball. */
export function liveSnapshot(state: MatchState, name: (id: PlayerId) => string): LiveSnapshot {
  const cut = (s: string, n = 60) => s.slice(0, n);
  const current = state.innings.at(-1);
  return {
    title: cut(state.config.teams.join(' vs '), 130),
    totalOvers: state.config.totalOvers,
    result: state.result?.description ?? (state.status === 'abandoned' ? 'Abandoned' : null),
    innings: state.innings.map((inn) => {
      const lastOver = inn.balls.at(-1)?.overNo;
      return {
        team: cut(inn.battingTeamId),
        runs: inn.runs,
        wickets: inn.wickets,
        overs: oversText(inn.legalBalls),
        target: inn.revisedTarget?.runs ?? inn.target,
        batters: Object.values(inn.batters).map((b) => ({
          name: cut(name(b.playerId)),
          runs: b.runs,
          balls: b.balls,
          fours: b.fours,
          sixes: b.sixes,
          out:
            b.status === 'not_out' || b.status === 'at_crease'
              ? null
              : cut(howOut(inn, b.playerId, name), 120),
          striker: b.playerId === inn.strikerId && !inn.closed,
        })),
        bowlers: Object.values(inn.bowlers)
          .filter((b) => b.balls > 0)
          .map((b) => ({
            name: cut(name(b.playerId)),
            overs: oversText(b.balls),
            runs: b.runs,
            wickets: b.wickets,
            current: !inn.closed && b.playerId === (inn.bowlerId ?? inn.lastOverBowlerId),
          })),
        thisOver: inn.closed ? [] : inn.balls.filter((b) => b.overNo === lastOver).map(ballLabel),
      };
    }),
    highlight: current === undefined ? null : milestone(current, (id) => cut(name(id))),
    commentary: (current?.balls ?? [])
      .slice(-30)
      .reverse()
      .map((b) => ({
        over: `${b.overNo}.${b.ballInOver}`,
        ball: ballLabel(b),
        text: cut(commentary(b, name), 200),
      })),
  };
}

export interface Highlight {
  /** The ball's event id, so each screen celebrates it once. */
  id: string;
  kind: 'bat' | 'bowl' | 'team';
  text: string;
}

/**
 * The milestone the latest ball of an innings reached, if any: a hat-trick,
 * five wickets, a hundred, a fifty, or the team passing 100, 150, 200…
 * Only the biggest one is reported.
 */
export function milestone(inn: InningsState, name: (id: PlayerId) => string): Highlight | null {
  const ball = inn.balls.at(-1);
  if (ball === undefined) return null;
  const at = (kind: Highlight['kind'], text: string): Highlight => ({
    id: ball.eventId,
    kind,
    text,
  });

  const bowler = inn.bowlers[ball.bowlerId];
  if (ball.wicket?.bowlerCredited === true && bowler !== undefined) {
    // Wides and no-balls between them don't break a hat-trick: only legal deliveries count.
    const last3 = inn.balls.filter((b) => b.bowlerId === ball.bowlerId && b.legal).slice(-3);
    if (
      ball.legal &&
      last3.length === 3 &&
      last3.at(-1) === ball &&
      last3.every((b) => b.wicket?.bowlerCredited === true)
    ) {
      return at('bowl', `HAT-TRICK! ${name(ball.bowlerId)}`);
    }
    if (bowler.wickets === 5) {
      return at('bowl', `5 WICKETS! ${name(ball.bowlerId)} ${bowler.wickets}/${bowler.runs}`);
    }
  }

  const batter = inn.batters[ball.strikerId];
  const offBat =
    ball.extra === null || ball.extra.type === 'noball' ? ball.runsOffBat + ball.overthrowRuns : 0;
  if (batter !== undefined && offBat > 0) {
    const before = batter.runs - offBat;
    const crossed = (n: number) => before < n && batter.runs >= n;
    const line = `${name(batter.playerId)} ${batter.runs} (${batter.balls})`;
    if (crossed(100)) return at('bat', `HUNDRED! ${line}`);
    if (crossed(50)) return at('bat', `FIFTY! ${line}`);
  }

  const teamBefore = inn.runs - ball.teamRuns;
  const mark = Math.floor(inn.runs / 50) * 50;
  if (mark >= 100 && teamBefore < mark) return at('team', `${mark} UP! ${inn.battingTeamId}`);
  return null;
}
