// Installation automatique de la base pendant le déploiement (appelé par "postinstall").
// - Sans DATABASE_URL ou sans mots de passe : ne fait rien (installation locale, CI...).
// - Sinon : exécute prisma/install.sql, qui crée la base si elle est vide
//   (tables + école de démonstration) puis réapplique la sécurité. Idempotent.
import { execFileSync } from 'node:child_process';
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
const sql = readFileSync(path.join(here, 'install.sql'), 'utf8')
  .replace('__FATI_APP_PASSWORD__', quote(appPwd))
  .replace('__FATI_PLATFORM_PASSWORD__', quote(platformPwd));

const dir = mkdtempSync(path.join(tmpdir(), 'fati-'));
const file = path.join(dir, 'install.sql');
writeFileSync(file, sql, { mode: 0o600 });
try {
  console.log('[FATI] Installation / mise à jour de la sécurité de la base...');
  execFileSync('npx', ['prisma', 'db', 'execute', '--url', url, '--file', file], {
    cwd: path.resolve(here, '..'),
    stdio: 'inherit',
  });
  console.log('[FATI] Base prête.');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
