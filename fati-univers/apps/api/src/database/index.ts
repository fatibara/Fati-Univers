/**
 * Accès à la base FATI UNIVERS.
 *
 * Trois façons d'obtenir un client, du plus courant au plus rare :
 *
 *   forTenant(prisma, { tenantId, userId })
 *     → chaque requête est exécutée dans une transaction qui fixe l'école
 *       active : PostgreSQL (RLS) ne laisse passer que ses lignes.
 *
 *   withTenantTransaction(prisma, ctx, async (tx) => { ... })
 *     → pour une opération en plusieurs étapes qui doit être atomique
 *       (encaissement + numéro de reçu + affectation aux échéances).
 *
 *   forUser(prisma, userId)
 *     → avant le choix de l'école : lister « mes écoles » (Membership).
 *
 * Le client nu (sans école) ne voit AUCUNE donnée scolaire : c'est voulu.
 */
import { Prisma, PrismaClient } from '@prisma/client';

export * from '@prisma/client';

export interface TenantContext {
  tenantId: string;
  userId: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, label: string): void {
  if (!UUID_RE.test(value)) throw new Error(`${label} invalide`);
}

export function createPrismaClient(url: string): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url } },
    log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['warn', 'error'],
  });
}

/** Client limité à une école. */
export function forTenant(prisma: PrismaClient, ctx: TenantContext) {
  assertUuid(ctx.tenantId, 'tenantId');
  assertUuid(ctx.userId, 'userId');
  return prisma.$extends({
    name: 'fati-tenant',
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, , result] = await prisma.$transaction([
            prisma.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId}, TRUE)`,
            prisma.$executeRaw`SELECT set_config('app.user_id', ${ctx.userId}, TRUE)`,
            query(args),
          ]);
          return result;
        },
      },
    },
  });
}

export type TenantPrisma = ReturnType<typeof forTenant>;

/** Client limité à un compte, sans école active (liste de ses écoles uniquement). */
export function forUser(prisma: PrismaClient, userId: string) {
  assertUuid(userId, 'userId');
  return prisma.$extends({
    name: 'fati-user',
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await prisma.$transaction([
            prisma.$executeRaw`SELECT set_config('app.user_id', ${userId}, TRUE)`,
            query(args),
          ]);
          return result;
        },
      },
    },
  });
}

/** Transaction interactive dans le périmètre d'une école. */
export async function withTenantTransaction<T>(
  prisma: PrismaClient,
  ctx: TenantContext,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { isolationLevel?: Prisma.TransactionIsolationLevel; timeout?: number },
): Promise<T> {
  assertUuid(ctx.tenantId, 'tenantId');
  assertUuid(ctx.userId, 'userId');
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.tenantId}, TRUE)`;
    await tx.$executeRaw`SELECT set_config('app.user_id', ${ctx.userId}, TRUE)`;
    return fn(tx);
  }, options);
}

/** Prochain numéro de reçu de l'école active (à appeler DANS withTenantTransaction). */
export async function nextReceiptNumber(tx: Prisma.TransactionClient): Promise<number> {
  const rows = await tx.$queryRaw<{ n: number }[]>`SELECT fati_next_receipt_number() AS n`;
  const n = rows[0]?.n;
  if (typeof n !== 'number') throw new Error('Numérotation des reçus indisponible');
  return n;
}
