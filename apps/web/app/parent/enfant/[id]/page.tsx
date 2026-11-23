'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Coquille, type Session } from '@/components/Coquille';
import { api, frDate } from '@/lib/api';

interface Detail {
  id: string;
  firstName: string;
  lastName: string;
  matricule: string;
  classroom: { name: string; level: string } | null;
  year: string | null;
  terms: { id: string; name: string }[];
  term: { id: string; name: string } | null;
  scale: number;
  average: number | null;
  subjects: { subjectId: string; name: string; average: number | null; coefficient: number }[];
  grades: { id: string; title: string; type: string; date: string; subject: string; maxScore: number; status: string | null; score: number | null; comment: string | null }[];
  attendance: { date: string; status: string; minutesLate: number | null; justified: boolean }[];
}

const STATUS: Record<string, string> = {
  ABSENT_JUSTIFIE: 'Absent (justifié)',
  ABSENT_NON_JUSTIFIE: 'Absent',
  DISPENSE: 'Dispensé',
};

function Enfant({ s, id }: { s: Session; id: string }) {
  const [termId, setTermId] = useState<string>('');
  const [d, setD] = useState<Detail | null>(null);
  useEffect(() => {
    api<Detail>(`/parent/children/${id}${termId ? `?termId=${termId}` : ''}`).then(setD).catch(s.fail);
  }, [id, termId, s.fail]);
  if (!d) return <p className="discret">Chargement…</p>;
  const low = (v: number | null, max: number) => v !== null && v < max / 2;
  return (
    <>
      <p className="discret" style={{ marginTop: -10 }}>
        <Link href="/parent">← Mes enfants</Link> · matricule {d.matricule}
      </p>
      <section className="carte section">
        <div className="boutons" style={{ justifyContent: 'space-between' }}>
          <div>
            <strong style={{ fontSize: 20 }}>{d.firstName} {d.lastName}</strong>
            <div className="discret">{d.classroom ? `${d.classroom.name} · ${d.classroom.level}` : 'Pas encore en classe'} {d.year ? `· ${d.year}` : ''}</div>
          </div>
          {d.terms.length > 0 && (
            <select className="petit" value={d.term?.id ?? ''} onChange={(e) => setTermId(e.target.value)}>
              {d.terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </div>
        <div style={{ display: 'flex', gap: 24, marginTop: 16, flexWrap: 'wrap' }}>
          <div><div className="discret">Moyenne générale</div><div className={`note${low(d.average, d.scale) ? ' bas' : ''}`} style={{ fontSize: 26 }}>{d.average ?? '—'} <span className="discret">/{d.scale}</span></div></div>
          <div><div className="discret">Absences (année)</div><div className="note" style={{ fontSize: 26 }}>{d.attendance.filter((a) => a.status === 'ABSENT').length}</div></div>
          <div><div className="discret">Retards (année)</div><div className="note" style={{ fontSize: 26 }}>{d.attendance.filter((a) => a.status === 'RETARD').length}</div></div>
        </div>
      </section>

      <section className="carte section">
        <h2>Moyennes par matière</h2>
        {d.subjects.length === 0 ? (
          <p className="discret">Pas encore de notes pour cette période.</p>
        ) : (
          <table>
            <thead><tr><th>Matière</th><th>Moyenne</th><th className="cacher-mobile">Coef.</th></tr></thead>
            <tbody>
              {d.subjects.map((x) => (
                <tr key={x.subjectId}>
                  <td>{x.name}</td>
                  <td className={`note${low(x.average, d.scale) ? ' bas' : ''}`}>{x.average ?? '—'}</td>
                  <td className="cacher-mobile">{x.coefficient}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="carte section">
        <h2>Toutes les notes</h2>
        {d.grades.length === 0 && <p className="discret">Aucune évaluation pour cette période.</p>}
        {d.grades.map((g) => (
          <div key={g.id} className="ligne-liste">
            <div>
              <strong>{g.subject}</strong> · {g.title}
              <div className="discret">{frDate(g.date)}{g.comment ? ` · « ${g.comment} »` : ''}</div>
            </div>
            <div className={`note${low(g.score, g.maxScore) ? ' bas' : ''}`}>
              {g.status === null ? <span className="discret">Pas encore noté</span> : g.status === 'NOTE' ? `${g.score}/${g.maxScore}` : STATUS[g.status] ?? g.status}
            </div>
          </div>
        ))}
      </section>

      <section className="carte">
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Absences et retards</h2>
        {d.attendance.length === 0 && <p className="discret">Aucune absence ni retard cette année.</p>}
        {d.attendance.map((a, i) => (
          <div key={`${a.date}-${i}`} className="ligne-liste">
            <span>{frDate(a.date)}</span>
            <span className={`pastille ${a.status === 'ABSENT' ? 'ko' : 'attente'}`}>
              {a.status === 'ABSENT' ? 'Absent' : `Retard${a.minutesLate ? ` ${a.minutesLate} min` : ''}`}
              {a.justified ? ' · justifié' : ''}
            </span>
          </div>
        ))}
      </section>
    </>
  );
}

export default function EnfantPage() {
  const params = useParams<{ id: string }>();
  return <Coquille titre="Suivi de l'élève" roles={['PARENT']}>{(s) => <Enfant s={s} id={params.id} />}</Coquille>;
}
