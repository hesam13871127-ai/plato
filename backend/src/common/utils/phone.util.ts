/**
 * Phone number helpers. Inputs are expected in E.164-ish form
 * (`+<country><subscriber>`, digits only after the leading +). We normalise
 * by stripping every non-digit except the leading + so comparisons are stable.
 */

export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  const leadingPlus = trimmed.startsWith('+') ? '+' : '';
  const digits = trimmed.replace(/\D/g, '');
  return `${leadingPlus}${digits}`;
}

/** E.164 validation: + and 8–15 digits total. */
export function isValidPhone(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(normalizePhone(phone));
}
