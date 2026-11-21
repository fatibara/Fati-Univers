import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/auth/password';

test('un mot de passe haché se vérifie, un mauvais est refusé', async () => {
  const h = await hashPassword('Un-Mot-De-Passe-2027');
  assert.ok(h.startsWith('scrypt$17$8$1$'));
  assert.equal(await verifyPassword(h, 'Un-Mot-De-Passe-2027'), true);
  assert.equal(await verifyPassword(h, 'mauvais'), false);
});

test('deux hachages du même mot de passe diffèrent (sel aléatoire)', async () => {
  assert.notEqual(await hashPassword('abc12345'), await hashPassword('abc12345'));
});

test("les comptes de démonstration du script d'installation se connectent", async () => {
  // Empreinte produite par scripts/build_install_sql.py (Python hashlib.scrypt)
  const fromInstallScript = 'scrypt$17$8$1$/hsH7ZMZTvELtQdBaziRfw==$fZkTj/MxbOOZV0Dxx1lfEQuGV10nLJ0Oi6B+SKauKjI=';
  assert.equal(await verifyPassword(fromInstallScript, 'Demo-Fati-2027'), true);
  assert.equal(await verifyPassword(fromInstallScript, 'Demo-Fati-2028'), false);
});

test('une empreinte mal formée est refusée sans erreur', async () => {
  assert.equal(await verifyPassword('n-importe-quoi', 'x'), false);
});
