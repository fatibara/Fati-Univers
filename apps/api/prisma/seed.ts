/**
 * Données de démonstration : une école guinéenne fictive complète pour
 * développer et faire des démonstrations. NE PAS exécuter en production.
 *
 * Utilise DATABASE_URL_PLATFORM (rôle BYPASSRLS) car il crée l'école elle-même.
 * Comptes créés (mot de passe commun : Demo-Fati-2027) :
 *   Directeur  +224620000001
 *   Enseignant +224620000002
 *   Caissière  +224620000003
 *   Parent     +224620000004
 */
import { PrismaClient, Cycle, Role } from '@prisma/client';
import { hashPassword as hash } from '../src/auth/password';

const url = process.env.DATABASE_URL_PLATFORM ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL_PLATFORM manquant');
const prisma = new PrismaClient({ datasources: { db: { url } } });

const PASSWORD = 'Demo-Fati-2027';

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Seed interdit en production');

  // Formules commerciales (prix à fixer : section 15 du cahier des charges)
  for (const p of [
    { code: 'ETABLISSEMENT', name: 'Établissement', maxStudents: 300, monthlySmsCredit: 500, features: [] },
    { code: 'PROFESSIONNELLE', name: 'Professionnelle', maxStudents: 1500, monthlySmsCredit: 2000, features: ['DISCIPLINE', 'EXAMENS', 'MESSAGERIE', 'WHATSAPP', 'MULTI_CAISSES'] },
    { code: 'PREMIUM', name: 'Premium', maxStudents: null, monthlySmsCredit: 6000, features: ['DISCIPLINE', 'EXAMENS', 'MESSAGERIE', 'WHATSAPP', 'MULTI_CAISSES', 'LMD', 'MULTI_CAMPUS'] },
  ]) {
    await prisma.plan.upsert({
      where: { code: p.code },
      update: {},
      create: { ...p, monthlyPriceGnf: 0, yearlyPriceGnf: 0 },
    });
  }

  const existing = await prisma.tenant.findUnique({ where: { slug: 'demo-kaloum' } });
  if (existing) {
    console.log('École de démonstration déjà présente : rien à faire.');
    return;
  }

  const passwordHash = await hash(PASSWORD);
  const mkUser = (phone: string, firstName: string, lastName: string) =>
    prisma.user.upsert({ where: { phone }, update: {}, create: { phone, firstName, lastName, passwordHash } });

  const director = await mkUser('+224620000001', 'Mariama', 'Bah');
  const teacherUser = await mkUser('+224620000002', 'Ibrahima', 'Sow');
  const cashierUser = await mkUser('+224620000003', 'Kadiatou', 'Condé');
  const parentUser = await mkUser('+224620000004', 'Alpha', 'Diallo');

  const tenant = await prisma.tenant.create({
    data: {
      slug: 'demo-kaloum',
      name: 'Groupe Scolaire Démo FATI',
      shortName: 'GS DEMO',
      status: 'ACTIF',
      city: 'Conakry',
      address: 'Kaloum',
      phone: '+224620000000',
      cycles: [Cycle.PRIMAIRE, Cycle.COLLEGE, Cycle.LYCEE],
    },
  });
  const t = tenant.id;

  const plan = await prisma.plan.findUniqueOrThrow({ where: { code: 'PROFESSIONNELLE' } });
  await prisma.subscription.create({
    data: { tenantId: t, planId: plan.id, status: 'ESSAI', startsAt: new Date('2027-09-01'), endsAt: new Date('2028-08-31') },
  });

  await prisma.membership.createMany({
    data: [
      { tenantId: t, userId: director.id, roles: [Role.DIRECTEUR] },
      { tenantId: t, userId: teacherUser.id, roles: [Role.ENSEIGNANT] },
      { tenantId: t, userId: cashierUser.id, roles: [Role.CAISSIER] },
      { tenantId: t, userId: parentUser.id, roles: [Role.PARENT] },
    ],
  });

  const year = await prisma.academicYear.create({
    data: { tenantId: t, label: '2027-2028', startsOn: new Date('2027-10-01'), endsOn: new Date('2028-06-30'), isCurrent: true },
  });
  const terms = [
    ['1er trimestre', '2027-10-01', '2027-12-20'],
    ['2e trimestre', '2028-01-05', '2028-03-31'],
    ['3e trimestre', '2028-04-10', '2028-06-30'],
  ] as const;
  for (const [i, [name, s, e]] of terms.entries()) {
    await prisma.term.create({
      data: { tenantId: t, academicYearId: year.id, name, position: i + 1, startsOn: new Date(s), endsOn: new Date(e) },
    });
  }

  // Niveaux du système guinéen (barème 10 au primaire, 20 ensuite : à confirmer avec les pilotes)
  const levelDefs: [Cycle, string, number, number][] = [
    [Cycle.PRIMAIRE, 'CP1', 1, 10], [Cycle.PRIMAIRE, 'CP2', 2, 10], [Cycle.PRIMAIRE, 'CE1', 3, 10],
    [Cycle.PRIMAIRE, 'CE2', 4, 10], [Cycle.PRIMAIRE, 'CM1', 5, 10], [Cycle.PRIMAIRE, 'CM2', 6, 10],
    [Cycle.COLLEGE, '7e année', 7, 20], [Cycle.COLLEGE, '8e année', 8, 20],
    [Cycle.COLLEGE, '9e année', 9, 20], [Cycle.COLLEGE, '10e année', 10, 20],
    [Cycle.LYCEE, '11e année', 11, 20], [Cycle.LYCEE, '12e année', 12, 20], [Cycle.LYCEE, 'Terminale', 13, 20],
  ];
  const levels: Record<string, string> = {};
  for (const [cycle, name, position, gradeScale] of levelDefs) {
    const l = await prisma.level.create({ data: { tenantId: t, cycle, name, position, gradeScale } });
    levels[name] = l.id;
  }

  await prisma.track.createMany({
    data: [
      { tenantId: t, code: 'SS', name: 'Sciences sociales' },
      { tenantId: t, code: 'SE', name: 'Sciences expérimentales' },
      { tenantId: t, code: 'SM', name: 'Sciences mathématiques' },
    ],
  });

  const subjectDefs = [
    ['FR', 'Français'], ['MATH', 'Mathématiques'], ['PC', 'Physique-Chimie'], ['SVT', 'Sciences de la vie et de la Terre'],
    ['HG', 'Histoire-Géographie'], ['ANG', 'Anglais'], ['ECM', 'Éducation civique et morale'], ['EPS', 'Éducation physique'],
  ] as const;
  const subjects: Record<string, string> = {};
  for (const [code, name] of subjectDefs) {
    subjects[code] = (await prisma.subject.create({ data: { tenantId: t, code, name } })).id;
  }
  const coefs: Record<string, number> = { FR: 4, MATH: 4, PC: 3, SVT: 3, HG: 2, ANG: 2, ECM: 1, EPS: 1 };
  await prisma.subjectCoefficient.createMany({
    data: Object.entries(coefs).map(([code, coefficient]) => ({
      tenantId: t, levelId: levels['10e année']!, subjectId: subjects[code]!, coefficient,
    })),
  });

  await prisma.gradingPolicy.create({
    data: {
      tenantId: t,
      mentions: [
        { min: 16, label: 'Très bien' }, { min: 14, label: 'Bien' }, { min: 12, label: 'Assez bien' },
        { min: 10, label: 'Passable' }, { min: 0, label: 'Insuffisant' },
      ],
    },
  });

  const teacher = await prisma.staffMember.create({
    data: { tenantId: t, userId: teacherUser.id, firstName: 'Ibrahima', lastName: 'Sow', phone: teacherUser.phone, position: 'Professeur de mathématiques' },
  });
  await prisma.staffMember.create({
    data: { tenantId: t, userId: cashierUser.id, firstName: 'Kadiatou', lastName: 'Condé', phone: cashierUser.phone, position: 'Caissière' },
  });

  const classroom = await prisma.classroom.create({
    data: { tenantId: t, academicYearId: year.id, levelId: levels['10e année']!, name: '10e A', capacity: 60, mainTeacherId: teacher.id },
  });
  await prisma.teachingAssignment.create({
    data: { tenantId: t, classroomId: classroom.id, subjectId: subjects.MATH!, staffId: teacher.id },
  });

  const guardian = await prisma.guardian.create({
    data: { tenantId: t, userId: parentUser.id, firstName: 'Alpha', lastName: 'Diallo', phone: parentUser.phone, profession: 'Commerçant' },
  });

  const students = [
    ['Aïssatou', 'Diallo', 'F'], ['Mamadou', 'Diallo', 'M'], ['Fatoumata', 'Camara', 'F'],
    ['Ousmane', 'Barry', 'M'], ['Hawa', 'Keïta', 'F'], ['Sékou', 'Touré', 'M'],
  ] as const;
  for (const [i, [firstName, lastName, gender]] of students.entries()) {
    const s = await prisma.student.create({
      data: { tenantId: t, matricule: `2027-${String(i + 1).padStart(4, '0')}`, firstName, lastName, gender },
    });
    await prisma.enrollment.create({
      data: { tenantId: t, studentId: s.id, classroomId: classroom.id, academicYearId: year.id, status: 'INSCRIT' },
    });
    if (lastName === 'Diallo') {
      await prisma.studentGuardian.create({
        data: { tenantId: t, studentId: s.id, guardianId: guardian.id, relationship: 'PERE', isPrimary: true },
      });
    }
  }

  const scolarite = await prisma.feeType.create({ data: { tenantId: t, category: 'SCOLARITE', name: 'Scolarité annuelle' } });
  const inscription = await prisma.feeType.create({ data: { tenantId: t, category: 'INSCRIPTION', name: 'Inscription' } });
  await prisma.feeRate.createMany({
    data: [
      { tenantId: t, feeTypeId: scolarite.id, levelId: levels['10e année']!, academicYearId: year.id, amountGnf: 3_600_000, installments: 3 },
      { tenantId: t, feeTypeId: inscription.id, levelId: levels['10e année']!, academicYearId: year.id, amountGnf: 250_000, installments: 1 },
    ],
  });

  console.log(`École de démonstration créée : ${tenant.name} (${t})`);
  console.log(`Comptes : +224620000001 à +224620000004, mot de passe ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
