'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Coquille, type Session } from '@/components/Coquille';
import { api, frDate, today } from '@/lib/api';
import { TEACHING } from '@/lib/roles';

interface StudentLite { id: string; matricule: string; firstName: string; lastName: string; gender: string }
interface ClassDetail {
  id: string;
  name: string;
  level: string;
  gradeScale: number;
  isMain: boolean;
  students: StudentLite[];
  mySubjects: { id: string; name: string }[];
  teachers: { subject: string; teacher: string }[];
}
type Status = 'PRESENT' | 'ABSENT' | 'RETARD';
interface AttendanceRow extends StudentLite { status: Status; minutesLate: number | null; smsSent: boolean }
interface Attendance { date: string; taken: boolean; takenBy: string | null; students: AttendanceRow[] }
interface AssessmentRow { id: string; title: string; type: string; date: string; maxScore: number; subject: { id: string; name: string }; term: { name: string }; gradedCount: number }

const TYPES: [string, string][] = [
  ['INTERROGATION', 'Interrogation'],
  ['DEVOIR', 'Devoir'],
  ['COMPOSITION', 'Composition'],
  ['EXAMEN', 'Examen'],
];

function Appel({ s, classId }: { s: Session; classId: string }) {
  const [date, setDate] = useState(today());
  const [data, setData] = useState<Attendance | null>(null);
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    api<Attendance>(`/teaching/classes/${classId}/attendance?date=${date}`).then(setData).catch(s.fail);
  }, [classId, date, s.fail]);

  const set = (id: string, patch: Partial<AttendanceRow>) =>
    setData((d) => (d ? { ...d, students: d.students.map((x) => (x.id === id ? { ...x, ...patch } : x)) } : d));

  async function save() {
    if (!data) return;
    setSaving(true);
    setNotice(null);
    try {
      const r = await api<{ present: number; absent: number; late: number; smsSent: number }>(`/teaching/classes/${classId}/attendance`, {
        method: 'POST',
        body: JSON.stringify({
          date,
          notifyParents: notify,
          records: data.students.map((x) => ({
            studentId: x.id,
            status: x.status,
            minutesLate: x.status === 'RETARD' && x.minutesLate ? x.minutesLate : undefined,
          })),
        }),
      });
      setNotice(`Appel enregistré : ${r.present} présent(s), ${r.absent} absent(s), ${r.late} retard(s)${r.smsSent ? ` · ${r.smsSent} SMS aux parents` : ''}.`);
      setData((d) => (d ? { ...d, taken: true } : d));
    } catch (err) {
      s.fail(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="carte">
      <div className="boutons" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <input type="date" className="petit" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        <span className="discret">{data?.taken ? `Appel déjà fait${data.takenBy ? ` par ${data.takenBy}` : ''} : vous pouvez le corriger` : 'Appel pas encore fait'}</span>
      </div>
      {notice && <div className="succes">{notice}</div>}
      {!data && <p className="discret">Chargement…</p>}
      {data && data.students.length === 0 && <p className="discret">Aucun élève inscrit dans cette classe.</p>}
      {data && data.students.length > 0 && (
        <>
          <div className="boutons" style={{ marginBottom: 8 }}>
            <button className="lien" onClick={() => setData({ ...data, students: data.students.map((x) => ({ ...x, status: 'PRESENT' })) })}>Tous présents</button>
          </div>
          {data.students.map((x) => (
            <div key={x.id} className="ligne-liste">
              <div>
                <strong>{x.lastName}</strong> {x.firstName}
                {x.smsSent && <span className="discret"> · parents prévenus</span>}
              </div>
              <div className="boutons">
                {x.status === 'RETARD' && (
                  <input
                    className="petit"
                    style={{ width: 80 }}
                    type="number"
                    min={1}
                    max={600}
                    placeholder="min"
                    value={x.minutesLate ?? ''}
                    onChange={(e) => set(x.id, { minutesLate: e.target.value ? Number(e.target.value) : null })}
                  />
                )}
                <div className="choix" role="group" aria-label={`Présence de ${x.firstName}`}>
                  <button className={`p${x.status === 'PRESENT' ? ' actif' : ''}`} onClick={() => set(x.id, { status: 'PRESENT' })}>P</button>
                  <button className={`a${x.status === 'ABSENT' ? ' actif' : ''}`} onClick={() => set(x.id, { status: 'ABSENT' })}>A</button>
                  <button className={`r${x.status === 'RETARD' ? ' actif' : ''}`} onClick={() => set(x.id, { status: 'RETARD' })}>R</button>
                </div>
              </div>
            </div>
          ))}
          <div className="boutons" style={{ marginTop: 16 }}>
            <label className="case"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Prévenir les parents des absents et retards par SMS</label>
          </div>
          <button className="bouton" style={{ marginTop: 12 }} disabled={saving} onClick={() => void save()}>
            {saving ? 'Enregistrement…' : `Enregistrer l'appel (${data.students.filter((x) => x.status === 'ABSENT').length} absent(s))`}
          </button>
        </>
      )}
    </section>
  );
}

function Notes({ s, detail }: { s: Session; detail: ClassDetail }) {
  const router = useRouter();
  const [subjectId, setSubjectId] = useState(detail.mySubjects[0]?.id ?? '');
  const [rows, setRows] = useState<AssessmentRow[] | null>(null);
  const [form, setForm] = useState({ type: 'DEVOIR', title: '', date: today(), maxScore: String(detail.gradeScale) });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    const q = subjectId ? `?subjectId=${subjectId}` : '';
    api<AssessmentRow[]>(`/teaching/classes/${detail.id}/assessments${q}`).then(setRows).catch(s.fail);
  }, [detail.id, subjectId, s.fail]);
  useEffect(load, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api<{ id: string }>('/teaching/assessments', {
        method: 'POST',
        body: JSON.stringify({ classroomId: detail.id, subjectId, type: form.type, title: form.title, date: form.date, maxScore: Number(form.maxScore) }),
      });
      router.push(`/enseignant/evaluation/${r.id}`);
    } catch (err) {
      s.fail(err);
      setSaving(false);
    }
  }

  return (
    <>
      {detail.mySubjects.length === 0 ? (
        <div className="carte section">Aucune matière ne vous est attribuée dans cette classe.</div>
      ) : (
        <section className="carte section">
          <h2>Nouvelle évaluation</h2>
          <form onSubmit={create} className="grille">
            <div className="champ">
              <label htmlFor="ms">Matière</label>
              <select id="ms" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                {detail.mySubjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
            <div className="champ">
              <label htmlFor="mt">Type</label>
              <select id="mt" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="champ"><label htmlFor="mti">Titre</label><input id="mti" placeholder="Devoir n°1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></div>
            <div className="champ"><label htmlFor="md">Date</label><input id="md" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></div>
            <div className="champ"><label htmlFor="mm">Noté sur</label><input id="mm" type="number" min={1} max={200} value={form.maxScore} onChange={(e) => setForm({ ...form, maxScore: e.target.value })} required /></div>
            <div style={{ alignSelf: 'end', marginBottom: 14 }}><button className="bouton auto" disabled={saving || !subjectId}>Créer et saisir les notes</button></div>
          </form>
        </section>
      )}
      <section className="carte">
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Évaluations</h2>
        {!rows && <p className="discret">Chargement…</p>}
        {rows?.length === 0 && <p className="discret">Aucune évaluation pour le moment.</p>}
        {rows?.map((a) => (
          <Link key={a.id} href={`/enseignant/evaluation/${a.id}`} className="ligne-liste" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div>
              <strong>{a.title}</strong> <span className="discret">· {a.subject.name} · {TYPES.find(([v]) => v === a.type)?.[1]}</span>
              <div className="discret">{frDate(a.date)} · {a.term.name} · sur {a.maxScore}</div>
            </div>
            <span className={`pastille ${a.gradedCount >= detail.students.length && detail.students.length > 0 ? 'ok' : 'attente'}`}>
              {a.gradedCount}/{detail.students.length} notes
            </span>
          </Link>
        ))}
      </section>
    </>
  );
}

function Classe({ s, classId }: { s: Session; classId: string }) {
  const [detail, setDetail] = useState<ClassDetail | null>(null);
  const [tab, setTab] = useState<'appel' | 'notes' | 'eleves'>('appel');
  useEffect(() => {
    api<ClassDetail>(`/teaching/classes/${classId}`).then(setDetail).catch(s.fail);
  }, [classId, s.fail]);
  if (!detail) return <p className="discret">Chargement…</p>;
  return (
    <>
      <p className="discret" style={{ marginTop: -10 }}>
        <Link href="/enseignant">← Mes classes</Link> · <strong>{detail.name}</strong> · {detail.level} · {detail.students.length} élève(s)
      </p>
      <div className="onglets">
        <button className={tab === 'appel' ? 'actif' : ''} onClick={() => setTab('appel')}>Appel</button>
        <button className={tab === 'notes' ? 'actif' : ''} onClick={() => setTab('notes')}>Notes</button>
        <button className={tab === 'eleves' ? 'actif' : ''} onClick={() => setTab('eleves')}>Élèves</button>
      </div>
      {tab === 'appel' && <Appel s={s} classId={classId} />}
      {tab === 'notes' && <Notes s={s} detail={detail} />}
      {tab === 'eleves' && (
        <section className="carte">
          <table>
            <thead><tr><th>Nom</th><th>Matricule</th></tr></thead>
            <tbody>
              {detail.students.map((x) => (
                <tr key={x.id}><td><strong>{x.lastName}</strong> {x.firstName}</td><td>{x.matricule}</td></tr>
              ))}
            </tbody>
          </table>
          {detail.teachers.length > 0 && (
            <p className="discret" style={{ marginTop: 16 }}>Professeurs : {detail.teachers.map((t) => `${t.subject} (${t.teacher})`).join(' · ')}</p>
          )}
        </section>
      )}
    </>
  );
}

export default function ClassePage() {
  const params = useParams<{ id: string }>();
  return <Coquille titre="Ma classe" roles={TEACHING}>{(s) => <Classe s={s} classId={params.id} />}</Coquille>;
}
