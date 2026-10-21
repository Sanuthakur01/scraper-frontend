import { useEffect, useState } from 'react';
import { useDataView, viewParam, type DataView } from './dataView';
import { signInHeader } from './session';
import type { ApiState } from './types';

export type QueryParams = Record<string, string | number | null | undefined>;

const toQuery = (params: QueryParams = {}) => {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => [k, String(v)]);
  return entries.length ? `?${new URLSearchParams(entries)}` : '';
};

// The backend's address when the dashboard is hosted somewhere else: NEXT_PUBLIC_API_URL (see
// .env.example), fixed when the dashboard is built. Empty: the backend serves the dashboard itself,
// so requests go to the same address.
const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');

export const apiUrl = (path: string, params?: QueryParams) => `${API_BASE}/api/${path}${toQuery(params)}`;

// A change the server refused: its message (e.g. "This number already exists.") and, sometimes, a
// second line with more detail.
export class ApiError extends Error {
  constructor(
    message: string,
    readonly detail = '',
  ) {
    super(message);
  }
}

// Sends a change, with the person's sign-in. Throws an ApiError with the server's own message when
// refused (e.g. "Your sign-in has expired…").
export async function sendJson<T>(path: string, method: 'PUT' | 'POST', body: unknown): Promise<T> {
  let res: Response;
  try {
    const headers = { 'Content-Type': 'application/json', ...(await signInHeader()) };
    res = await fetch(apiUrl(path), { method, headers, body: JSON.stringify(body) });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error ?? `Could not save (error ${res.status}).`, data?.detail ?? '');
  return data as T;
}

// apiUrl for the jobs the dashboard shows now (Filtered or Non-filtered), e.g. for CSV download links.
export function useApiUrl() {
  const { view } = useDataView();
  return (path: string, params?: QueryParams) => apiUrl(path, { ...params, ...viewParam(view) });
}

// Fetches whenever the URL changes (also when the Filtered / Non-filtered switch changes, which adds
// ?view=nonfiltered). Keeps the previous data while reloading so the page doesn't jump, except after a
// switch: then the old data goes at once, so one set's numbers never show under the other's name.
// skip: don't fetch (yet), e.g. when a value the request needs is missing. auth: send the person's
// sign-in (for data only signed-in people may read, e.g. the activity record).
export function useApi<T>(path: string, params?: QueryParams, { skip = false, auth = false }: { skip?: boolean; auth?: boolean } = {}): ApiState<T> {
  const { view, ready } = useDataView();
  const url = apiUrl(path, { ...params, ...viewParam(view) });
  const [state, setState] = useState<ApiState<T> & { view?: DataView }>({ data: null, error: null, loading: true });

  useEffect(() => {
    if (!ready || skip) return; // the remembered view isn't known yet, or nothing to fetch
    let cancelled = false;
    setState((s) => (s.view === view ? { ...s, loading: true } : { data: null, error: null, loading: true, view }));
    (auth ? signInHeader() : Promise.resolve({}))
      .then((headers) => fetch(url, { headers }))
      .then(async (res) => {
        // The server's own message when it has one (e.g. "Your role can't see this.").
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Could not load ${path} (${res.status})`);
        return res.json() as Promise<T>;
      })
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false, view });
      })
      .catch((error: Error) => {
        if (!cancelled) setState((s) => ({ ...s, error, loading: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [url, path, ready, view, skip, auth]);

  return skip ? { data: null, error: null, loading: false } : state;
}
