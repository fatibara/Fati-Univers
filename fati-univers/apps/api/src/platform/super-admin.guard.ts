import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { FatiRequest } from '../common/request';
import { PrismaService } from '../prisma/prisma.service';

/** Réservé aux super-administrateurs FATI. Le droit est revérifié en base à chaque requête. */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<FatiRequest>();
    if (!req.user) throw new ForbiddenException('Connexion requise');
    const user = await this.prisma.app.user.findUnique({ where: { id: req.user.id }, select: { isSuperAdmin: true } });
    if (!user?.isSuperAdmin) throw new ForbiddenException('Réservé à l’administration FATI UNIVERS');
    return true;
  }
}
