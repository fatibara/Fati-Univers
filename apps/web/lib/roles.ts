/** Affichage seulement : l'API vérifie toujours les droits elle-même. */
export const DIRECTION = ['PROMOTEUR', 'DIRECTEUR'];
export const STRUCTURE = [...DIRECTION, 'CENSEUR'];
export const STUDENTS_READ = [...STRUCTURE, 'SECRETAIRE', 'COMPTABLE', 'CAISSIER', 'SURVEILLANT', 'BIBLIOTHECAIRE'];
export const STUDENTS_WRITE = [...DIRECTION, 'SECRETAIRE'];
export const TEACHING = [...STRUCTURE, 'ENSEIGNANT', 'SURVEILLANT'];
export const ANNOUNCE = STRUCTURE;

export const ROLE_LABELS: Record<string, string> = {
  PROMOTEUR: 'Promoteur',
  DIRECTEUR: 'Directeur',
  CENSEUR: 'Censeur',
  SECRETAIRE: 'Secrétaire',
  COMPTABLE: 'Comptable',
  CAISSIER: 'Caissier',
  ENSEIGNANT: 'Enseignant',
  SURVEILLANT: 'Surveillant',
  PARENT: 'Parent',
  ELEVE: 'Élève',
  BIBLIOTHECAIRE: 'Bibliothécaire',
  RESPONSABLE_TRANSPORT: 'Transport',
  RESPONSABLE_CANTINE: 'Cantine',
  RESPONSABLE_INTERNAT: 'Internat',
};

export function hasAny(roles: readonly string[], allowed: readonly string[]) {
  return roles.some((r) => allowed.includes(r));
}

export interface NavItem {
  href: string;
  label: string;
  roles?: readonly string[];
}

export const NAV: NavItem[] = [
  { href: '/tableau-de-bord', label: 'Accueil' },
  { href: '/enseignant', label: 'Appel et notes', roles: TEACHING },
  { href: '/parent', label: 'Mes enfants', roles: ['PARENT'] },
  { href: '/eleves', label: 'Élèves', roles: STUDENTS_READ },
  { href: '/structure', label: 'Classes', roles: STRUCTURE },
  { href: '/comptes', label: 'Comptes', roles: DIRECTION },
  { href: '/annonces', label: 'Annonces' },
];
