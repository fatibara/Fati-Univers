import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { withTenantTransaction, type TenantPrisma } from '../database';
import type { TenantInfo } from '../common/request';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { currentYear, requireCurrentYear, splitPeriods } from '../school/school';
import { LEVEL_PRESETS, SUBJECT_PRESETS } from './presets';
import type {
  CreateClassroomDto,
  CreateLevelDto,
  CreateSubjectDto,
  CreateYearDto,
  QuickStartDto,
  SetAssignmentDto,
  UpdateClassroomDto,
} from './structure.dto';

const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);

/** Organisation de l'école : année scolaire, niveaux, classes, matières, professeurs par matière. */
@Injectable()
export class StructureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async overview(db: TenantPrisma) {
    const year = await currentYear(db);
    const [levels, subjects, staff] = await Promise.all([
      db.level.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }] }),
      db.subject.findMany({ orderBy: { name: 'asc' } }),
      db.staffMember.findMany({
        where: { isActive: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        select: { id: true, firstName: true, lastName: true, position: true },
      }),
    ]);
    const classrooms = await db.classroom.findMany({
      where: { academicYearId: year?.id ?? '00000000-0000-0000-0000-000000000000' },
      orderBy: [{ level: { position: 'asc' } }, { name: 'asc' }],
      include: {
        level: { select: { id: true, name: true, cycle: true, gradeScale: true } },
        mainTeacher: { select: { id: true, firstName: true, lastName: true } },
        assignments: { select: { subjectId: true, staffId: true } },
        _count: { select: { enrollments: true } },
      },
    });
    return {
      year,
      levels,
      subjects,
      staff,
      classrooms: classrooms.map((c) => ({
        id: c.id,
        name: c.name,
        capacity: c.capacity,
        level: c.level,
        mainTeacher: c.mainTeacher,
        assignments: c.assignments,
        studentCount: c._count.enrollments,
      })),
    };
  }

  async createYear(tenant: TenantInfo, userId: string, dto: CreateYearDto) {
    if (dto.endsOn.slice(0, 10) <= dto.startsOn.slice(0, 10)) {
      throw new BadRequestException("La fin de l'année doit être après son début");
    }
    const ctx = { tenantId: tenant.tenantId, userId };
    return withTenantTransaction(this.prisma.app, ctx, async (tx) => {
      const exists = await tx.academicYear.findFirst({ where: { label: dto.label } });
      if (exists) throw new ConflictException(`L'année ${dto.label} existe déjà`);
      const previous = await tx.academicYear.findFirst({ where: { isCurrent: true } });
      await tx.academicYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
      const year = await tx.academicYear.create({
        data: {
          tenantId: tenant.tenantId,
          label: dto.label,
          startsOn: day(dto.startsOn),
          endsOn: day(dto.endsOn),
          periodType: dto.periodType,
          isCurrent: true,
        },
      });
      const count = dto.periodType === 'SEMESTRE' ? 2 : 3;
      const word = dto.periodType === 'SEMESTRE' ? 'semestre' : 'trimestre';
      const periods = splitPeriods(dto.startsOn.slice(0, 10), dto.endsOn.slice(0, 10), count);
      for (let i = 0; i < periods.length; i++) {
        const p = periods[i]!;
        await tx.term.create({
          data: {
            tenantId: tenant.tenantId,
            academicYearId: year.id,
            name: `${i === 0 ? '1er' : `${i + 1}e`} ${word}`,
            position: i + 1,
            startsOn: day(p.startsOn),
            endsOn: day(p.endsOn),
          },
        });
      }

      let copied = 0;
      if (previous && dto.copyClasses !== false) {
        const old = await tx.classroom.findMany({ where: { academicYearId: previous.id }, include: { assignments: true } });
        for (const c of old) {
          const created = await tx.classroom.create({
            data: {
              tenantId: tenant.tenantId,
              academicYearId: year.id,
              levelId: c.levelId,
              trackId: c.trackId,
              campusId: c.campusId,
              name: c.name,
              capacity: c.capacity,
              mainTeacherId: c.mainTeacherId,
            },
          });
          for (const a of c.assignments) {
            await tx.teachingAssignment.create({
              data: { tenantId: tenant.tenantId, classroomId: created.id, subjectId: a.subjectId, staffId: a.staffId },
            });
          }
          copied++;
        }
      }
      await this.audit.logInTx(tx, ctx, {
        action: 'ACADEMIC_YEAR_CREATED',
        entity: 'AcademicYear',
        entityId: year.id,
        after: { label: year.label, copiedClasses: copied },
      });
      return { id: year.id, label: year.label, copiedClasses: copied };
    });
  }

  async createLevel(db: TenantPrisma, tenant: TenantInfo, dto: CreateLevelDto) {
    const max = await db.level.aggregate({ _max: { position: true } });
    return db.level.create({
      data: {
        tenantId: tenant.tenantId,
        name: dto.name.trim(),
        cycle: dto.cycle,
        position: (max._max.position ?? 0) + 1,
        gradeScale: dto.gradeScale ?? (dto.cycle === 'PRIMAIRE' || dto.cycle === 'MATERNELLE' ? 10 : 20),
      },
    });
  }

  private async assertStaff(db: TenantPrisma, staffId: string | null | undefined) {
    if (!staffId) return;
    const staff = await db.staffMember.findFirst({ where: { id: staffId, isActive: true }, select: { id: true } });
    if (!staff) throw new BadRequestException('Professeur introuvable dans cette école');
  }

  async createClassroom(db: TenantPrisma, tenant: TenantInfo, dto: CreateClassroomDto) {
    const year = await requireCurrentYear(db);
    await this.assertStaff(db, dto.mainTeacherId);
    const level = await db.level.findFirst({ where: { id: dto.levelId }, select: { id: true } });
    if (!level) throw new BadRequestException('Niveau introuvable');
    return db.classroom.create({
      data: {
        tenantId: tenant.tenantId,
        academicYearId: year.id,
        levelId: dto.levelId,
        name: dto.name.trim(),
        capacity: dto.capacity,
        mainTeacherId: dto.mainTeacherId ?? null,
      },
    });
  }

  async updateClassroom(db: TenantPrisma, id: string, dto: UpdateClassroomDto) {
    const classroom = await db.classroom.findFirst({ where: { id }, select: { id: true } });
    if (!classroom) throw new NotFoundException('Classe introuvable');
    await this.assertStaff(db, dto.mainTeacherId);
    return db.classroom.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.mainTeacherId !== undefined ? { mainTeacherId: dto.mainTeacherId } : {}),
      },
    });
  }

  async deleteClassroom(db: TenantPrisma, id: string) {
    const classroom = await db.classroom.findFirst({
      where: { id },
      include: { _count: { select: { enrollments: true, assessments: true, attendanceSessions: true } } },
    });
    if (!classroom) throw new NotFoundException('Classe introuvable');
    const c = classroom._count;
    if (c.enrollments + c.assessments + c.attendanceSessions > 0) {
      throw new ConflictException('Cette classe a déjà des élèves, des notes ou des appels : elle ne peut pas être supprimée');
    }
    await db.teachingAssignment.deleteMany({ where: { classroomId: id } });
    await db.classroom.delete({ where: { id } });
    return { deleted: true };
  }

  async createSubject(db: TenantPrisma, tenant: TenantInfo, dto: CreateSubjectDto) {
    const code = dto.code.trim().toUpperCase();
    const exists = await db.subject.findFirst({ where: { code } });
    if (exists) throw new ConflictException(`Le code ${code} est déjà utilisé`);
    return db.subject.create({ data: { tenantId: tenant.tenantId, code, name: dto.name.trim() } });
  }

  async setAssignment(db: TenantPrisma, tenant: TenantInfo, dto: SetAssignmentDto) {
    const [classroom, subject] = await Promise.all([
      db.classroom.findFirst({ where: { id: dto.classroomId }, select: { id: true } }),
      db.subject.findFirst({ where: { id: dto.subjectId }, select: { id: true } }),
    ]);
    if (!classroom || !subject) throw new NotFoundException('Classe ou matière introuvable');
    if (!dto.staffId) {
      await db.teachingAssignment.deleteMany({ where: { classroomId: dto.classroomId, subjectId: dto.subjectId } });
      return { assigned: false };
    }
    await this.assertStaff(db, dto.staffId);
    await db.teachingAssignment.upsert({
      where: {
        tenantId_classroomId_subjectId: { tenantId: tenant.tenantId, classroomId: dto.classroomId, subjectId: dto.subjectId },
      },
      update: { staffId: dto.staffId },
      create: { tenantId: tenant.tenantId, classroomId: dto.classroomId, subjectId: dto.subjectId, staffId: dto.staffId },
    });
    return { assigned: true };
  }

  /** Crée d'un coup les niveaux et matières habituels des cycles choisis (sans doublon). */
  async quickStart(db: TenantPrisma, tenant: TenantInfo, dto: QuickStartDto) {
    const order: ('MATERNELLE' | 'PRIMAIRE' | 'COLLEGE' | 'LYCEE')[] = ['MATERNELLE', 'PRIMAIRE', 'COLLEGE', 'LYCEE'];
    const cycles = order.filter((c) => dto.cycles.includes(c));
    const [existingLevels, existingSubjects, max] = await Promise.all([
      db.level.findMany({ select: { name: true } }),
      db.subject.findMany({ select: { code: true } }),
      db.level.aggregate({ _max: { position: true } }),
    ]);
    const levelNames = new Set(existingLevels.map((l) => l.name));
    const subjectCodes = new Set(existingSubjects.map((s) => s.code));
    let position = max._max.position ?? 0;
    let levels = 0;
    let subjects = 0;
    for (const cycle of cycles) {
      const preset = LEVEL_PRESETS[cycle];
      for (const name of preset.names) {
        if (levelNames.has(name)) continue;
        position++;
        await db.level.create({ data: { tenantId: tenant.tenantId, cycle, name, position, gradeScale: preset.scale } });
        levelNames.add(name);
        levels++;
      }
      for (const [code, name] of SUBJECT_PRESETS[cycle]) {
        if (subjectCodes.has(code)) continue;
        await db.subject.create({ data: { tenantId: tenant.tenantId, code, name } });
        subjectCodes.add(code);
        subjects++;
      }
    }
    return { levels, subjects };
  }
}
