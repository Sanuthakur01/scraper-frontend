// Talking to IJF AI (server: src/ai/routes.js). Every request carries the person's sign-in; the answer to
// a question streams back as server-sent events, read here with fetch (EventSource can't send the sign-in).
import { ApiError, apiUrl } from './api';
import type { DataView } from './dataView';
import { signInHeader } from './session';
import type { ChatAction, ChatCard, ChatMessage, ChatPeriod } from './types';

export interface ChatContext {
  path: string;
  period?: ChatPeriod;
  view: DataView;
}

// The page the person is on, for "this course", "these jobs".
export function pageContext(view: DataView): ChatContext {
  const { pathname, search } = window.location;
  const q = new URLSearchParams(search);
  const from = q.get('from');
  const period = from ? { from, to: q.get('to') ?? from } : q.get('days') ? { days: Number(q.get('days')) } : undefined;
  return { path: pathname.replace(/\/+$/, '') || '/', period, view };
}

// A request to /api/chat…; throws an ApiError with the server's own words when refused.
export async function chatApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method: init.method ?? 'GET',
      headers: { ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(await signInHeader()) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error ?? `Something went wrong (error ${res.status}).`);
  return data as T;
}

export type ChatEvent =
  | { event: 'start'; data: { chatId: string } }
  | { event: 'status'; data: string }
  | { event: 'text'; data: string }
  | { event: 'card'; data: ChatCard }
  | { event: 'action'; data: ChatAction }
  | { event: 'error'; data: { message: string } }
  | { event: 'done'; data: { chatId: string; title: string; message: ChatMessage } };

// Asks a question; onEvent gets each event as it arrives. Refused before answering (not signed in, the
// day's questions used up): throws an ApiError with the server's words.
export async function ask({
  chatId,
  message,
  context,
  signal,
  onEvent,
}: {
  chatId?: string;
  message: string;
  context: ChatContext;
  signal: AbortSignal;
  onEvent: (e: ChatEvent) => void;
}) {
  let res: Response;
  try {
    res = await fetch(apiUrl('chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await signInHeader()) },
      body: JSON.stringify({ chatId, message, context }),
      signal,
    });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new ApiError('Could not reach the server. Check your connection and try again.');
  }
  if (!res.ok || !res.headers.get('content-type')?.includes('text/event-stream') || !res.body) {
    const data = await res.json().catch(() => null);
    throw new ApiError(data?.error ?? `IJF AI couldn't answer (error ${res.status}).`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch (err) {
      if (signal.aborted) throw err;
      throw new ApiError(CONNECTION_LOST);
    }
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = block.match(/^event: (.*)$/m)?.[1];
      const data = block.match(/^data: (.*)$/m)?.[1];
      if (!event || !data) continue;
      if (event === 'done') finished = true;
      onEvent({ event, data: JSON.parse(data) } as ChatEvent);
    }
  }
  // The answer stopped before the server said it was done (e.g. the server restarted mid-answer).
  if (!finished && !signal.aborted) throw new ApiError(CONNECTION_LOST);
}

export const CONNECTION_LOST = 'The connection to the server was lost before IJF AI finished (the server may have restarted). Please ask again.';
