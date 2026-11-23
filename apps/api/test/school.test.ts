import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitPeriods, termFor } from '../src/school/periods';
import { ROLE_PERMISSIONS, can } from '../src/domain/permissions';

test('une année se découpe en trimestres sans trou ni chevauchement', () => {
  const p = splitPeriods('2026-10-01', '2027-06-30', 3);
  assert.equal(p.length, 3);
  assert.equal(p[0]!.startsOn, '2026-10-01');
  assert.equal(p[2]!.endsOn, '2027-06-30');
  for (let i = 1; i < p.length; i++) {
    const prevEnd = Date.parse(p[i - 1]!.endsOn);
    assert.equal(Date.parse(p[i]!.startsOn) - prevEnd, 86_400_000);
  }
});

test('la période du jour est trouvée, sinon la dernière commencée', () => {
  const terms = splitPeriods('2026-10-01', '2027-06-30', 3).map((t, i) => ({
    id: String(i + 1),
    startsOn: new Date(`${t.startsOn}T00:00:00Z`),
    endsOn: new Date(`${t.endsOn}T00:00:00Z`),
  }));
  assert.equal(termFor(terms, '2026-10-15')?.id, '1');
  assert.equal(termFor(terms, '2027-05-01')?.id, '3');
  assert.equal(termFor(terms, '2027-08-01')?.id, '3');
  assert.equal(termFor(terms, '2026-09-01')?.id, '1');
});

test('chaque rôle peut lire les annonces ; seuls les rôles prévus ouvrent l\'espace enseignant', () => {
  for (const perms of Object.values(ROLE_PERMISSIONS)) assert.ok(perms.includes('announcements.read'));
  assert.ok(can(['ENSEIGNANT'], 'teaching.access'));
  assert.ok(can(['DIRECTEUR'], 'teaching.access'));
  assert.ok(!can(['PARENT'], 'teaching.access'));
  assert.ok(!can(['CAISSIER'], 'teaching.access'));
  assert.ok(!can(['ENSEIGNANT'], 'child.read'));
});
