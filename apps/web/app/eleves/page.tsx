'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Coquille, type Session } from '@/components/Coquille';
import { api } from '@/lib/api';
import { hasAny, STUDENTS_READ, STUDENTS_WRITE } from '@/lib/roles';

interface StudentRow {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
  gender: 'M' | 'F';
  enrollments: { status: string; classroom: { id: string; name: string } }[];
}
interface Structure {
  year: { label: string } | null;
  classrooms: { id: string; name: string; level: { name: string } }[];
}

function Eleves({ s }: { s: Session }) {
  const canWrite = hasAny(s.roles, STUDENTS_WRITE);
  const [rows, setRows] = useState<{ items: StudentRow[]; total: number } | null>(null);
  const [structure, setStructure] = useState<Structure | null>(null);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const empty = { firstName: '', lastName: '', gender: 'M' as 'M' | 'F', birthDate: '', classroomId: '', matricule: '' };
  const [form, setForm] = useState(empty);

  const load = useCallback(() => {
    const q = new URLSearchParams({ pageSize: '200' });
    if (search.trim()) q.set('search', search.trim());
    if (classFilter) q.set('classroomId', classFilter);
    api<{ items: StudentRow[]; total: number }>(`/students?${q.toString()}`).then(setRows).catch(s.fail);
  }, [search, classFilter, s.fail]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    api<Structure>('/structure').then(setStructure).catch(s.fail);
  }, [s.fail]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const st = await api<{ firstName: string; lastName: string; matricule: string }>('/students', {
        method: 'POST',
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          gender: form.gender,
          birthDate: form.birthDate || undefined,
          classroomId: form.classroomId || undefined,
          matricule: form.matricule.trim() || undefined,
        }),
      });
      setNotice(`${st.firstName} ${st.lastName} est inscrit(e) · matricule ${st.matricule}`);
      setForm({ ...empty, classroomId: form.classroomId });
      load();
    } catch (err) {
      s.fail(err);
    } finally {
      setSaving(false);
    }
  }

  async function changeClass(student: StudentRow, classroomId: string) {
    if (!classroomId) return;
    try {
      const r = await api<{ classroom: string }>(`/students/${student.id}/enroll`, { method: 'POST', body: JSON.stringify({ classroomId }) });
      setNotice(`${student.firstName} ${student.lastName} est maintenant en ${r.classroom}`);
      load();
    } catch (err) {
      s.fail(err);
    }
  }

  const classrooms = structure?.classrooms ?? [];

  return (
    <>
      {notice && <div className="succes">{notice}</div>}
      {canWrite && (
        <section className="carte section">
          {!showForm ? (
            <button className="bouton auto" onClick={() => setShowForm(true)}>+ Inscrire un élève</button>
          ) : (
            <>
              <h2>Inscrire un élève</h2>
              {!structure?.year && <div className="alerte" style={{ marginBottom: 12 }}>Aucune année scolaire en cours : l&apos;élève sera enregistré sans classe. La direction crée l&apos;année dans « Classes ».</div>}
              <form onSubmit={create} className="grille">
                <div className="champ"><label htmlFor="p">Prénom</label><input id="p" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></div>
                <div className="champ"><label htmlFor="n">Nom</label><input id="n" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></div>
                <div className="champ">
                  <label htmlFor="g">Sexe</label>
                  <select id="g" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as 'M' | 'F' })}>
                    <option value="M">Garçon</option>
                    <option value="F">Fille</option>
                  </select>
                </div>
                <div className="champ"><label htmlFor="d">Date de naissance</label><input id="d" type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} /></div>
                <div className="champ">
                  <label htmlFor="c">Classe</label>
                  <select id="c" value={form.classroomId} onChange={(e) => setForm({ ...form, classroomId: e.target.value })}>
                    <option value="">— Choisir —</option>
                    {classrooms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="champ"><label htmlFor="m">Matricule (facultatif)</label><input id="m" placeholder="Automatique" value={form.matricule} onChange={(e) => setForm({ ...form, matricule: e.target.value })} /></div>
                <div className="boutons" style={{ gridColumn: '1 / -1' }}>
                  <button className="bouton auto" disabled={saving}>{saving ? 'Enregistrement…' : 'Inscrire'}</button>
                  <button type="button" className="bouton secondaire" onClick={() => setShowForm(false)}>Fermer</button>
                </div>
              </form>
            </>
          )}
        </section>
      )}

      <section className="carte">
        <div className="boutons" style={{ marginBottom: 12 }}>
          <input className="petit" style={{ flex: 1, minWidth: 180 }} placeholder="Rechercher (nom, prénom, matricule)" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="petit" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
            <option value="">Toutes les classes</option>
            {classrooms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <span className="discret">{rows ? `${rows.total} élève(s)` : '…'}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Nom</th><th className="cacher-mobile">Matricule</th><th>Classe</th></tr></thead>
            <tbody>
              {rows?.items.map((st) => {
                const current = st.enrollments[0]?.classroom;
                return (
                  <tr key={st.id}>
                    <td><strong>{st.lastName}</strong> {st.firstName}</td>
                    <td className="cacher-mobile">{st.matricule}</td>
                    <td>
                      {canWrite && classrooms.length > 0 ? (
                        <select className="petit" value={current?.id ?? ''} onChange={(e) => void changeClass(st, e.target.value)}>
                          <option value="">— Sans classe —</option>
                          {classrooms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      ) : (
                        current?.name ?? '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows && rows.items.length === 0 && <p className="discret">Aucun élève.</p>}
        </div>
      </section>
    </>
  );
}

export default function ElevesPage() {
  return <Coquille titre="Élèves" roles={STUDENTS_READ}>{(s) => <Eleves s={s} />}</Coquille>;
}
