import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_POLICY,
  GradeError,
  InvalidAmountError,
  InvalidPhoneError,
  SMS_MAX,
  absenceSms,
  addMonths,
  allocatePayment,
  annualAverage,
  balance,
  can,
  formatGnf,
  formatGuineaPhone,
  generalAverage,
  mention,
  normalizeGuineaPhone,
  parseGnf,
  permissionsOf,
  planInstallments,
  rankLabel,
  rankStudents,
  receiptSms,
  reportCardSms,
  subjectAverage,
  sumGnf,
  toGsm7,
  type AssessmentInput,
} from '../src/domain';

// ---------------------------------------------------------------- Argent ----
test('formatGnf affiche les milliers séparés et la devise', () => {
  assert.equal(formatGnf(0), '0 GNF');
  assert.equal(formatGnf(500), '500 GNF');
  assert.equal(formatGnf(1250000), '1 250 000 GNF');
  assert.equal(formatGnf(15000000, false), '15 000 000');
});

test('les montants GNF sont des entiers positifs', () => {
  assert.throws(() => formatGnf(-1), InvalidAmountError);
  assert.throws(() => formatGnf(1000.5), InvalidAmountError);
  assert.throws(() => sumGnf([1000, Number.NaN]), InvalidAmountError);
  assert.equal(sumGnf([250000, 250000, 500000]), 1000000);
});

test('parseGnf lit les saisies humaines et refuse les décimales', () => {
  assert.equal(parseGnf('1 250 000'), 1250000);
  assert.equal(parseGnf('1.250.000 GNF'), 1250000);
  assert.equal(parseGnf('1250000'), 1250000);
  assert.throws(() => parseGnf('1250,50'), InvalidAmountError);
  assert.throws(() => parseGnf('abc'), InvalidAmountError);
});

// ----------------------------------------------------------------- Notes ----
const evals: AssessmentInput[] = [
  { id: 'd1', type: 'DEVOIR', maxScore: 20, weight: 1 },
  { id: 'd2', type: 'DEVOIR', maxScore: 40, weight: 1 },
  { id: 'c1', type: 'COMPOSITION', maxScore: 20, weight: 1 },
];

test('moyenne de matière : notes ramenées au barème, composition comptée double', () => {
  // d1 = 12/20, d2 = 28/40 -> 14/20, c1 = 15/20 (poids 2)
  // (12 + 14 + 15*2) / 4 = 56 / 4 = 14
  const avg = subjectAverage(evals, [
    { assessmentId: 'd1', status: 'NOTE', score: 12 },
    { assessmentId: 'd2', status: 'NOTE', score: 28 },
    { assessmentId: 'c1', status: 'NOTE', score: 15 },
  ]);
  assert.equal(avg, 14);
});

test('absent non justifié : ignoré ou compté zéro selon la règle de l’école', () => {
  const grades = [
    { assessmentId: 'd1', status: 'NOTE' as const, score: 16 },
    { assessmentId: 'c1', status: 'ABSENT_NON_JUSTIFIE' as const, score: null },
  ];
  assert.equal(subjectAverage(evals, grades), 16);
  // ZERO : (16*1 + 0*2) / 3 = 5,333 -> 5,33
  assert.equal(subjectAverage(evals, grades, { ...DEFAULT_POLICY, absentPolicy: 'ZERO' }), 5.33);
});

test('absent justifié et dispensé ne comptent jamais ; aucune note = pas de moyenne', () => {
  assert.equal(
    subjectAverage(evals, [
      { assessmentId: 'd1', status: 'ABSENT_JUSTIFIE', score: null },
      { assessmentId: 'c1', status: 'DISPENSE', score: null },
    ], { ...DEFAULT_POLICY, absentPolicy: 'ZERO' }),
    null,
  );
});

test('une note hors bornes est refusée', () => {
  assert.throws(() => subjectAverage(evals, [{ assessmentId: 'd1', status: 'NOTE', score: 21 }]), GradeError);
  assert.throws(() => subjectAverage(evals, [{ assessmentId: 'xx', status: 'NOTE', score: 10 }]), GradeError);
});

test('barème sur 10 au primaire', () => {
  const primaire = { ...DEFAULT_POLICY, scale: 10 };
  const ev: AssessmentInput[] = [{ id: 'e', type: 'DEVOIR', maxScore: 10, weight: 1 }];
  assert.equal(subjectAverage(ev, [{ assessmentId: 'e', status: 'NOTE', score: 7.5 }], primaire), 7.5);
  assert.equal(mention(7.5, primaire), 'Bien'); // 7,5/10 = 15/20
});

test('moyenne générale pondérée par les coefficients', () => {
  // Maths 12 (coef 4), Français 15 (coef 3), EPS 18 (coef 1), Anglais sans note
  // (48 + 45 + 18) / 8 = 13,875 -> 13,88
  const g = generalAverage([
    { subjectId: 'MATH', average: 12, coefficient: 4 },
    { subjectId: 'FR', average: 15, coefficient: 3 },
    { subjectId: 'EPS', average: 18, coefficient: 1 },
    { subjectId: 'ANG', average: null, coefficient: 2 },
  ]);
  assert.equal(g, 13.88);
  assert.equal(generalAverage([]), null);
});

test('arrondi demi vers le haut sans erreur de virgule flottante', () => {
  // 1,005 en flottant vaut 1,00499999… : l'arrondi naïf donne 1,00
  assert.equal(generalAverage([{ subjectId: 'x', average: 1.005, coefficient: 1 }]), 1.01);
});

test('moyenne annuelle simple ou pondérée', () => {
  assert.equal(annualAverage([10, 12, 14]), 12);
  assert.equal(annualAverage([10, 12, 14], [1, 1, 2]), 12.5);
  assert.equal(annualAverage([10, null, 14]), 12);
  assert.throws(() => annualAverage([10, 12], [1]), GradeError);
});

test('classement avec ex æquo (rang olympique) et élèves sans moyenne', () => {
  const r = rankStudents([
    { studentId: 'a', average: 12 },
    { studentId: 'b', average: 15.5 },
    { studentId: 'c', average: 12 },
    { studentId: 'd', average: null },
    { studentId: 'e', average: 9 },
  ]);
  const byId = Object.fromEntries(r.map((x) => [x.studentId, x]));
  assert.equal(byId.b!.rank, 1);
  assert.equal(byId.a!.rank, 2);
  assert.equal(byId.c!.rank, 2);
  assert.equal(byId.a!.exAequo, true);
  assert.equal(byId.e!.rank, 4);
  assert.equal(byId.d!.rank, null);
  assert.equal(rankLabel(1), '1er');
  assert.equal(rankLabel(2, true), '2e ex æquo');
});

test('mentions par tranche', () => {
  assert.equal(mention(16), 'Très bien');
  assert.equal(mention(15.99), 'Bien');
  assert.equal(mention(10), 'Passable');
  assert.equal(mention(9.99), 'Insuffisant');
  assert.equal(mention(null), null);
});

// ------------------------------------------------------------- Échéances ----
test('échéancier : la somme des échéances est exactement le total', () => {
  const plan = planInstallments(1000000, 3, '2027-10-05');
  assert.deepEqual(plan.map((p) => p.amountGnf), [333334, 333333, 333333]);
  assert.equal(plan.reduce((s, p) => s + p.amountGnf, 0), 1000000);
  assert.deepEqual(plan.map((p) => p.dueOn), ['2027-10-05', '2027-11-05', '2027-12-05']);
});

test('ajout de mois sur une fin de mois', () => {
  assert.equal(addMonths('2027-01-31', 1), '2027-02-28');
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonths('2027-10-31', 3), '2028-01-31');
});

test('un paiement couvre les échéances de la plus ancienne à la plus récente', () => {
  const inst = [
    { id: 'i2', dueOn: '2027-11-05', amountGnf: 300000, paidGnf: 0 },
    { id: 'i1', dueOn: '2027-10-05', amountGnf: 300000, paidGnf: 100000 },
    { id: 'i3', dueOn: '2027-12-05', amountGnf: 300000, paidGnf: 0 },
  ];
  const r = allocatePayment(450000, inst);
  assert.deepEqual(r.allocations, [
    { installmentId: 'i1', amountGnf: 200000 },
    { installmentId: 'i2', amountGnf: 250000 },
  ]);
  assert.equal(r.unallocatedGnf, 0);
  const trop = allocatePayment(1000000, inst);
  assert.equal(trop.unallocatedGnf, 200000);
});

test('reste à payer et retard', () => {
  const b = balance(
    [
      { id: 'i1', dueOn: '2027-10-05', amountGnf: 300000, paidGnf: 300000 },
      { id: 'i2', dueOn: '2027-11-05', amountGnf: 300000, paidGnf: 100000 },
      { id: 'i3', dueOn: '2027-12-05', amountGnf: 300000, paidGnf: 0 },
    ],
    '2027-11-20',
  );
  assert.deepEqual(b, { remainingGnf: 500000, overdueGnf: 200000 });
});

// ------------------------------------------------------------- Téléphone ----
test('numéros guinéens normalisés en +224', () => {
  assert.equal(normalizeGuineaPhone('620 12 34 56'), '+224620123456');
  assert.equal(normalizeGuineaPhone('00224 664-12-34-56'), '+224664123456');
  assert.equal(normalizeGuineaPhone('+224620123456'), '+224620123456');
  assert.equal(normalizeGuineaPhone('224620123456'), '+224620123456');
  assert.equal(formatGuineaPhone('+224620123456'), '+224 620 12 34 56');
  assert.throws(() => normalizeGuineaPhone('720123456'), InvalidPhoneError);
  assert.throws(() => normalizeGuineaPhone('62012345'), InvalidPhoneError);
});

// ------------------------------------------------------------------- SMS ----
const GSM7 = /^[A-Za-z0-9 @£$¥!"#%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà\n\r]*$/;

test('SMS : un seul segment, sans accents', () => {
  const msgs = [
    absenceSms({ school: 'GS Les Élites', student: 'Aïssatou Diallo', date: '12/10/2027', slot: '08h-10h' }),
    receiptSms({ school: 'GS Les Élites', student: 'Aïssatou Diallo', amountGnf: 1250000, receiptNumber: 1542, remainingGnf: 2500000 }),
    reportCardSms({ school: 'GS Les Élites', student: 'Aïssatou Diallo', term: '1er trimestre', average: 14.5, scale: 20, rank: '3e ex æquo' }),
    absenceSms({ school: 'Groupe Scolaire Privé International de la Haute Guinée', student: 'Mamadou Saliou Diallo Barry Camara', date: '12/10/2027', slot: 'toute la journée' }),
  ];
  for (const m of msgs) {
    assert.ok(m.length <= SMS_MAX, `trop long (${m.length}) : ${m}`);
    assert.match(m, GSM7, `caractère hors GSM-7 : ${m}`);
  }
  assert.ok(msgs[1]!.includes('1 250 000 GNF'));
  assert.equal(toGsm7('Élève à l’école'), "Eleve a l'ecole");
});

// ----------------------------------------------------------- Permissions ----
test('permissions : le caissier encaisse mais ne valide pas les bulletins', () => {
  assert.equal(can(['CAISSIER'], 'cash.collect'), true);
  assert.equal(can(['CAISSIER'], 'reportcards.validate'), false);
  assert.equal(can(['CAISSIER'], 'payments.cancel.approve'), false);
});

test('permissions : l’enseignant ne voit pas les finances', () => {
  assert.equal(can(['ENSEIGNANT'], 'finance.read'), false);
  assert.equal(can(['ENSEIGNANT'], 'grades.write.own'), true);
});

test('permissions cumulées : enseignant et parent dans la même école', () => {
  const p = permissionsOf(['ENSEIGNANT', 'PARENT']);
  assert.ok(p.has('attendance.take'));
  assert.ok(p.has('child.read'));
  assert.ok(!p.has('students.write'));
});
