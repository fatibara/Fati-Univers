'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Bouton « Installer l'application ».
 * - Android / ordinateur (Chrome, Edge) : ouvre la fenêtre d'installation du navigateur.
 * - iPhone / iPad (Safari) : affiche la marche à suivre (Partager → Sur l'écran d'accueil).
 * - Déjà installée : ne s'affiche pas.
 */
export function InstallerApp() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || (!deferred && !isIos)) return null;

  return (
    <div className="carte" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <img src="/icon-192.png" alt="" width={44} height={44} style={{ borderRadius: 10 }} />
        <div>
          <strong>Installer FATI UNIVERS</strong>
          <div className="discret">Sur l&apos;écran d&apos;accueil, comme une application.</div>
        </div>
      </div>
      {deferred && (
        <button
          className="bouton"
          type="button"
          onClick={async () => {
            await deferred.prompt();
            await deferred.userChoice;
            setDeferred(null);
          }}
        >
          Installer l&apos;application
        </button>
      )}
      {!deferred && isIos && (
        <>
          <button className="bouton" type="button" onClick={() => setShowIosHelp((v) => !v)}>
            Installer sur iPhone
          </button>
          {showIosHelp && (
            <ol className="discret" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>
              <li>Touchez le bouton Partager de Safari (carré avec une flèche).</li>
              <li>Choisissez « Sur l&apos;écran d&apos;accueil ».</li>
              <li>Touchez « Ajouter ».</li>
            </ol>
          )}
        </>
      )}
    </div>
  );
}
