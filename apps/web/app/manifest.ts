import type { MetadataRoute } from 'next';

/** Application installable (PWA) : « Installer » sur Android et ordinateur, « Sur l'écran d'accueil » sur iPhone. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'FATI UNIVERS',
    short_name: 'FATI UNIVERS',
    description: 'Toute la gestion de votre établissement, sur une seule plateforme. Une solution FATIGLOBAL.',
    start_url: '/tableau-de-bord',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#0b6e4f',
    lang: 'fr',
    categories: ['education', 'productivity'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
