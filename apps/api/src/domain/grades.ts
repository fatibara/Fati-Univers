/**
 * Calcul des moyennes, rangs et mentions.
 *
 * Toutes les règles sont paramétrables par établissement et par niveau
 * (GradingPolicy). Les valeurs par défaut correspondent à la pratique la plus
 * courante et seront validées avec les écoles pilotes.
 */

export type AssessmentType = 'INTERROGATION' | 'DEVOIR' | 'COMPOSITION' | 'EXAMEN';
export type GradeStatus = 'NOTE' | 'ABSENT_JUSTIFIE' | 'ABSENT_NON_JUSTIFIE' | 'DISPENSE';
export type AbsentPolicy = 'NON_COMPTE' | 'ZERO';

export interface AssessmentInput {
  id: string;
  type: AssessmentType;
  /** Note maximale de l'évaluation (ex. 20, 10, 40). */
  maxScore: number;
  /** Poids propre de l'évaluation (1 par défaut). */
  weight: number;
}

export interface GradeInput {
  assessmentId: string;
  status: GradeStatus;
  /** Note brute sur maxScore ; null si absent ou dispensé. */
  score: number | null;
}

export interface MentionBand {
  /** Seuil minimal, exprimé sur 20. */
  min: number;
  label: string;
}

export interface GradingPolicy {
  /** Barème du niveau : 10 au primaire, 20 au secondaire (configurable). */
  scale: number;
  absentPolicy: AbsentPolicy;
  decimals: number;
  typeWeights: Record<AssessmentType, number>;
  mentions: MentionBand[];
}

export const DEFAULT_POLICY: GradingPolicy = {
  scale: 20,
  absentPolicy: 'NON_COMPTE',
  decimals: 2,
  typeWeights: { INTERROGATION: 1, DEVOIR: 1, COMPOSITION: 2, EXAMEN: 2 },
  mentions: [
    { min: 16, label: 'Très bien' },
    { min: 14, label: 'Bien' },
    { min: 12, label: 'Assez bien' },
    { min: 10, label: 'Passable' },
    { min: 0, label: 'Insuffisant' },
  ],
};

export class GradeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GradeError';
  }
}

/** Arrondi « au plus proche, demi vers le haut », sans erreur de virgule flottante. */
export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/**
 * Moyenne d'un élève dans une matière pour une période.
 * - chaque note est ramenée au barème du niveau (ex. 30/40 -> 15/20) ;
 * - poids effectif = poids de l'évaluation × poids du type (composition ×2…) ;
 * - absent non justifié : compté 0 ou ignoré selon la politique de l'école ;
 * - absent justifié, dispensé ou note non saisie : ignoré.
 * Renvoie null si aucune note ne compte.
 */
export function subjectAverage(
  assessments: readonly AssessmentInput[],
  grades: readonly GradeInput[],
  policy: GradingPolicy = DEFAULT_POLICY,
): number | null {
  const byId = new Map(assessments.map((a) => [a.id, a]));
  let weighted = 0;
  let totalWeight = 0;

  for (const g of grades) {
    const a = byId.get(g.assessmentId);
    if (!a) throw new GradeError(`Note liée à une évaluation inconnue : ${g.assessmentId}`);
    if (a.maxScore <= 0) throw new GradeError(`Note maximale invalide pour ${a.id}`);

    let normalized: number;
    if (g.status === 'NOTE') {
      if (g.score === null || g.score < 0 || g.score > a.maxScore) {
        throw new GradeError(`Note ${g.score} hors bornes (0 à ${a.maxScore}) pour ${a.id}`);
      }
      normalized = (g.score / a.maxScore) * policy.scale;
    } else if (g.status === 'ABSENT_NON_JUSTIFIE' && policy.absentPolicy === 'ZERO') {
      normalized = 0;
    } else {
      continue;
    }

    const w = a.weight * (policy.typeWeights[a.type] ?? 1);
    if (w <= 0) continue;
    weighted += normalized * w;
    totalWeight += w;
  }

  return totalWeight === 0 ? null : roundTo(weighted / totalWeight, policy.decimals);
}

export interface SubjectResult {
  subjectId: string;
  average: number | null;
  coefficient: number;
}

/**
 * Moyenne générale = Σ(moyenne × coefficient) / Σ(coefficients),
 * en ne gardant que les matières qui ont une moyenne et un coefficient > 0.
 */
export function generalAverage(subjects: readonly SubjectResult[], decimals = 2): number | null {
  let sum = 0;
  let coefs = 0;
  for (const s of subjects) {
    if (s.average === null || s.coefficient <= 0) continue;
    sum += s.average * s.coefficient;
    coefs += s.coefficient;
  }
  return coefs === 0 ? null : roundTo(sum / coefs, decimals);
}

/**
 * Moyenne annuelle à partir des moyennes de période.
 * weights : null = moyenne simple ; sinon un poids par période (ex. [1, 1, 2]).
 */
export function annualAverage(
  periodAverages: readonly (number | null)[],
  weights: readonly number[] | null = null,
  decimals = 2,
): number | null {
  if (weights && weights.length !== periodAverages.length) {
    throw new GradeError('Autant de poids que de périodes sont nécessaires');
  }
  let sum = 0;
  let total = 0;
  periodAverages.forEach((avg, i) => {
    if (avg === null) return;
    const w = weights ? weights[i]! : 1;
    sum += avg * w;
    total += w;
  });
  return total === 0 ? null : roundTo(sum / total, decimals);
}

export interface RankedStudent {
  studentId: string;
  average: number | null;
  /** Rang « olympique » : 1, 2, 2, 4. null si pas de moyenne. */
  rank: number | null;
  /** true si l'élève partage son rang. */
  exAequo: boolean;
}

/** Classement d'une classe ; les élèves sans moyenne ne sont pas classés. */
export function rankStudents(
  students: readonly { studentId: string; average: number | null }[],
): RankedStudent[] {
  const ranked = students
    .filter((s) => s.average !== null)
    .sort((a, b) => (b.average as number) - (a.average as number));

  const result: RankedStudent[] = [];
  ranked.forEach((s, i) => {
    const prev = ranked[i - 1];
    const rank = prev && prev.average === s.average ? result[i - 1]!.rank : i + 1;
    result.push({ studentId: s.studentId, average: s.average, rank, exAequo: false });
  });
  const counts = new Map<number | null, number>();
  for (const r of result) counts.set(r.rank, (counts.get(r.rank) ?? 0) + 1);
  for (const r of result) r.exAequo = (counts.get(r.rank) ?? 0) > 1;

  for (const s of students) {
    if (s.average === null) result.push({ studentId: s.studentId, average: null, rank: null, exAequo: false });
  }
  return result;
}

/** Libellé de rang pour le bulletin : "1er", "2e", "3e ex æquo". */
export function rankLabel(rank: number, exAequo = false): string {
  const base = rank === 1 ? '1er' : `${rank}e`;
  return exAequo ? `${base} ex æquo` : base;
}

/** Mention selon la moyenne ; les seuils sont exprimés sur 20 et convertis si le barème est sur 10. */
export function mention(average: number | null, policy: GradingPolicy = DEFAULT_POLICY): string | null {
  if (average === null) return null;
  const on20 = (average / policy.scale) * 20;
  const bands = [...policy.mentions].sort((a, b) => b.min - a.min);
  return bands.find((b) => on20 + 1e-9 >= b.min)?.label ?? null;
}
