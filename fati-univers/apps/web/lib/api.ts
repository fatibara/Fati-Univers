/**
 * Client de l'API FATI UNIVERS.
 * Phase 1 : le jeton d'accès est gardé en sessionStorage (effacé à la fermeture de l'onglet).
 * Phase 2 (sécurité) : passage à des cookies httpOnly posés par un route handler Next.js.
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

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const store = {
  get token() {
    return typeof window === 'undefined' ? null : sessionStorage.getItem('fati.token');
  },
  get tenant() {
    return typeof window === 'undefined' ? null : sessionStorage.getItem('fati.tenant');
  },
};

export function saveSession(token: string) {
  sessionStorage.setItem('fati.token', token);
}
export function chooseSchool(tenantId: string) {
  sessionStorage.setItem('fati.tenant', tenantId);
}
export function clearSession() {
  sessionStorage.removeItem('fati.token');
  sessionStorage.removeItem('fati.tenant');
}
export function currentSchoolId() {
  return store.tenant;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (store.token) headers.set('Authorization', `Bearer ${store.token}`);
  if (store.tenant) headers.set('X-Tenant-Id', store.tenant);

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const msg = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    throw new ApiError(res.status, msg ?? 'Une erreur est survenue');
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}
