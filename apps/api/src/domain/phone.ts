/**
 * Numéros de téléphone guinéens.
 * Un numéro mobile guinéen compte 9 chiffres et commence par 6
 * (ex. 620 12 34 56). Indicatif pays : +224.
 */

export class InvalidPhoneError extends Error {
  constructor(input: string) {
    super(`Numéro de téléphone invalide : ${input}`);
    this.name = 'InvalidPhoneError';
  }
}

/**
 * Normalise au format international E.164 : "+224620123456".
 * Accepte "620 12 34 56", "00224620123456", "+224 620-12-34-56", "224620123456".
 */
export function normalizeGuineaPhone(input: string): string {
  let digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('224') && digits.length === 12) digits = digits.slice(3);
  if (!/^6\d{8}$/.test(digits)) throw new InvalidPhoneError(input);
  return `+224${digits}`;
}

export function isValidGuineaPhone(input: string): boolean {
  try {
    normalizeGuineaPhone(input);
    return true;
  } catch {
    return false;
  }
}

/** Affichage lisible : "+224 620 12 34 56". */
export function formatGuineaPhone(e164: string): string {
  const n = normalizeGuineaPhone(e164).slice(4);
  return `+224 ${n.slice(0, 3)} ${n.slice(3, 5)} ${n.slice(5, 7)} ${n.slice(7, 9)}`;
}
