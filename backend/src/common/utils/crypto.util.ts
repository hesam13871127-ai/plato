import { createHash, randomBytes, randomInt } from 'crypto';

/** SHA-256 hex digest used to store refresh tokens and OTP codes. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** URL-safe random token (used as the raw refresh token). */
export function generateRefreshToken(): string {
  return randomBytes(48).toString('hex');
}

/**
 * Numeric OTP code with a fixed length, generated with a CSPRNG.
 * `randomInt` gives an unbiased digit distribution.
 */
export function generateOtpCode(length: number): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += randomInt(0, 10).toString();
  }
  return code;
}

/** Random 6-character room access code (unambiguous alphabet). */
export function generateAccessCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[randomInt(0, alphabet.length)];
  }
  return code;
}
