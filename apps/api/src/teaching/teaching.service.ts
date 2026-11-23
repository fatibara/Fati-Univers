import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { withTenantTransaction, type TenantPrisma } from '../database';
import { absenceSms, can, lateSms } from '../domain';
import type { TenantInfo } from '../common/request';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { ACTIVE_ENROLLMENT, currentYear, isoDate, requireCurrentYear, staffOf, termFor } from '../school/school';
import type { CreateAssessmentDto, SaveAttendanceDto, SaveGradesDto } from './teaching.dto';

const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const frDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

interface Access {
  /** Fiche personnel du compte (null pour un promoteur sans fiche). */
  staffId: string | null;
  /** Direction / censeur / surveillant : toute l'école. */
  wholeSchool: boolean;
  /** Matières que le compte enseigne dans cette classe. */
  subjectIds: Set<string>;
  isMain: boolean;
}

/** Espace enseignant : ses classes, l'appel, les évaluations et les notes. */
@Injectable()
export class TeachingService {
  private readonly log = new Logger('Teaching');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sms: SmsService,
  ) {}

  private wholeSchool(tenant: TenantInfo) {
    return can(tenant.roles, 'attendance.manage') || can(tenant.roles, 'grades.read.all');
  }

  /** Droits du compte sur une classe. Refuse si la classe ne le concerne pas. */
  private async access(db: TenantPrisma, tenant: TenantInfo, userId: string, classroomId: string) {
    const classroom = await db.classroom.findFirst({
      where: { id: classroomId },
      include: { level: { select: { name: true, gradeScale: true } }, academicYear: { select: { id: true, isCurrent: true } } },
    });
    if (!classroom) throw new NotFoundException('Classe introuvable');
    const staff = await staffOf(db, userId);
    const wholeSchool = this.wholeSchool(tenant);
    const assignments = staff
      ? await db.teachingAssignment.findMany({ where: { classroomId, staffId: staff.id }, select: { subjectId: true } })
      : [];
    const access: Access = {
      staffId: staff?.id ?? null,
      wholeSchool,
      subjectIds: new Set(assignments.map((a) => a.subjectId)),
      isMain: !!staff && classroom.mainTeacherId === staff.id,
    };
    if (!wholeSchool && access.subjectIds.size === 0 && !access.isMain) {
      throw new ForbiddenException("Vous n'enseignez pas dans cette classe");
    }
    return { classroom, access };
  }

  private requireStaff(access: Access): string {
    if (!access.staffId) throw new BadRequestException('Votre compte doit avoir une fiche « personnel » dans cette école');
    return access.staffId;
  }

  private canGrade(tenant: TenantInfo, access: Access, subjectId: string) {
    return access.subjectIds.has(subjectId) || can(tenant.roles, 'classes.manage');
  }

  async myClasses(db: TenantPrisma, tenant: TenantInfo, userId: string) {
    const year = await currentYear(db);
    if (!year) return { year: null, classes: [] };
    const staff = await staffOf(db, userId);
    const wholeSchool = this.wholeSchool(tenant);
    if (!staff && !wholeSchool) return { year: { id: year.id, label: year.label }, classes: [] };
    const staffId = staff?.id ?? '00000000-0000-0000-0000-000000000000';
    const classrooms = await db.classroom.findMany({
      where: wholeSchool
        ? { academicYearId: year.id }
        : { academicYearId: year.id, OR: [{ mainTeacherId: staffId }, { assignments: { some: { staffId } } }] },
      orderBy: [{ level: { position: 'asc' } }, { name: 'asc' }],
      include: {
        level: { select: { name: true } },
        assignments: { include: { subject: { select: { id: true, name: true } } } },
        _count: { select: { enrollments: true } },
      },
    });
    const allSubjects = can(tenant.roles, 'classes.manage')
      ? await db.subject.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } })
      : [];
    return {
      year: { id: year.id, label: year.label },
      classes: classrooms.map((c) => {
        const own = c.assignments.filter((a) => a.staffId === staffId).map((a) => a.subject);
        return {
          id: c.id,
          name: c.name,
          level: c.level.name,
          studentCount: c._count.enrollments,
          isMain: c.mainTeacherId === staffId,
          subjects: allSubjects.length > 0 ? allSubjects : wholeSchool ? c.assignments.map((a) => a.subject) : own,
        };
      }),
    };
  }

  private roster(db: TenantPrisma, classroomId: string) {
    return db.enrollment
      .findMany({
        where: { classroomId, status: { in: [...ACTIVE_ENROLLMENT] } },
        include: { student: { select: { id: true, matricule: true, firstName: true, lastName: true, gender: true } } },
      })
      .then((rows) =>
        rows
          .map((r) => r.student)
          .sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr') || a.firstName.localeCompare(b.firstName, 'fr')),
      );
  }

  async classDetail(db: TenantPrisma, tenant: TenantInfo, userId: string, classroomId: string) {
    const { classroom, access } = await this.access(db, tenant, userId, classroomId);
    const [students, assignments, subjects] = await Promise.all([
      this.roster(db, classroomId),
      db.teachingAssignment.findMany({
        where: { classroomId },
        include: {
          subject: { select: { id: true, name: true } },
          staff: { select: { firstName: true, lastName: true } },
        },
      }),
      can(tenant.roles, 'classes.manage') ? db.subject.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }) : Promise.resolve(null),
    ]);
    const mySubjects = subjects ?? assignments.filter((a) => access.subjectIds.has(a.subjectId)).map((a) => a.subject);
    return {
      id: classroom.id,
      name: classroom.name,
      level: classroom.level.name,
      gradeScale: classroom.level.gradeScale,
      isMain: access.isMain,
      students,
      mySubjects,
      teachers: assignments.map((a) => ({ subject: a.subject.name, teacher: `${a.staff.firstName} ${a.staff.lastName}` })),
    };
  }

  async getAttendance(db: TenantPrisma, tenant: TenantInfo, userId: string, classroomId: string, date: string) {
    await this.access(db, tenant, userId, classroomId);
    const [students, session] = await Promise.all([
      this.roster(db, classroomId),
      db.attendanceSession.findFirst({
        where: { classroomId, date: day(date) },
        orderBy: { createdAt: 'desc' },
        include: { records: true, takenBy: { select: { firstName: true, lastName: true } } },
      }),
    ]);
    const byStudent = new Map((session?.records ?? []).map((r) => [r.studentId, r]));
    return {
      date: date.slice(0, 10),
      taken: !!session,
      takenBy: session ? `${session.takenBy.firstName} ${session.takenBy.lastName}` : null,
      students: students.map((s) => {
        const r = byStudent.get(s.id);
        return { ...s, status: r?.status ?? 'PRESENT', minutesLate: r?.minutesLate ?? null, smsSent: !!r?.smsSentAt };
      }),
    };
  }

  async saveAttendance(db: TenantPrisma, tenant: TenantInfo, userId: string, classroomId: string, dto: SaveAttendanceDto) {
    const { access } = await this.access(db, tenant, userId, classroomId);
    const staffId = this.requireStaff(access);
    const date = dto.date.slice(0, 10);
    if (date > isoDate(new Date(Date.now() + 86_400_000))) throw new BadRequestException("On ne fait pas l'appel d'un jour futur");
    const roster = new Set((await this.roster(db, classroomId)).map((s) => s.id));
    const lines = dto.records.filter((r) => roster.has(r.studentId));
    const ctx = { tenantId: tenant.tenantId, userId };

    const toNotify = await withTenantTransaction(this.prisma.app, ctx, async (tx) => {
      let session = await tx.attendanceSession.findFirst({ where: { classroomId, date: day(date) }, orderBy: { createdAt: 'desc' } });
      session ??= await tx.attendanceSession.create({
        data: { tenantId: tenant.tenantId, classroomId, takenById: staffId, date: day(date) },
      });
      const previous = await tx.attendanceRecord.findMany({ where: { sessionId: session.id } });
      const before = new Map(previous.map((r) => [r.studentId, r]));
      const notify: { recordId: string; studentId: string; status: 'ABSENT' | 'RETARD'; minutes: number }[] = [];
      for (const line of lines) {
        const minutesLate = line.status === 'RETARD' ? (line.minutesLate ?? null) : null;
        const record = await tx.attendanceRecord.upsert({
          where: { tenantId_sessionId_studentId: { tenantId: tenant.tenantId, sessionId: session.id, studentId: line.studentId } },
          update: { status: line.status, minutesLate },
          create: { tenantId: tenant.tenantId, sessionId: session.id, studentId: line.studentId, status: line.status, minutesLate },
        });
        const old = before.get(line.studentId);
        if (line.status !== 'PRESENT' && !(old && old.status === line.status) && !record.smsSentAt) {
          notify.push({ recordId: record.id, studentId: line.studentId, status: line.status, minutes: minutesLate ?? 0 });
        }
      }
      return notify;
    });

    const counts = {
      present: lines.filter((l) => l.status === 'PRESENT').length,
      absent: lines.filter((l) => l.status === 'ABSENT').length,
      late: lines.filter((l) => l.status === 'RETARD').length,
    };
    let smsSent = 0;
    if (dto.notifyParents && toNotify.length > 0) smsSent = await this.notifyParents(db, tenant, date, toNotify);
    return { saved: lines.length, ...counts, smsSent };
  }

  private async notifyParents(
    db: TenantPrisma,
    tenant: TenantInfo,
    date: string,
    items: { recordId: string; studentId: string; status: 'ABSENT' | 'RETARD'; minutes: number }[],
  ) {
    const school = await db.tenant.findFirst({ where: { id: tenant.tenantId }, select: { shortName: true, name: true } });
    const schoolName = school?.shortName || school?.name || 'Ecole';
    const links = await db.studentGuardian.findMany({
      where: { studentId: { in: items.map((i) => i.studentId) }, receivesSms: true },
      include: { guardian: { select: { phone: true } }, student: { select: { firstName: true, lastName: true } } },
    });
    let sent = 0;
    for (const item of items) {
      const forStudent = links.filter((l) => l.studentId === item.studentId);
      let any = false;
      for (const link of forStudent) {
        const student = `${link.student.firstName} ${link.student.lastName}`;
        const body =
          item.status === 'ABSENT'
            ? absenceSms({ school: schoolName, student, date: frDate(date) })
            : lateSms({ school: schoolName, student, date: frDate(date), minutes: item.minutes });
        const res = await this.sms.send({ tenantId: tenant.tenantId, to: link.guardian.phone, body, purpose: item.status === 'ABSENT' ? 'ABSENCE' : 'RETARD' });
        if (res.sent) {
          sent++;
          any = true;
        }
      }
      if (any) await db.attendanceRecord.update({ where: { id: item.recordId }, data: { smsSentAt: new Date() } });
    }
    return sent;
  }

  async listAssessments(db: TenantPrisma, tenant: TenantInfo, userId: string, classroomId: string, subjectId?: string) {
    const { access } = await this.access(db, tenant, userId, classroomId);
    const visible = access.wholeSchool || can(tenant.roles, 'classes.manage') ? undefined : [...access.subjectIds];
    const rows = await db.assessment.findMany({
      where: {
        classroomId,
        ...(subjectId ? { subjectId } : {}),
        ...(visible ? { subjectId: subjectId && visible.includes(subjectId) ? subjectId : { in: visible } } : {}),
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: {
        subject: { select: { id: true, name: true } },
        term: { select: { id: true, name: true } },
        _count: { select: { grades: true } },
      },
    });
    return rows.map((a) => ({
      id: a.id,
      title: a.title,
      type: a.type,
      date: isoDate(a.date),
      maxScore: Number(a.maxScore),
      subject: a.subject,
      term: a.term,
      gradedCount: a._count.grades,
    }));
  }

  async createAssessment(db: TenantPrisma, tenant: TenantInfo, userId: string, dto: CreateAssessmentDto) {
    const { classroom, access } = await this.access(db, tenant, userId, dto.classroomId);
    if (!this.canGrade(tenant, access, dto.subjectId)) throw new ForbiddenException("Vous n'enseignez pas cette matière dans cette classe");
    const staffId = this.requireStaff(access);
    const year = await requireCurrentYear(db);
    if (classroom.academicYearId !== year.id) throw new BadRequestException("Cette classe n'est pas de l'année en cours");
    const date = dto.date.slice(0, 10);
    const term = termFor(year.terms, date);
    if (!term) throw new BadRequestException("L'année scolaire n'a pas de trimestre ou semestre");
    if (term.gradesLockedAt) throw new BadRequestException(`Les notes du ${term.name} sont clôturées`);
    const subject = await db.subject.findFirst({ where: { id: dto.subjectId }, select: { id: true } });
    if (!subject) throw new NotFoundException('Matière introuvable');
    const a = await db.assessment.create({
      data: {
        tenantId: tenant.tenantId,
        classroomId: classroom.id,
        subjectId: dto.subjectId,
        termId: term.id,
        createdById: staffId,
        type: dto.type,
        title: dto.title.trim(),
        date: day(date),
        maxScore: dto.maxScore ?? classroom.level.gradeScale,
      },
    });
    return { id: a.id, term: term.name };
  }

  async getAssessment(db: TenantPrisma, tenant: TenantInfo, userId: string, id: string) {
    const a = await db.assessment.findFirst({
      where: { id },
      include: {
        subject: { select: { id: true, name: true } },
        term: { select: { name: true, gradesLockedAt: true } },
        classroom: { select: { id: true, name: true } },
        grades: true,
      },
    });
    if (!a) throw new NotFoundException('Évaluation introuvable');
    const { access } = await this.access(db, tenant, userId, a.classroomId);
    if (!access.wholeSchool && !this.canGrade(tenant, access, a.subjectId)) throw new ForbiddenException('Accès refusé');
    const students = await this.roster(db, a.classroomId);
    const byStudent = new Map(a.grades.map((g) => [g.studentId, g]));
    const scores = a.grades.filter((g) => g.status === 'NOTE' && g.score !== null).map((g) => Number(g.score));
    return {
      id: a.id,
      title: a.title,
      type: a.type,
      date: isoDate(a.date),
      maxScore: Number(a.maxScore),
      subject: a.subject,
      classroom: a.classroom,
      term: a.term.name,
      locked: !!a.term.gradesLockedAt,
      canEdit: !a.term.gradesLockedAt && this.canGrade(tenant, access, a.subjectId),
      stats: scores.length
        ? {
            count: scores.length,
            average: Math.round((scores.reduce((x, y) => x + y, 0) / scores.length) * 100) / 100,
            min: Math.min(...scores),
            max: Math.max(...scores),
          }
        : null,
      students: students.map((s) => {
        const g = byStudent.get(s.id);
        return { ...s, status: g?.status ?? null, score: g?.score === null || g?.score === undefined ? null : Number(g.score), comment: g?.comment ?? '' };
      }),
    };
  }

  async saveGrades(db: TenantPrisma, tenant: TenantInfo, userId: string, id: string, dto: SaveGradesDto) {
    const a = await db.assessment.findFirst({ where: { id }, include: { term: { select: { gradesLockedAt: true, name: true } } } });
    if (!a) throw new NotFoundException('Évaluation introuvable');
    const { access } = await this.access(db, tenant, userId, a.classroomId);
    if (!this.canGrade(tenant, access, a.subjectId)) throw new ForbiddenException("Vous n'enseignez pas cette matière dans cette classe");
    if (a.term.gradesLockedAt) throw new BadRequestException(`Les notes du ${a.term.name} sont clôturées`);
    const max = Number(a.maxScore);
    const roster = new Set((await this.roster(db, a.classroomId)).map((s) => s.id));
    for (const g of dto.grades) {
      if (!roster.has(g.studentId)) throw new BadRequestException("Un élève de la liste n'est pas dans cette classe");
      if (g.status === 'NOTE' && (g.score === null || g.score === undefined || g.score > max)) {
        throw new BadRequestException(`Chaque note doit être entre 0 et ${max}`);
      }
    }
    const ctx = { tenantId: tenant.tenantId, userId };
    await withTenantTransaction(this.prisma.app, ctx, async (tx) => {
      for (const g of dto.grades) {
        const score = g.status === 'NOTE' ? g.score! : null;
        const comment = g.comment?.trim() || null;
        await tx.grade.upsert({
          where: { tenantId_assessmentId_studentId: { tenantId: tenant.tenantId, assessmentId: a.id, studentId: g.studentId } },
          update: { status: g.status, score, comment, updatedById: userId },
          create: { tenantId: tenant.tenantId, assessmentId: a.id, studentId: g.studentId, status: g.status, score, comment, updatedById: userId },
        });
      }
      await this.audit.logInTx(tx, ctx, {
        action: 'GRADES_SAVED',
        entity: 'Assessment',
        entityId: a.id,
        after: { count: dto.grades.length },
      });
    });
    return { saved: dto.grades.length };
  }
}
