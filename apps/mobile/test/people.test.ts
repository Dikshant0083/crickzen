import { describe, expect, it } from 'vitest';
import { maskMobile, matchesQuery } from '../src/people';

const rahul = { id: '1', name: 'Rahul Kumar', mobile: '9876543210', role: 'batter' as const };

describe('matchesQuery', () => {
  it('finds a player by name or by a formatted mobile number', () => {
    expect(matchesQuery(rahul, 'rahul')).toBe(true);
    expect(matchesQuery(rahul, '+91 98765 43210')).toBe(true);
  });

  it('never matches a partial number, so numbers cannot be guessed', () => {
    expect(matchesQuery(rahul, '43210')).toBe(false);
    expect(matchesQuery(rahul, '987654321')).toBe(false);
  });

  it('does not treat digits inside a name search as a number search', () => {
    expect(matchesQuery(rahul, 'Amit 9')).toBe(false);
    expect(matchesQuery({ ...rahul, mobile: null }, '9876543210')).toBe(false);
  });
});

describe('maskMobile', () => {
  it('shows only the last four digits', () => {
    expect(maskMobile('9876543210')).toBe('••••••3210');
    expect(maskMobile(null)).toBe('');
  });
});
