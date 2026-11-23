import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditService } from './audit/audit.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { ENV, loadEnv } from './config/env';
import { HealthController } from './health/health.controller';
import { SuperAdminBootstrap } from './platform/super-admin.bootstrap';
import { StructureController } from './structure/structure.controller';
import { StructureService } from './structure/structure.service';
import { TeachingController } from './teaching/teaching.controller';
import { TeachingService } from './teaching/teaching.service';
import { ParentController } from './parent/parent.controller';
import { ParentService } from './parent/parent.service';
import { AnnouncementsController, AnnouncementsService } from './announcements/announcements';
import { DashboardController, DashboardService } from './dashboard/dashboard';
import { PrismaService } from './prisma/prisma.service';
import { StudentsController } from './students/students.controller';
import { StudentsService } from './students/students.service';
import { PermissionsGuard } from './tenancy/permissions.guard';
import { TenantGuard } from './tenancy/tenant.guard';
import { SmsService } from './sms/sms.service';
import { PlatformController } from './platform/platform.controller';
import { PlatformService } from './platform/platform.service';
import { SuperAdminGuard } from './platform/super-admin.guard';
import { MembersController } from './members/members.controller';
import { MembersService } from './members/members.service';

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => loadEnv() }, PrismaService, AuditService, SmsService],
  exports: [ENV, PrismaService, AuditService, SmsService],
})
class CoreModule {}

@Module({
  imports: [CoreModule, ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]), AuthModule],
  controllers: [
    HealthController,
    StudentsController,
    PlatformController,
    MembersController,
    StructureController,
    TeachingController,
    ParentController,
    AnnouncementsController,
    DashboardController,
  ],
  providers: [
    StudentsService,
    PlatformService,
    MembersService,
    SuperAdminGuard,
    SuperAdminBootstrap,
    StructureService,
    TeachingService,
    ParentService,
    AnnouncementsService,
    DashboardService,
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
    // Ordre d'exécution : limitation de débit -> connexion -> école active -> permissions
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
