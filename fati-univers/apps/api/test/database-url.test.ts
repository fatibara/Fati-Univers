import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roleUrl } from '../src/config/database-url';

test('adresse Neon : autre rôle, même serveur, pooler compatible Prisma', () => {
  const u = new URL(
    roleUrl(
      'postgresql://neondb_owner:secret@ep-cool-123-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
      'fati_app',
      'AbcDef123456789xyzABC',
    ),
  );
  assert.equal(u.username, 'fati_app');
  assert.equal(u.password, 'AbcDef123456789xyzABC');
  assert.equal(u.hostname, 'ep-cool-123-pooler.eu-central-1.aws.neon.tech');
  assert.equal(u.pathname, '/neondb');
  assert.equal(u.searchParams.get('pgbouncer'), 'true');
  assert.equal(u.searchParams.get('sslmode'), 'require');
});

test('adresse locale : pas de SSL forcé, pas de pooler', () => {
  const u = new URL(roleUrl('postgresql://fati_owner:x@localhost:5432/fati', 'fati_platform', 'p'));
  assert.equal(u.username, 'fati_platform');
  assert.equal(u.searchParams.has('sslmode'), false);
  assert.equal(u.searchParams.has('pgbouncer'), false);
});
