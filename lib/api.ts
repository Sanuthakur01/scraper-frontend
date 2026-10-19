import { useEffect, useState } from 'react';
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

// Sends a change. Throws an ApiError with the server's own message when refused.
export async function sendJson<T>(path: string, method: 'PUT' | 'POST', body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error ?? `Could not save (error ${res.status}).`, data?.detail ?? '');
  return data as T;
}

// Fetches whenever the URL changes. Keeps the previous data while reloading so the page doesn't jump.
export function useApi<T>(path: string, params?: QueryParams): ApiState<T> {
  const url = apiUrl(path, params);
  const [state, setState] = useState<ApiState<T>>({ data: null, error: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
        return res.json() as Promise<T>;
      })
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((error: Error) => {
        if (!cancelled) setState((s) => ({ ...s, error, loading: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [url, path]);

  return state;
}
