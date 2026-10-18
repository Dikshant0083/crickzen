import type { Result, RuleViolation, ViolationCode } from './types.js';

export function ok<T>(value: T): Result<T, RuleViolation> {
  return { ok: true, value };
}

export function err<T>(
  code: ViolationCode,
  detail: string,
  eventId?: string,
): Result<T, RuleViolation> {
  return {
    ok: false,
    error: eventId === undefined ? { code, detail } : { code, detail, eventId },
  };
}

export function violation(code: ViolationCode, detail: string, eventId?: string): RuleViolation {
  return eventId === undefined ? { code, detail } : { code, detail, eventId };
}

export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}
