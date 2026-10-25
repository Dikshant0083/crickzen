/**
 * Digits only, last 10 kept, so "+91 98765-43210" and "9876543210" match.
 * shortcut: assumes 10-digit national numbers (India); store E.164 once OTP verification exists.
 */
export function normalizeMobile(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (digits === '') return null;
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export function isValidMobile(mobile: string | null): boolean {
  return mobile === null || /^\d{10}$/.test(mobile);
}
