import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditService } from './audit/audit.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { ENV, loadEnv } from './config/env';
import { HealthController } from './health/health.controller';
import { PrismaService } from './prisma/prisma.service';
import { StudentsController } from './students/students.controller';
import { StudentsService } from './students/students.service';
import { PermissionsGuard } from './tenancy/permissions.guard';
import { TenantGuard } from './tenancy/tenant.guard';

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => loadEnv() }, PrismaService, AuditService],
  exports: [ENV, PrismaService, AuditService],
})
class CoreModule {}

@Module({
  imports: [CoreModule, ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]), AuthModule],
  controllers: [HealthController, StudentsController],
  providers: [
    StudentsService,
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
    // Ordre d'exécution : limitation de débit -> connexion -> école active -> permissions
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
