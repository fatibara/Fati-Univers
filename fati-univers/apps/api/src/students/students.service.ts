import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, TenantPrisma } from '../database';
import { AuditService } from '../audit/audit.service';
import type { TenantInfo } from '../common/request';
import type { CreateStudentDto, ListStudentsQuery } from './students.dto';

@Injectable()
export class StudentsService {
  constructor(private readonly audit: AuditService) {}

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
    const student = await db.student.create({
      data: {
        tenantId: tenant.tenantId,
        matricule: dto.matricule.trim(),
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim().toUpperCase(),
        gender: dto.gender,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        birthPlace: dto.birthPlace?.trim(),
      },
    });
    await this.audit.log(db, { tenantId: tenant.tenantId, userId }, {
      action: 'STUDENT_CREATED',
      entity: 'Student',
      entityId: student.id,
      after: { matricule: student.matricule, firstName: student.firstName, lastName: student.lastName },
    });
    return student;
  }
}
