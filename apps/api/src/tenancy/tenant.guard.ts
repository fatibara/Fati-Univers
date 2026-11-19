import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { forTenant, forUser } from '../database';
import type { Role } from '../domain';
import { IS_PUBLIC, NO_TENANT } from '../common/decorators';
import type { FatiRequest } from '../common/request';
import { PrismaService } from '../prisma/prisma.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TENANT_HEADER = 'x-tenant-id';

/**
 * Garde globale : fixe l'école active de la requête.
 * 1. L'école est indiquée par l'en-tête X-Tenant-Id (jamais par le corps de la requête).
 * 2. Le compte doit avoir un rôle actif dans cette école, et l'école doit être active.
 * 3. On attache un client Prisma limité à cette école : la base (RLS) refusera
 *    toute ligne d'une autre école, même si un service oublie un filtre.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(NO_TENANT, targets)) return true;

    const req = ctx.switchToHttp().getRequest<FatiRequest>();
    if (!req.user) throw new ForbiddenException('Connexion requise');

    const tenantId = req.headers[TENANT_HEADER];
    if (typeof tenantId !== 'string' || !UUID_RE.test(tenantId)) {
      throw new BadRequestException('En-tête X-Tenant-Id manquant ou invalide');
    }

    const membership = await forUser(this.prisma.app, req.user.id).membership.findFirst({
      where: { userId: req.user.id, tenantId, isActive: true },
      select: { roles: true, tenant: { select: { status: true } } },
    });
    // Même réponse que l'école existe ou non : on ne révèle rien.
    if (!membership) throw new ForbiddenException('Accès refusé à cet établissement');
    if (membership.tenant.status !== 'ACTIF') {
      throw new ForbiddenException("Cet établissement n'est pas actif. Contactez FATI UNIVERS.");
    }

    req.tenant = { tenantId, roles: membership.roles as Role[] };
    req.db = forTenant(this.prisma.app, { tenantId, userId: req.user.id });
    return true;
  }
}
