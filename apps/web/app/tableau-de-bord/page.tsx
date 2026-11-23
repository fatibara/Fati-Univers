'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Coquille, type Session } from '@/components/Coquille';
import { api, frDate } from '@/lib/api';
import { DIRECTION, hasAny, STRUCTURE, TEACHING } from '@/lib/roles';

interface Summary {
  year: { label: string } | null;
  term: { name: string } | null;
  counts: { students: number; classrooms: number; staff: number; teachers: number; parents: number; assessments: number };
  today: { absent: number; late: number; calls: number; classrooms: number };
  checklist: { key: string; label: string; done: boolean; href: string }[];
}
interface TeacherClasses {
  year: { label: string } | null;
  classes: { id: string; name: string; level: string; studentCount: number; isMain: boolean; subjects: { id: string; name: string }[] }[];
}
interface Children {
  children: { id: string; firstName: string; lastName: string; classroom: { name: string } | null; average: number | null; absences: number; lates: number }[];
  term: { name: string } | null;
}
interface Announcement {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
}

function Direction({ s }: { s: Session }) {
  const [data, setData] = useState<Summary | null>(null);
  useEffect(() => {
    api<Summary>('/dashboard').then(setData).catch(s.fail);
  }, [s.fail]);
  if (!data) return <p className="discret">Chargement des chiffres…</p>;
  const todo = data.checklist.filter((c) => !c.done);
  return (
    <>
      {todo.length > 0 && hasAny(s.roles, STRUCTURE) && (
        <section className="carte section">
          <h2>Pour bien démarrer ({data.checklist.length - todo.length}/{data.checklist.length})</h2>
          {data.checklist.map((c) => (
            <div key={c.key} className={`etape${c.done ? ' fait' : ''}`}>
              <span className="rond">{c.done ? '✓' : ''}</span>
              <span className="texte">{c.label}</span>
              {!c.done && <Link href={c.href} className="lien" style={{ marginLeft: 'auto' }}>Faire</Link>}
            </div>
          ))}
        </section>
      )}
      <section className="grille section">
        <div className="carte kpi"><div className="libelle">Élèves inscrits</div><div className="valeur">{data.counts.students}</div><div className="discret">{data.year ? `Année ${data.year.label}` : 'Aucune année en cours'}</div></div>
        <div className="carte kpi"><div className="libelle">Classes</div><div className="valeur">{data.counts.classrooms}</div><div className="discret">{data.term?.name ?? ''}</div></div>
        <div className="carte kpi"><div className="libelle">Appels faits aujourd&apos;hui</div><div className="valeur">{data.today.calls}/{data.today.classrooms}</div><div className="discret">{data.today.absent} absent(s), {data.today.late} retard(s)</div></div>
        <div className="carte kpi"><div className="libelle">Personnel · parents</div><div className="valeur">{data.counts.staff} · {data.counts.parents}</div><div className="discret">{data.counts.teachers} enseignant(s)</div></div>
      </section>
    </>
  );
}

function Teacher({ s }: { s: Session }) {
  const [data, setData] = useState<TeacherClasses | null>(null);
  useEffect(() => {
    api<TeacherClasses>('/teaching/classes').then(setData).catch(s.fail);
  }, [s.fail]);
  if (!data) return null;
  return (
    <section className="carte section">
      <h2>Mes classes</h2>
      {data.classes.length === 0 && <p className="discret">Aucune classe ne vous est encore attribuée. La direction le fait dans « Classes ».</p>}
      {data.classes.map((c) => (
        <div className="ligne-liste" key={c.id}>
          <div>
            <strong>{c.name}</strong> <span className="discret">· {c.studentCount} élève(s){c.isMain ? ' · professeur principal' : ''}</span>
            <div className="discret">{c.subjects.map((x) => x.name).join(', ')}</div>
          </div>
          <Link className="bouton auto" href={`/enseignant/classe/${c.id}`}>Faire l&apos;appel</Link>
        </div>
      ))}
    </section>
  );
}

function Parent({ s }: { s: Session }) {
  const [data, setData] = useState<Children | null>(null);
  useEffect(() => {
    api<Children>('/parent/children').then(setData).catch(s.fail);
  }, [s.fail]);
  if (!data) return null;
  return (
    <section className="section">
      <h2 style={{ fontSize: 18 }}>Mes enfants {data.term ? <span className="discret">· {data.term.name}</span> : null}</h2>
      <div className="cartes">
        {data.children.map((c) => (
          <Link key={c.id} href={`/parent/enfant/${c.id}`} className="carte-lien">
            <div className="carte">
              <strong style={{ fontSize: 17 }}>{c.firstName} {c.lastName}</strong>
              <div className="discret">{c.classroom?.name ?? 'Pas encore en classe'}</div>
              <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                <div><div className="discret">Moyenne</div><div className="note">{c.average ?? '—'}</div></div>
                <div><div className="discret">Absences</div><div className="note">{c.absences}</div></div>
                <div><div className="discret">Retards</div><div className="note">{c.lates}</div></div>
              </div>
            </div>
          </Link>
        ))}
        {data.children.length === 0 && <p className="discret">Aucun enfant n&apos;est encore lié à votre compte.</p>}
      </div>
    </section>
  );
}

function Annonces({ s }: { s: Session }) {
  const [items, setItems] = useState<Announcement[] | null>(null);
  useEffect(() => {
    api<Announcement[]>('/announcements').then(setItems).catch(s.fail);
  }, [s.fail]);
  if (!items || items.length === 0) return null;
  return (
    <section className="carte section">
      <div className="entete" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Dernières annonces</h2>
        <Link href="/annonces" className="lien">Tout voir</Link>
      </div>
      {items.slice(0, 3).map((a) => (
        <div key={a.id} className="ligne-liste" style={{ display: 'block' }}>
          <strong>{a.title}</strong> <span className="discret">· {frDate(a.publishedAt)}</span>
          <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{a.body}</div>
        </div>
      ))}
    </section>
  );
}

export default function TableauDeBordPage() {
  return (
    <Coquille titre="Accueil">
      {(s) => (
        <>
          {hasAny(s.roles, [...DIRECTION, 'CENSEUR']) && <Direction s={s} />}
          {s.roles.includes('ENSEIGNANT') && <Teacher s={s} />}
          {s.roles.includes('PARENT') && <Parent s={s} />}
          {!hasAny(s.roles, [...DIRECTION, 'CENSEUR', 'ENSEIGNANT', 'PARENT']) && hasAny(s.roles, TEACHING) && (
            <section className="carte section">
              <Link href="/enseignant" className="bouton auto">Suivre les appels</Link>
            </section>
          )}
          <Annonces s={s} />
        </>
      )}
    </Coquille>
  );
}
