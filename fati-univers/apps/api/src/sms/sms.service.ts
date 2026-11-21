import { Inject, Injectable, Logger } from '@nestjs/common';
import { toGsm7 } from '../domain';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

export interface SmsResult {
  sent: boolean;
  /** true en mode simulation : aucun SMS réel n'est parti. */
  simulated: boolean;
  error?: string;
}

/**
 * Envoi de SMS.
 * - SMS_PROVIDER=simulation (par défaut) : le SMS est enregistré et affiché dans les logs, rien n'est envoyé.
 * - SMS_PROVIDER=orange : API SMS Orange Guinée (developer.orange.com, « SMS Guinea Conakry »).
 * Chaque SMS est journalisé dans la table SmsMessage de l'école.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger('SMS');
  private orangeToken: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  get simulation(): boolean {
    return this.env.SMS_PROVIDER !== 'orange';
  }

  async send(p: { tenantId: string | null; to: string; body: string; purpose: string }): Promise<SmsResult> {
    const body = toGsm7(p.body);
    let result: SmsResult;
    let providerRef: string | undefined;

    if (this.simulation) {
      this.logger.log(`[simulation] vers ${p.to.slice(0, 7)}•••• : ${p.purpose}`);
      result = { sent: true, simulated: true };
    } else {
      try {
        providerRef = await this.sendWithOrange(p.to, body);
        result = { sent: true, simulated: false };
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        this.logger.error(`Échec d'envoi Orange : ${error}`);
        result = { sent: false, simulated: false, error };
      }
    }

    if (p.tenantId) {
      await this.prisma.platform.smsMessage
        .create({
          data: {
            tenantId: p.tenantId,
            toPhone: p.to,
            body,
            segments: Math.max(1, Math.ceil(body.length / 160)),
            purpose: p.purpose,
            status: result.sent ? 'ENVOYE' : 'ECHEC',
            provider: this.simulation ? 'simulation' : 'orange',
            providerRef,
            error: result.error,
            sentAt: result.sent ? new Date() : undefined,
          },
        })
        .catch((e) => this.logger.error(`Journal SMS impossible : ${e instanceof Error ? e.message : e}`));
    }
    return result;
  }

  private async orangeAccessToken(): Promise<string> {
    if (this.orangeToken && this.orangeToken.expiresAt > Date.now() + 60_000) return this.orangeToken.value;
    const { ORANGE_SMS_CLIENT_ID: id, ORANGE_SMS_CLIENT_SECRET: secret } = this.env;
    if (!id || !secret) throw new Error('ORANGE_SMS_CLIENT_ID / ORANGE_SMS_CLIENT_SECRET manquants');
    const res = await fetch('https://api.orange.com/oauth/v3/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) throw new Error(`jeton Orange refusé (${res.status})`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.orangeToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return json.access_token;
  }

  private async sendWithOrange(to: string, message: string): Promise<string | undefined> {
    const token = await this.orangeAccessToken();
    const sender = this.env.ORANGE_SMS_SENDER;
    const res = await fetch(
      `https://api.orange.com/smsmessaging/v1/outbound/${encodeURIComponent(sender)}/requests`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          outboundSMSMessageRequest: {
            address: `tel:${to}`,
            senderAddress: sender,
            ...(this.env.ORANGE_SMS_SENDER_NAME ? { senderName: this.env.ORANGE_SMS_SENDER_NAME } : {}),
            outboundSMSTextMessage: { message },
          },
        }),
      },
    );
    if (!res.ok) throw new Error(`envoi refusé par Orange (${res.status}) ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json().catch(() => ({}))) as { outboundSMSMessageRequest?: { resourceURL?: string } };
    return json.outboundSMSMessageRequest?.resourceURL;
  }
}
