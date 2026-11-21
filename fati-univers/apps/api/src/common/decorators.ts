import { createParamDecorator, ExecutionContext, InternalServerErrorException, SetMetadata } from '@nestjs/common';
import type { Permission } from '../domain';
import type { FatiRequest } from './request';

export const IS_PUBLIC = 'fati:public';
export const NO_TENANT = 'fati:no-tenant';
export const PERMISSIONS = 'fati:permissions';

/** Route accessible sans connexion (santé, connexion). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route connectée mais sans école active (ex. « mes écoles »). */
export const NoTenant = () => SetMetadata(NO_TENANT, true);

/** Permission(s) exigée(s). Toutes doivent être détenues. */
export const RequirePermission = (...permissions: Permission[]) => SetMetadata(PERMISSIONS, permissions);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<FatiRequest>();
  if (!req.user) throw new InternalServerErrorException('Compte absent de la requête');
  return req.user;
});

export const CurrentTenant = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<FatiRequest>();
  if (!req.tenant) throw new InternalServerErrorException('École active absente de la requête');
  return req.tenant;
});

/** Client Prisma limité à l'école active (RLS). Le seul à utiliser dans les services métier. */
export const TenantDb = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<FatiRequest>();
  if (!req.db) throw new InternalServerErrorException('Client école absent de la requête');
  return req.db;
});
