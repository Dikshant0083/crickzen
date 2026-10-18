import { emptyExtras } from './rules/attribution.js';
import type {
  BatterState,
  BowlerState,
  InningsNo,
  InningsState,
  MatchConfig,
  MatchState,
  PlayerId,
  Squad,
  TeamId,
} from './types.js';

export function initialState(config: MatchConfig): MatchState {
  return {
    matchId: config.matchId,
    config,
    status: 'setup',
    toss: null,
    squads: {},
    innings: [],
    currentInningsIndex: null,
    result: null,
    appliedEventIds: [],
    voidedEventIds: [],
    pendingPenalties: {},
  };
}

export function newBatter(playerId: PlayerId, position: number): BatterState {
  return {
    playerId,
    position,
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    status: 'at_crease',
    dismissal: null,
  };
}

export function newBowler(playerId: PlayerId): BowlerState {
  return {
    playerId,
    balls: 0,
    runs: 0,
    wickets: 0,
    maidens: 0,
    dots: 0,
    wides: 0,
    noballs: 0,
    completedOvers: 0,
  };
}

export interface OpenInningsInput {
  inningsNo: InningsNo;
  battingTeamId: TeamId;
  bowlingTeamId: TeamId;
  strikerId: PlayerId;
  nonStrikerId: PlayerId;
  bowlerId: PlayerId;
  totalOvers: number;
  target: number | null;
}

export function newInnings(input: OpenInningsInput): InningsState {
  return {
    inningsNo: input.inningsNo,
    battingTeamId: input.battingTeamId,
    bowlingTeamId: input.bowlingTeamId,
    runs: 0,
    wickets: 0,
    legalBalls: 0,
    extras: emptyExtras(),
    totalOvers: input.totalOvers,
    target: input.target,
    strikerId: input.strikerId,
    nonStrikerId: input.nonStrikerId,
    bowlerId: input.bowlerId,
    lastOverBowlerId: null,
    freeHit: false,
    batters: {
      [input.strikerId]: newBatter(input.strikerId, 1),
      [input.nonStrikerId]: newBatter(input.nonStrikerId, 2),
    },
    bowlers: { [input.bowlerId]: newBowler(input.bowlerId) },
    battingOrder: [input.strikerId, input.nonStrikerId],
    balls: [],
    partnerships: [
      {
        forWicket: 1,
        batterIds: [input.strikerId, input.nonStrikerId],
        runs: 0,
        balls: 0,
        unbroken: true,
      },
    ],
    fallOfWickets: [],
    closed: false,
    closeReason: null,
    interruptionActive: false,
    oversLost: 0,
    revisedTarget: null,
  };
}

export function currentInnings(state: MatchState): InningsState | null {
  const index = state.currentInningsIndex;
  if (index === null) return null;
  return state.innings[index] ?? null;
}

export function otherTeam(config: MatchConfig, teamId: TeamId): TeamId {
  return config.teams[0] === teamId ? config.teams[1] : config.teams[0];
}

export function squadOf(state: MatchState, teamId: TeamId): Squad | null {
  return state.squads[teamId] ?? null;
}

/**
 * Batters who may still come to the crease. Retired-hurt players are eligible
 * to return; retired-out and dismissed players are not.
 */
export function availableBatters(state: MatchState, innings: InningsState): PlayerId[] {
  const squad = squadOf(state, innings.battingTeamId);
  if (squad === null) return [];
  return squad.playingXI.filter((playerId) => {
    if (playerId === innings.strikerId || playerId === innings.nonStrikerId) return false;
    const batter = innings.batters[playerId];
    if (batter === undefined) return true;
    return batter.status === 'did_not_bat' || batter.status === 'retired_hurt';
  });
}

/** Wickets that end the innings: one fewer than the number who can bat. */
export function allOutWicketCount(state: MatchState, innings: InningsState): number {
  const squad = squadOf(state, innings.battingTeamId);
  const size = squad?.playingXI.length ?? state.config.playersPerSide;
  return size - 1;
}

/** Legal balls remaining in the innings. */
export function ballsRemaining(innings: InningsState): number {
  return Math.max(0, innings.totalOvers * 6 - innings.legalBalls);
}

/** Zero-indexed over currently in progress. */
export function currentOverNo(innings: InningsState): number {
  return Math.floor(innings.legalBalls / 6);
}

/** Legal balls bowled so far within the current over, 0..5. */
export function ballsInCurrentOver(innings: InningsState): number {
  return innings.legalBalls % 6;
}

export function runRate(innings: InningsState): number {
  if (innings.legalBalls === 0) return 0;
  return (innings.runs * 6) / innings.legalBalls;
}

/**
 * Runs per over the chasing side needs. Null when not chasing or already done.
 * The UI must label this a requirement, not a prediction.
 */
export function requiredRunRate(innings: InningsState): number | null {
  const target = innings.revisedTarget?.runs ?? innings.target;
  if (target === null || target === undefined) return null;
  const balls = ballsRemaining(innings);
  if (balls === 0) return null;
  const needed = target - innings.runs;
  if (needed <= 0) return null;
  return (needed * 6) / balls;
}
