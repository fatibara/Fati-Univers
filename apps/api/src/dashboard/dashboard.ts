import { Controller, Get, Injectable } from '@nestjs/common';
import type { TenantPrisma } from '../database';
import { CurrentTenant, RequirePermission, TenantDb } from '../common/decorators';
import type { TenantInfo } from '../common/request';
import { ACTIVE_ENROLLMENT, currentYear, termFor, todayIso } from '../school/school';

/** Chiffres clés et liste « pour bien démarrer » de la direction. */
@Injectable()
export class DashboardService {
  async summary(db: TenantPrisma, tenantId: string) {
    const year = await currentYear(db);
    const today = new Date(`${todayIso()}T00:00:00Z`);
    const yearId = year?.id ?? '00000000-0000-0000-0000-000000000000';
    const [students, classrooms, staff, teachers, parents, levels, subjects, assignments, absentToday, lateToday, callsToday, assessments] =
      await Promise.all([
        db.enrollment.count({ where: { academicYearId: yearId, status: { in: [...ACTIVE_ENROLLMENT] } } }),
        db.classroom.count({ where: { academicYearId: yearId } }),
        db.staffMember.count({ where: { isActive: true } }),
        db.membership.count({ where: { tenantId, isActive: true, roles: { has: 'ENSEIGNANT' } } }),
        db.membership.count({ where: { tenantId, isActive: true, roles: { has: 'PARENT' } } }),
        db.level.count(),
        db.subject.count(),
        db.teachingAssignment.count({ where: { classroom: { academicYearId: yearId } } }),
        db.attendanceRecord.count({ where: { status: 'ABSENT', session: { date: today } } }),
        db.attendanceRecord.count({ where: { status: 'RETARD', session: { date: today } } }),
        db.attendanceSession.count({ where: { date: today } }),
        db.assessment.count({ where: { classroom: { academicYearId: yearId } } }),
      ]);
    const term = year ? termFor(year.terms, todayIso()) : undefined;
    return {
      year: year ? { label: year.label } : null,
      term: term ? { name: term.name } : null,
      counts: { students, classrooms, staff, teachers, parents, assessments },
      today: { absent: absentToday, late: lateToday, calls: callsToday, classrooms },
      checklist: [
        { key: 'year', label: "Créer l'année scolaire", done: !!year, href: '/structure' },
        { key: 'levels', label: 'Ajouter les niveaux et les matières', done: levels > 0 && subjects > 0, href: '/structure' },
        { key: 'classes', label: 'Créer les classes', done: classrooms > 0, href: '/structure' },
        { key: 'teachers', label: 'Ajouter les enseignants', done: teachers > 0, href: '/comptes' },
        { key: 'assignments', label: 'Attribuer un professeur à chaque matière', done: assignments > 0, href: '/structure' },
        { key: 'students', label: 'Inscrire les élèves', done: students > 0, href: '/eleves' },
        { key: 'parents', label: 'Créer les comptes parents', done: parents > 0, href: '/comptes' },
      ],
    };
  }
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @RequirePermission('dashboard.view')
  summary(@TenantDb() db: TenantPrisma, @CurrentTenant() tenant: TenantInfo) {
    return this.dashboard.summary(db, tenant.tenantId);
  }
}
