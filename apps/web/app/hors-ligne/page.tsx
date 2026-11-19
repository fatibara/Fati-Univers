export const metadata = { title: 'Hors-ligne · FATI UNIVERS' };

export default function HorsLignePage() {
  return (
    <main className="page" style={{ maxWidth: 480, paddingTop: 80, textAlign: 'center' }}>
      <img src="/icon-192.png" alt="" width={72} height={72} />
      <h1 style={{ fontSize: 24 }}>Pas de connexion internet</h1>
      <p className="discret">
        FATI UNIVERS a besoin du réseau pour cette page. Vérifiez votre connexion puis réessayez.
      </p>
    </main>
  );
}
