import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword } from '../auth/password';
import { isValidGuineaPhone, normalizeGuineaPhone } from '../domain/phone';

export type SuperAdminStatus = 'non-configure' | 'numero-invalide' | 'mot-de-passe-trop-court' | 'pret' | 'erreur';

/**
 * Crée ou corrige le compte super-administrateur à partir de FATI_SUPERADMIN_PHONE / FATI_SUPERADMIN_PASSWORD.
 * Le mot de passe de la variable fait foi : s'il ne correspond plus au compte, il est remplacé.
 * (Retirer la variable FATI_SUPERADMIN_PASSWORD pour garder un mot de passe changé dans l'application.)
 */
@Injectable()
export class SuperAdminBootstrap implements OnApplicationBootstrap {
  private readonly log = new Logger('SuperAdmin');
  status: SuperAdminStatus = 'non-configure';
  private running?: Promise<SuperAdminStatus>;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensure();
  }

  ensure(): Promise<SuperAdminStatus> {
    this.running ??= this.run().then((s) => (this.status = s));
    return this.running;
  }

  private async run(): Promise<SuperAdminStatus> {
    const phoneInput = this.env.FATI_SUPERADMIN_PHONE;
    const password = this.env.FATI_SUPERADMIN_PASSWORD;
    if (!phoneInput) return 'non-configure';
    if (!isValidGuineaPhone(phoneInput)) return 'numero-invalide';
    if (password !== undefined && password.length > 0 && password.length < 8) return 'mot-de-passe-trop-court';
    const phone = normalizeGuineaPhone(phoneInput);
    try {
      const db = this.prisma.platform;
      const existing = await db.user.findUnique({ where: { phone }, select: { id: true, isSuperAdmin: true, passwordHash: true } });
      const needsPassword =
        !!password && (!existing?.passwordHash || !(await verifyPassword(existing.passwordHash, password)));
      const passwordHash = needsPassword ? await hashPassword(password!) : undefined;
      if (!existing) {
        await db.user.create({
          data: { phone, firstName: 'Super', lastName: 'ADMIN', isSuperAdmin: true, passwordHash: passwordHash ?? null },
        });
      } else if (!existing.isSuperAdmin || passwordHash) {
        await db.user.update({
          where: { id: existing.id },
          data: { isSuperAdmin: true, ...(passwordHash ? { passwordHash, failedLoginCount: 0, lockedUntil: null } : {}) },
        });
        if (passwordHash) await db.userSession.updateMany({ where: { userId: existing.id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      this.log.log('Compte super-administrateur prêt');
      return 'pret';
    } catch (err) {
      this.log.error(`Compte super-administrateur : ${(err as Error).message}`);
      this.running = undefined;
      return 'erreur';
    }
  }
}
