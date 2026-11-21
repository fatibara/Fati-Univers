import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { withTenantTransaction, type Prisma, type TenantPrisma } from '../database';
import { isValidGuineaPhone, normalizeGuineaPhone } from '../domain';
import type { TenantInfo } from '../common/request';
import { PlatformService } from '../platform/platform.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateMemberDto, UpdateMemberDto } from './members.dto';

const STAFF_ROLES = new Set([
  'DIRECTEUR', 'CENSEUR', 'SECRETAIRE', 'COMPTABLE', 'CAISSIER', 'ENSEIGNANT', 'SURVEILLANT',
  'BIBLIOTHECAIRE', 'RESPONSABLE_TRANSPORT', 'RESPONSABLE_CANTINE', 'RESPONSABLE_INTERNAT',
]);

/** Gestion des comptes d'une école par sa direction. Tout passe par le client limité à l'école (RLS). */
@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platform: PlatformService,
  ) {}

  async list(db: TenantPrisma, tenant: TenantInfo) {
    const rows = await db.membership.findMany({
      where: { tenantId: tenant.tenantId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, firstName: true, lastName: true, phone: true, passwordHash: true, lastLoginAt: true } } },
    });
    const guardians = await db.guardian.findMany({
      where: { userId: { in: rows.map((r) => r.userId) } },
      include: { students: { include: { student: { select: { id: true, firstName: true, lastName: true } } } } },
    });
    const childrenByUser = new Map(
      guardians.map((g) => [g.userId, g.students.map((s) => `${s.student.firstName} ${s.student.lastName}`)]),
    );
    return rows.map((m) => ({
      id: m.id,
      userId: m.userId,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      phone: m.user.phone,
      roles: m.roles,
      isActive: m.isActive,
      activated: !!m.user.passwordHash,
      lastLoginAt: m.user.lastLoginAt,
      children: childrenByUser.get(m.userId) ?? [],
    }));
  }

  async create(tenant: TenantInfo, actorUserId: string, dto: CreateMemberDto) {
    if (!isValidGuineaPhone(dto.phone)) throw new BadRequestException('Numéro invalide (ex. 620 12 34 56)');
    const phone = normalizeGuineaPhone(dto.phone);
    const firstName = dto.firstName.trim();
    const lastName = dto.lastName.trim().toUpperCase();
    const ctx = { tenantId: tenant.tenantId, userId: actorUserId };
    const studentIds = [...new Set(dto.studentIds ?? [])];
    if (dto.roles.includes('PARENT') && studentIds.length === 0) {
      throw new BadRequestException('Choisissez au moins un enfant pour un compte parent');
    }

    const user = await withTenantTransaction(this.prisma.app, ctx, async (tx) => {
      const user = await tx.user.upsert({ where: { phone }, update: {}, create: { phone, firstName, lastName } });

      const existing = await tx.membership.findFirst({ where: { tenantId: tenant.tenantId, userId: user.id } });
      if (existing) {
        const roles = [...new Set([...existing.roles, ...dto.roles])] as Prisma.MembershipUpdateInput['roles'];
        await tx.membership.update({ where: { id: existing.id }, data: { roles, isActive: true } });
      } else {
        await tx.membership.create({ data: { tenantId: tenant.tenantId, userId: user.id, roles: dto.roles } });
      }

      if (dto.roles.some((r) => STAFF_ROLES.has(r))) {
        const staff = await tx.staffMember.findFirst({ where: { tenantId: tenant.tenantId, userId: user.id } });
        if (!staff) {
          await tx.staffMember.create({
            data: { tenantId: tenant.tenantId, userId: user.id, firstName, lastName, phone, position: dto.position?.trim() },
          });
        }
      }

      if (dto.roles.includes('PARENT')) {
        const found = await tx.student.findMany({ where: { id: { in: studentIds } }, select: { id: true } });
        if (found.length !== studentIds.length) throw new BadRequestException('Un des élèves choisis est introuvable');
        let guardian = await tx.guardian.findFirst({ where: { tenantId: tenant.tenantId, phone } });
        if (!guardian) {
          guardian = await tx.guardian.create({ data: { tenantId: tenant.tenantId, userId: user.id, firstName, lastName, phone } });
        } else if (!guardian.userId) {
          guardian = await tx.guardian.update({ where: { id: guardian.id }, data: { userId: user.id } });
        }
        for (const studentId of studentIds) {
          const link = await tx.studentGuardian.findFirst({ where: { tenantId: tenant.tenantId, studentId, guardianId: guardian.id } });
          if (!link) {
            await tx.studentGuardian.create({
              data: { tenantId: tenant.tenantId, studentId, guardianId: guardian.id, relationship: dto.relationship?.trim() || 'PARENT' },
            });
          }
        }
      }

      await tx.auditLog.create({
        data: { tenantId: tenant.tenantId, actorUserId, action: 'MEMBER_ADDED', entity: 'Membership', entityId: user.id, after: { phone, roles: dto.roles } },
      });
      return user;
    });

    const school = await this.prisma.platform.tenant.findUniqueOrThrow({ where: { id: tenant.tenantId }, select: { shortName: true } });
    const activation = await this.platform.sendActivation(tenant.tenantId, school.shortName, phone, !!user.passwordHash);
    return { member: { userId: user.id, firstName: user.firstName, lastName: user.lastName, phone }, activation };
  }

  async update(db: TenantPrisma, tenant: TenantInfo, actorUserId: string, id: string, dto: UpdateMemberDto) {
    const m = await db.membership.findFirst({ where: { id, tenantId: tenant.tenantId } });
    if (!m) throw new NotFoundException('Compte introuvable');
    if (m.userId === actorUserId) throw new ForbiddenException('Vous ne pouvez pas modifier votre propre compte');
    if (m.roles.includes('PROMOTEUR')) throw new ForbiddenException('Le compte du promoteur se gère avec FATI UNIVERS');
    const updated = await db.membership.update({
      where: { id },
      data: { ...(dto.roles ? { roles: dto.roles } : {}), ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}) },
    });
    await db.auditLog.create({
      data: {
        tenantId: tenant.tenantId,
        actorUserId,
        action: 'MEMBER_UPDATED',
        entity: 'Membership',
        entityId: id,
        before: { roles: m.roles, isActive: m.isActive },
        after: { roles: updated.roles, isActive: updated.isActive },
      },
    });
    return { id, roles: updated.roles, isActive: updated.isActive };
  }

  async resendCode(db: TenantPrisma, tenant: TenantInfo, id: string) {
    const m = await db.membership.findFirst({ where: { id, tenantId: tenant.tenantId }, include: { user: true } });
    if (!m) throw new NotFoundException('Compte introuvable');
    const school = await this.prisma.platform.tenant.findUniqueOrThrow({ where: { id: tenant.tenantId }, select: { shortName: true } });
    return this.platform.sendActivation(tenant.tenantId, school.shortName, m.user.phone, !!m.user.passwordHash);
  }
}
