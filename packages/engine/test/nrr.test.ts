import { describe, expect, it } from 'vitest';
import { inningsRunRate, netRunRate } from '../src/index.js';

describe('net run rate (DOMAIN-RULES §7)', () => {
  it('divides by balls, not by the decimal over notation (checklist #6)', () => {
    // 19.3 overs is 19.5, not 19.3. 100 runs off 117 balls:
    //   correct:   100 / 19.5     = 5.1282...
    //   the bug:   100 / 19.3     = 5.1813...
    const rate = inningsRunRate({ runs: 100, legalBalls: 117, allOut: false, quotaOvers: 20 });

    expect(rate).toBeCloseTo(5.1282, 4);
    expect(rate).not.toBeCloseTo(5.1813, 4);
  });

  it('charges a side bowled out with its full quota (checklist #5)', () => {
    // 80 runs, all out in 15 overs of a 20-over match.
    //   correct:  80 / 20 = 4.0
    //   the bug:  80 / 15 = 5.33
    const rate = inningsRunRate({ runs: 80, legalBalls: 90, allOut: true, quotaOvers: 20 });

    expect(rate).toBe(4);
  });

  it('uses overs actually faced when the side was not bowled out', () => {
    const rate = inningsRunRate({ runs: 80, legalBalls: 90, allOut: false, quotaOvers: 20 });

    expect(rate).toBeCloseTo(5.3333, 4);
  });

  it('returns zero for an innings with no overs faced', () => {
    expect(inningsRunRate({ runs: 0, legalBalls: 0, allOut: false, quotaOvers: 20 })).toBe(0);
  });

  it('computes NRR as scoring rate minus concession rate', () => {
    const nrr = netRunRate(
      [{ runs: 180, legalBalls: 120, allOut: false, quotaOvers: 20 }],
      [{ runs: 150, legalBalls: 120, allOut: false, quotaOvers: 20 }],
    );

    expect(nrr).toBeCloseTo(1.5, 5);
  });

  it('aggregates across several matches', () => {
    const nrr = netRunRate(
      [
        { runs: 180, legalBalls: 120, allOut: false, quotaOvers: 20 },
        { runs: 120, legalBalls: 90, allOut: true, quotaOvers: 20 },
      ],
      [
        { runs: 150, legalBalls: 120, allOut: false, quotaOvers: 20 },
        { runs: 121, legalBalls: 108, allOut: false, quotaOvers: 20 },
      ],
    );

    // for:     300 / (20 + 20) = 7.5    (the all-out innings charged 20 overs)
    // against: 271 / (20 + 18) = 7.1315
    expect(nrr).toBeCloseTo(0.3684, 4);
  });

  it('handles a side with no overs bowled against them', () => {
    const nrr = netRunRate([{ runs: 50, legalBalls: 30, allOut: false, quotaOvers: 20 }], []);
    expect(nrr).toBe(10);
  });
});
