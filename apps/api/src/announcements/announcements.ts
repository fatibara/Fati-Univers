import { Body, Controller, Delete, Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';
import type { TenantPrisma } from '../database';
import { can, toGsm7, SMS_MAX } from '../domain';
import { CurrentTenant, CurrentUser, RequirePermission, TenantDb } from '../common/decorators';
import type { AuthUser, TenantInfo } from '../common/request';
import { SmsService } from '../sms/sms.service';
import { ACTIVE_ENROLLMENT } from '../school/school';

export const AUDIENCES = ['TOUS', 'PARENTS', 'PERSONNEL'] as const;
const MAX_SMS_PER_ANNOUNCEMENT = 500;
const STAFF_ROLES = ['DIRECTEUR', 'PROMOTEUR', 'CENSEUR', 'SECRETAIRE', 'COMPTABLE', 'CAISSIER', 'ENSEIGNANT', 'SURVEILLANT'];

export class CreateAnnouncementDto {
  @IsString()
  @Length(2, 100)
  title: string;

  @IsString()
  @Length(2, 2000)
  body: string;

  @IsIn(AUDIENCES)
  audience: (typeof AUDIENCES)[number];

  /** Envoyer aussi un SMS aux parents (annonces « TOUS » ou « PARENTS »). */
  @IsOptional()
  @IsBoolean()
  sendSms?: boolean;
}

@Injectable()
export class AnnouncementsService {
  constructor(private readonly sms: SmsService) {}

  async list(db: TenantPrisma, tenant: TenantInfo) {
    const manager = can(tenant.roles, 'announcements.send');
    const isParent = tenant.roles.includes('PARENT');
    const isStaff = tenant.roles.some((r) => STAFF_ROLES.includes(r));
    const audiences = manager ? [...AUDIENCES] : ['TOUS', ...(isParent ? ['PARENTS'] : []), ...(isStaff ? ['PERSONNEL'] : [])];
    const rows = await db.announcement.findMany({
      where: { publishedAt: { not: null }, audience: { in: audiences } },
      orderBy: { publishedAt: 'desc' },
      take: 50,
    });
    return rows.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      audience: a.audience,
      sendSms: a.sendSms,
      publishedAt: a.publishedAt,
    }));
  }

  async create(db: TenantPrisma, tenant: TenantInfo, userId: string, dto: CreateAnnouncementDto) {
    const smsWanted = !!dto.sendSms && dto.audience !== 'PERSONNEL';
    const a = await db.announcement.create({
      data: {
        tenantId: tenant.tenantId,
        title: dto.title.trim(),
        body: dto.body.trim(),
        audience: dto.audience,
        sendSms: smsWanted,
        publishedAt: new Date(),
        createdById: userId,
      },
    });
    let smsSent = 0;
    let smsSkipped = 0;
    if (smsWanted) {
      const school = await db.tenant.findFirst({ where: { id: tenant.tenantId }, select: { shortName: true, name: true } });
      const links = await db.studentGuardian.findMany({
        where: {
          receivesSms: true,
          student: { archivedAt: null, enrollments: { some: { academicYear: { isCurrent: true }, status: { in: [...ACTIVE_ENROLLMENT] } } } },
        },
        select: { guardian: { select: { phone: true } } },
      });
      const phones: string[] = [...new Set<string>(links.map((l) => l.guardian.phone))];
      const text = toGsm7(`${school?.shortName || school?.name || 'Ecole'}: ${a.title}. ${a.body}`);
      const body = text.length > SMS_MAX ? `${text.slice(0, SMS_MAX - 3)}...` : text;
      for (const phone of phones.slice(0, MAX_SMS_PER_ANNOUNCEMENT)) {
        const res = await this.sms.send({ tenantId: tenant.tenantId, to: phone, body, purpose: 'ANNONCE' });
        if (res.sent) smsSent++;
      }
      smsSkipped = Math.max(0, phones.length - MAX_SMS_PER_ANNOUNCEMENT);
    }
    return { id: a.id, smsSent, smsSkipped };
  }

  async remove(db: TenantPrisma, id: string) {
    const a = await db.announcement.findFirst({ where: { id }, select: { id: true } });
    if (!a) throw new NotFoundException('Annonce introuvable');
    await db.announcement.delete({ where: { id } });
    return { deleted: true };
  }
}

@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  @RequirePermission('announcements.read')
  list(@TenantDb() db: TenantPrisma, @CurrentTenant() tenant: TenantInfo) {
    return this.announcements.list(db, tenant);
  }

  @Post()
  @RequirePermission('announcements.send')
  create(
    @TenantDb() db: TenantPrisma,
    @CurrentTenant() tenant: TenantInfo,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAnnouncementDto,
  ) {
    return this.announcements.create(db, tenant, user.id, dto);
  }

  @Delete(':id')
  @RequirePermission('announcements.send')
  remove(@TenantDb() db: TenantPrisma, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.announcements.remove(db, id);
  }
}
