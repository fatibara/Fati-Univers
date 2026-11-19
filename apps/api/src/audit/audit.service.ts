import { Injectable } from '@nestjs/common';
import type { Prisma, TenantPrisma } from '../database';

export interface AuditEntry {
  action: string;
  entity: string;
  entityId?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ip?: string;
}

type Ctx = { tenantId: string; userId: string };

function toData(ctx: Ctx, e: AuditEntry): Prisma.AuditLogUncheckedCreateInput {
  return {
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId,
    before: e.before,
    after: e.after,
    ip: e.ip,
  };
}

/** Journal des actions importantes (notes, paiements, droits). La base interdit de le modifier. */
@Injectable()
export class AuditService {
  /** Avec le client de l'école (requête simple). */
  async log(db: TenantPrisma, ctx: Ctx, entry: AuditEntry): Promise<void> {
    await db.auditLog.create({ data: toData(ctx, entry) });
  }

  /** Dans une transaction (withTenantTransaction) : l'audit est annulé si l'opération échoue. */
  async logInTx(tx: Prisma.TransactionClient, ctx: Ctx, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({ data: toData(ctx, entry) });
  }
}
