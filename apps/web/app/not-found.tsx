import Link from 'next/link';

/** Lien erroné ou ancien : page claire au lieu d'un « 404 » brut. */
export default function NotFound() {
  return (
    <main className="page" style={{ maxWidth: 460, paddingTop: 72, textAlign: 'center' }}>
      <img src="/icon-192.png" alt="" width={64} height={64} />
      <h1 style={{ fontSize: 22 }}>Page introuvable</h1>
      <p className="discret">Ce lien n&apos;existe pas ou plus. Continuez depuis l&apos;accueil de FATI UNIVERS.</p>
      <Link href="/tableau-de-bord" className="bouton" style={{ textDecoration: 'none' }}>
        Aller à l&apos;accueil
      </Link>
    </main>
  );
}
