'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Coquille, type Session } from '@/components/Coquille';
import { api, frDate } from '@/lib/api';
import { TEACHING } from '@/lib/roles';

type GStatus = 'NOTE' | 'ABSENT_JUSTIFIE' | 'ABSENT_NON_JUSTIFIE' | 'DISPENSE';
interface Row { id: string; firstName: string; lastName: string; matricule: string; status: GStatus | null; score: number | null; comment: string }
interface Evaluation {
  id: string;
  title: string;
  type: string;
  date: string;
  maxScore: number;
  subject: { name: string };
  classroom: { id: string; name: string };
  term: string;
  locked: boolean;
  canEdit: boolean;
  stats: { count: number; average: number; min: number; max: number } | null;
  students: Row[];
}
interface Line { status: GStatus; score: string; comment: string }

const STATUSES: [GStatus, string][] = [
  ['NOTE', 'Noté'],
  ['ABSENT_JUSTIFIE', 'Absent justifié'],
  ['ABSENT_NON_JUSTIFIE', 'Absent non justifié'],
  ['DISPENSE', 'Dispensé'],
];

function Saisie({ s, id }: { s: Session; id: string }) {
  const [ev, setEv] = useState<Evaluation | null>(null);
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  function load() {
    api<Evaluation>(`/teaching/assessments/${id}`)
      .then((data) => {
        setEv(data);
        setLines(
          Object.fromEntries(
            data.students.map((x) => [x.id, { status: x.status ?? 'NOTE', score: x.score === null ? '' : String(x.score), comment: x.comment }]),
          ),
        );
      })
      .catch(s.fail);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [id]);

  if (!ev) return <p className="discret">Chargement…</p>;

  const set = (studentId: string, patch: Partial<Line>) => setLines((l) => ({ ...l, [studentId]: { ...l[studentId]!, ...patch } }));

  async function save() {
    if (!ev) return;
    setLocalError(null);
    setNotice(null);
    const grades = [];
    for (const st of ev.students) {
      const l = lines[st.id];
      if (!l) continue;
      if (l.status === 'NOTE') {
        if (l.score.trim() === '') continue; // pas encore noté
        const score = Number(l.score.replace(',', '.'));
        if (Number.isNaN(score) || score < 0 || score > ev.maxScore) {
          setLocalError(`Note invalide pour ${st.firstName} ${st.lastName} : entre 0 et ${ev.maxScore}`);
          return;
        }
        grades.push({ studentId: st.id, status: 'NOTE', score, comment: l.comment || undefined });
      } else {
        grades.push({ studentId: st.id, status: l.status, score: null, comment: l.comment || undefined });
      }
    }
    setSaving(true);
    try {
      const r = await api<{ saved: number }>(`/teaching/assessments/${ev.id}/grades`, { method: 'PUT', body: JSON.stringify({ grades }) });
      setNotice(`${r.saved} note(s) enregistrée(s).`);
      load();
    } catch (err) {
      s.fail(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <p className="discret" style={{ marginTop: -10 }}>
        <Link href={`/enseignant/classe/${ev.classroom.id}`}>← {ev.classroom.name}</Link> · {ev.subject.name} · {frDate(ev.date)} · {ev.term} · noté sur {ev.maxScore}
      </p>
      <h2 style={{ fontSize: 20, marginTop: 0 }}>{ev.title}</h2>
      {ev.locked && <div className="alerte" style={{ marginBottom: 12 }}>Les notes de cette période sont clôturées : lecture seule.</div>}
      {ev.stats && (
        <section className="grille section">
          <div className="carte kpi"><div className="libelle">Moyenne de la classe</div><div className="valeur">{ev.stats.average}</div></div>
          <div className="carte kpi"><div className="libelle">Plus basse · plus haute</div><div className="valeur">{ev.stats.min} · {ev.stats.max}</div></div>
          <div className="carte kpi"><div className="libelle">Notes saisies</div><div className="valeur">{ev.stats.count}/{ev.students.length}</div></div>
        </section>
      )}
      {notice && <div className="succes">{notice}</div>}
      {localError && <div className="erreur">{localError}</div>}
      <section className="carte">
        {ev.students.length === 0 && <p className="discret">Aucun élève dans cette classe.</p>}
        {ev.students.map((st) => {
          const l = lines[st.id] ?? { status: 'NOTE' as GStatus, score: '', comment: '' };
          const low = l.status === 'NOTE' && l.score !== '' && Number(l.score.replace(',', '.')) < ev.maxScore / 2;
          return (
            <div key={st.id} className="ligne-liste">
              <div style={{ minWidth: 160 }}>
                <strong>{st.lastName}</strong> {st.firstName}
              </div>
              <div className="boutons">
                <select className="petit" value={l.status} disabled={!ev.canEdit} onChange={(e) => set(st.id, { status: e.target.value as GStatus })}>
                  {STATUSES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
                {l.status === 'NOTE' && (
                  <input
                    className={`petit note${low ? ' bas' : ''}`}
                    style={{ width: 90 }}
                    inputMode="decimal"
                    placeholder={`/ ${ev.maxScore}`}
                    value={l.score}
                    disabled={!ev.canEdit}
                    onChange={(e) => set(st.id, { score: e.target.value })}
                  />
                )}
                <input
                  className="petit cacher-mobile"
                  style={{ width: 180 }}
                  placeholder="Appréciation"
                  value={l.comment}
                  disabled={!ev.canEdit}
                  onChange={(e) => set(st.id, { comment: e.target.value })}
                />
              </div>
            </div>
          );
        })}
        {ev.canEdit && ev.students.length > 0 && (
          <button className="bouton" style={{ marginTop: 16 }} disabled={saving} onClick={() => void save()}>
            {saving ? 'Enregistrement…' : 'Enregistrer les notes'}
          </button>
        )}
      </section>
    </>
  );
}

export default function EvaluationPage() {
  const params = useParams<{ id: string }>();
  return <Coquille titre="Saisie des notes" roles={TEACHING}>{(s) => <Saisie s={s} id={params.id} />}</Coquille>;
}
