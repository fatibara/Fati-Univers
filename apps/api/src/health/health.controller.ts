import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    try {
      await this.prisma.app.$queryRaw`SELECT 1`;
      return { status: 'ok', service: 'fati-univers-api', time: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException('Base de données indisponible');
    }
  }
}
