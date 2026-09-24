const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const ACCESS_KEY = 'fc_token';
const REFRESH_KEY = 'fc_refresh';

export class ApiError extends Error {
  statusCode: number;
  code?: string;
  details?: unknown;

  constructor(body: { statusCode: number; message: string; code?: string; details?: unknown }) {
    super(body.message || 'Ошибка запроса');
    this.name = 'ApiError';
    this.statusCode = body.statusCode;
    this.code = body.code;
    this.details = body.details;
  }
}

function getToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(ACCESS_KEY, token);
  else localStorage.removeItem(ACCESS_KEY);
}

export function getStoredToken(): string | null {
  return getToken();
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setRefreshToken(token: string | null) {
  if (token) localStorage.setItem(REFRESH_KEY, token);
  else localStorage.removeItem(REFRESH_KEY);
}

export function clearSession() {
  setToken(null);
  setRefreshToken(null);
}

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn?: string;
};

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      clearSession();
      return false;
    }
    const data = (await res.json()) as AuthTokens;
    setToken(data.accessToken);
    setRefreshToken(data.refreshToken);
    return true;
  } catch {
    clearSession();
    return false;
  }
}

/** Single-flight refresh so parallel 401s share one refresh call */
function ensureRefreshed() {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function api<T>(
  path: string,
  options: RequestInit & { json?: unknown; auth?: boolean; _retried?: boolean } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const attachAuth = options.auth !== false;
  const token = attachAuth ? getToken() : null;
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
    });
  } catch {
    throw new ApiError({
      statusCode: 0,
      message: 'Нет связи с сервером. Проверьте, что API запущен.',
    });
  }

  if (res.status === 401 && attachAuth && !options._retried && path !== '/auth/refresh') {
    const ok = await ensureRefreshed();
    if (ok) {
      return api<T>(path, { ...options, _retried: true });
    }
  }

  if (!res.ok) {
    let body: { statusCode: number; message: string; code?: string; details?: unknown };
    try {
      body = await res.json();
    } catch {
      body = { statusCode: res.status, message: res.statusText || 'Ошибка запроса' };
    }
    // Nest ConflictException sometimes nests payload
    if (body && typeof body === 'object' && 'message' in body && typeof (body as { message: unknown }).message === 'object') {
      const nested = (body as { message: { message?: string; code?: string; details?: unknown } }).message;
      body = {
        statusCode: body.statusCode,
        message: nested.message || 'Ошибка запроса',
        code: nested.code,
        details: nested.details,
      };
    }
    throw new ApiError(body);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export type { AuthTokens };
