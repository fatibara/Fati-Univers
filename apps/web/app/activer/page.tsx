'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, clearSession, saveSession } from '@/lib/api';

/** Première connexion (code reçu par SMS) ou mot de passe oublié. */
export default function ActiverPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError('Les deux mots de passe ne sont pas identiques');
    setLoading(true);
    try {
      const res = await api<{ accessToken: string; refreshToken: string }>('/auth/activate', {
        method: 'POST',
        body: JSON.stringify({ phone, code: code.replace(/\s/g, ''), password }),
      });
      clearSession();
      saveSession(res.accessToken, res.refreshToken);
      router.push('/tableau-de-bord');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activation impossible');
    } finally {
      setLoading(false);
    }
  }

  async function requestCode() {
    setError(null);
    setInfo(null);
    if (!phone) return setError('Indiquez d’abord votre numéro de téléphone');
    try {
      const res = await api<{ message: string }>('/auth/request-code', { method: 'POST', body: JSON.stringify({ phone }) });
      setInfo(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi impossible');
    }
  }

  return (
    <main className="page" style={{ maxWidth: 440, paddingTop: 48 }}>
      <div className="marque" style={{ marginBottom: 24 }}>
        <img src="/icon-192.png" alt="" width={40} height={40} />
        <div>
          FATI UNIVERS
          <small>Une solution FATIGLOBAL</small>
        </div>
      </div>
      <form className="carte" onSubmit={onSubmit}>
        <h1 style={{ fontSize: 22, marginTop: 0 }}>Activer mon compte</h1>
        <p className="discret" style={{ marginTop: -6 }}>
          Première connexion ou mot de passe oublié : saisissez le code à 6 chiffres reçu par SMS, puis choisissez votre mot de passe.
        </p>
        {error && <div className="erreur" role="alert">{error}</div>}
        {info && <div className="succes" role="status">{info}</div>}
        <div className="champ">
          <label htmlFor="phone">Numéro de téléphone</label>
          <input id="phone" inputMode="tel" autoComplete="tel" placeholder="620 00 00 00" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </div>
        <div className="champ">
          <label htmlFor="code">Code reçu par SMS</label>
          <input id="code" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} required />
        </div>
        <div className="champ">
          <label htmlFor="password">Nouveau mot de passe</label>
          <input id="password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div className="champ">
          <label htmlFor="confirm">Confirmer le mot de passe</label>
          <input id="confirm" type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </div>
        <button className="bouton" disabled={loading}>{loading ? 'Activation…' : 'Activer et me connecter'}</button>
        <button type="button" className="lien" onClick={requestCode} style={{ marginTop: 14 }}>
          Je n’ai pas de code ou il a expiré : m’envoyer un nouveau code
        </button>
      </form>
      <p className="discret" style={{ textAlign: 'center', marginTop: 16 }}>
        <Link href="/connexion">Retour à la connexion</Link>
      </p>
    </main>
  );
}
