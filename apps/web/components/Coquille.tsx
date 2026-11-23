'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ApiError, chooseSchool, currentSchoolId, errorText, isLoggedIn, loadMe, logout, type Me, type School } from '@/lib/api';
import { hasAny, NAV, ROLE_LABELS } from '@/lib/roles';

export interface Session {
  me: Me;
  school: School;
  roles: string[];
  /** À appeler quand une requête échoue : gère la déconnexion et affiche le message. */
  fail: (err: unknown) => void;
}

interface Props {
  titre: string;
  /** Rôles autorisés à voir la page (tous si absent). */
  roles?: readonly string[];
  actions?: ReactNode;
  children: (s: Session) => ReactNode;
}

/** Cadre commun des pages d'une école : en-tête, menu selon le rôle, choix de l'école. */
export function Coquille({ titre, roles, actions, children }: Props) {
  const router = useRouter();
  const path = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        void logout().then(() => router.replace('/connexion'));
        return;
      }
      setError(errorText(err));
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [router],
  );

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace('/connexion');
      return;
    }
    loadMe()
      .then((data) => {
        setMe(data);
        const saved = currentSchoolId();
        const only = data.schools.length === 1 && !data.user.isSuperAdmin ? data.schools[0]!.id : null;
        const pick = data.schools.some((s) => s.id === saved) ? saved : only;
        chooseSchool(pick);
        setSchoolId(pick);
      })
      .catch(fail);
  }, [fail, router]);

  if (!me) {
    return (
      <main className="page">
        {error ? <div className="erreur">{error}</div> : <p className="discret">Chargement…</p>}
      </main>
    );
  }

  const school = me.schools.find((s) => s.id === schoolId);

  if (!school) {
    return (
      <main className="page" style={{ maxWidth: 560 }}>
        <div className="marque" style={{ marginBottom: 20 }}>
          <img src="/icon-192.png" alt="" width={36} height={36} />
          <div>
            FATI UNIVERS
            <small>Bonjour {me.user.firstName}</small>
          </div>
        </div>
        <div className="carte">
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Choisissez votre établissement</h2>
          {me.schools.length === 0 && !me.user.isSuperAdmin && (
            <p className="discret">Aucun établissement n&apos;est associé à votre compte. Contactez la direction de votre école.</p>
          )}
          {me.user.isSuperAdmin && (
            <div className="ecole">
              <div>
                <strong>Administration FATI UNIVERS</strong>
                <div className="discret">Créer et gérer les écoles abonnées</div>
              </div>
              <Link className="bouton secondaire" href="/admin">Ouvrir</Link>
            </div>
          )}
          {me.schools.map((s) => (
            <div className="ecole" key={s.id}>
              <div>
                <strong>{s.name}</strong>
                <div className="discret">{s.roles.map((r) => ROLE_LABELS[r] ?? r).join(', ')}</div>
              </div>
              <button
                className="bouton secondaire"
                onClick={() => {
                  chooseSchool(s.id);
                  setSchoolId(s.id);
                }}
              >
                Ouvrir
              </button>
            </div>
          ))}
          <button className="lien" style={{ marginTop: 16 }} onClick={() => void logout().then(() => router.replace('/connexion'))}>
            Se déconnecter
          </button>
        </div>
      </main>
    );
  }

  const nav = NAV.filter((n) => !n.roles || hasAny(school.roles, n.roles));
  const allowed = !roles || hasAny(school.roles, roles);

  return (
    <>
      <header className="barre">
        <div className="barre-haut">
          <Link href="/tableau-de-bord" className="marque" style={{ textDecoration: 'none', color: 'inherit' }}>
            <img src="/icon-192.png" alt="" width={32} height={32} />
            <div>
              {school.name}
              <small>
                {me.user.firstName} {me.user.lastName} · {school.roles.map((r) => ROLE_LABELS[r] ?? r).join(', ')}
              </small>
            </div>
          </Link>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {me.user.isSuperAdmin && <Link className="puce" href="/admin">Administration</Link>}
            {(me.schools.length > 1 || me.user.isSuperAdmin) && (
              <button
                className="puce"
                onClick={() => {
                  chooseSchool(null);
                  setSchoolId(null);
                }}
              >
                Changer d&apos;école
              </button>
            )}
            <button className="puce" onClick={() => void logout().then(() => router.replace('/connexion'))}>
              Déconnexion
            </button>
          </div>
        </div>
        <nav className="menu" aria-label="Menu principal">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className={path === n.href || path.startsWith(`${n.href}/`) ? 'actif' : ''}>
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="page">
        <div className="entete">
          <h1 style={{ margin: 0, fontSize: 24 }}>{titre}</h1>
          {allowed && actions}
        </div>
        {error && (
          <div className="erreur" role="alert">
            {error}{' '}
            <button className="lien" onClick={() => setError(null)}>Fermer</button>
          </div>
        )}
        {allowed ? (
          children({ me, school, roles: school.roles, fail })
        ) : (
          <div className="carte">Cette page n&apos;est pas disponible pour votre rôle.</div>
        )}
      </main>
    </>
  );
}
