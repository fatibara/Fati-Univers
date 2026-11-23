'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Coquille, type Session } from '@/components/Coquille';
import { api, frDate } from '@/lib/api';

interface Child {
  id: string;
  firstName: string;
  lastName: string;
  classroom: { name: string; gradeScale: number } | null;
  average: number | null;
  absences: number;
  lates: number;
  lastGrades: { id: string; title: string; subject: string; date: string; score: number | null; maxScore: number; status: string | null }[];
}
interface Data { year: { label: string } | null; term: { name: string } | null; children: Child[] }

function MesEnfants({ s }: { s: Session }) {
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    api<Data>('/parent/children').then(setData).catch(s.fail);
  }, [s.fail]);
  if (!data) return <p className="discret">Chargement…</p>;
  if (data.children.length === 0) return <div className="carte">Aucun enfant n&apos;est lié à votre compte. Contactez le secrétariat de l&apos;école.</div>;
  return (
    <>
      {data.term && <p className="discret" style={{ marginTop: -10 }}>{data.year?.label} · {data.term.name}</p>}
      <div className="cartes">
        {data.children.map((c) => (
          <Link key={c.id} href={`/parent/enfant/${c.id}`} className="carte-lien">
            <div className="carte">
              <strong style={{ fontSize: 18 }}>{c.firstName} {c.lastName}</strong>
              <div className="discret">{c.classroom?.name ?? 'Pas encore en classe'}</div>
              <div style={{ display: 'flex', gap: 18, margin: '12px 0' }}>
                <div><div className="discret">Moyenne</div><div className="note" style={{ fontSize: 20 }}>{c.average ?? '—'}{c.average !== null && c.classroom ? <span className="discret"> /{c.classroom.gradeScale}</span> : null}</div></div>
                <div><div className="discret">Absences</div><div className="note" style={{ fontSize: 20 }}>{c.absences}</div></div>
                <div><div className="discret">Retards</div><div className="note" style={{ fontSize: 20 }}>{c.lates}</div></div>
              </div>
              {c.lastGrades.length > 0 && (
                <div className="discret">
                  Dernières notes :{' '}
                  {c.lastGrades.map((g) => `${g.subject} ${g.score ?? 'abs.'}/${g.maxScore} (${frDate(g.date)})`).join(' · ')}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

export default function ParentPage() {
  return <Coquille titre="Mes enfants" roles={['PARENT']}>{(s) => <MesEnfants s={s} />}</Coquille>;
}
