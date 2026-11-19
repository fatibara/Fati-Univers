import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FATI UNIVERS',
  description: 'Toute la gestion de votre établissement, sur une seule plateforme. Une solution FATIGLOBAL.',
  applicationName: 'FATI UNIVERS',
  icons: { icon: '/icon-192.png', apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'FATI UNIVERS', statusBarStyle: 'default' },
};

export const viewport: Viewport = { themeColor: '#0b6e4f', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
