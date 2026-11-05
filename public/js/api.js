const TOKEN_KEY = 'tippspiel.token';

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
export const setToken = (t) => {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* Speicher gesperrt: Anmeldung gilt nur für diese Sitzung */
  }
};

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const TIMEOUT_MS = 15000;

export async function api(path, { method = 'GET', body } = {}) {
  const token = getToken();
  let res;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    res = await fetch(path, {
      method,
      signal: controller.signal,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw new ApiError('Der Server antwortet gerade nicht. Versuche es gleich noch einmal.', 0);
    throw new ApiError('Keine Verbindung. Prüfe dein Internet und versuche es noch einmal.', 0);
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith('/api/login')) {
      setToken(null);
      window.dispatchEvent(new Event('auth-lost'));
    }
    throw new ApiError(data.error ?? 'Etwas ist schiefgelaufen.', res.status);
  }
  return data;
}
