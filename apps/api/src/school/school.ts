import { BadRequestException } from '@nestjs/common';
import type { TenantPrisma } from '../database';

/** Élèves comptés comme présents dans une classe. */
export const ACTIVE_ENROLLMENT = ['PREINSCRIT', 'INSCRIT'] as const;

/** Année scolaire en cours de l'école (null si la direction ne l'a pas encore créée). */
export function currentYear(db: TenantPrisma) {
  return db.academicYear.findFirst({
    where: { isCurrent: true },
    include: { terms: { orderBy: { position: 'asc' } } },
  });
}

export async function requireCurrentYear(db: TenantPrisma) {
  const year = await currentYear(db);
  if (!year) {
    throw new BadRequestException("Aucune année scolaire en cours. La direction doit la créer dans « Structure de l'école ».");
  }
  return year;
}

/** Fiche « personnel » du compte connecté dans l'école active. */
export function staffOf(db: TenantPrisma, userId: string) {
  return db.staffMember.findFirst({ where: { userId, isActive: true } });
}

export { isoDate, splitPeriods, termFor, todayIso } from './periods';
