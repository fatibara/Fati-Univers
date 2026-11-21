import type { Request } from 'express';
import type { TenantPrisma } from '../database';
import type { Role } from '../domain';

export interface AuthUser {
  id: string;
  isSuperAdmin: boolean;
}

export interface TenantInfo {
  tenantId: string;
  roles: Role[];
}

/** Requête enrichie par les gardes : compte, école active et client limité à l'école. */
export interface FatiRequest extends Request {
  user?: AuthUser;
  tenant?: TenantInfo;
  db?: TenantPrisma;
}
