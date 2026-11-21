import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { activationSms, isValidGuineaPhone, normalizeGuineaPhone } from '../domain';
import { OtpService } from '../auth/otp.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import type { CreateSchoolDto } from './platform.dto';

function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'ecole'}-${randomBytes(2).toString('hex')}`;
}

export interface ActivationInfo {
  smsSent: boolean;
  /** Présent uniquement en mode simulation (aucun SMS réel) : à transmettre à la personne. */
  simulatedCode?: string;
  alreadyActive?: boolean;
}

/** Super-administration : utilise le rôle fati_platform, qui voit toutes les écoles. */
@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly sms: SmsService,
  ) {}

  async listSchools() {
    const schools = await this.prisma.platform.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { students: true, memberships: true } },
        subscriptions: { orderBy: { startsAt: 'desc' }, take: 1, include: { plan: { select: { name: true } } } },
        memberships: {
          where: { roles: { has: 'DIRECTEUR' } },
          take: 1,
          include: { user: { select: { firstName: true, lastName: true, phone: true, passwordHash: true } } },
        },
      },
    });
    return schools.map((s) => {
      const d = s.memberships[0]?.user;
      return {
        id: s.id,
        name: s.name,
        shortName: s.shortName,
        city: s.city,
        status: s.status,
        cycles: s.cycles,
        createdAt: s.createdAt,
        students: s._count.students,
        members: s._count.memberships,
        plan: s.subscriptions[0]?.plan.name ?? null,
        subscriptionStatus: s.subscriptions[0]?.status ?? null,
        director: d ? { firstName: d.firstName, lastName: d.lastName, phone: d.phone, activated: !!d.passwordHash } : null,
      };
    });
  }

  async createSchool(dto: CreateSchoolDto, actorUserId: string) {
    if (!isValidGuineaPhone(dto.director.phone)) throw new BadRequestException('Numéro du directeur invalide (ex. 620 12 34 56)');
    if (dto.phone && !isValidGuineaPhone(dto.phone)) throw new BadRequestException("Numéro de l'école invalide");
    const directorPhone = normalizeGuineaPhone(dto.director.phone);
    const plan = await this.prisma.platform.plan.findFirst({ where: { code: 'PROFESSIONNELLE' } });

    const { tenant, director } = await this.prisma.platform.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          slug: slugify(dto.name),
          name: dto.name.trim(),
          shortName: dto.shortName.trim().toUpperCase(),
          city: dto.city?.trim(),
          phone: dto.phone ? normalizeGuineaPhone(dto.phone) : undefined,
          status: 'ACTIF',
          cycles: dto.cycles,
        },
      });
      if (plan) {
        const start = new Date();
        await tx.subscription.create({
          data: {
            tenantId: tenant.id,
            planId: plan.id,
            status: 'ESSAI',
            billingCycle: 'ANNUEL',
            startsAt: start,
            endsAt: new Date(start.getTime() + 365 * 86_400_000),
          },
        });
      }
      const director = await tx.user.upsert({
        where: { phone: directorPhone },
        update: {},
        create: { phone: directorPhone, firstName: dto.director.firstName.trim(), lastName: dto.director.lastName.trim().toUpperCase() },
      });
      await tx.membership.create({ data: { tenantId: tenant.id, userId: director.id, roles: ['DIRECTEUR'] } });
      await tx.staffMember.create({
        data: { tenantId: tenant.id, userId: director.id, firstName: director.firstName, lastName: director.lastName, phone: directorPhone, position: 'Directeur' },
      });
      await tx.auditLog.create({
        data: { tenantId: tenant.id, actorUserId, action: 'SCHOOL_CREATED', entity: 'Tenant', entityId: tenant.id, after: { name: tenant.name, director: directorPhone } },
      });
      return { tenant, director };
    });

    const activation = await this.sendActivation(tenant.id, tenant.shortName, director.phone, !!director.passwordHash);
    return { school: { id: tenant.id, name: tenant.name, shortName: tenant.shortName }, activation };
  }

  async setStatus(id: string, status: 'ACTIF' | 'SUSPENDU', actorUserId: string) {
    const tenant = await this.prisma.platform.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('École introuvable');
    await this.prisma.platform.tenant.update({ where: { id }, data: { status } });
    await this.prisma.platform.auditLog.create({
      data: { tenantId: id, actorUserId, action: status === 'SUSPENDU' ? 'SCHOOL_SUSPENDED' : 'SCHOOL_ACTIVATED', entity: 'Tenant', entityId: id },
    });
    return { id, status };
  }

  async resendDirectorCode(id: string) {
    const tenant = await this.prisma.platform.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('École introuvable');
    const m = await this.prisma.platform.membership.findFirst({
      where: { tenantId: id, roles: { has: 'DIRECTEUR' } },
      include: { user: true },
    });
    if (!m) throw new NotFoundException('Aucun directeur pour cette école');
    return this.sendActivation(id, tenant.shortName, m.user.phone, !!m.user.passwordHash);
  }

  /** Envoie (ou simule) le SMS d'activation. Si le compte a déjà un mot de passe, rien à faire. */
  async sendActivation(tenantId: string, schoolShortName: string, phone: string, alreadyActive: boolean): Promise<ActivationInfo> {
    if (alreadyActive) return { smsSent: false, alreadyActive: true };
    const code = await this.otp.issue(phone, 'ACTIVATION');
    const res = await this.sms.send({ tenantId, to: phone, body: activationSms({ school: schoolShortName, code }), purpose: 'ACTIVATION' });
    return { smsSent: res.sent && !res.simulated, simulatedCode: res.simulated ? code : undefined };
  }
}
