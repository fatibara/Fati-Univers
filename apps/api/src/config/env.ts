import { z } from 'zod';
import { roleUrl } from './database-url';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_CORS_ORIGINS: z.string().default('http://localhost:3000'),
  DATABASE_URL_APP: z.string().url(),
  DATABASE_URL_PLATFORM: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET doit faire au moins 32 caractères'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  // SMS : "simulation" (par défaut, rien n'est envoyé) ou "orange" (API SMS Orange Guinée)
  SMS_PROVIDER: z.enum(['simulation', 'orange']).default('simulation'),
  ORANGE_SMS_CLIENT_ID: z.string().optional(),
  ORANGE_SMS_CLIENT_SECRET: z.string().optional(),
  // Adresse d'expédition Orange pour la Guinée (à confirmer dans votre espace developer.orange.com)
  ORANGE_SMS_SENDER: z.string().default('tel:+2240000'),
  ORANGE_SMS_SENDER_NAME: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;
export const ENV = Symbol('ENV');

function withDerivedUrls(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out = { ...source };
  const base = source.DATABASE_URL;
  if (!out.DATABASE_URL_APP && base && source.FATI_APP_PASSWORD) {
    out.DATABASE_URL_APP = roleUrl(base, 'fati_app', source.FATI_APP_PASSWORD);
  }
  if (!out.DATABASE_URL_PLATFORM && base && source.FATI_PLATFORM_PASSWORD) {
    out.DATABASE_URL_PLATFORM = roleUrl(base, 'fati_platform', source.FATI_PLATFORM_PASSWORD);
  }
  return out;
}

/** Lit et valide les variables d'environnement : l'API refuse de démarrer si une valeur manque. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (source === process.env) {
    try {
      process.loadEnvFile(); // lit apps/api/.env s'il existe (Node 20.12+)
    } catch {
      // Pas de fichier .env : on utilise les variables du système (Vercel, CI).
    }
  }
  const parsed = EnvSchema.safeParse(withDerivedUrls(source));
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(
      `Configuration invalide :\n${details}\n` +
        'Sur Vercel : vérifiez DATABASE_URL (ajoutée par Neon), FATI_APP_PASSWORD, FATI_PLATFORM_PASSWORD et JWT_ACCESS_SECRET.',
    );
  }
  return parsed.data;
}
