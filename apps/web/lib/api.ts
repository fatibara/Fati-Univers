/**
 * Client de l'API FATI UNIVERS.
 * La session est gardée sur l'appareil (localStorage) pour que l'application installée reste connectée :
 * - le jeton d'accès (15 min) est renouvelé automatiquement grâce au jeton de renouvellement (30 jours) ;
 * - « Déconnexion » révoque le jeton de renouvellement côté serveur.
 */
// Même domaine que le site : Next.js relaie vers l'API (voir next.config.mjs).
export const API_URL = '/api/v1';

export interface School {
  id: string;
  name: string;
  shortName: string;
  status: string;
  roles: string[];
}

export interface Me {
  user: { id: string; firstName: string; lastName: string; phone: string; isSuperAdmin: boolean };
  schools: School[];
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const KEYS = { token: 'fati.token', refresh: 'fati.refresh', tenant: 'fati.tenant' };

function read(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key) ?? sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    /* stockage indisponible (navigation privée) : la session durera le temps de l'onglet */
  }
}

let meCache: Promise<Me> | null = null;

export function saveSession(token: string, refreshToken?: string) {
  write(KEYS.token, token);
  if (refreshToken) write(KEYS.refresh, refreshToken);
  meCache = null;
}
export function chooseSchool(tenantId: string | null) {
  write(KEYS.tenant, tenantId);
}
export function clearSession() {
  write(KEYS.token, null);
  write(KEYS.refresh, null);
  write(KEYS.tenant, null);
  meCache = null;
}
export function currentSchoolId() {
  return read(KEYS.tenant);
}
export function isLoggedIn() {
  return !!read(KEYS.token) || !!read(KEYS.refresh);
}

let refreshing: Promise<boolean> | null = null;

/** Renouvelle le jeton d'accès (une seule fois même si plusieurs requêtes échouent en même temps). */
function refreshSession(): Promise<boolean> {
  const refreshToken = read(KEYS.refresh);
  if (!refreshToken) return Promise.resolve(false);
  refreshing ??= fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (res) => {
      if (!res.ok) return false;
      const body = (await res.json()) as { accessToken: string; refreshToken: string };
      write(KEYS.token, body.accessToken);
      write(KEYS.refresh, body.refreshToken);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function send(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const token = read(KEYS.token);
  const tenant = read(KEYS.tenant);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (tenant) headers.set('X-Tenant-Id', tenant);
  return fetch(`${API_URL}${path}`, { ...init, headers });
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await send(path, init);
    if (res.status === 401 && !path.startsWith('/auth/') && (await refreshSession())) {
      res = await send(path, init);
    }
  } catch {
    throw new ApiError(0, 'Pas de connexion internet. Vérifiez votre réseau puis réessayez.');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const msg = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    throw new ApiError(res.status, msg ?? 'Une erreur est survenue');
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Profil du compte connecté (mis en cache pendant la visite). */
export function loadMe(force = false): Promise<Me> {
  if (force || !meCache) {
    meCache = api<Me>('/auth/me');
    meCache.catch(() => {
      meCache = null;
    });
  }
  return meCache;
}

export async function logout() {
  const refreshToken = read(KEYS.refresh);
  if (refreshToken) {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }
  clearSession();
}

/** Messages d'erreur lisibles. */
export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : 'Une erreur est survenue';
}

/** Date du jour AAAA-MM-JJ. */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function frDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = iso.slice(0, 10);
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}
