import { beforeEach, describe, expect, it } from 'vitest';
import { resetIds, Scorer } from './helpers.js';

beforeEach(resetIds);

describe('strike rotation (DOMAIN-RULES §1)', () => {
  it('swaps on odd runs and holds on even', () => {
    const one = Scorer.live().runs(1).innings();
    expect(one.strikerId).toBe('a2');
    expect(one.nonStrikerId).toBe('a1');

    const two = Scorer.live().runs(2).innings();
    expect(two.strikerId).toBe('a1');

    const four = Scorer.live().runs(4).innings();
    expect(four.strikerId).toBe('a1');

    const three = Scorer.live().runs(3).innings();
    expect(three.strikerId).toBe('a2');
  });

  it('swaps ends at the end of an over', () => {
    const innings = Scorer.live().dot().dot().dot().dot().dot().dot().innings();

    expect(innings.legalBalls).toBe(6);
    expect(innings.strikerId).toBe('a2');
    expect(innings.nonStrikerId).toBe('a1');
  });

  it('leaves the striker on strike after a single off the last ball (checklist #1)', () => {
    // The over swap composes with the single's swap, so on net nobody moves.
    const innings = Scorer.live().dot().dot().dot().dot().dot().runs(1).innings();

    expect(innings.legalBalls).toBe(6);
    expect(innings.strikerId).toBe('a1');
    expect(innings.nonStrikerId).toBe('a2');
  });

  it('rotates on runs run off a wide but not on the wide penalty alone', () => {
    const noRun = Scorer.live().wide().innings();
    expect(noRun.strikerId).toBe('a1');

    const oneRun = Scorer.live().wide(1).innings();
    expect(oneRun.strikerId).toBe('a2');
  });

  it('rotates on byes', () => {
    const innings = Scorer.live().bye(1).innings();
    expect(innings.strikerId).toBe('a2');
  });

  it('rotates on runs off the bat on a no-ball', () => {
    const innings = Scorer.live().noball(1).innings();
    expect(innings.strikerId).toBe('a2');
  });

  it('does not count a wide toward the over', () => {
    const innings = Scorer.live().dot().dot().wide().dot().dot().dot().dot().innings();

    expect(innings.legalBalls).toBe(6);
    expect(innings.runs).toBe(1);
  });

  it('honours an explicit strike swap', () => {
    const innings = Scorer.live().push({ kind: 'strike.swapped' }).innings();

    expect(innings.strikerId).toBe('a2');
    expect(innings.nonStrikerId).toBe('a1');
  });

  it('numbers balls in standard notation, with illegal balls sharing a position', () => {
    const innings = Scorer.live().dot().dot().wide().dot().innings();

    expect(innings.balls.map((b) => `${b.overNo}.${b.ballInOver}`)).toEqual([
      '0.1',
      '0.2',
      '0.3',
      '0.3',
    ]);
  });
});
