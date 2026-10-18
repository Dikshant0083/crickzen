import type { DismissalKind, MatchRules, PlayerId, WicketInput } from '../types.js';

/** DOMAIN-RULES §3 — bowler credit. */
const BOWLER_CREDITED: Record<DismissalKind, boolean> = {
  bowled: true,
  caught: true,
  caught_and_bowled: true,
  lbw: true,
  stumped: true,
  hit_wicket: true,
  hit_twice: true,
  run_out: false,
  obstructing: false,
};

/**
 * Dismissals possible off a no-ball (and therefore off a free hit).
 * Bowled, caught, lbw and stumped are impossible — rejecting them is what
 * makes free-hit scoring trustworthy.
 */
const POSSIBLE_OFF_NO_BALL: ReadonlySet<DismissalKind> = new Set<DismissalKind>([
  'run_out',
  'obstructing',
  'hit_twice',
]);

const REQUIRES_FIELDER: ReadonlySet<DismissalKind> = new Set<DismissalKind>([
  'caught',
  'run_out',
  'stumped',
]);

export function bowlerIsCredited(kind: DismissalKind): boolean {
  return BOWLER_CREDITED[kind];
}

export function possibleOffNoBall(kind: DismissalKind): boolean {
  return POSSIBLE_OFF_NO_BALL.has(kind);
}

export function requiresFielder(kind: DismissalKind): boolean {
  return REQUIRES_FIELDER.has(kind);
}

/** A catch-type dismissal, for the law-18.11 strike rule. */
export function isCatch(kind: DismissalKind): boolean {
  return kind === 'caught' || kind === 'caught_and_bowled';
}

export interface Ends {
  strikerId: PlayerId;
  nonStrikerId: PlayerId;
}

export interface ResolveEndsInput {
  before: Ends;
  /** Runs the batters physically ran on this delivery. */
  runsRun: number;
  /** True when the over completed on this delivery. */
  overCompleted: boolean;
  wicket: WicketInput | undefined;
  /** The batter arriving at the crease, if a wicket fell and one is available. */
  incomingBatterId: PlayerId | null;
  rules: MatchRules;
}

/**
 * Who is on strike after a delivery. DOMAIN-RULES §1 and §3.
 *
 * Order matters and is the source of several classic bugs:
 *   1. odd runs run swap the ends
 *   2. a run out where the batters crossed swaps them again
 *   3. the dismissed batter is replaced at whichever end they now occupy
 *      (overridden by law 18.11 for catches)
 *   4. the end-of-over swap is applied LAST, composing with everything above —
 *      which is why an odd single off the last ball leaves the striker put
 */
export function resolveEnds(input: ResolveEndsInput): Ends {
  let striker = input.before.strikerId;
  let nonStriker = input.before.nonStrikerId;

  const swap = () => {
    const tmp = striker;
    striker = nonStriker;
    nonStriker = tmp;
  };

  if (input.runsRun % 2 === 1) swap();

  const wicket = input.wicket;
  if (wicket !== undefined) {
    // Crossing matters on a run out, and on a catch under the pre-2022 law.
    if (wicket.battersCrossed === true) swap();

    const incoming = input.incomingBatterId;
    const outIsStriker = wicket.playerOutId === striker;

    if (incoming !== null) {
      if (isCatch(wicket.kind) && input.rules.newBatterTakesStrikeOnCatch) {
        // Law 18.11 (2022): the incoming batter takes strike on a catch
        // whether or not the batters crossed.
        nonStriker = outIsStriker ? nonStriker : striker;
        striker = incoming;
      } else if (outIsStriker) {
        striker = incoming;
      } else {
        nonStriker = incoming;
      }
    } else {
      // No batter available — the innings is ending. Clear the vacated end;
      // callers treat a null end as "innings over".
      if (outIsStriker) striker = nonStriker;
      nonStriker = striker;
    }
  }

  if (input.overCompleted) swap();

  return { strikerId: striker, nonStrikerId: nonStriker };
}
