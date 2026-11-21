'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, saveSession } from '@/lib/api';
import { InstallerApp } from '@/components/InstallerApp';

export default function ConnexionPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<{ accessToken: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone, password }),
      });
      saveSession(res.accessToken);
      router.push('/tableau-de-bord');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page" style={{ maxWidth: 420, paddingTop: 64 }}>
      <div className="marque" style={{ marginBottom: 24 }}>
        <img src="/icon-192.png" alt="" width={40} height={40} />
        <div>
          FATI UNIVERS
          <small>Une solution FATIGLOBAL</small>
        </div>
      </div>
      <form className="carte" onSubmit={onSubmit}>
        <h1 style={{ fontSize: 22, marginTop: 0 }}>Connexion</h1>
        {error && <div className="erreur" role="alert">{error}</div>}
        <div className="champ">
          <label htmlFor="phone">Numéro de téléphone</label>
          <input
            id="phone"
            inputMode="tel"
            autoComplete="tel"
            placeholder="620 00 00 00"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </div>
        <div className="champ">
          <label htmlFor="password">Mot de passe</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>
        <button className="bouton" disabled={loading}>
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
      <p className="discret" style={{ textAlign: 'center', marginTop: 16 }}>
        Première connexion ou mot de passe oublié ? <a href="/activer">Activer mon compte avec un code SMS</a>
      </p>
      <InstallerApp />
      <p className="discret" style={{ textAlign: 'center', marginTop: 16, fontSize: 13 }}>
        Version de démonstration : toutes les données sont fictives.
      </p>
    </main>
  );
}
