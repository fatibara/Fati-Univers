import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { OTP_MAX_ATTEMPTS, OTP_TTL_MINUTES, generateOtpCode, hashOtp, otpMatches, type OtpPurpose } from './otp';

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Crée un nouveau code (et annule les précédents non utilisés). Renvoie le code en clair, à envoyer par SMS. */
  async issue(phone: string, purpose: OtpPurpose): Promise<string> {
    const code = generateOtpCode();
    await this.prisma.app.otpCode.updateMany({
      where: { phone, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await this.prisma.app.otpCode.create({
      data: {
        phone,
        purpose,
        codeHash: hashOtp(this.env.JWT_ACCESS_SECRET, phone, purpose, code),
        expiresAt: new Date(Date.now() + OTP_TTL_MINUTES[purpose] * 60_000),
      },
    });
    return code;
  }

  /** Vérifie un code ; le consomme s'il est bon. */
  async verify(phone: string, purposes: OtpPurpose[], code: string): Promise<boolean> {
    const otp = await this.prisma.app.otpCode.findFirst({
      where: { phone, purpose: { in: purposes }, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) return false;
    const ok = otpMatches(this.env.JWT_ACCESS_SECRET, phone, otp.purpose as OtpPurpose, code, otp.codeHash);
    await this.prisma.app.otpCode.update({
      where: { id: otp.id },
      data: ok ? { consumedAt: new Date() } : { attempts: { increment: 1 } },
    });
    return ok;
  }
}
