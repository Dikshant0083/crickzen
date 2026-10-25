import { beforeEach, describe, expect, it } from 'vitest';
import { knockoutRound, roundRobin, type StandingsMatch, standings } from '../src/index.js';
import { resetIds, Scorer } from './helpers.js';

beforeEach(resetIds);

describe('roundRobin', () => {
  it.each([2, 3, 4, 5, 6, 7, 8])(
    '%i sides: every pair meets once, nobody twice in a round',
    (n) => {
      const teams = Array.from({ length: n }, (_, i) => `T${i + 1}`);
      const fixtures = roundRobin(teams);

      const pairs = fixtures.map((f) => [f.home, f.away].sort().join('-'));
      expect(new Set(pairs).size).toBe((n * (n - 1)) / 2);
      expect(pairs.length).toBe((n * (n - 1)) / 2);

      for (const round of new Set(fixtures.map((f) => f.round))) {
        const playing = fixtures.filter((f) => f.round === round).flatMap((f) => [f.home, f.away]);
        expect(new Set(playing).size).toBe(playing.length);
      }
    },
  );

  it('plays a second leg with home and away reversed', () => {
    const fixtures = roundRobin(['A', 'B', 'C', 'D'], 2);
    expect(fixtures).toHaveLength(12);
    const first = fixtures[0];
    const mirror = fixtures.find(
      (f) => f.round === (first?.round ?? 0) + 3 && f.home === first?.away,
    );
    expect(mirror?.away).toBe(first?.home);
  });
});

describe('knockoutRound', () => {
  it('pairs top against bottom and gives byes to the top seeds', () => {
    expect(knockoutRound(['A', 'B', 'C', 'D'])).toEqual([
      { home: 'A', away: 'D' },
      { home: 'B', away: 'C' },
    ]);
    expect(knockoutRound(['A', 'B', 'C', 'D', 'E', 'F'])).toEqual([
      { home: 'A', away: null },
      { home: 'B', away: null },
      { home: 'C', away: 'F' },
      { home: 'D', away: 'E' },
    ]);
  });
});

/** A 2-over match: IND bat first and score `first`, AUS chase. */
function match(first: (s: Scorer) => void, chase: (s: Scorer) => void): StandingsMatch {
  const s = Scorer.live({ format: 'CUSTOM', totalOvers: 2, xiSize: 3 });
  first(s);
  s.open(2, 'AUS', 'b1', 'b2', 'a1');
  chase(s);
  const state = s.expectState();
  return { teams: ['IND', 'AUS'], result: state.result, innings: state.innings };
}

describe('standings', () => {
  it('awards points, then ranks level sides by net run rate', () => {
    // IND 12 in 2 overs; AUS bowled out for 4 in 0.2 overs → AUS faced the full 2-over quota.
    const indWin = match(
      (s) => s.runs(6).dots(5).bowler('b2').runs(6).dots(5),
      (s) => s.runs(4).wicket('bowled', 'b1', { incoming: 'b3' }).wicket('bowled', 'b3'),
    );
    const table = standings(['IND', 'AUS', 'ENG'], [indWin]);

    expect(table.map((r) => r.team)).toEqual(['IND', 'ENG', 'AUS']);
    expect(table[0]).toMatchObject({ played: 1, won: 1, points: 2 });
    // IND: 12/2 - 4/2 = 4. All-out AUS counted over the full 2 overs, not 0.2.
    expect(table[0]?.nrr).toBeCloseTo(4);
    expect(table[2]?.nrr).toBeCloseTo(-4);
  });

  it('splits a tie, unless a super over decided it, and skips unfinished matches', () => {
    const tie = match(
      (s) => s.runs(4).dots(5).bowler('b2').dots(6),
      (s) => s.runs(4).dots(5).bowler('a2').dots(6),
    );
    expect(tie.result?.kind).toBe('tie');

    const split = standings(['IND', 'AUS'], [tie]);
    expect(split.map((r) => r.points)).toEqual([1, 1]);

    const decided = standings(['IND', 'AUS'], [{ ...tie, superOverWinner: 'AUS' }]);
    expect(decided[0]).toMatchObject({ team: 'AUS', won: 1, points: 2 });

    const unfinished = standings(['IND', 'AUS'], [{ ...tie, result: null }]);
    expect(unfinished.every((r) => r.played === 0)).toBe(true);
  });
});
