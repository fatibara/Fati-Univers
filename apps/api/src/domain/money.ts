/**
 * Argent en francs guinéens (GNF).
 * Règle absolue : un montant est un ENTIER positif ou nul. Jamais de décimales,
 * jamais de nombre à virgule flottante stocké.
 */

export class InvalidAmountError extends Error {
  constructor(value: unknown) {
    super(`Montant GNF invalide : ${String(value)} (entier positif attendu)`);
    this.name = 'InvalidAmountError';
  }
}

/** Vérifie qu'une valeur est un montant GNF valide et la renvoie. */
export function assertGnf(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new InvalidAmountError(value);
  return value;
}

/**
 * Affiche un montant : 1250000 -> "1 250 000 GNF".
 * Espace simple comme séparateur de milliers : lisible partout, y compris
 * dans un SMS (les espaces insécables ne passent pas toujours).
 */
export function formatGnf(amount: number, withCurrency = true): string {
  assertGnf(amount);
  const digits = String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return withCurrency ? `${digits} GNF` : digits;
}

/**
 * Lit un montant saisi par un humain : "1 250 000", "1.250.000", "1250000 GNF".
 * Refuse les décimales ("1250,50") plutôt que de les arrondir en silence.
 */
export function parseGnf(input: string): number {
  const cleaned = input.replace(/gnf/gi, '').replace(/[\s  ]/g, '').trim();
  if (/^\d{1,3}([.,]\d{3})+$/.test(cleaned)) return assertGnf(Number(cleaned.replace(/[.,]/g, '')));
  if (/^\d+$/.test(cleaned)) return assertGnf(Number(cleaned));
  throw new InvalidAmountError(input);
}

/** Somme sûre de montants GNF. */
export function sumGnf(amounts: readonly number[]): number {
  return assertGnf(amounts.reduce((acc, a) => acc + assertGnf(a), 0));
}
