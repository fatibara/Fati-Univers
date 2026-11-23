import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateOtpCode, hashOtp, otpMatches } from '../src/auth/otp';
import { SMS_MAX, activationSms, resetCodeSms } from '../src/domain';

const SECRET = 'un-secret-de-test-suffisamment-long-pour-hmac';

test('les codes font 6 chiffres et varient', () => {
  const codes = new Set(Array.from({ length: 200 }, () => generateOtpCode()));
  for (const c of codes) assert.match(c, /^\d{6}$/);
  assert.ok(codes.size > 190);
});

test('un code se vérifie seulement pour le bon numéro, le bon usage et le bon code', () => {
  const h = hashOtp(SECRET, '+224620000001', 'ACTIVATION', '123456');
  assert.equal(otpMatches(SECRET, '+224620000001', 'ACTIVATION', '123456', h), true);
  assert.equal(otpMatches(SECRET, '+224620000001', 'ACTIVATION', '123457', h), false);
  assert.equal(otpMatches(SECRET, '+224620000002', 'ACTIVATION', '123456', h), false);
  assert.equal(otpMatches(SECRET, '+224620000001', 'RESET_PASSWORD', '123456', h), false);
  assert.equal(otpMatches('autre-secret', '+224620000001', 'ACTIVATION', '123456', h), false);
  assert.equal(otpMatches(SECRET, '+224620000001', 'ACTIVATION', '12345a', h), false);
});

test("le code n'est jamais stocké en clair", () => {
  const h = hashOtp(SECRET, '+224620000001', 'ACTIVATION', '987654');
  assert.ok(!h.includes('987654'));
  assert.equal(h.length, 64);
});

test("SMS d'activation et de réinitialisation : un seul SMS, code toujours présent", () => {
  const long = activationSms({ school: 'GROUPE SCOLAIRE PRIVE INTERNATIONAL DE LA HAUTE GUINEE ET DU FOUTA', code: '482913' });
  const court = activationSms({ school: 'GS DEMO', code: '000123' });
  const reset = resetCodeSms('555777');
  for (const m of [long, court, reset]) assert.ok(m.length <= SMS_MAX, `${m.length} : ${m}`);
  assert.ok(long.includes('482913'));
  assert.ok(court.includes('000123') && court.includes('GS DEMO'));
  assert.ok(reset.includes('555777'));
});
