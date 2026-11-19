/**
 * Test de bout en bout de l'exigence non négociable :
 * « un établissement ne doit jamais pouvoir consulter ou modifier les données
 *   d'un autre établissement, y compris en modifiant une URL, un identifiant ou
 *   une requête API ».
 *
 * Prérequis : base installée (base-de-donnees/installation.sql), variables DATABASE_URL_APP,
 * DATABASE_URL_PLATFORM et JWT_ACCESS_SECRET définies (le CI les fournit).
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashPassword as hash } from '../src/auth/password';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createPrismaClient, type PrismaClient } from '../src/database';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup';

const PASSWORD = 'Test-Isolation-2027';
const suffix = randomUUID().slice(0, 8);
// Numéros de test uniques : 6 + 8 chiffres aléatoires
const phone = () => `+2246${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

describe('Isolation entre établissements (API)', () => {
  let app: INestApplication;
  let platform: PrismaClient;
  const ids = {
    tenantA: randomUUID(),
    tenantB: randomUUID(),
    studentA: randomUUID(),
    studentB: randomUUID(),
  };
  const phones = { directorA: phone(), teacherA: phone(), directorB: phone() };
  let tokenDirectorA = '';
  let tokenTeacherA = '';

  beforeAll(async () => {
    platform = createPrismaClient(process.env.DATABASE_URL_PLATFORM!);
    const passwordHash = await hash(PASSWORD);

    await platform.tenant.createMany({
      data: [
        { id: ids.tenantA, slug: `test-a-${suffix}`, name: 'Test A', shortName: 'TEST A', status: 'ACTIF' },
        { id: ids.tenantB, slug: `test-b-${suffix}`, name: 'Test B', shortName: 'TEST B', status: 'ACTIF' },
      ],
    });
    const [dA, tA, dB] = await Promise.all([
      platform.user.create({ data: { phone: phones.directorA, firstName: 'Dir', lastName: 'A', passwordHash } }),
      platform.user.create({ data: { phone: phones.teacherA, firstName: 'Ens', lastName: 'A', passwordHash } }),
      platform.user.create({ data: { phone: phones.directorB, firstName: 'Dir', lastName: 'B', passwordHash } }),
    ]);
    await platform.membership.createMany({
      data: [
        { tenantId: ids.tenantA, userId: dA.id, roles: ['DIRECTEUR'] },
        { tenantId: ids.tenantA, userId: tA.id, roles: ['ENSEIGNANT'] },
        { tenantId: ids.tenantB, userId: dB.id, roles: ['DIRECTEUR'] },
      ],
    });
    await platform.student.createMany({
      data: [
        { id: ids.studentA, tenantId: ids.tenantA, matricule: 'A-1', firstName: 'Élève', lastName: 'A', gender: 'F' },
        { id: ids.studentB, tenantId: ids.tenantB, matricule: 'B-1', firstName: 'Élève', lastName: 'B', gender: 'M' },
      ],
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await configureApp(app);
    await app.init();

    const login = async (p: string) =>
      (await request(app.getHttpServer()).post('/api/v1/auth/login').send({ phone: p, password: PASSWORD }).expect(200))
        .body.accessToken as string;
    tokenDirectorA = await login(phones.directorA);
    tokenTeacherA = await login(phones.teacherA);
  });

  afterAll(async () => {
    const tenants = [ids.tenantA, ids.tenantB];
    // Les écoles de test et leur journal d'audit (en ajout seul) restent dans la base de test.
    await platform.student.deleteMany({ where: { tenantId: { in: tenants } } });
    await platform.membership.deleteMany({ where: { tenantId: { in: tenants } } });
    await platform.user.deleteMany({ where: { phone: { in: Object.values(phones) } } });
    await app?.close();
    await platform.$disconnect();
  });

  const api = () => request(app.getHttpServer());
  const asDirectorA = (req: request.Test, tenant = ids.tenantA) =>
    req.set('Authorization', `Bearer ${tokenDirectorA}`).set('X-Tenant-Id', tenant);

  it('refuse toute requête sans connexion', async () => {
    await api().get('/api/v1/students').set('X-Tenant-Id', ids.tenantA).expect(401);
  });

  it("l'école A ne voit que ses élèves", async () => {
    const res = await asDirectorA(api().get('/api/v1/students')).expect(200);
    const found = res.body.items.map((s: { id: string }) => s.id);
    expect(found).toContain(ids.studentA);
    expect(found).not.toContain(ids.studentB);
  });

  it("l'élève de B est introuvable depuis A, même avec son identifiant exact", async () => {
    await asDirectorA(api().get(`/api/v1/students/${ids.studentB}`)).expect(404);
  });

  it("changer l'en-tête X-Tenant-Id vers une école dont on n'est pas membre est refusé", async () => {
    await asDirectorA(api().get('/api/v1/students'), ids.tenantB).expect(403);
  });

  it('un tenantId glissé dans le corps de la requête est rejeté', async () => {
    await asDirectorA(api().post('/api/v1/students'))
      .send({ tenantId: ids.tenantB, matricule: 'PIRATE', firstName: 'X', lastName: 'Y', gender: 'M' })
      .expect(400);
  });

  it("un élève créé par A appartient à A et reste invisible pour B", async () => {
    const res = await asDirectorA(api().post('/api/v1/students'))
      .send({ matricule: `A-NEW-${suffix}`, firstName: 'Nouvel', lastName: 'Eleve', gender: 'M' })
      .expect(201);
    expect(res.body.tenantId).toBe(ids.tenantA);
  });

  it("un enseignant ne peut pas lister le fichier des élèves", async () => {
    await api()
      .get('/api/v1/students')
      .set('Authorization', `Bearer ${tokenTeacherA}`)
      .set('X-Tenant-Id', ids.tenantA)
      .expect(403);
  });

  it('« mes écoles » ne liste que les écoles du compte', async () => {
    const res = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${tokenDirectorA}`).expect(200);
    expect(res.body.schools.map((s: { id: string }) => s.id)).toEqual([ids.tenantA]);
  });

  it('bloque le compte après 5 mots de passe erronés', async () => {
    for (let i = 0; i < 5; i++) {
      await api().post('/api/v1/auth/login').send({ phone: phones.directorB, password: 'mauvais-mdp' }).expect(401);
    }
    const res = await api().post('/api/v1/auth/login').send({ phone: phones.directorB, password: PASSWORD }).expect(401);
    expect(res.body.message).toContain('bloqué');
  });
});
