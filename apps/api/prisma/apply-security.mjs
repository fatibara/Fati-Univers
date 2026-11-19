// Applique (avec DATABASE_URL, rôle propriétaire) les scripts de sécurité (RLS, audit, garde-fous financiers, droits)
// après chaque migration. Idempotent : peut être relancé sans risque.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const files = ['001_rls.sql', '002_audit_append_only.sql', '003_finance_guards.sql', '004_grants.sql'];

for (const f of files) {
  console.log(`→ ${f}`);
  execFileSync(
    'npx',
    ['prisma', 'db', 'execute', '--schema', 'prisma/schema.prisma', '--file', `prisma/sql/${f}`],
    { cwd: root, stdio: 'inherit' },
  );
}
console.log('Sécurité de la base appliquée.');
