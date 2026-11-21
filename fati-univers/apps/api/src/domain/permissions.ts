/**
 * Rôles et permissions (section 4 du cahier des charges).
 * Ce fichier est partagé : l'API l'utilise pour AUTORISER, le web et le
 * mobile seulement pour afficher ou masquer des boutons.
 * La décision finale est toujours prise côté serveur.
 */

export const ROLES = [
  'PROMOTEUR',
  'DIRECTEUR',
  'CENSEUR',
  'SECRETAIRE',
  'COMPTABLE',
  'CAISSIER',
  'ENSEIGNANT',
  'SURVEILLANT',
  'PARENT',
  'ELEVE',
  'BIBLIOTHECAIRE',
  'RESPONSABLE_TRANSPORT',
  'RESPONSABLE_CANTINE',
  'RESPONSABLE_INTERNAT',
] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'school.settings.manage',
  'users.manage',
  'dashboard.view',
  'students.read',
  'students.write',
  'enrollments.write',
  'imports.run',
  'classes.manage',
  'timetable.manage',
  'timetable.read.own',
  'attendance.take', // ses classes
  'attendance.manage', // toute l'école
  'grades.write.own', // ses classes et matières
  'grades.read.all',
  'reportcards.validate',
  'discipline.write',
  'finance.read',
  'finance.fees.manage',
  'cash.collect',
  'cash.close',
  'payments.cancel.request',
  'payments.cancel.approve',
  'announcements.send',
  'audit.read',
  'child.read', // parent : ses enfants liés uniquement
  'self.read', // élève : son propre dossier
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const DIRECTION: Permission[] = [
  'school.settings.manage',
  'users.manage',
  'dashboard.view',
  'students.read',
  'students.write',
  'enrollments.write',
  'imports.run',
  'classes.manage',
  'timetable.manage',
  'attendance.manage',
  'grades.read.all',
  'reportcards.validate',
  'discipline.write',
  'finance.read',
  'finance.fees.manage',
  'payments.cancel.approve',
  'announcements.send',
  'audit.read',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  PROMOTEUR: DIRECTION,
  DIRECTEUR: DIRECTION,
  CENSEUR: [
    'dashboard.view',
    'students.read',
    'classes.manage',
    'timetable.manage',
    'attendance.manage',
    'grades.read.all',
    'discipline.write',
    'announcements.send',
  ],
  SECRETAIRE: ['students.read', 'students.write', 'enrollments.write', 'imports.run', 'timetable.read.own'],
  COMPTABLE: ['students.read', 'finance.read', 'finance.fees.manage', 'cash.collect', 'cash.close', 'payments.cancel.request'],
  CAISSIER: ['students.read', 'cash.collect', 'cash.close', 'payments.cancel.request'],
  ENSEIGNANT: ['timetable.read.own', 'attendance.take', 'grades.write.own'],
  SURVEILLANT: ['students.read', 'attendance.manage', 'discipline.write'],
  PARENT: ['child.read'],
  ELEVE: ['self.read', 'timetable.read.own'],
  BIBLIOTHECAIRE: ['students.read'],
  RESPONSABLE_TRANSPORT: ['students.read'],
  RESPONSABLE_CANTINE: ['students.read'],
  RESPONSABLE_INTERNAT: ['students.read'],
};

/** Permissions cumulées d'une personne qui a plusieurs rôles dans une école. */
export function permissionsOf(roles: readonly Role[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r] ?? []) set.add(p);
  return set;
}

export function can(roles: readonly Role[], permission: Permission): boolean {
  return permissionsOf(roles).has(permission);
}

/** Rôles qui exigent la double authentification (section 4). */
export const TWO_FACTOR_ROLES: readonly Role[] = ['PROMOTEUR', 'DIRECTEUR', 'COMPTABLE'];
