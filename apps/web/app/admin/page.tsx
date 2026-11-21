'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, clearSession } from '@/lib/api';

interface School {
  id: string;
  name: string;
  shortName: string;
  city: string | null;
  status: string;
  students: number;
  members: number;
  plan: string | null;
  director: { firstName: string; lastName: string; phone: string; activated: boolean } | null;
}
interface Activation {
  smsSent: boolean;
  simulatedCode?: string;
  alreadyActive?: boolean;
}

const CYCLES = [
  ['MATERNELLE', 'Maternelle'],
  ['PRIMAIRE', 'Primaire'],
  ['COLLEGE', 'Collège'],
  ['LYCEE', 'Lycée'],
  ['SUPERIEUR', 'Supérieur'],
  ['FORMATION_PRO', 'Formation pro'],
] as const;

function ActivationMessage({ a, who }: { a: Activation; who: string }) {
  if (a.alreadyActive) return <div className="succes">{who} a déjà un compte actif : il peut se connecter avec son mot de passe.</div>;
  if (a.simulatedCode)
    return (
      <div className="alerte">
        Mode simulation (pas encore de SMS réels). Transmettez ce code à {who} : <strong style={{ fontSize: 20, letterSpacing: 2 }}>{a.simulatedCode}</strong>
        <br />Il l’utilise sur la page « Activer mon compte ». Valable 7 jours.
      </div>
    );
  return <div className="succes">Code d’activation envoyé par SMS à {who}.</div>;
}

export default function AdminPage() {
  const router = useRouter();
  const [schools, setSchools] = useState<School[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string; activation: Activation } | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', shortName: '', city: 'Conakry', phone: '', cycles: ['PRIMAIRE', 'COLLEGE'] as string[], dFirst: '', dLast: '', dPhone: '' });

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        clearSession();
        router.replace('/connexion');
        return;
      }
      setError(err instanceof Error ? err.message : 'Erreur');
    },
    [router],
  );

  const load = useCallback(() => api<School[]>('/platform/schools').then(setSchools).catch(fail), [fail]);
  useEffect(() => {
    load();
  }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSaving(true);
    try {
      const res = await api<{ school: { name: string }; activation: Activation }>('/platform/schools', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          shortName: form.shortName,
          city: form.city || undefined,
          phone: form.phone || undefined,
          cycles: form.cycles,
          director: { firstName: form.dFirst, lastName: form.dLast, phone: form.dPhone },
        }),
      });
      setResult({ name: res.school.name, activation: res.activation });
      setForm({ ...form, name: '', shortName: '', phone: '', dFirst: '', dLast: '', dPhone: '' });
      load();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(s: School) {
    const status = s.status === 'ACTIF' ? 'SUSPENDU' : 'ACTIF';
    if (status === 'SUSPENDU' && !window.confirm(`Suspendre ${s.name} ? Plus personne de cette école ne pourra se connecter.`)) return;
    await api(`/platform/schools/${s.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }).catch(fail);
    load();
  }

  async function resend(s: School) {
    try {
      const a = await api<Activation>(`/platform/schools/${s.id}/resend-code`, { method: 'POST' });
      setResult({ name: s.name, activation: a });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      fail(err);
    }
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  return (
    <main className="page">
      <div className="entete">
        <div>
          <h1 style={{ margin: 0, fontSize: 26 }}>Administration FATI UNIVERS</h1>
          <span className="discret">Écoles abonnées et comptes des directeurs</span>
        </div>
        <Link href="/tableau-de-bord" className="bouton secondaire">Retour</Link>
      </div>

      {error && <div className="erreur" role="alert">{error}</div>}
      {result && (
        <div style={{ marginBottom: 16 }}>
          <ActivationMessage a={result.activation} who={`le directeur de ${result.name}`} />
        </div>
      )}

      <section className="carte" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Nouvelle école</h2>
        <form onSubmit={create} className="grille">
          <div className="champ"><label htmlFor="n">Nom de l’école</label><input id="n" value={form.name} onChange={set('name')} required minLength={3} placeholder="Groupe Scolaire Les Élites" /></div>
          <div className="champ"><label htmlFor="sn">Nom court (SMS, 11 max)</label><input id="sn" value={form.shortName} onChange={set('shortName')} required maxLength={11} placeholder="GS ELITES" /></div>
          <div className="champ"><label htmlFor="c">Ville</label><input id="c" value={form.city} onChange={set('city')} /></div>
          <div className="champ"><label htmlFor="p">Téléphone de l’école</label><input id="p" inputMode="tel" value={form.phone} onChange={set('phone')} placeholder="620 00 00 00" /></div>
          <fieldset className="champ" style={{ border: 0, padding: 0, gridColumn: '1 / -1' }}>
            <legend style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Cycles</legend>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {CYCLES.map(([v, l]) => (
                <label key={v} style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 400 }}>
                  <input type="checkbox" checked={form.cycles.includes(v)} onChange={(e) => setForm({ ...form, cycles: e.target.checked ? [...form.cycles, v] : form.cycles.filter((x) => x !== v) })} />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="champ"><label htmlFor="df">Prénom du directeur</label><input id="df" value={form.dFirst} onChange={set('dFirst')} required /></div>
          <div className="champ"><label htmlFor="dl">Nom du directeur</label><input id="dl" value={form.dLast} onChange={set('dLast')} required /></div>
          <div className="champ"><label htmlFor="dp">Téléphone du directeur</label><input id="dp" inputMode="tel" value={form.dPhone} onChange={set('dPhone')} required placeholder="620 00 00 00" /></div>
          <div style={{ gridColumn: '1 / -1' }}>
            <button className="bouton" style={{ width: 'auto' }} disabled={saving || form.cycles.length === 0}>{saving ? 'Création…' : 'Créer l’école et le compte du directeur'}</button>
          </div>
        </form>
      </section>

      <section className="carte">
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Écoles ({schools?.length ?? '…'})</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: 760 }}>
            <thead><tr><th>École</th><th>Directeur</th><th>Élèves</th><th>Comptes</th><th>Statut</th><th></th></tr></thead>
            <tbody>
              {schools?.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong><div className="discret">{s.shortName}{s.city ? ` · ${s.city}` : ''}{s.plan ? ` · ${s.plan}` : ''}</div></td>
                  <td>{s.director ? (<>{s.director.firstName} {s.director.lastName}<div className="discret">{s.director.phone} · {s.director.activated ? 'compte actif' : 'pas encore activé'}</div></>) : '—'}</td>
                  <td>{s.students}</td>
                  <td>{s.members}</td>
                  <td><span className={s.status === 'ACTIF' ? 'pastille ok' : 'pastille ko'}>{s.status === 'ACTIF' ? 'Active' : 'Suspendue'}</span></td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {s.director && !s.director.activated && <button className="lien" onClick={() => resend(s)}>Renvoyer le code</button>}{' '}
                    <button className="lien" onClick={() => toggle(s)}>{s.status === 'ACTIF' ? 'Suspendre' : 'Réactiver'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
