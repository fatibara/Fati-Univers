import { formatGnf } from './money';

/**
 * Messages SMS aux parents.
 * - 160 caractères maximum (un seul SMS facturé) ;
 * - sans accents : l'alphabet GSM-7 garantit la bonne réception sur tous les
 *   téléphones et évite que le message soit coupé en 70 caractères (UCS-2).
 */

export const SMS_MAX = 160;

/** Retire les accents et caractères hors GSM-7 courants. */
export function toGsm7(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/[«»“”]/g, '"')
    .replace(/[  ]/g, ' ')
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'OE')
    .replace(/æ/g, 'ae');
}

function fit(text: string): string {
  const t = toGsm7(text).replace(/\s+/g, ' ').trim();
  return t.length <= SMS_MAX ? t : `${t.slice(0, SMS_MAX - 3)}...`;
}

export function absenceSms(p: { school: string; student: string; date: string; slot?: string }): string {
  const when = p.slot ? `le ${p.date} (${p.slot})` : `le ${p.date}`;
  return fit(`${p.school}: votre enfant ${p.student} est absent(e) ${when}. Merci de contacter l'ecole si besoin.`);
}

export function lateSms(p: { school: string; student: string; date: string; minutes: number }): string {
  return fit(`${p.school}: ${p.student} est arrive(e) en retard de ${p.minutes} min le ${p.date}.`);
}

export function receiptSms(p: {
  school: string;
  student: string;
  amountGnf: number;
  receiptNumber: number;
  remainingGnf: number;
}): string {
  return fit(
    `${p.school}: paiement recu ${formatGnf(p.amountGnf)} pour ${p.student}. Recu No ${p.receiptNumber}. ` +
      `Reste a payer: ${formatGnf(p.remainingGnf)}. Merci.`,
  );
}

export function reminderSms(p: { school: string; student: string; amountGnf: number; dueOn: string }): string {
  return fit(
    `${p.school}: rappel, ${formatGnf(p.amountGnf)} a regler pour ${p.student} avant le ${p.dueOn}. ` +
      `Paiement a la caisse ou par Mobile Money.`,
  );
}

export function reportCardSms(p: {
  school: string;
  student: string;
  term: string;
  average: number;
  scale: number;
  rank: string;
}): string {
  const avg = p.average.toFixed(2).replace('.', ',');
  return fit(`${p.school}: bulletin ${p.term} de ${p.student}: moyenne ${avg}/${p.scale}, rang ${p.rank}.`);
}

export function otpSms(code: string): string {
  return fit(`FATI UNIVERS: votre code de connexion est ${code}. Il expire dans 10 minutes. Ne le partagez avec personne.`);
}

export function activationSms(p: { school: string; code: string }): string {
  return fit(
    // Le code vient en premier : même tronqué, le message reste utilisable.
    `FATI UNIVERS : votre code d'activation est ${p.code} (valable 7 jours). Compte cree par ${p.school}. ` +
      `Choisissez votre mot de passe dans l'application.`,
  );
}

export function resetCodeSms(code: string): string {
  return fit(`FATI UNIVERS : code pour changer votre mot de passe : ${code}. Valable 15 minutes. Ne le partagez pas.`);
}
