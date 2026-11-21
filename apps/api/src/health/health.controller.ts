import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { SuperAdminBootstrap } from '../platform/super-admin.bootstrap';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly superAdmin: SuperAdminBootstrap,
  ) {}

  @Public()
  @Get()
  async check() {
    try {
      await this.prisma.app.$queryRaw`SELECT 1`;
      const superAdmin = await this.superAdmin.ensure();
      return { status: 'ok', service: 'fati-univers-api', superAdmin, time: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException('Base de données indisponible');
    }
  }
}
