'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, apiUrl, useApi } from '@/lib/api';
import { ask, chatApi, pageContext } from '@/lib/chat';
import { useDataView } from '@/lib/dataView';
import { COURSE_COLORS, formatDate, formatNumber, formatUpdated, shownCities } from '@/lib/format';
import { signInHeader } from '@/lib/session';
import type { ChatAction, ChatCard, ChatMessage, ChatReminder, ChatSummary, ChatUsage, Course, Job, JobsResponse, Meta } from '@/lib/types';
import { useAccess } from './AuthGate';
import ChatMarkdown from './ChatMarkdown';
import { SectionError } from './PageParts';
import {
  AlertIcon,
  ArrowRightIcon,
  ChartIcon,
  CheckIcon,
  CloseIcon,
  ExternalIcon,
  HistoryIcon,
  LinkIcon,
  MailIcon,
  PhoneIcon,
  PlusIcon,
  SendIcon,
  SparklesIcon,
  StopIcon,
  ThumbDownIcon,
  ThumbUpIcon,
  UserIcon,
} from './Icons';
import JobDetailsModal, { CopyButton } from './JobDetailsModal';

// IJF AI: a chat about the dashboard's data, open from any page ("Ask IJF AI", or Ctrl+K). Answers stream
// in, with cards (jobs, HR contacts, follow-ups) and changes to confirm. Phone numbers and emails never go
// to the AI (the server swaps them for stand-ins); the cards here show the real ones.

// Questions to start with, for the page the person is on.
function suggestionsFor(path: string): string[] {
  if (path.startsWith('/course/'))
    return ['Which companies are hiring for this course this week?', "Which of the latest day's jobs have no HR details yet?", 'Which skills should this course add?', 'Show me HR contacts for the newest jobs here'];
  if (path.startsWith('/performance'))
    return ['Who added the most HR contacts this week?', 'Which numbers have no remark yet?', 'How many CVs were shared this month?', "Write this week's summary for my manager"];
  if (path.startsWith('/partners')) return ['Which hiring partners have no HR contact yet?', 'Top hiring partners for Data Engineering'];
  if (path.startsWith('/activity')) return ['What did the team change today?', 'Which changes were made through IJF AI?'];
  return ['How many new jobs came today, per course?', 'Top 5 companies hiring this week', 'Which site gave the most jobs today?', "Write this week's summary for my manager"];
}

const ACTION_STATUS: Record<ChatAction['status'], string> = { pending: '', done: 'Saved', failed: 'Not saved', cancelled: 'Cancelled' };

export default function AiChat() {
  const meta = useApi<Meta>('meta');
  const access = useAccess();
  const { view, setView } = useDataView();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState<'chat' | 'history' | 'usage'>('chat');
  const [chatId, setChatId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [briefing, setBriefing] = useState<{ text?: string; writing?: boolean; error?: string } | null>(null);
  const [reminders, setReminders] = useState<ChatReminder[] | null>(null);
  const [history, setHistory] = useState<ChatSummary[] | null>(null);
  const [usage, setUsage] = useState<ChatUsage | null>(null);
  const [problem, setProblem] = useState('');
  const [deciding, setDeciding] = useState('');
  const [detail, setDetail] = useState<Job | null>(null);
  const [path, setPath] = useState('/');
  const stopper = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const enabled = Boolean(meta.data?.aiEnabled && access);
  const courses: Course[] = meta.data?.courses ?? [];

  // Ctrl+K opens and closes it; Esc closes it.
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);

  // Opened: the cursor in the box, the page it was opened from (for suggestions), today's briefing and
  // what needs attention (once).
  useEffect(() => {
    if (!open) return;
    setPath(window.location.pathname.replace(/\/+$/, '') || '/');
    requestAnimationFrame(() => input.current?.focus());
    if (!reminders) {
      chatApi<{ items: ChatReminder[] }>('chat/reminders')
        .then((r) => setReminders(r.items))
        .catch(() => setReminders([]));
    }
    if (!briefing) {
      setBriefing({ writing: true });
      let tries = 0;
      const load = () =>
        chatApi<{ text?: string; writing?: boolean }>('chat/briefing')
          .then((b) => {
            if (b.text) setBriefing({ text: b.text });
            else if (tries++ < 8) setTimeout(load, 5000);
            else setBriefing({ error: "Today's briefing isn't ready yet." });
          })
          .catch((err: Error) => setBriefing({ error: err.message }));
      load();
    }
  }, [open, briefing, reminders]);

  // New words: keep the newest in view.
  useEffect(() => {
    const box = log.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [messages]);

  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => opener.current?.focus());
  };

  // A dashboard page from an answer or a card (in its view); on a phone the chat steps aside.
  const go = useCallback(
    (href: string, linkView?: 'filtered' | 'nonfiltered') => {
      if (linkView && linkView !== view) setView(linkView);
      router.push(href);
      if (window.innerWidth < 760) setOpen(false);
    },
    [router, setView, view],
  );

  const openJob = async (id: string, set: 'filtered' | 'nonfiltered') => {
    try {
      const res = await fetch(apiUrl('jobs', { id, days: 1, view: set === 'nonfiltered' ? 'nonfiltered' : undefined }), { headers: await signInHeader() });
      const job = ((await res.json()) as JobsResponse).items?.[0];
      if (job) setDetail(job);
      else setProblem('That job is no longer stored.');
    } catch {
      setProblem('Could not reach the server. Check your connection and try again.');
    }
  };

  const updateLast = (fn: (m: ChatMessage) => ChatMessage) =>
    setMessages((list) => {
      const copy = [...list];
      copy[copy.length - 1] = fn(copy[copy.length - 1]);
      return copy;
    });

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setDraft('');
    setScreen('chat');
    setBusy(true);
    setProblem('');
    setMessages((list) => [
      ...list,
      { role: 'user', content: question, cards: [], actions: [] },
      { role: 'assistant', content: '', cards: [], actions: [], pending: true, status: 'Thinking' },
    ]);
    const controller = new AbortController();
    stopper.current = controller;
    try {
      await ask({
        chatId,
        message: question,
        context: pageContext(view),
        signal: controller.signal,
        onEvent: (e) => {
          if (e.event === 'start') setChatId(e.data.chatId);
          else if (e.event === 'status') updateLast((m) => ({ ...m, status: e.data }));
          else if (e.event === 'text') updateLast((m) => ({ ...m, content: m.content + e.data, status: '' }));
          else if (e.event === 'card') updateLast((m) => ({ ...m, cards: [...m.cards, e.data] }));
          else if (e.event === 'action') updateLast((m) => ({ ...m, actions: [...m.actions, e.data] }));
          else if (e.event === 'error') updateLast((m) => ({ ...m, error: e.data.message }));
          else if (e.event === 'done') {
            setChatId(e.data.chatId);
            updateLast(() => ({ ...e.data.message, pending: false }));
            setAnnounce('IJF AI answered.');
            setHistory(null);
          }
        },
      });
    } catch (err) {
      if (!(err instanceof ApiError) && !controller.signal.aborted) console.error('IJF AI:', err);
      updateLast((m) => ({
        ...m,
        pending: false,
        status: '',
        error: controller.signal.aborted ? (m.content ? '' : 'Stopped.') : err instanceof ApiError ? err.message : `IJF AI could not answer (${(err as Error).message || 'unknown error'}). Please ask again.`,
        retry: controller.signal.aborted ? undefined : question,
      }));
    } finally {
      updateLast((m) => (m.pending ? { ...m, pending: false, status: '' } : m));
      stopper.current = null;
      setBusy(false);
      requestAnimationFrame(() => input.current?.focus());
    }
  };

  const decide = async (index: number, action: ChatAction, decision: 'confirm' | 'cancel') => {
    if (!chatId || !action.id) return;
    setDeciding(action.id);
    const patch = (next: ChatAction) =>
      setMessages((list) => list.map((m, i) => (i === index ? { ...m, actions: m.actions.map((a) => (a.id === action.id ? next : a)) } : m)));
    try {
      const r = await chatApi<{ action: ChatAction }>(`chat/conversations/${chatId}/actions/${action.id}`, { method: 'POST', body: { decision } });
      patch(r.action);
    } catch (err) {
      patch({ ...action, status: 'failed', error: (err as Error).message });
    } finally {
      setDeciding('');
    }
  };

  const rate = async (index: number, message: ChatMessage, value: 'up' | 'down') => {
    if (!chatId || !message.id) return;
    const next = message.feedback === value ? '' : value;
    setMessages((list) => list.map((m, i) => (i === index ? { ...m, feedback: next } : m)));
    await chatApi(`chat/conversations/${chatId}/messages/${message.id}/feedback`, { method: 'POST', body: { value: next } }).catch(() => {});
  };

  const newChat = () => {
    stopper.current?.abort();
    setChatId(undefined);
    setMessages([]);
    setScreen('chat');
    setProblem('');
    requestAnimationFrame(() => input.current?.focus());
  };

  const showHistory = async () => {
    setScreen('history');
    try {
      setHistory((await chatApi<{ items: ChatSummary[] }>('chat/conversations')).items);
    } catch (err) {
      setProblem((err as Error).message);
    }
  };

  const openChat = async (id: string) => {
    try {
      const chat = await chatApi<{ id: string; messages: ChatMessage[] }>(`chat/conversations/${id}`);
      setChatId(chat.id);
      setMessages(chat.messages);
      setScreen('chat');
    } catch (err) {
      setProblem((err as Error).message);
    }
  };

  const deleteChat = async (id: string) => {
    await chatApi(`chat/conversations/${id}`, { method: 'DELETE' }).catch(() => {});
    setHistory((list) => list?.filter((c) => c.id !== id) ?? null);
    if (id === chatId) newChat();
  };

  const showUsage = async () => {
    setScreen('usage');
    try {
      setUsage(await chatApi<ChatUsage>('chat/usage'));
    } catch (err) {
      setProblem((err as Error).message);
    }
  };

  if (!enabled) return null;
  const mayUsage = access?.can('view-ai-usage') ?? false;

  return (
    <>
      {!open && (
        <button ref={opener} type="button" className="ai-fab" onClick={() => setOpen(true)} title="Ask IJF AI (Ctrl+K)" aria-haspopup="dialog">
          <SparklesIcon size={18} />
          <span className="ai-fab-label">Ask IJF AI</span>
        </button>
      )}

      {open && (
        <aside className="ai-panel" role="dialog" aria-label="IJF AI" aria-modal="false" onKeyDown={(e) => e.key === 'Escape' && !detail && close()}>
          <header className="ai-head">
            <span className="ai-mark" aria-hidden="true">
              <SparklesIcon size={16} />
            </span>
            <div className="ai-title">
              <strong>IJF AI</strong>
              <span>Answers from your dashboard&apos;s data</span>
            </div>
            <button type="button" className="icon-btn" onClick={newChat} title="New chat" aria-label="New chat">
              <PlusIcon size={16} />
            </button>
            <button type="button" className={`icon-btn ${screen === 'history' ? 'is-on' : ''}`} onClick={() => (screen === 'history' ? setScreen('chat') : showHistory())} title="Your chats" aria-label="Your chats" aria-pressed={screen === 'history'}>
              <HistoryIcon size={16} />
            </button>
            {mayUsage && (
              <button type="button" className={`icon-btn ${screen === 'usage' ? 'is-on' : ''}`} onClick={() => (screen === 'usage' ? setScreen('chat') : showUsage())} title="Usage (admins)" aria-label="Usage" aria-pressed={screen === 'usage'}>
                <ChartIcon size={16} />
              </button>
            )}
            <button type="button" className="icon-btn" onClick={close} title="Close (Esc)" aria-label="Close IJF AI">
              <CloseIcon size={16} />
            </button>
          </header>

          <div className="ai-body" ref={log}>
            {problem && (
              <p className="ai-problem" role="alert">
                <AlertIcon size={14} /> {problem}
              </p>
            )}

            {screen === 'history' ? (
              <History items={history} current={chatId} onOpen={openChat} onDelete={deleteChat} />
            ) : screen === 'usage' ? (
              <Usage usage={usage} />
            ) : messages.length === 0 ? (
              <Welcome path={path} briefing={briefing} reminders={reminders} onAsk={send} onLink={go} onRetryBriefing={() => setBriefing(null)} />
            ) : (
              <div className="ai-messages">
                {messages.map((m, i) =>
                  m.role === 'user' ? (
                    <div key={i} className="ai-msg user">
                      <p>{m.content}</p>
                    </div>
                  ) : (
                    <div key={i} className="ai-msg assistant">
                      {m.content && <ChatMarkdown text={m.content} onLink={(href) => go(href)} />}
                      {m.pending && (
                        <p className="ai-status" role="status">
                          <span className="ai-dots" aria-hidden="true">
                            <i />
                            <i />
                            <i />
                          </span>
                          {m.status ? `${m.status}…` : 'Writing…'}
                        </p>
                      )}
                      {m.cards.map((card, c) => (
                        <Card key={c} card={card} courses={courses} onOpenJob={openJob} onLink={go} />
                      ))}
                      {m.actions.map((a, n) => (
                        <ActionCard key={a.id ?? n} action={a} busy={deciding === a.id} onDecide={(d) => decide(i, a, d)} />
                      ))}
                      {m.error && (
                        <div className="ai-error" role="alert">
                          <AlertIcon size={14} />
                          <span>{m.error}</span>
                          {m.retry && i === messages.length - 1 && !busy && (
                            <button type="button" className="btn btn-sm" onClick={() => send(m.retry!)}>
                              Ask again
                            </button>
                          )}
                        </div>
                      )}
                      {!m.pending && m.id && m.content && (
                        <div className="ai-tools">
                          <button type="button" className={m.feedback === 'up' ? 'is-on' : ''} onClick={() => rate(i, m, 'up')} aria-label="Good answer" aria-pressed={m.feedback === 'up'} title="Good answer">
                            <ThumbUpIcon size={13} />
                          </button>
                          <button type="button" className={m.feedback === 'down' ? 'is-on' : ''} onClick={() => rate(i, m, 'down')} aria-label="Bad answer" aria-pressed={m.feedback === 'down'} title="Bad answer">
                            <ThumbDownIcon size={13} />
                          </button>
                          <CopyButton value={m.content} what="answer" />
                        </div>
                      )}
                    </div>
                  ),
                )}
              </div>
            )}
          </div>

          <form
            className="ai-composer"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <textarea
              ref={input}
              value={draft}
              rows={Math.min(5, Math.max(1, draft.split('\n').length))}
              placeholder="Ask about jobs, HR contacts or follow-ups…"
              aria-label="Ask IJF AI"
              maxLength={2000}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(draft);
                }
              }}
            />
            {busy ? (
              <button type="button" className="ai-send stop" onClick={() => stopper.current?.abort()} aria-label="Stop answering" title="Stop">
                <StopIcon size={15} />
              </button>
            ) : (
              <button type="submit" className="ai-send" disabled={!draft.trim()} aria-label="Send" title="Send (Enter)">
                <SendIcon size={15} />
              </button>
            )}
          </form>
          <p className="ai-foot">Numbers come from your dashboard. Phone numbers and emails never leave this server.</p>
          <span className="sr-only" role="status" aria-live="polite">
            {announce}
          </span>
        </aside>
      )}

      {detail && (
        <JobDetailsModal
          job={detail}
          courses={courses}
          onClose={() => setDetail(null)}
          onSaved={(job) => setDetail(job)}
          onOpenJob={(job) => setDetail(job)}
        />
      )}
    </>
  );
}

// ---------- the empty chat: briefing, what needs attention, questions to start with ----------

function Welcome({
  path,
  briefing,
  reminders,
  onAsk,
  onLink,
  onRetryBriefing,
}: {
  path: string;
  briefing: { text?: string; writing?: boolean; error?: string } | null;
  reminders: ChatReminder[] | null;
  onAsk: (q: string) => void;
  onLink: (href: string) => void;
  onRetryBriefing: () => void; // asks for the briefing again
}) {
  return (
    <div className="ai-welcome">
      <p className="ai-hello">Hi! Ask anything about the jobs, HR contacts, students and follow-ups, in English or Hinglish.</p>

      <section className="ai-section">
        <h3>Today&apos;s briefing</h3>
        {briefing?.text ? (
          <ChatMarkdown text={briefing.text} onLink={onLink} />
        ) : briefing?.error ? (
          <SectionError what="today's briefing" error={new Error(briefing.error)} onRetry={onRetryBriefing} />
        ) : (
          <div className="ai-skeleton" aria-busy="true" aria-label="Writing today's briefing">
            <span className="skeleton" />
            <span className="skeleton" />
            <span className="skeleton" />
          </div>
        )}
      </section>

      {reminders && reminders.length > 0 && (
        <section className="ai-section">
          <h3>Needs attention</h3>
          <ul className="ai-reminders">
            {reminders.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onAsk(r.ask)} title={`Ask: ${r.ask}`}>
                  <AlertIcon size={13} />
                  <span>{r.text}</span>
                  <ArrowRightIcon size={13} />
                </button>
                {r.href && (
                  <a
                    href={r.href}
                    onClick={(e) => {
                      e.preventDefault();
                      onLink(r.href!);
                    }}
                    title="Open the list"
                  >
                    Open
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="ai-section">
        <h3>Try asking</h3>
        <div className="ai-suggestions">
          {suggestionsFor(path).map((q) => (
            <button key={q} type="button" onClick={() => onAsk(q)}>
              {q}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

// ---------- cards beside an answer (real data: contacts included) ----------

function Card({ card, courses, onOpenJob, onLink }: { card: ChatCard; courses: Course[]; onOpenJob: (id: string, set: 'filtered' | 'nonfiltered') => void; onLink: (href: string, view?: 'filtered' | 'nonfiltered') => void }) {
  const courseName = (id: string) => courses.find((c) => c.id === id)?.name ?? id;
  if (card.type === 'jobs') {
    return (
      <div className="ai-card">
        <p className="ai-card-title">
          {formatNumber(card.total)} {card.total === 1 ? 'job' : 'jobs'}
          <span className="muted"> · {formatNumber(card.withHrDetails)} with HR details</span>
        </p>
        {card.items.length > 0 && (
          <ul className="ai-jobs">
            {card.items.map((j) => (
              <li key={j.id}>
                <span className="dot" style={{ background: COURSE_COLORS[j.course] }} aria-hidden="true" />
                <button type="button" onClick={() => onOpenJob(j.id, j.set)} title="Open this job">
                  <strong>{j.title}</strong>
                  <span className="muted">
                    {j.company}
                    {shownCities(j.cities).length ? ` · ${shownCities(j.cities).join(', ')}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {card.links.length > 0 && (
          <div className="ai-card-links">
            <span className="muted">Show in the job list:</span>
            {card.links.map((l) => (
              <button key={l.href} type="button" className="ai-link-btn" onClick={() => onLink(l.href, l.view)}>
                {l.label} <ArrowRightIcon size={12} />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (card.type === 'contacts') {
    return (
      <div className="ai-card">
        {card.jobs.map((j) => (
          <div key={j.id} className="ai-contact">
            <button type="button" className="ai-contact-job" onClick={() => onOpenJob(j.id, j.set)} title="Open this job">
              <strong>{j.company || 'Company not shown'}</strong>
              <span className="muted">
                {j.title} · {courseName(j.course)}
              </span>
            </button>
            {j.hrNames.length > 0 && (
              <p className="ai-contact-line">
                <UserIcon size={13} /> {j.hrNames.join(', ')}
              </p>
            )}
            {j.phones.map((p) => (
              <p key={p} className="ai-contact-line">
                <PhoneIcon size={13} /> <a href={`tel:${p.replace(/[^\d+]/g, '')}`}>{p}</a>
                <CopyButton value={p} what="phone number" />
                {j.fromPost.phone && <span className="cell-source">post</span>}
              </p>
            ))}
            {j.emails.map((e) => (
              <p key={e} className="ai-contact-line">
                <MailIcon size={13} /> <a href={`mailto:${e}`}>{e}</a>
                <CopyButton value={e} what="email" />
                {j.fromPost.email && <span className="cell-source">post</span>}
              </p>
            ))}
            {j.hrProfiles
              .filter((u) => /^https?:\/\//i.test(u))
              .map((u) => (
                <p key={u} className="ai-contact-line">
                  <LinkIcon size={13} />{' '}
                  <a href={u} target="_blank" rel="noopener noreferrer">
                    {u.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '')} <ExternalIcon size={11} />
                  </a>
                </p>
              ))}
            {!j.phones.length && !j.emails.length && !j.hrNames.length && <p className="muted">No HR contact stored yet.</p>}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="ai-card">
      <p className="ai-card-title">
        {formatNumber(card.total)} {card.total === 1 ? 'number or email' : 'numbers and emails'}
        {card.items.length < card.total && <span className="muted"> · first {card.items.length} shown</span>}
      </p>
      <ul className="ai-followups">
        {card.items.map((f) => (
          <li key={`${f.jobId}-${f.contact}`}>
            <span className="ai-followup-contact">
              {f.field === 'phone' ? <PhoneIcon size={12} /> : <MailIcon size={12} />}
              <a href={f.field === 'phone' ? `tel:${f.contact.replace(/[^\d+]/g, '')}` : `mailto:${f.contact}`}>{f.contact}</a>
            </span>
            <button type="button" className="ai-followup-job" onClick={() => onOpenJob(f.jobId, 'filtered')} title="Open this job">
              {f.company} · {f.job}
            </button>
            <span className="ai-followup-state">
              {f.student ? <span className="student-tag">{f.student}</span> : <span className="muted">No student</span>}
              {f.remark ? <span className="ai-remark">{f.remark}</span> : <span className="muted">No remark</span>}
            </span>
            <span className="muted ai-followup-by">
              by {f.addedBy} · {formatUpdated(f.addedAt)}
            </span>
          </li>
        ))}
      </ul>
      <button type="button" className="ai-link-btn" onClick={() => onLink('/performance?days=30&show=contacts')}>
        Open in the Performance report <ArrowRightIcon size={12} />
      </button>
    </div>
  );
}

// A change IJF AI proposed: nothing happens until Confirm.
function ActionCard({ action, busy, onDecide }: { action: ChatAction; busy: boolean; onDecide: (d: 'confirm' | 'cancel') => void }) {
  return (
    <div className={`ai-card ai-action status-${action.status}`}>
      <p className="ai-card-title">{action.type === 'set-follow-up' ? 'Record a follow-up' : 'Add HR details'}</p>
      <p className="ai-action-summary">{action.summary}</p>
      {action.status === 'pending' ? (
        <div className="ai-action-buttons">
          <button type="button" className="btn btn-sm" onClick={() => onDecide('cancel')} disabled={busy || !action.id}>
            Cancel
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => onDecide('confirm')} disabled={busy || !action.id}>
            {busy ? <span className="spinner" aria-hidden="true" /> : <CheckIcon size={13} />} {action.id ? 'Confirm' : 'Preparing…'}
          </button>
        </div>
      ) : (
        <p className={`ai-action-state ${action.status}`} role="status">
          {action.status === 'done' ? <CheckIcon size={13} /> : action.status === 'failed' ? <AlertIcon size={13} /> : null}
          {ACTION_STATUS[action.status]}
          {action.error ? `: ${action.error}` : ''}
        </p>
      )}
    </div>
  );
}

// ---------- the person's chats, and usage for admins ----------

function History({ items, current, onOpen, onDelete }: { items: ChatSummary[] | null; current?: string; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  if (!items) return <div className="ai-skeleton" aria-busy="true" aria-label="Loading your chats"><span className="skeleton" /><span className="skeleton" /></div>;
  if (!items.length) return <p className="muted ai-empty">No chats yet. Your questions and answers are kept here.</p>;
  return (
    <ul className="ai-history">
      {items.map((c) => (
        <li key={c.id} className={c.id === current ? 'is-current' : ''}>
          <button type="button" onClick={() => onOpen(c.id)}>
            <strong>{c.title}</strong>
            <span className="muted">{formatUpdated(c.updatedAt)}</span>
          </button>
          <button type="button" className="icon-btn" onClick={() => onDelete(c.id)} aria-label={`Delete chat: ${c.title}`} title="Delete">
            <CloseIcon size={13} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function Usage({ usage }: { usage: ChatUsage | null }): ReactNode {
  if (!usage) return <div className="ai-skeleton" aria-busy="true" aria-label="Loading usage"><span className="skeleton" /><span className="skeleton" /></div>;
  const total = usage.people.reduce((n, p) => n + p.questions, 0);
  return (
    <div className="ai-usage">
      <p className="muted">
        Since {formatDate(usage.since)} · model {usage.model} · {formatNumber(total)} questions · {formatNumber(usage.briefings.count)} daily briefings
      </p>
      <table>
        <thead>
          <tr>
            <th>Person</th>
            <th className="num">Questions</th>
            <th className="num">Tokens</th>
            <th className="num">
              <ThumbUpIcon size={12} /> / <ThumbDownIcon size={12} />
            </th>
          </tr>
        </thead>
        <tbody>
          {usage.people.map((p) => (
            <tr key={p.email}>
              <td>{p.email}</td>
              <td className="num">{formatNumber(p.questions)}</td>
              <td className="num">{formatNumber(p.promptTokens + p.completionTokens)}</td>
              <td className="num">
                {p.up} / {p.down}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Costs: see the OpenAI dashboard (Usage), where a monthly budget can be set.</p>
    </div>
  );
}
