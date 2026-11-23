import { Injectable, NotFoundException } from '@nestjs/common';
import type { TenantPrisma } from '../database';
import { DEFAULT_POLICY, generalAverage, subjectAverage, type AssessmentType, type GradeStatus } from '../domain';
import { currentYear, isoDate, termFor, todayIso } from '../school/school';

interface ChildRow {
  id: string;
  firstName: string;
  lastName: string;
  matricule: string;
  classroom: { id: string; name: string; level: string; gradeScale: number; levelId: string } | null;
}

/** Espace parent : uniquement les enfants liés à son compte. */
@Injectable()
export class ParentService {
  private async children(db: TenantPrisma, userId: string): Promise<ChildRow[]> {
    const guardian = await db.guardian.findFirst({
      where: { userId },
      include: {
        students: {
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                matricule: true,
                archivedAt: true,
                enrollments: {
                  where: { academicYear: { isCurrent: true } },
                  select: {
                    classroom: { select: { id: true, name: true, levelId: true, level: { select: { name: true, gradeScale: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!guardian) return [];
    return guardian.students
      .filter((l) => !l.student.archivedAt)
      .map((l) => {
        const c = l.student.enrollments[0]?.classroom;
        return {
          id: l.student.id,
          firstName: l.student.firstName,
          lastName: l.student.lastName,
          matricule: l.student.matricule,
          classroom: c ? { id: c.id, name: c.name, level: c.level.name, gradeScale: c.level.gradeScale, levelId: c.levelId } : null,
        };
      });
  }

  /** Notes, moyennes par matière et moyenne générale d'un élève pour une période. */
  private async results(db: TenantPrisma, child: ChildRow, termId: string | undefined) {
    if (!child.classroom || !termId) return { subjects: [], average: null as number | null, grades: [] };
    const [assessments, coefficients] = await Promise.all([
      db.assessment.findMany({
        where: { classroomId: child.classroom.id, termId },
        orderBy: { date: 'desc' },
        include: { subject: { select: { id: true, name: true } }, grades: { where: { studentId: child.id } } },
      }),
      db.subjectCoefficient.findMany({ where: { levelId: child.classroom.levelId } }),
    ]);
    const policy = { ...DEFAULT_POLICY, scale: child.classroom.gradeScale };
    const coef = new Map(coefficients.map((c) => [c.subjectId, c.coefficient]));
    const bySubject = new Map<string, { name: string; items: typeof assessments }>();
    for (const a of assessments) {
      const entry = bySubject.get(a.subjectId) ?? { name: a.subject.name, items: [] };
      entry.items.push(a);
      bySubject.set(a.subjectId, entry);
    }
    const subjects = [...bySubject.entries()]
      .map(([subjectId, { name, items }]) => {
        const grades = items.flatMap((a) =>
          a.grades.map((g) => ({ assessmentId: a.id, status: g.status as GradeStatus, score: g.score === null ? null : Number(g.score) })),
        );
        let average: number | null = null;
        try {
          average = subjectAverage(
            items.map((a) => ({ id: a.id, type: a.type as AssessmentType, maxScore: Number(a.maxScore), weight: Number(a.weight) })),
            grades,
            policy,
          );
        } catch {
          average = null;
        }
        return { subjectId, name, average, coefficient: coef.get(subjectId) ?? 1 };
      })
      .sort((x, y) => x.name.localeCompare(y.name, 'fr'));
    const grades = assessments.map((a) => {
      const g = a.grades[0];
      return {
        id: a.id,
        title: a.title,
        type: a.type,
        date: isoDate(a.date),
        subject: a.subject.name,
        maxScore: Number(a.maxScore),
        status: g?.status ?? null,
        score: g && g.score !== null ? Number(g.score) : null,
        comment: g?.comment ?? null,
      };
    });
    return { subjects, average: generalAverage(subjects), grades };
  }

  private async attendance(db: TenantPrisma, studentId: string, since: Date | undefined) {
    const records = await db.attendanceRecord.findMany({
      where: { studentId, status: { not: 'PRESENT' }, ...(since ? { session: { date: { gte: since } } } : {}) },
      include: { session: { select: { date: true } } },
    });
    return records
      .map((r) => ({ date: isoDate(r.session.date), status: r.status, minutesLate: r.minutesLate, justified: r.justified }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async overview(db: TenantPrisma, userId: string) {
    const year = await currentYear(db);
    const term = year ? termFor(year.terms, todayIso()) : undefined;
    const kids = await this.children(db, userId);
    const children: (ChildRow & { average: number | null; lastGrades: unknown[]; absences: number; lates: number })[] = [];
    for (const child of kids) {
      const [results, absences] = await Promise.all([this.results(db, child, term?.id), this.attendance(db, child.id, year?.startsOn)]);
      children.push({
        ...child,
        average: results.average,
        lastGrades: results.grades.filter((g) => g.status !== null).slice(0, 3),
        absences: absences.filter((a) => a.status === 'ABSENT').length,
        lates: absences.filter((a) => a.status === 'RETARD').length,
      });
    }
    return { year: year ? { label: year.label } : null, term: term ? { id: term.id, name: term.name } : null, children };
  }

  async child(db: TenantPrisma, userId: string, studentId: string, termId?: string) {
    const kids = await this.children(db, userId);
    const child = kids.find((k) => k.id === studentId);
    // Un enfant non lié au compte est invisible (404), même s'il existe dans l'école.
    if (!child) throw new NotFoundException('Élève introuvable');
    const year = await currentYear(db);
    const terms = year?.terms ?? [];
    const term = (termId && terms.find((t) => t.id === termId)) || termFor(terms, todayIso());
    const [results, attendance] = await Promise.all([this.results(db, child, term?.id), this.attendance(db, child.id, year?.startsOn)]);
    const scale = child.classroom?.gradeScale ?? 20;
    return {
      ...child,
      year: year?.label ?? null,
      terms: terms.map((t) => ({ id: t.id, name: t.name })),
      term: term ? { id: term.id, name: term.name } : null,
      scale,
      average: results.average,
      subjects: results.subjects,
      grades: results.grades,
      attendance,
    };
  }
}
