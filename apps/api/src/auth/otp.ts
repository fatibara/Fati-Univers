/**
 * Codes à usage unique (6 chiffres) envoyés par SMS.
 * - Le code n'est jamais stocké en clair : seule une empreinte HMAC-SHA256 est gardée.
 * - 5 essais maximum, durée de validité limitée, un nouveau code annule l'ancien.
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export type OtpPurpose = 'ACTIVATION' | 'RESET_PASSWORD';

export const OTP_MAX_ATTEMPTS = 5;
/** Activation : le directeur ou le super-admin peut transmettre le code plus tard. */
export const OTP_TTL_MINUTES: Record<OtpPurpose, number> = { ACTIVATION: 7 * 24 * 60, RESET_PASSWORD: 15 };

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashOtp(secret: string, phone: string, purpose: OtpPurpose, code: string): string {
  return createHmac('sha256', secret).update(`${phone}:${purpose}:${code}`).digest('hex');
}

export function otpMatches(secret: string, phone: string, purpose: OtpPurpose, code: string, storedHash: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const a = Buffer.from(hashOtp(secret, phone, purpose, code), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
