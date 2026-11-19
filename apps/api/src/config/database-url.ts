/**
 * Construit l'adresse de connexion d'un rôle à partir de celle fournie par
 * Neon/Vercel (DATABASE_URL) : même serveur, même base, autre identifiant.
 * Ainsi, sur Vercel, il suffit d'ajouter les mots de passe des rôles
 * FATI_APP_PASSWORD et FATI_PLATFORM_PASSWORD.
 */
export function roleUrl(baseUrl: string, user: string, password: string): string {
  const url = new URL(baseUrl);
  url.username = encodeURIComponent(user);
  url.password = encodeURIComponent(password);
  // Connexion via le pooler Neon (mode transaction) : désactive les requêtes préparées côté Prisma.
  if (url.hostname.includes('-pooler') && !url.searchParams.has('pgbouncer')) {
    url.searchParams.set('pgbouncer', 'true');
  }
  if (!url.searchParams.has('sslmode') && !['localhost', '127.0.0.1'].includes(url.hostname)) {
    url.searchParams.set('sslmode', 'require');
  }
  return url.toString();
}
