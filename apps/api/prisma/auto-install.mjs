// Installation automatique de la base pendant le déploiement (appelé par "postinstall").
// - Sans DATABASE_URL ou sans mots de passe : ne fait rien (installation locale, CI...).
// - Sinon : exécute prisma/install.sql, qui crée la base si elle est vide
//   (tables + école de démonstration) puis réapplique la sécurité. Idempotent.
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
const appPwd = process.env.FATI_APP_PASSWORD;
const platformPwd = process.env.FATI_PLATFORM_PASSWORD;

if (!url || !appPwd || !platformPwd) {
  console.log('[FATI] Installation automatique ignorée (DATABASE_URL ou mots de passe absents).');
  process.exit(0);
}
if (process.env.FATI_AUTO_INSTALL === 'off') {
  console.log('[FATI] Installation automatique désactivée (FATI_AUTO_INSTALL=off).');
  process.exit(0);
}

const quote = (v) => v.replace(/'/g, "''");

/** Même normalisation que src/domain/phone.ts. */
function normalizeGuineaPhone(input) {
  let d = String(input).replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('224') && d.length === 12) d = d.slice(3);
  if (!/^6\d{8}$/.test(d)) throw new Error(`FATI_SUPERADMIN_PHONE invalide : ${input}`);
  return `+224${d}`;
}

/** Même format que src/auth/password.ts. */
function hashPassword(password) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 32, { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  return `scrypt$17$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** Compte super-administrateur FATI (créé ou promu à chaque déploiement). */
function superAdminSql() {
  const phoneInput = process.env.FATI_SUPERADMIN_PHONE;
  if (!phoneInput) return '';
  const phone = normalizeGuineaPhone(phoneInput);
  const pwd = process.env.FATI_SUPERADMIN_PASSWORD;
  if (pwd && pwd.length < 8) throw new Error('FATI_SUPERADMIN_PASSWORD : 8 caractères minimum');
  const hash = pwd ? `'${quote(hashPassword(pwd))}'` : 'NULL';
  // Le mot de passe n'est posé que si le compte n'en a pas encore (il ne remplace jamais un mot de passe choisi).
  return `
INSERT INTO "User"(id, phone, "firstName", "lastName", "isSuperAdmin", "passwordHash", "updatedAt")
VALUES ('${randomUUID()}', '${phone}', 'Super', 'ADMIN', true, ${hash}, now())
ON CONFLICT (phone) DO UPDATE SET "isSuperAdmin" = true,
  "passwordHash" = COALESCE("User"."passwordHash", EXCLUDED."passwordHash"), "updatedAt" = now();
`;
}
const sql =
  readFileSync(path.join(here, 'install.sql'), 'utf8')
    .replace('__FATI_APP_PASSWORD__', quote(appPwd))
    .replace('__FATI_PLATFORM_PASSWORD__', quote(platformPwd));
// Le compte super-administrateur est géré au démarrage de l'API (src/platform/super-admin.bootstrap.ts).
const adminSql = '';

const dir = mkdtempSync(path.join(tmpdir(), 'fati-'));
const run = (name, content) => {
  const file = path.join(dir, name);
  writeFileSync(file, content, { mode: 0o600 });
  execFileSync('npx', ['prisma', 'db', 'execute', '--url', url, '--file', file], {
    cwd: path.resolve(here, '..'),
    stdio: 'inherit',
  });
};
try {
  console.log('[FATI] Installation / mise à jour de la sécurité de la base...');
  run('install.sql', sql);
  if (adminSql) {
    run('super-admin.sql', adminSql);
    console.log('[FATI] Compte super-administrateur prêt.');
  }
  console.log('[FATI] Base prête.');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
