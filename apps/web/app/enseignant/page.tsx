'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Coquille, type Session } from '@/components/Coquille';
import { api } from '@/lib/api';
import { TEACHING } from '@/lib/roles';

interface Classes {
  year: { label: string } | null;
  classes: { id: string; name: string; level: string; studentCount: number; isMain: boolean; subjects: { id: string; name: string }[] }[];
}

function MesClasses({ s }: { s: Session }) {
  const [data, setData] = useState<Classes | null>(null);
  useEffect(() => {
    api<Classes>('/teaching/classes').then(setData).catch(s.fail);
  }, [s.fail]);
  if (!data) return <p className="discret">Chargement…</p>;
  if (!data.year) return <div className="carte">Aucune année scolaire en cours. La direction doit l&apos;ouvrir dans « Classes ».</div>;
  if (data.classes.length === 0) {
    return <div className="carte">Aucune classe ne vous est attribuée pour {data.year.label}. La direction vous attribue vos classes et matières dans « Classes ».</div>;
  }
  return (
    <div className="cartes">
      {data.classes.map((c) => (
        <Link key={c.id} href={`/enseignant/classe/${c.id}`} className="carte-lien">
          <div className="carte">
            <strong style={{ fontSize: 18 }}>{c.name}</strong>
            <div className="discret">{c.level} · {c.studentCount} élève(s){c.isMain ? ' · professeur principal' : ''}</div>
            <div style={{ marginTop: 10, fontSize: 14 }}>{c.subjects.map((x) => x.name).join(', ') || '—'}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function EnseignantPage() {
  return <Coquille titre="Appel et notes" roles={TEACHING}>{(s) => <MesClasses s={s} />}</Coquille>;
}
