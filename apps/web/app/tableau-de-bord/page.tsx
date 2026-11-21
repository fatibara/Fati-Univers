'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, chooseSchool, clearSession, currentSchoolId, type School } from '@/lib/api';

interface Me {
  user: { firstName: string; lastName: string; isSuperAdmin: boolean };
  schools: School[];
}
interface StudentRow {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
  enrollments: { classroom: { name: string } }[];
}

export default function TableauDeBordPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [students, setStudents] = useState<{ items: StudentRow[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback(
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

  useEffect(() => {
    api<Me>('/auth/me')
      .then((data) => {
        setMe(data);
        const saved = currentSchoolId();
        const only = data.schools.length === 1 && !data.user.isSuperAdmin ? data.schools[0]!.id : null;
        const pick = data.schools.some((s) => s.id === saved) ? saved : only;
        if (pick) {
          chooseSchool(pick);
          setSchoolId(pick);
        }
      })
      .catch(handleError);
  }, [handleError]);

  useEffect(() => {
    if (!schoolId) return;
    const school = me?.schools.find((s) => s.id === schoolId);
    const canRead = school?.roles.some((r) => ['PROMOTEUR', 'DIRECTEUR', 'CENSEUR', 'SECRETAIRE', 'COMPTABLE', 'CAISSIER', 'SURVEILLANT'].includes(r));
    if (!canRead) return;
    api<{ items: StudentRow[]; total: number }>('/students?pageSize=20').then(setStudents).catch(handleError);
  }, [schoolId, me, handleError]);

  if (error) return <main className="page"><div className="erreur">{error}</div></main>;
  if (!me) return <main className="page discret">Chargement…</main>;

  const school = me.schools.find((s) => s.id === schoolId);

  if (!school) {
    return (
      <main className="page" style={{ maxWidth: 560 }}>
        <h1>Bonjour {me.user.firstName}</h1>
        <div className="carte">
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Choisissez votre établissement</h2>
          {me.schools.length === 0 && !me.user.isSuperAdmin && <p className="discret">Aucun établissement n&apos;est associé à votre compte.</p>}
          {me.user.isSuperAdmin && (
            <div className="ecole">
              <div>
                <strong>Administration FATI UNIVERS</strong>
                <div className="discret">Créer et gérer les écoles abonnées</div>
              </div>
              <a className="bouton secondaire" href="/admin">Ouvrir</a>
            </div>
          )}
          {me.schools.map((s) => (
            <div className="ecole" key={s.id}>
              <div>
                <strong>{s.name}</strong>
                <div className="discret">{s.roles.join(', ').toLowerCase()}</div>
              </div>
              <button className="bouton secondaire" onClick={() => { chooseSchool(s.id); setSchoolId(s.id); }}>
                Ouvrir
              </button>
            </div>
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="entete">
        <div className="marque">
          <img src="/icon-192.png" alt="" width={36} height={36} />
          <div>
            {school.name}
            <small>FATI UNIVERS · {me.user.firstName} {me.user.lastName}</small>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {school.roles.some((r) => r === 'DIRECTEUR' || r === 'PROMOTEUR') && (
            <a className="bouton secondaire" href="/comptes">Comptes</a>
          )}
          {me.user.isSuperAdmin && <a className="bouton secondaire" href="/admin">Administration</a>}
          {me.schools.length > 1 && (
            <button className="bouton secondaire" onClick={() => setSchoolId(null)}>Changer d&apos;école</button>
          )}
          <button className="bouton secondaire" onClick={() => { clearSession(); router.replace('/connexion'); }}>
            Déconnexion
          </button>
        </div>
      </div>

      <section className="grille" style={{ marginBottom: 20 }}>
        <div className="carte kpi"><div className="libelle">Élèves inscrits</div><div className="valeur">{students?.total ?? '—'}</div></div>
        <div className="carte kpi"><div className="libelle">Présence du jour</div><div className="valeur">—</div><div className="discret">Phase 5</div></div>
        <div className="carte kpi"><div className="libelle">Encaissé aujourd&apos;hui</div><div className="valeur">—</div><div className="discret">Phase 6</div></div>
        <div className="carte kpi"><div className="libelle">Impayés</div><div className="valeur">—</div><div className="discret">Phase 6</div></div>
      </section>

      {students && (
        <section className="carte">
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Élèves</h2>
          <table>
            <thead><tr><th>Matricule</th><th>Nom</th><th>Prénom</th><th>Classe</th></tr></thead>
            <tbody>
              {students.items.map((s) => (
                <tr key={s.id}>
                  <td>{s.matricule}</td>
                  <td>{s.lastName}</td>
                  <td>{s.firstName}</td>
                  <td>{s.enrollments[0]?.classroom.name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
