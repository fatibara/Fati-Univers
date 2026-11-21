import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { permissionsOf, type Permission } from '../domain';
import { IS_PUBLIC, NO_TENANT, PERMISSIONS } from '../common/decorators';
import type { FatiRequest } from '../common/request';

/**
 * Garde globale : vérifie les permissions du rôle dans l'école active.
 * Sécurité par défaut : une route d'école SANS @RequirePermission est refusée.
 * Un développeur ne peut donc pas exposer une route en oubliant ses droits.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(NO_TENANT, targets)) return true;

    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS, targets);
    if (!required || required.length === 0) {
      this.logger.error(`Route sans permission déclarée : ${ctx.getClass().name}.${ctx.getHandler().name}`);
      throw new ForbiddenException('Accès refusé');
    }

    const req = ctx.switchToHttp().getRequest<FatiRequest>();
    const granted = permissionsOf(req.tenant?.roles ?? []);
    if (!required.every((p) => granted.has(p))) {
      throw new ForbiddenException("Votre rôle ne permet pas cette action");
    }
    return true;
  }
}
