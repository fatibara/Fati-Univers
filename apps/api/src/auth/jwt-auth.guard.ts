import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC } from '../common/decorators';
import type { FatiRequest } from '../common/request';

/** Garde globale : toute route exige un jeton valide, sauf @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<FatiRequest>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Connexion requise');

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; sa?: boolean }>(token);
      req.user = { id: payload.sub, isSuperAdmin: payload.sa === true };
      return true;
    } catch {
      throw new UnauthorizedException('Session expirée, veuillez vous reconnecter');
    }
  }
}
