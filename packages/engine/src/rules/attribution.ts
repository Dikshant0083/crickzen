import type { Delivery, ExtrasBreakdown, MatchRules } from '../types.js';

/**
 * How one delivery is attributed. See DOMAIN-RULES §1 and §2.
 *
 * The three numbers that are routinely conflated and must stay separate:
 *   teamRuns    — added to the innings total
 *   batterRuns  — credited to the striker
 *   bowlerRuns  — charged against the bowler (NOT the same as teamRuns:
 *                 byes, leg-byes and penalties are nobody's fault)
 */
export interface Attribution {
  /** Counts toward the over and the bowler's ball count. */
  legal: boolean;
  teamRuns: number;
  batterRuns: number;
  bowlerRuns: number;
  /** Striker faced this delivery: legal balls and no-balls, never wides. */
  batterFacedBall: boolean;
  /**
   * Runs the batters physically ran. Only these rotate the strike — a wide or
   * no-ball penalty does not move anybody.
   */
  runsRun: number;
  extras: ExtrasBreakdown;
  /** Boundary counters, from the stroke only — never from an overthrow. */
  isFour: boolean;
  isSix: boolean;
}

const NO_EXTRAS: ExtrasBreakdown = {
  wides: 0,
  noballs: 0,
  byes: 0,
  legbyes: 0,
  penalties: 0,
};

export function attributeDelivery(delivery: Delivery, rules: MatchRules): Attribution {
  const runsOffBat = delivery.runsOffBat;
  const overthrow = delivery.overthrowRuns ?? 0;
  const extra = delivery.extra;

  if (extra === undefined) {
    // Plain legal delivery. Overthrows off the bat credit the batter, because
    // they are runs scored from the stroke.
    const total = runsOffBat + overthrow;
    return {
      legal: true,
      teamRuns: total,
      batterRuns: total,
      bowlerRuns: total,
      batterFacedBall: true,
      runsRun: total,
      extras: { ...NO_EXTRAS },
      isFour: runsOffBat === 4,
      isSix: runsOffBat === 6,
    };
  }

  switch (extra.type) {
    case 'wide': {
      // Nothing can be scored off the bat on a wide (validated upstream).
      // Every run — penalty, runs run, overthrow — is recorded as a wide, and
      // all of it is charged to the bowler.
      const total = rules.widePenalty + extra.runs + overthrow;
      return {
        legal: false,
        teamRuns: total,
        batterRuns: 0,
        bowlerRuns: total,
        batterFacedBall: false,
        runsRun: extra.runs + overthrow,
        extras: { ...NO_EXTRAS, wides: total },
        isFour: false,
        isSix: false,
      };
    }

    case 'noball': {
      // The penalty and anything off the bat are charged to the bowler.
      // extra.runs here means byes taken off the no-ball, which are not.
      const batterTotal = runsOffBat + overthrow;
      return {
        legal: false,
        teamRuns: rules.noBallPenalty + batterTotal + extra.runs,
        batterRuns: batterTotal,
        bowlerRuns: rules.noBallPenalty + batterTotal,
        batterFacedBall: true,
        runsRun: batterTotal + extra.runs,
        extras: { ...NO_EXTRAS, noballs: rules.noBallPenalty, byes: extra.runs },
        isFour: runsOffBat === 4,
        isSix: runsOffBat === 6,
      };
    }

    case 'bye':
    case 'legbye': {
      // A legal ball the striker faced, but the runs are not theirs and are
      // not charged to the bowler.
      const total = extra.runs + overthrow;
      return {
        legal: true,
        teamRuns: total,
        batterRuns: 0,
        bowlerRuns: 0,
        batterFacedBall: true,
        runsRun: total,
        extras:
          extra.type === 'bye' ? { ...NO_EXTRAS, byes: total } : { ...NO_EXTRAS, legbyes: total },
        isFour: false,
        isSix: false,
      };
    }
  }
}

export function addExtras(a: ExtrasBreakdown, b: ExtrasBreakdown): ExtrasBreakdown {
  return {
    wides: a.wides + b.wides,
    noballs: a.noballs + b.noballs,
    byes: a.byes + b.byes,
    legbyes: a.legbyes + b.legbyes,
    penalties: a.penalties + b.penalties,
  };
}

export function emptyExtras(): ExtrasBreakdown {
  return { ...NO_EXTRAS };
}

export function totalExtras(e: ExtrasBreakdown): number {
  return e.wides + e.noballs + e.byes + e.legbyes + e.penalties;
}
