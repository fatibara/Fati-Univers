import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { forUser } from '../database';
import { isValidGuineaPhone, normalizeGuineaPhone } from '../domain';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword } from './password';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const INVALID = 'Téléphone ou mot de passe incorrect';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

@Injectable()
export class AuthService {
  /** Hash factice : on vérifie toujours un mot de passe, pour que le temps de réponse ne révèle pas si un numéro existe. */
  private dummyHash: Promise<string> = hashPassword('fati-dummy-password-for-timing');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async login(phoneInput: string, password: string, meta: { ip?: string; userAgent?: string }): Promise<Tokens> {
    if (!isValidGuineaPhone(phoneInput)) {
      await verifyPassword(await this.dummyHash, password).catch(() => false);
      throw new UnauthorizedException(INVALID);
    }
    const phone = normalizeGuineaPhone(phoneInput);
    const user = await this.prisma.app.user.findUnique({ where: { phone } });

    if (!user || !user.passwordHash) {
      await verifyPassword(await this.dummyHash, password).catch(() => false);
      throw new UnauthorizedException(INVALID);
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        `Compte temporairement bloqué après ${MAX_FAILED_ATTEMPTS} essais. Réessayez dans ${LOCK_MINUTES} minutes.`,
      );
    }

    const ok = await verifyPassword(user.passwordHash, password).catch(() => false);
    if (!ok) {
      const failed = user.failedLoginCount + 1;
      await this.prisma.app.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failed >= MAX_FAILED_ATTEMPTS ? 0 : failed,
          lockedUntil: failed >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      throw new UnauthorizedException(INVALID);
    }

    await this.prisma.app.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    return this.issueTokens(user.id, user.isSuperAdmin, meta);
  }

  async refresh(refreshToken: string, meta: { ip?: string; userAgent?: string }): Promise<Tokens> {
    const session = await this.prisma.app.userSession.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expirée, veuillez vous reconnecter');
    }
    // Rotation : l'ancien jeton devient inutilisable.
    await this.prisma.app.userSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    return this.issueTokens(session.userId, session.user.isSuperAdmin, meta);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.app.userSession.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Profil et liste des écoles où le compte a un rôle. */
  async me(userId: string) {
    const user = await this.prisma.app.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, phone: true, firstName: true, lastName: true, isSuperAdmin: true, preferredLanguage: true },
    });
    const memberships = await forUser(this.prisma.app, userId).membership.findMany({
      where: { userId, isActive: true },
      select: {
        roles: true,
        tenant: { select: { id: true, name: true, shortName: true, status: true, logoKey: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return { user, schools: memberships.map((m) => ({ ...m.tenant, roles: m.roles })) };
  }

  private async issueTokens(userId: string, isSuperAdmin: boolean, meta: { ip?: string; userAgent?: string }): Promise<Tokens> {
    const accessToken = await this.jwt.signAsync({ sub: userId, sa: isSuperAdmin });
    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.app.userSession.create({
      data: {
        userId,
        tokenHash: sha256(refreshToken),
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 255),
        expiresAt: new Date(Date.now() + this.env.REFRESH_TTL_DAYS * 86_400_000),
      },
    });
    return { accessToken, refreshToken, expiresIn: this.env.JWT_ACCESS_TTL_SECONDS };
  }
}
