import { describe, expect, it } from 'vitest';
import { matchesQuery } from '../src/people';

const rahul = { id: '1', name: 'Rahul Kumar', mobile: '9876543210', role: 'batter' as const };

describe('matchesQuery', () => {
  it('finds a player by name or by a formatted mobile number', () => {
    expect(matchesQuery(rahul, 'rahul')).toBe(true);
    expect(matchesQuery(rahul, '+91 98765 43210')).toBe(true);
    expect(matchesQuery(rahul, '43210')).toBe(true);
  });

  it('does not treat digits inside a name search as a number search', () => {
    expect(matchesQuery(rahul, 'Amit 9')).toBe(false);
    expect(matchesQuery({ ...rahul, mobile: null }, '98765')).toBe(false);
  });
});
