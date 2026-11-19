import { assertGnf } from './money';

export interface PlannedInstallment {
  position: number;
  /** Date d'échéance au format AAAA-MM-JJ. */
  dueOn: string;
  amountGnf: number;
}

/** Ajoute des mois à une date AAAA-MM-JJ en restant sur un jour valide (31 -> 30, 28...). */
export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * Découpe un total en n échéances entières. Le reste de la division va sur la
 * première échéance : la somme est toujours exactement égale au total.
 * Ex. 1 000 000 GNF en 3 -> 333 334 + 333 333 + 333 333.
 */
export function planInstallments(
  totalGnf: number,
  count: number,
  firstDueOn: string,
  monthsBetween = 1,
): PlannedInstallment[] {
  assertGnf(totalGnf);
  if (!Number.isInteger(count) || count < 1) throw new Error("Nombre d'échéances invalide");
  const base = Math.floor(totalGnf / count);
  const remainder = totalGnf - base * count;
  return Array.from({ length: count }, (_, i) => ({
    position: i + 1,
    dueOn: addMonths(firstDueOn, i * monthsBetween),
    amountGnf: base + (i === 0 ? remainder : 0),
  }));
}

export interface OpenInstallment {
  id: string;
  dueOn: string;
  amountGnf: number;
  paidGnf: number;
}

export interface Allocation {
  installmentId: string;
  amountGnf: number;
}

export interface AllocationResult {
  allocations: Allocation[];
  /** Montant non affecté (trop-perçu) : à rembourser ou à garder en avoir. */
  unallocatedGnf: number;
}

/**
 * Répartit un paiement sur les échéances, de la plus ancienne à la plus
 * récente. Aucune échéance n'est payée au-delà de son montant.
 */
export function allocatePayment(amountGnf: number, installments: readonly OpenInstallment[]): AllocationResult {
  assertGnf(amountGnf);
  let rest = amountGnf;
  const allocations: Allocation[] = [];
  const ordered = [...installments].sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  for (const inst of ordered) {
    if (rest === 0) break;
    const due = inst.amountGnf - inst.paidGnf;
    if (due <= 0) continue;
    const part = Math.min(due, rest);
    allocations.push({ installmentId: inst.id, amountGnf: part });
    rest -= part;
  }
  return { allocations, unallocatedGnf: rest };
}

/** Reste à payer et montant en retard à une date donnée. */
export function balance(installments: readonly OpenInstallment[], today: string) {
  let remainingGnf = 0;
  let overdueGnf = 0;
  for (const i of installments) {
    const due = Math.max(0, i.amountGnf - i.paidGnf);
    remainingGnf += due;
    if (i.dueOn < today) overdueGnf += due;
  }
  return { remainingGnf, overdueGnf };
}
