// One place that talks to the backend. Always relative URLs (Next rewrites /api/* to the API) and
// credentials 'same-origin' so the HttpOnly `sid` cookie rides along. Nothing is stored in localStorage.

export type FieldError = { field: string; message: string };

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: FieldError[];
  requestId?: string;
  constructor(message: string, status: number, code?: string, details?: FieldError[], requestId?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

export type ApiResult<T = any> = { data: T; meta?: any; message?: string };

type Opts = { method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; body?: unknown; query?: Record<string, any> };

const buildQuery = (query?: Record<string, any>) => {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
};

export async function api<T = any>(path: string, opts: Opts = {}): Promise<ApiResult<T>> {
  const { method = 'GET', body, query } = opts;
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}${buildQuery(query)}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0, 'NETWORK');
  }

  if (res.status === 204) return { data: null as T };

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body (proxy error page, etc.) */
  }

  if (!res.ok || json?.success === false) {
    const err = new ApiError(
      json?.message || (res.status >= 500 ? 'Something went wrong on our end.' : 'Request failed'),
      res.status,
      json?.code,
      json?.details,
      json?.requestId,
    );
    // A 401 anywhere except the login/me calls means the session is gone.
    if (res.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/me') && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('cr:unauthorized'));
    }
    throw err;
  }
  // Lists come back as data: [...] with meta beside it. If a list ever arrives as { items, meta }, hoist the meta.
  let data = json?.data;
  let meta = json?.meta;
  if (data && !Array.isArray(data) && Array.isArray(data.items) && data.meta && meta === undefined) {
    meta = data.meta;
    data = data.items;
  }
  return { data: data as T, meta, message: json?.message };
}

// Turns a VALIDATION_ERROR into { fieldName: message } for inline form errors.
export const fieldErrors = (err: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (err instanceof ApiError && err.details) for (const d of err.details) if (!out[d.field]) out[d.field] = d.message;
  return out;
};

export const errorMessage = (err: unknown, fallback = 'Something went wrong. Please try again.') =>
  err instanceof ApiError ? err.message : fallback;

export const isRateLimited = (err: unknown) => err instanceof ApiError && (err.status === 429 || err.code === 'RATE_LIMITED');
export const isNotFound = (err: unknown) => err instanceof ApiError && err.status === 404;
export const isServerError = (err: unknown) => err instanceof ApiError && (err.status >= 500 || err.status === 0);
