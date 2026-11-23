'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Coquille, type Session } from '@/components/Coquille';
import { api, frDate } from '@/lib/api';
import { STRUCTURE } from '@/lib/roles';

interface Staff { id: string; firstName: string; lastName: string; position: string | null }
interface Level { id: string; name: string; cycle: string; gradeScale: number }
interface Subject { id: string; code: string; name: string }
interface Classroom {
  id: string;
  name: string;
  capacity: number | null;
  level: { id: string; name: string };
  mainTeacher: { id: string; firstName: string; lastName: string } | null;
  assignments: { subjectId: string; staffId: string }[];
  studentCount: number;
}
interface Overview {
  year: { id: string; label: string; startsOn: string; endsOn: string; terms: { id: string; name: string; startsOn: string; endsOn: string }[] } | null;
  levels: Level[];
  subjects: Subject[];
  staff: Staff[];
  classrooms: Classroom[];
}

const CYCLES: [string, string][] = [
  ['MATERNELLE', 'Maternelle'],
  ['PRIMAIRE', 'Primaire'],
  ['COLLEGE', 'Collège'],
  ['LYCEE', 'Lycée'],
];

function nextYearLabel() {
  const now = new Date();
  const y = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return { label: `${y}-${y + 1}`, startsOn: `${y}-10-01`, endsOn: `${y + 1}-06-30` };
}

function Structure({ s }: { s: Session }) {
  const [data, setData] = useState<Overview | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [yearForm, setYearForm] = useState({ ...nextYearLabel(), periodType: 'TRIMESTRE', copyClasses: true, show: false });
  const [cycles, setCycles] = useState<string[]>(['PRIMAIRE']);
  const [levelForm, setLevelForm] = useState({ name: '', cycle: 'PRIMAIRE' });
  const [subjectForm, setSubjectForm] = useState({ code: '', name: '' });
  const [classForm, setClassForm] = useState({ name: '', levelId: '', mainTeacherId: '' });

  const load = useCallback(() => {
    api<Overview>('/structure').then(setData).catch(s.fail);
  }, [s.fail]);
  useEffect(load, [load]);

  async function run(fn: () => Promise<string | void>) {
    setBusy(true);
    setNotice(null);
    try {
      const msg = await fn();
      if (msg) setNotice(msg);
      load();
    } catch (err) {
      s.fail(err);
    } finally {
      setBusy(false);
    }
  }

  const post = <T,>(path: string, body: unknown, method = 'POST') => api<T>(path, { method, body: JSON.stringify(body) });

  if (!data) return <p className="discret">Chargement…</p>;
  const staffName = (id: string | null | undefined) => {
    const st = data.staff.find((x) => x.id === id);
    return st ? `${st.firstName} ${st.lastName}` : '';
  };

  return (
    <>
      {notice && <div className="succes">{notice}</div>}

      <section className="carte section">
        <h2>Année scolaire</h2>
        {data.year ? (
          <>
            <p style={{ marginTop: 0 }}>
              <strong>{data.year.label}</strong> · du {frDate(data.year.startsOn)} au {frDate(data.year.endsOn)}
            </p>
            <div className="discret">{data.year.terms.map((t) => `${t.name} : ${frDate(t.startsOn)} → ${frDate(t.endsOn)}`).join(' · ')}</div>
          </>
        ) : (
          <p className="discret" style={{ marginTop: 0 }}>Aucune année en cours. Créez-la pour pouvoir ouvrir les classes.</p>
        )}
        {!yearForm.show ? (
          <button className="lien" style={{ marginTop: 10 }} onClick={() => setYearForm({ ...yearForm, show: true })}>
            {data.year ? 'Ouvrir une nouvelle année scolaire' : 'Créer l’année scolaire'}
          </button>
        ) : (
          <form
            className="grille"
            style={{ marginTop: 14 }}
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void run(async () => {
                const r = await post<{ label: string; copiedClasses: number }>('/structure/years', {
                  label: yearForm.label,
                  startsOn: yearForm.startsOn,
                  endsOn: yearForm.endsOn,
                  periodType: yearForm.periodType,
                  copyClasses: yearForm.copyClasses,
                });
                setYearForm({ ...yearForm, show: false });
                return `Année ${r.label} ouverte${r.copiedClasses ? ` · ${r.copiedClasses} classe(s) recopiée(s)` : ''}`;
              });
            }}
          >
            <div className="champ"><label htmlFor="yl">Année</label><input id="yl" value={yearForm.label} onChange={(e) => setYearForm({ ...yearForm, label: e.target.value })} placeholder="2026-2027" required /></div>
            <div className="champ"><label htmlFor="ys">Rentrée</label><input id="ys" type="date" value={yearForm.startsOn} onChange={(e) => setYearForm({ ...yearForm, startsOn: e.target.value })} required /></div>
            <div className="champ"><label htmlFor="ye">Fin d&apos;année</label><input id="ye" type="date" value={yearForm.endsOn} onChange={(e) => setYearForm({ ...yearForm, endsOn: e.target.value })} required /></div>
            <div className="champ">
              <label htmlFor="yp">Découpage</label>
              <select id="yp" value={yearForm.periodType} onChange={(e) => setYearForm({ ...yearForm, periodType: e.target.value })}>
                <option value="TRIMESTRE">3 trimestres</option>
                <option value="SEMESTRE">2 semestres</option>
              </select>
            </div>
            {data.year && (
              <label className="case" style={{ gridColumn: '1 / -1' }}>
                <input type="checkbox" checked={yearForm.copyClasses} onChange={(e) => setYearForm({ ...yearForm, copyClasses: e.target.checked })} />
                Recopier les classes et les professeurs de {data.year.label}
              </label>
            )}
            <div className="boutons" style={{ gridColumn: '1 / -1' }}>
              <button className="bouton auto" disabled={busy}>Ouvrir l&apos;année</button>
              <button type="button" className="bouton secondaire" onClick={() => setYearForm({ ...yearForm, show: false })}>Annuler</button>
            </div>
          </form>
        )}
      </section>

      {(data.levels.length === 0 || data.subjects.length === 0) && (
        <section className="carte section">
          <h2>Configuration rapide</h2>
          <p className="discret" style={{ marginTop: 0 }}>Cochez les cycles de votre école : FATI UNIVERS crée les niveaux (CP1, 7e année…) et les matières habituelles. Vous pourrez en ajouter ensuite.</p>
          <div className="boutons" style={{ marginBottom: 12 }}>
            {CYCLES.map(([v, l]) => (
              <label key={v} className="case">
                <input type="checkbox" checked={cycles.includes(v)} onChange={() => setCycles(cycles.includes(v) ? cycles.filter((x) => x !== v) : [...cycles, v])} /> {l}
              </label>
            ))}
          </div>
          <button
            className="bouton auto"
            disabled={busy || cycles.length === 0}
            onClick={() =>
              void run(async () => {
                const r = await post<{ levels: number; subjects: number }>('/structure/quick-start', { cycles });
                return `${r.levels} niveau(x) et ${r.subjects} matière(s) ajoutés`;
              })
            }
          >
            Créer les niveaux et matières
          </button>
        </section>
      )}

      <section className="carte section">
        <h2>Classes {data.year ? <span className="discret">· {data.year.label}</span> : null}</h2>
        {!data.year && <p className="discret">Créez d&apos;abord l&apos;année scolaire.</p>}
        {data.year && data.levels.length === 0 && <p className="discret">Ajoutez d&apos;abord des niveaux (configuration rapide ci-dessus).</p>}
        {data.classrooms.map((c) => (
          <div key={c.id} className="ligne-liste" style={{ display: 'block' }}>
            <div className="boutons" style={{ justifyContent: 'space-between' }}>
              <div>
                <strong>{c.name}</strong> <span className="discret">· {c.level.name} · {c.studentCount} élève(s)</span>
                <div className="discret">
                  Professeur principal : {c.mainTeacher ? `${c.mainTeacher.firstName} ${c.mainTeacher.lastName}` : 'aucun'} ·{' '}
                  {c.assignments.length}/{data.subjects.length} matière(s) avec professeur
                </div>
              </div>
              <button className="lien" onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? 'Fermer' : 'Professeurs'}</button>
            </div>
            {open === c.id && (
              <div style={{ marginTop: 12, background: 'var(--fond)', borderRadius: 8, padding: 12 }}>
                <div className="champ">
                  <label>Professeur principal</label>
                  <select
                    value={c.mainTeacher?.id ?? ''}
                    onChange={(e) => void run(async () => {
                      await post(`/structure/classrooms/${c.id}`, { mainTeacherId: e.target.value || null }, 'PATCH');
                      return `Professeur principal de ${c.name} enregistré`;
                    })}
                  >
                    <option value="">— Aucun —</option>
                    {data.staff.map((st) => <option key={st.id} value={st.id}>{st.firstName} {st.lastName}</option>)}
                  </select>
                </div>
                <table>
                  <thead><tr><th>Matière</th><th>Professeur</th></tr></thead>
                  <tbody>
                    {data.subjects.map((sub) => {
                      const a = c.assignments.find((x) => x.subjectId === sub.id);
                      return (
                        <tr key={sub.id}>
                          <td>{sub.name}</td>
                          <td>
                            <select
                              className="petit"
                              value={a?.staffId ?? ''}
                              onChange={(e) => void run(async () => {
                                await post('/structure/assignments', { classroomId: c.id, subjectId: sub.id, staffId: e.target.value || null }, 'PUT');
                                return e.target.value ? `${sub.name} en ${c.name} : ${staffName(e.target.value)}` : `${sub.name} en ${c.name} : plus de professeur`;
                              })}
                            >
                              <option value="">— Personne —</option>
                              {data.staff.map((st) => <option key={st.id} value={st.id}>{st.firstName} {st.lastName}</option>)}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {data.staff.length === 0 && <p className="discret">Ajoutez d&apos;abord les enseignants dans « Comptes ».</p>}
                {c.studentCount === 0 && (
                  <button
                    className="lien"
                    style={{ color: 'var(--rouge)', marginTop: 10 }}
                    onClick={() => {
                      if (!window.confirm(`Supprimer la classe ${c.name} ?`)) return;
                      void run(async () => {
                        await api(`/structure/classrooms/${c.id}`, { method: 'DELETE' });
                        return `Classe ${c.name} supprimée`;
                      });
                    }}
                  >
                    Supprimer cette classe
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {data.year && data.levels.length > 0 && (
          <form
            className="grille"
            style={{ marginTop: 16 }}
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void run(async () => {
                await post('/structure/classrooms', {
                  name: classForm.name,
                  levelId: classForm.levelId,
                  mainTeacherId: classForm.mainTeacherId || undefined,
                });
                setClassForm({ ...classForm, name: '' });
                return `Classe ${classForm.name} créée`;
              });
            }}
          >
            <div className="champ">
              <label htmlFor="cl">Niveau</label>
              <select id="cl" value={classForm.levelId} onChange={(e) => setClassForm({ ...classForm, levelId: e.target.value })} required>
                <option value="">— Choisir —</option>
                {data.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="champ"><label htmlFor="cn">Nom de la classe</label><input id="cn" placeholder="CM2 A" value={classForm.name} onChange={(e) => setClassForm({ ...classForm, name: e.target.value })} required /></div>
            <div className="champ">
              <label htmlFor="cm">Professeur principal</label>
              <select id="cm" value={classForm.mainTeacherId} onChange={(e) => setClassForm({ ...classForm, mainTeacherId: e.target.value })}>
                <option value="">— Plus tard —</option>
                {data.staff.map((st) => <option key={st.id} value={st.id}>{st.firstName} {st.lastName}</option>)}
              </select>
            </div>
            <div style={{ alignSelf: 'end', marginBottom: 14 }}><button className="bouton auto" disabled={busy}>+ Ajouter la classe</button></div>
          </form>
        )}
      </section>

      <div className="grille">
        <section className="carte section">
          <h2>Niveaux ({data.levels.length})</h2>
          <div className="discret" style={{ marginBottom: 12 }}>{data.levels.map((l) => `${l.name} (/${l.gradeScale})`).join(' · ') || 'Aucun'}</div>
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void run(async () => {
                await post('/structure/levels', levelForm);
                setLevelForm({ ...levelForm, name: '' });
                return `Niveau ${levelForm.name} ajouté`;
              });
            }}
          >
            <div className="champ"><label htmlFor="ln">Nouveau niveau</label><input id="ln" placeholder="Terminale SM" value={levelForm.name} onChange={(e) => setLevelForm({ ...levelForm, name: e.target.value })} required /></div>
            <div className="champ">
              <label htmlFor="lc">Cycle</label>
              <select id="lc" value={levelForm.cycle} onChange={(e) => setLevelForm({ ...levelForm, cycle: e.target.value })}>
                {CYCLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <button className="bouton secondaire" disabled={busy}>Ajouter</button>
          </form>
        </section>

        <section className="carte section">
          <h2>Matières ({data.subjects.length})</h2>
          <div className="discret" style={{ marginBottom: 12 }}>{data.subjects.map((x) => x.name).join(' · ') || 'Aucune'}</div>
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void run(async () => {
                await post('/structure/subjects', subjectForm);
                setSubjectForm({ code: '', name: '' });
                return `Matière ${subjectForm.name} ajoutée`;
              });
            }}
          >
            <div className="champ"><label htmlFor="sn">Nouvelle matière</label><input id="sn" placeholder="Informatique" value={subjectForm.name} onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })} required /></div>
            <div className="champ"><label htmlFor="sc">Code court</label><input id="sc" placeholder="INFO" value={subjectForm.code} onChange={(e) => setSubjectForm({ ...subjectForm, code: e.target.value.toUpperCase() })} required maxLength={10} /></div>
            <button className="bouton secondaire" disabled={busy}>Ajouter</button>
          </form>
        </section>
      </div>
    </>
  );
}

export default function StructurePage() {
  return <Coquille titre="Classes et matières" roles={STRUCTURE}>{(s) => <Structure s={s} />}</Coquille>;
}
