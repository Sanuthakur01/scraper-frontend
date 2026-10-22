'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { apiUrl, useApi } from '@/lib/api';
import { ROLE_LABELS, roleFrom } from '@/lib/access';
import { COURSE_COLORS, dayHeading, formatDateTime, formatNumber, formatTime, istDayOf } from '@/lib/format';
import { signInHeader } from '@/lib/session';
import type { ActivityAction, ActivityChange, ActivityEntry, ActivityResponse, Course, Job, JobsResponse, Meta } from '@/lib/types';
import { HistoryIcon, LinkIcon, MailIcon, MessageIcon, NoteIcon, PhoneIcon, SearchIcon, SparklesIcon, UserIcon, UsersIcon } from './Icons';
import JobDetailsModal from './JobDetailsModal';
import { CardHeader, PageError, PageHeader, PageSkeleton, Segmented } from './PageParts';

const PAGE = 30; // changes loaded at a time

const FIELDS: Record<ActivityChange['field'], { label: string; icon: ReactNode }> = {
  hrName: { label: 'HR name', icon: <UserIcon size={13} /> },
  hrProfile: { label: 'HR profile', icon: <LinkIcon size={13} /> },
  phone: { label: 'Phone', icon: <PhoneIcon size={13} /> },
  email: { label: 'Email', icon: <MailIcon size={13} /> },
  assignedTo: { label: 'Assigned to', icon: <UsersIcon size={13} /> },
  remarks: { label: 'Notes', icon: <NoteIcon size={13} /> },
  // The performance report's follow-up of one number or email (named beside it).
  contactStudent: { label: 'Student', icon: <UserIcon size={13} /> },
  contactRemark: { label: 'Remark', icon: <MessageIcon size={13} /> },
};

const ACTION_LABELS: Record<ActivityAction, string> = { added: 'Added', edited: 'Edited', removed: 'Removed' };

// "Riya Sharma" -> "RS"; "riya@ijf.in" -> "R"
const initials = (name: string, email: string) =>
  (name.trim() ? name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]) : [email[0] ?? '?']).join('').toUpperCase();

// One field's change: values added (green +) and removed (red, struck out); a value only rewritten, or
// the notes, as before → after.
function ChangeValues({ change }: { change: ActivityChange }) {
  if (change.field !== 'remarks' && (change.added.length || change.removed.length)) {
    return (
      <span className="change-values">
        {change.added.map((v) => (
          <span key={`+${v}`} className="value-chip added">
            <span aria-hidden="true">+ </span>
            <span className="sr-only">added </span>
            {v}
          </span>
        ))}
        {change.removed.map((v) => (
          <span key={`-${v}`} className="value-chip removed">
            <span aria-hidden="true">− </span>
            <span className="sr-only">removed </span>
            <s>{v}</s>
          </span>
        ))}
      </span>
    );
  }
  const before = change.before.join(', ');
  const after = change.after.join(', ');
  return (
    <span className="change-values">
      {before && (
        <span className="value-text old" title={before}>
          <span className="sr-only">was </span>
          <s>{before}</s>
        </span>
      )}
      {before && after && (
        <span className="change-arrow" aria-hidden="true">
          →
        </span>
      )}
      {after && (
        <span className="value-text new" title={after}>
          <span className="sr-only">now </span>
          {after}
        </span>
      )}
    </span>
  );
}

// problem: why its job couldn't be opened (shown on the change itself, where it was clicked).
function Entry({ entry, courses, problem, onOpenJob }: { entry: ActivityEntry; courses: Course[]; problem: string; onOpenJob: (entry: ActivityEntry) => void }) {
  const { actor, job } = entry;
  const role = roleFrom({ role: actor.role ?? '' });
  const course = courses.find((c) => c.id === job.course);
  return (
    <li className="activity-item">
      <span className="activity-avatar" aria-hidden="true">
        {initials(actor.name ?? '', actor.email)}
      </span>
      <div className="activity-main">
        <p className="activity-who">
          <strong>{actor.name || actor.email}</strong>
          {actor.name && <span className="muted">{actor.email}</span>}
          {role && <span className="activity-role">{ROLE_LABELS[role]}</span>}
        </p>
        <p className="activity-what">
          <span className={`action-pill ${entry.action}`}>{ACTION_LABELS[entry.action]}</span>
          <span>{entry.changes.some((c) => c.contact) ? 'follow-up on' : 'HR details on'}</span>
          <button type="button" className="activity-job" onClick={() => onOpenJob(entry)} aria-haspopup="dialog" title="Open this job">
            {job.title || 'a job'}
          </button>
          {job.company && <span className="muted">at {job.company}</span>}
          {course && (
            <span className="job-course">
              <span className="dot" style={{ background: COURSE_COLORS[course.id] }} aria-hidden="true" />
              {course.name}
            </span>
          )}
          {job.set === 'nonfiltered' && <span className="badge-muted">Non-filtered</span>}
          {entry.via === 'ai' && (
            <span className="via-ai" title="Proposed by IJF AI and confirmed by this person">
              <SparklesIcon size={11} /> via IJF AI
            </span>
          )}
        </p>
        <ul className="activity-changes">
          {entry.changes.map((change) => (
            <li key={change.field}>
              <span className="change-field">
                {FIELDS[change.field].icon} {FIELDS[change.field].label}
                {change.contact && (
                  <span className="change-contact" title={`For ${change.contact.value}`}>
                    {change.contact.field === 'phone' ? <PhoneIcon size={11} /> : <MailIcon size={11} />}
                    {change.contact.value}
                  </span>
                )}
              </span>
              <span className={`change-kind ${change.change}`}>{change.change}</span>
              <ChangeValues change={change} />
            </li>
          ))}
        </ul>
        {problem && (
          <p className="activity-notice" role="status">
            {problem}
          </p>
        )}
      </div>
      <time className="activity-time" dateTime={entry.at} title={formatDateTime(entry.at)}>
        {formatTime(entry.at)}
      </time>
    </li>
  );
}

interface Filters {
  email: string;
  action: '' | ActivityAction;
  q: string;
}
const NO_FILTERS: Filters = { email: '', action: '', q: '' };

// The activity record: who added, changed or removed which job's HR details (phone numbers, emails,
// students, notes) and when, newest first, by day. Filters: person, kind of change, job or company.
// A job's title opens its details window. Only for signed-in people (the server checks).
export default function ActivityLog() {
  const meta = useApi<Meta>('meta');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [search, setSearch] = useState('');
  const [reload, setReload] = useState(0); // bumped after a save in a job's window: the record has a new change
  const first = useApi<ActivityResponse>('activity', { ...filters, limit: PAGE, r: reload || undefined }, { auth: true });
  // Pages loaded with "Show older", for the first page they follow.
  const [older, setOlder] = useState<{ base: ActivityResponse | null; items: ActivityEntry[]; next: string | null }>({ base: null, items: [], next: null });
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState('');
  const [people, setPeople] = useState<ActivityResponse['people']>([]);
  // A job opened from a change, or why it can't be.
  const [detail, setDetail] = useState<Job | null>(null);
  const [saved, setSaved] = useState<Record<string, Job>>({});
  const [opening, setOpening] = useState<{ id: string; problem: string } | null>(null);

  // Wait until typing pauses before searching.
  useEffect(() => {
    const timer = setTimeout(() => setFilters((f) => (f.q === search.trim() ? f : { ...f, q: search.trim() })), 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (first.data?.people) setPeople(first.data.people);
  }, [first.data]);

  if (meta.error) return <PageError title="Could not load the activity" error={meta.error} />;
  if (!meta.data) return <PageSkeleton />;

  const data = first.data;
  const extra = older.base === data ? older : { items: [], next: data?.next ?? null };
  const entries = [...(data?.items ?? []), ...extra.items];
  const next = older.base === data ? older.next : (data?.next ?? null);
  const filtered = Boolean(filters.email || filters.action || filters.q);
  const courses = meta.data.courses;

  const showOlder = async () => {
    if (!next || loadingOlder) return;
    setLoadingOlder(true);
    setOlderError('');
    try {
      const res = await fetch(apiUrl('activity', { ...filters, limit: PAGE, before: next }), { headers: await signInHeader() });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? `Could not load more (${res.status})`);
      const pageOf = body as ActivityResponse;
      setOlder((o) => ({ base: data, items: [...(o.base === data ? o.items : []), ...pageOf.items], next: pageOf.next }));
    } catch (err) {
      setOlderError((err as Error).message);
    } finally {
      setLoadingOlder(false);
    }
  };

  // Opens the job a change was made on (in the set it was in), if it is still stored.
  const openJob = async (entry: ActivityEntry) => {
    setOpening({ id: entry._id, problem: '' });
    try {
      const params = { id: entry.job.id, days: 1, view: entry.job.set === 'nonfiltered' ? 'nonfiltered' : undefined };
      const res = await fetch(apiUrl('jobs', params), { headers: await signInHeader() });
      const body = (await res.json().catch(() => null)) as JobsResponse | null;
      const job = body?.items?.[0];
      if (!res.ok || !job) {
        setOpening({ id: entry._id, problem: 'This job is no longer stored (jobs are kept for 90 days after they were last seen).' });
        return;
      }
      setOpening(null);
      setDetail(saved[job._id] ?? job);
    } catch {
      setOpening({ id: entry._id, problem: 'Could not reach the server. Check your connection and try again.' });
    }
  };

  // The changes, grouped by IST day.
  const days: { day: string; items: ActivityEntry[] }[] = [];
  for (const entry of entries) {
    const day = istDayOf(entry.at);
    if (days.at(-1)?.day === day) days.at(-1)?.items.push(entry);
    else days.push({ day, items: [entry] });
  }

  return (
    <main className="page">
      <PageHeader
        icon={<HistoryIcon size={20} />}
        eyebrow="Team"
        title="Activity"
        subtitle="Who added, changed or removed HR phone numbers, emails, students and notes, on which job, and when. Newest first."
      />

      <section className="card card-flush activity-card">
        <CardHeader
          icon={<HistoryIcon />}
          title={
            <>
              Changes {data?.total != null && <span className="count-badge">{formatNumber(data.total)}</span>}
            </>
          }
          description="Each change is recorded under the email of the person who made it, from their sign-in. Click a job to open it."
        />
        <div className="toolbar">
          <label className="search">
            <SearchIcon />
            <input
              type="search"
              placeholder="Search job or company"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search job or company"
            />
          </label>
          <select className="select" value={filters.email} onChange={(e) => setFilters((f) => ({ ...f, email: e.target.value }))} aria-label="Person">
            <option value="">Everyone</option>
            {(people ?? []).map((p) => (
              <option key={p.email} value={p.email}>
                {p.name ? `${p.name} (${p.email})` : p.email} · {formatNumber(p.count)}
              </option>
            ))}
          </select>
          <Segmented
            label="Kind of change"
            value={filters.action}
            onChange={(action) => setFilters((f) => ({ ...f, action }))}
            options={[
              { value: '', label: 'All' },
              { value: 'added', label: 'Added' },
              { value: 'edited', label: 'Edited' },
              { value: 'removed', label: 'Removed' },
            ]}
          />
          {filtered && (
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setFilters(NO_FILTERS);
                setSearch('');
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        {first.error ? (
          <p className="activity-empty" role="alert">
            {first.error.message}
          </p>
        ) : !data ? (
          <div className="activity-skeleton" aria-busy="true" aria-label="Loading changes">
            {[0, 1, 2].map((i) => (
              <span key={i} className="skeleton" />
            ))}
          </div>
        ) : !entries.length ? (
          <div className="activity-empty">
            <span className="auth-icon" aria-hidden="true">
              <HistoryIcon size={22} />
            </span>
            <p>
              <strong>{filtered ? 'No changes match these filters.' : 'No changes recorded yet.'}</strong>
            </p>
            {!filtered && (
              <p className="muted">When someone adds or changes a job&apos;s HR phone numbers, emails, students or notes, it shows up here with their email.</p>
            )}
          </div>
        ) : (
          <div className={`activity-days ${first.loading ? 'is-loading' : ''}`}>
            {days.map(({ day, items }) => (
              <section key={day} className="activity-day" aria-label={dayHeading(day)}>
                <h3 className="activity-day-title">{dayHeading(day)}</h3>
                <ol className="activity-list">
                  {items.map((entry) => (
                    <Entry key={entry._id} entry={entry} courses={courses} problem={opening?.id === entry._id ? opening.problem : ''} onOpenJob={openJob} />
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}

        {data && entries.length > 0 && (
          <div className="pager">
            <span>
              Showing {formatNumber(entries.length)}
              {data.total != null ? ` of ${formatNumber(data.total)}` : ''}
            </span>
            {olderError && <span className="field-error">{olderError}</span>}
            {next && (
              <button type="button" className="btn btn-sm" onClick={showOlder} disabled={loadingOlder}>
                {loadingOlder ? 'Loading…' : 'Show older'}
              </button>
            )}
          </div>
        )}
      </section>

      {detail && (
        <JobDetailsModal
          job={saved[detail._id] ?? detail}
          courses={courses}
          saved={saved}
          onClose={() => setDetail(null)}
          onSaved={(job) => {
            setSaved((rows) => ({ ...rows, [job._id]: job }));
            setReload((n) => n + 1);
          }}
          onOpenJob={(job) => setDetail(saved[job._id] ?? job)}
        />
      )}
    </main>
  );
}
