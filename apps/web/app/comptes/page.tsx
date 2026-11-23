'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Coquille, type Session } from '@/components/Coquille';
import { api } from '@/lib/api';
import { DIRECTION } from '@/lib/roles';

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  roles: string[];
  isActive: boolean;
  activated: boolean;
  children: string[];
}
interface Activation {
  smsSent: boolean;
  simulatedCode?: string;
  alreadyActive?: boolean;
}
interface StudentRow {
  id: string;
  firstName: string;
  lastName: string;
  enrollments: { classroom: { name: string } }[];
}

const ROLES: [string, string][] = [
  ['ENSEIGNANT', 'Enseignant'],
  ['PARENT', 'Parent'],
  ['CAISSIER', 'Caissier'],
  ['COMPTABLE', 'Comptable'],
  ['SECRETAIRE', 'Secrétaire'],
  ['CENSEUR', 'Censeur'],
  ['SURVEILLANT', 'Surveillant'],
  ['DIRECTEUR', 'Directeur'],
];
const LABEL = Object.fromEntries([...ROLES, ['PROMOTEUR', 'Promoteur']]);

function Comptes({ s }: { s: Session }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ who: string; a: Activation } | null>(null);
  const [saving, setSaving] = useState(false);
  const empty = { firstName: '', lastName: '', phone: '', roles: ['ENSEIGNANT'] as string[], studentIds: [] as string[], position: '' };
  const [form, setForm] = useState(empty);

  const fail = s.fail;

  const load = useCallback(() => {
    api<Member[]>('/members').then(setMembers).catch(fail);
    api<{ items: StudentRow[] }>('/students?pageSize=200').then((r) => setStudents(r.items)).catch(() => undefined);
  }, [fail]);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const res = await api<{ member: { firstName: string; lastName: string }; activation: Activation }>('/members', {
        method: 'POST',
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          roles: form.roles,
          studentIds: form.roles.includes('PARENT') ? form.studentIds : undefined,
          position: form.position || undefined,
        }),
      });
      setNotice({ who: `${res.member.firstName} ${res.member.lastName}`, a: res.activation });
      setForm(empty);
      load();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  async function resend(m: Member) {
    try {
      const a = await api<Activation>(`/members/${m.id}/resend-code`, { method: 'POST' });
      setNotice({ who: `${m.firstName} ${m.lastName}`, a });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      fail(err);
    }
  }

  async function toggleActive(m: Member) {
    if (m.isActive && !window.confirm(`Désactiver le compte de ${m.firstName} ${m.lastName} ? Il ne pourra plus accéder à l’école.`)) return;
    await api(`/members/${m.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !m.isActive }) }).catch(fail);
    load();
  }

  const toggleRole = (r: string) =>
    setForm({ ...form, roles: form.roles.includes(r) ? form.roles.filter((x) => x !== r) : [...form.roles, r] });
  const toggleStudent = (id: string) =>
    setForm({ ...form, studentIds: form.studentIds.includes(id) ? form.studentIds.filter((x) => x !== id) : [...form.studentIds, id] });

  return (
    <>
      <p className="discret" style={{ marginTop: -10 }}>Personnel et parents : chacun reçoit un code par SMS pour sa première connexion.</p>

      {error && <div className="erreur" role="alert">{error}</div>}
      {notice && (
        <div style={{ marginBottom: 16 }}>
          {notice.a.alreadyActive ? (
            <div className="succes">{notice.who} avait déjà un compte FATI UNIVERS : il voit maintenant votre école en se connectant.</div>
          ) : notice.a.simulatedCode ? (
            <div className="alerte">
              Mode simulation (pas encore de SMS réels). Code à transmettre à {notice.who} :{' '}
              <strong style={{ fontSize: 20, letterSpacing: 2 }}>{notice.a.simulatedCode}</strong>
              <br />À saisir sur la page « Activer mon compte ». Valable 7 jours.
            </div>
          ) : (
            <div className="succes">Code d’activation envoyé par SMS à {notice.who}.</div>
          )}
        </div>
      )}

      <section className="carte" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Ajouter un compte</h2>
        <form onSubmit={create} className="grille">
          <div className="champ"><label htmlFor="f">Prénom</label><input id="f" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></div>
          <div className="champ"><label htmlFor="l">Nom</label><input id="l" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></div>
          <div className="champ"><label htmlFor="t">Téléphone</label><input id="t" inputMode="tel" placeholder="620 00 00 00" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></div>
          <fieldset className="champ" style={{ border: 0, padding: 0, gridColumn: '1 / -1' }}>
            <legend style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Rôle(s)</legend>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {ROLES.map(([v, l]) => (
                <label key={v} style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 400 }}>
                  <input type="checkbox" checked={form.roles.includes(v)} onChange={() => toggleRole(v)} /> {l}
                </label>
              ))}
            </div>
          </fieldset>
          {form.roles.some((r) => r !== 'PARENT') && (
            <div className="champ"><label htmlFor="pos">Fonction (facultatif)</label><input id="pos" placeholder="Professeur de mathématiques" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></div>
          )}
          {form.roles.includes('PARENT') && (
            <fieldset className="champ" style={{ border: 0, padding: 0, gridColumn: '1 / -1' }}>
              <legend style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Ses enfants dans l’école</legend>
              {students.length === 0 && <span className="discret">Aucun élève enregistré pour l’instant.</span>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
                {students.map((s) => (
                  <label key={s.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 400 }}>
                    <input type="checkbox" checked={form.studentIds.includes(s.id)} onChange={() => toggleStudent(s.id)} />
                    {s.firstName} {s.lastName} <span className="discret">{s.enrollments[0]?.classroom.name ?? ''}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div style={{ gridColumn: '1 / -1' }}>
            <button className="bouton" style={{ width: 'auto' }} disabled={saving || form.roles.length === 0}>
              {saving ? 'Création…' : 'Créer le compte et envoyer le code'}
            </button>
          </div>
        </form>
      </section>

      <section className="carte">
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Comptes ({members?.length ?? '…'})</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: 720 }}>
            <thead><tr><th>Nom</th><th>Téléphone</th><th>Rôles</th><th>État</th><th></th></tr></thead>
            <tbody>
              {members?.map((m) => (
                <tr key={m.id} style={{ opacity: m.isActive ? 1 : 0.55 }}>
                  <td><strong>{m.firstName} {m.lastName}</strong>{m.children.length > 0 && <div className="discret">Parent de : {m.children.join(', ')}</div>}</td>
                  <td>{m.phone}</td>
                  <td>{m.roles.map((r) => LABEL[r] ?? r).join(', ')}</td>
                  <td>
                    {!m.isActive ? <span className="pastille ko">Désactivé</span> : m.activated ? <span className="pastille ok">Actif</span> : <span className="pastille attente">Code envoyé</span>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {!m.activated && m.isActive && <button className="lien" onClick={() => resend(m)}>Renvoyer le code</button>}{' '}
                    {!m.roles.includes('PROMOTEUR') && <button className="lien" onClick={() => toggleActive(m)}>{m.isActive ? 'Désactiver' : 'Réactiver'}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export default function ComptesPage() {
  return <Coquille titre="Comptes de l’école" roles={DIRECTION}>{(s) => <Comptes s={s} />}</Coquille>;
}
