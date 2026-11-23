import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { withTenantTransaction, type Prisma, type TenantPrisma } from '../database';
import { PrismaService } from '../prisma/prisma.service';
import { currentYear, requireCurrentYear } from '../school/school';
import { AuditService } from '../audit/audit.service';
import type { TenantInfo } from '../common/request';
import type { CreateStudentDto, EnrollDto, ListStudentsQuery } from './students.dto';

@Injectable()
export class StudentsService {
  constructor(
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  async list(db: TenantPrisma, q: ListStudentsQuery) {
    const where: Prisma.StudentWhereInput = {
      archivedAt: null,
      ...(q.search
        ? {
            OR: [
              { firstName: { contains: q.search, mode: 'insensitive' as const } },
              { lastName: { contains: q.search, mode: 'insensitive' as const } },
              { matricule: { contains: q.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(q.classroomId ? { enrollments: { some: { classroomId: q.classroomId } } } : {}),
    };
    // Pas de tenantId dans le filtre : la base (RLS) ne renvoie que l'école active.
    const [items, total] = await Promise.all([
      db.student.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true,
          matricule: true,
          firstName: true,
          lastName: true,
          gender: true,
          birthDate: true,
          enrollments: {
            where: { academicYear: { isCurrent: true } },
            select: { status: true, classroom: { select: { id: true, name: true } } },
          },
        },
      }),
      db.student.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async get(db: TenantPrisma, id: string) {
    const student = await db.student.findFirst({
      where: { id },
      include: {
        guardians: { include: { guardian: true } },
        enrollments: { include: { classroom: { select: { id: true, name: true } }, academicYear: true } },
      },
    });
    // Un élève d'une autre école est invisible : 404, jamais 403 (on ne confirme pas qu'il existe).
    if (!student) throw new NotFoundException('Élève introuvable');
    return student;
  }

  async create(db: TenantPrisma, tenant: TenantInfo, userId: string, dto: CreateStudentDto) {
    const year = await currentYear(db);
    if (dto.classroomId) {
      const classroom = await db.classroom.findFirst({ where: { id: dto.classroomId, academicYearId: year?.id ?? '' }, select: { id: true } });
      if (!year || !classroom) throw new BadRequestException("Classe introuvable dans l'année en cours");
    }
    const ctx = { tenantId: tenant.tenantId, userId };
    return withTenantTransaction(this.prisma.app, ctx, async (tx) => {
      let matricule = dto.matricule?.trim();
      if (!matricule) {
        const prefix = (year?.label ?? new Date().getUTCFullYear().toString()).slice(0, 4);
        const count = await tx.student.count({ where: { matricule: { startsWith: `${prefix}-` } } });
        let n = count + 1;
        // Recherche du prochain numéro libre (au cas où des matricules ont été saisis à la main).
        while (await tx.student.findFirst({ where: { matricule: `${prefix}-${String(n).padStart(4, '0')}` }, select: { id: true } })) n++;
        matricule = `${prefix}-${String(n).padStart(4, '0')}`;
      } else if (await tx.student.findFirst({ where: { matricule }, select: { id: true } })) {
        throw new ConflictException(`Le matricule ${matricule} est déjà utilisé`);
      }
      const student = await tx.student.create({
        data: {
          tenantId: tenant.tenantId,
          matricule,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim().toUpperCase(),
          gender: dto.gender,
          birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
          birthPlace: dto.birthPlace?.trim(),
        },
      });
      if (dto.classroomId && year) {
        await tx.enrollment.create({
          data: {
            tenantId: tenant.tenantId,
            studentId: student.id,
            classroomId: dto.classroomId,
            academicYearId: year.id,
            status: 'INSCRIT',
          },
        });
      }
      await this.audit.logInTx(tx, ctx, {
        action: 'STUDENT_CREATED',
        entity: 'Student',
        entityId: student.id,
        after: { matricule: student.matricule, firstName: student.firstName, lastName: student.lastName, classroomId: dto.classroomId ?? null },
      });
      return student;
    });
  }

  /** Inscrit l'élève dans une classe de l'année en cours (ou le change de classe). */
  async enroll(db: TenantPrisma, tenant: TenantInfo, userId: string, studentId: string, dto: EnrollDto) {
    const year = await requireCurrentYear(db);
    const [student, classroom] = await Promise.all([
      db.student.findFirst({ where: { id: studentId, archivedAt: null }, select: { id: true } }),
      db.classroom.findFirst({ where: { id: dto.classroomId, academicYearId: year.id }, select: { id: true, name: true } }),
    ]);
    if (!student) throw new NotFoundException('Élève introuvable');
    if (!classroom) throw new BadRequestException("Classe introuvable dans l'année en cours");
    const enrollment = await db.enrollment.upsert({
      where: { tenantId_studentId_academicYearId: { tenantId: tenant.tenantId, studentId, academicYearId: year.id } },
      update: { classroomId: classroom.id, status: 'INSCRIT' },
      create: { tenantId: tenant.tenantId, studentId, classroomId: classroom.id, academicYearId: year.id, status: 'INSCRIT' },
    });
    await this.audit.log(db, { tenantId: tenant.tenantId, userId }, {
      action: 'STUDENT_ENROLLED',
      entity: 'Enrollment',
      entityId: enrollment.id,
      after: { studentId, classroom: classroom.name },
    });
    return { enrolled: true, classroom: classroom.name };
  }
}
