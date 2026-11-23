'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Coquille, type Session } from '@/components/Coquille';
import { api, frDate } from '@/lib/api';
import { ANNOUNCE, hasAny } from '@/lib/roles';

interface Announcement { id: string; title: string; body: string; audience: string; sendSms: boolean; publishedAt: string }

const AUDIENCES: [string, string][] = [
  ['TOUS', 'Tout le monde'],
  ['PARENTS', 'Parents'],
  ['PERSONNEL', 'Personnel'],
];

function Annonces({ s }: { s: Session }) {
  const canSend = hasAny(s.roles, ANNOUNCE);
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [form, setForm] = useState({ title: '', body: '', audience: 'TOUS', sendSms: false });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Announcement[]>('/announcements').then(setItems).catch(s.fail);
  }, [s.fail]);
  useEffect(load, [load]);

  async function publish(e: FormEvent) {
    e.preventDefault();
    if (form.sendSms && !window.confirm('Envoyer aussi un SMS à tous les parents concernés ?')) return;
    setSaving(true);
    setNotice(null);
    try {
      const r = await api<{ smsSent: number; smsSkipped: number }>('/announcements', { method: 'POST', body: JSON.stringify(form) });
      setNotice(`Annonce publiée${r.smsSent ? ` · ${r.smsSent} SMS envoyé(s)` : ''}${r.smsSkipped ? ` · ${r.smsSkipped} non envoyé(s) (limite atteinte)` : ''}.`);
      setForm({ title: '', body: '', audience: 'TOUS', sendSms: false });
      load();
    } catch (err) {
      s.fail(err);
    } finally {
      setSaving(false);
    }
  }

  async function remove(a: Announcement) {
    if (!window.confirm(`Supprimer l'annonce « ${a.title} » ?`)) return;
    await api(`/announcements/${a.id}`, { method: 'DELETE' }).catch(s.fail);
    load();
  }

  return (
    <>
      {notice && <div className="succes">{notice}</div>}
      {canSend && (
        <section className="carte section">
          <h2>Nouvelle annonce</h2>
          <form onSubmit={publish}>
            <div className="champ"><label htmlFor="t">Titre</label><input id="t" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required maxLength={100} /></div>
            <div className="champ"><label htmlFor="b">Message</label><textarea id="b" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required maxLength={2000} /></div>
            <div className="grille">
              <div className="champ">
                <label htmlFor="a">Pour</label>
                <select id="a" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value, sendSms: e.target.value === 'PERSONNEL' ? false : form.sendSms })}>
                  {AUDIENCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              {form.audience !== 'PERSONNEL' && (
                <label className="case" style={{ alignSelf: 'center' }}>
                  <input type="checkbox" checked={form.sendSms} onChange={(e) => setForm({ ...form, sendSms: e.target.checked })} />
                  Envoyer aussi par SMS aux parents
                </label>
              )}
            </div>
            <button className="bouton auto" disabled={saving}>{saving ? 'Publication…' : 'Publier'}</button>
          </form>
        </section>
      )}
      <section className="carte">
        {!items && <p className="discret">Chargement…</p>}
        {items?.length === 0 && <p className="discret">Aucune annonce pour le moment.</p>}
        {items?.map((a) => (
          <div key={a.id} className="ligne-liste" style={{ display: 'block' }}>
            <div className="boutons" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong>{a.title}</strong>{' '}
                <span className="discret">· {frDate(a.publishedAt)}{canSend ? ` · ${AUDIENCES.find(([v]) => v === a.audience)?.[1] ?? a.audience}${a.sendSms ? ' · SMS' : ''}` : ''}</span>
              </div>
              {canSend && <button className="lien" onClick={() => void remove(a)}>Supprimer</button>}
            </div>
            <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{a.body}</div>
          </div>
        ))}
      </section>
    </>
  );
}

export default function AnnoncesPage() {
  return <Coquille titre="Annonces">{(s) => <Annonces s={s} />}</Coquille>;
}
