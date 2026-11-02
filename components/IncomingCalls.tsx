'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useState, type CSSProperties, type ReactNode } from 'react';
import { ApiError, apiUrl, sendJson, useApi } from '@/lib/api';
import { COURSE_COLORS, courseInitials, dayHeading, formatDate, formatNumber, formatTime, istDayOf, periodFrom, periodParams } from '@/lib/format';
import { ACTIVITY_PERIODS } from '@/lib/performance';
import { signInHeader } from '@/lib/session';
import type { CallOutcome, CourseId, IncomingCall, IncomingCallsResponse, Meta } from '@/lib/types';
import { useAccess } from './AuthGate';
import IncomingCallForm, { CALL_OUTCOMES, outcomeLabel, sourceLabel } from './IncomingCallForm';
import { BuildingIcon, CalendarIcon, CheckIcon, CloseIcon, PhoneIncomingIcon, SearchIcon } from './Icons';
import { CopyButton } from './JobDetailsModal';
import { CardHeader, FilterKpi, PageError, PageHeader, PageSkeleton, SectionError } from './PageParts';
import PeriodTabs from './PeriodTabs';

type Where = '' | 'in' | 'out'; // all, in our HR database, not in it
const ADMINS = ['ADMIN', 'SUPER_ADMIN'];
const companiesOf = (calls: IncomingCall[]) => new Set(calls.map((c) => c.companyKey)).size;

// A headline box that only counts.
function Kpi({ icon, name, value, note }: { icon: ReactNode; name: string; value: number | null; note: string }) {
  return (
    <div className="kpi">
      <div className="kpi-top">
        <span className="kpi-badge" aria-hidden="true">
          {icon}
        </span>
        <span className="kpi-name">{name}</span>
      </div>
      <p className="kpi-value">{value == null ? '—' : formatNumber(value)}</p>
      <p className="kpi-period">{note}</p>
    </div>
  );
}

// The Incoming calls page (/incoming-calls, from its box on Home and from Assign numbers): the HR calls to our
// students the team logged in the period (today by default), newest first. Boxes: how many calls, how many companies
// are in our HR database (their numbers come first on Assign numbers) and how many aren't (for the research team to
// add), interviews that came of them, and each course's calls; the database and course boxes filter the table, as do
// its chips and the search. A call's outcome can be set here as it becomes known; the person who logged a call, or
// an admin, can remove it. The period is in the address (?days=1, or ?from=&to=).
export default function IncomingCalls() {
  const router = useRouter();
  const period = periodFrom(useSearchParams(), ACTIVITY_PERIODS);
  const meta = useApi<Meta>('meta');
  const [reload, setReload] = useState(0);
  const state = useApi<IncomingCallsResponse>('incoming-calls', { ...periodParams(period), r: reload || undefined }, { auth: true });
  const access = useAccess();
  const mayLog = access?.can('record-outcomes') ?? false;
  const [logging, setLogging] = useState(false);
  const [course, setCourse] = useState<CourseId | ''>('');
  const [where, setWhere] = useState<Where>('');
  const [outcome, setOutcome] = useState<CallOutcome | 'none' | ''>('');
  const [search, setSearch] = useState('');
  // Changes made here since the list loaded: a call's new outcome, or null when it was removed.
  const [changed, setChanged] = useState<Record<string, { outcome: CallOutcome | '' } | null>>({});
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  if (meta.error) return <PageError title="Could not reach the server" error={meta.error} />;
  if (!meta.data) return <PageSkeleton />;
  const { courses } = meta.data;
  const data = state.data;
  const loading = !data;
  const items = (data?.items ?? []).filter((c) => changed[c.id] !== null).map((c) => (changed[c.id] ? { ...c, ...changed[c.id] } : c));
  const inPortal = items.filter((c) => c.inPortal);
  const outside = items.filter((c) => !c.inPortal);
  const query = search.trim().toLowerCase();
  const passes = (c: IncomingCall, except?: 'course' | 'where' | 'outcome') =>
    (except === 'course' || !course || c.course === course) &&
    (except === 'where' || !where || (where === 'in') === c.inPortal) &&
    (except === 'outcome' || !outcome || (outcome === 'none' ? !c.outcome : c.outcome === outcome));
  const shown = items
    .filter((c) => passes(c))
    .filter((c) => !query || [c.phone, c.hrName, c.email, c.company, c.student, c.job?.title ?? ''].some((t) => t.toLowerCase().includes(query)));
  const oneDay = data ? data.from === data.to : period.days === 1;
  const periodWords = period.key === '1' ? 'today' : 'in this period';
  const filtered = Boolean(query || course || where || outcome);
  const outcomesHere = CALL_OUTCOMES.filter((o) => o.id === outcome || items.some((c) => passes(c, 'outcome') && c.outcome === o.id));
  const mayRemove = (c: IncomingCall) =>
    mayLog && (ADMINS.includes(access?.role ?? '') || (c.createdBy?.email ?? '').toLowerCase() === (access?.email ?? '').toLowerCase());

  const setCallOutcome = async (call: IncomingCall, value: CallOutcome | '') => {
    const before = call.outcome;
    setChanged((c) => ({ ...c, [call.id]: { outcome: value } }));
    setProblems((p) => ({ ...p, [call.id]: '' }));
    try {
      await sendJson<IncomingCall>(`incoming-calls/${call.id}`, 'PUT', { outcome: value });
    } catch (err) {
      setChanged((c) => ({ ...c, [call.id]: { outcome: before } }));
      setProblems((p) => ({ ...p, [call.id]: err instanceof ApiError ? err.message : 'Could not save. Try again.' }));
    }
  };
  const remove = async (call: IncomingCall) => {
    setBusy(call.id);
    setProblems((p) => ({ ...p, [call.id]: '' }));
    try {
      const res = await fetch(apiUrl(`incoming-calls/${call.id}`), { method: 'DELETE', headers: await signInHeader() });
      if (!res.ok) throw new ApiError((await res.json().catch(() => null))?.error ?? `Could not remove it (error ${res.status}).`);
      setChanged((c) => ({ ...c, [call.id]: null }));
    } catch (err) {
      setProblems((p) => ({ ...p, [call.id]: err instanceof ApiError ? err.message : 'Could not reach the server. Try again.' }));
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  return (
    <main className="page calls-page">
      <PageHeader
        eyebrow={`Incoming calls · ${period.label}`}
        title="Incoming calls"
        subtitle="HR calls to our students, logged by the team. Companies in our HR database get their numbers first on Assign numbers."
        actions={
          <PeriodTabs
            period={period}
            periods={ACTIVITY_PERIODS}
            first={data?.since ? istDayOf(data.since) : null}
            last={istDayOf(new Date().toISOString())}
            data="changes"
            onChange={(q) => router.replace(`/incoming-calls?${q}`, { scroll: false })}
          />
        }
      >
        {mayLog && (
          <button type="button" className="btn btn-hot" onClick={() => setLogging(true)}>
            <PhoneIncomingIcon size={16} /> Log an incoming call
          </button>
        )}
        {data?.since && <span className="status-pill">Logged since {formatDate(data.since)}</span>}
      </PageHeader>

      {state.error ? (
        <SectionError what="the incoming calls" error={state.error} onRetry={state.reload} />
      ) : (
        <>
          <section className={`kpis kpis-4 calls-kpis ${state.loading ? 'is-loading' : ''}`} aria-label="Summary">
            <Kpi icon={<PhoneIncomingIcon size={16} />} name="Incoming calls" value={loading ? null : items.length} note={`Logged ${periodWords}`} />
            <FilterKpi
              name="In our HR database"
              icon={<CheckIcon size={16} />}
              value={loading ? null : companiesOf(inPortal)}
              note={`${inPortal.length === 1 ? '1 call' : `${formatNumber(inPortal.length)} calls`} · numbers first on Assign`}
              color="var(--good-text)"
              active={where === 'in'}
              onClick={() => setWhere(where === 'in' ? '' : 'in')}
            />
            <FilterKpi
              name="Not in our database"
              icon={<BuildingIcon size={16} />}
              value={loading ? null : companiesOf(outside)}
              note={`${outside.length === 1 ? '1 call' : `${formatNumber(outside.length)} calls`} · companies to add`}
              color="var(--warn-text)"
              active={where === 'out'}
              onClick={() => setWhere(where === 'out' ? '' : 'out')}
            />
            <Kpi
              icon={<CalendarIcon size={16} />}
              name="Interviews"
              value={loading ? null : items.filter((c) => c.outcome === 'interview').length}
              note="Scheduled from these calls"
            />
            {courses.map((c) => (
              <FilterKpi
                key={c.id}
                name={c.name}
                icon={courseInitials(c.name)}
                color={COURSE_COLORS[c.id]}
                value={loading ? null : items.filter((i) => i.course === c.id).length}
                note={`Calls ${periodWords}`}
                active={course === c.id}
                onClick={() => setCourse(course === c.id ? '' : c.id)}
              />
            ))}
          </section>

          <section className="card card-flush">
            <CardHeader
              icon={<PhoneIncomingIcon />}
              title={
                <>
                  Calls <span className="count-badge">{loading ? '—' : formatNumber(shown.length)}</span>
                </>
              }
              description={oneDay ? 'The latest first.' : 'The latest day first, each day the latest first.'}
            />
            {data?.truncated && <p className="note-warning perf-note">Only the latest {formatNumber(data.items.length)} calls are shown. Choose fewer days to see them all.</p>}
            <div className="toolbar iv-toolbar">
              <label className="search">
                <SearchIcon />
                <input
                  type="search"
                  placeholder="Search number, HR, company, student or opening"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search the calls"
                />
              </label>
              <div className="iv-filters">
                <div className="filter-chips" role="group" aria-label="Course">
                  <span className="iv-filter-label">Course</span>
                  <button type="button" className="filter-chip" aria-pressed={!course} onClick={() => setCourse('')}>
                    All <span className="chip-count">{formatNumber(items.filter((c) => passes(c, 'course')).length)}</span>
                  </button>
                  {courses
                    .filter((c) => course === c.id || items.some((i) => passes(i, 'course') && i.course === c.id))
                    .map((c) => (
                      <button key={c.id} type="button" className="filter-chip" aria-pressed={course === c.id} onClick={() => setCourse(course === c.id ? '' : c.id)}>
                        {c.name} <span className="chip-count">{formatNumber(items.filter((i) => passes(i, 'course') && i.course === c.id).length)}</span>
                      </button>
                    ))}
                </div>
                <div className="filter-chips" role="group" aria-label="HR database">
                  <span className="iv-filter-label">HR database</span>
                  {(
                    [
                      ['', 'All'],
                      ['in', 'In it'],
                      ['out', 'Not in it'],
                    ] as [Where, string][]
                  ).map(([id, label]) => (
                    <button key={id || 'all'} type="button" className="filter-chip" aria-pressed={where === id} onClick={() => setWhere(id)}>
                      {label}{' '}
                      <span className="chip-count">
                        {formatNumber(items.filter((c) => passes(c, 'where') && (!id || (id === 'in') === c.inPortal)).length)}
                      </span>
                    </button>
                  ))}
                </div>
                {items.some((c) => c.outcome) && (
                  <div className="filter-chips" role="group" aria-label="Outcome">
                    <span className="iv-filter-label">Outcome</span>
                    <button type="button" className="filter-chip" aria-pressed={!outcome} onClick={() => setOutcome('')}>
                      All
                    </button>
                    {outcomesHere.map((o) => (
                      <button key={o.id} type="button" className="filter-chip" aria-pressed={outcome === o.id} onClick={() => setOutcome(outcome === o.id ? '' : o.id)}>
                        {o.label} <span className="chip-count">{formatNumber(items.filter((c) => passes(c, 'outcome') && c.outcome === o.id).length)}</span>
                      </button>
                    ))}
                    <button type="button" className="filter-chip" aria-pressed={outcome === 'none'} onClick={() => setOutcome(outcome === 'none' ? '' : 'none')}>
                      Not said <span className="chip-count">{formatNumber(items.filter((c) => passes(c, 'outcome') && !c.outcome).length)}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {loading ? (
              <div className="company-jobs-loading cv-loading" aria-busy="true" aria-label="Loading the calls">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="skeleton" />
                ))}
              </div>
            ) : !shown.length ? (
              <div className="activity-empty">
                <span className="auth-icon" aria-hidden="true">
                  <PhoneIncomingIcon size={22} />
                </span>
                <p>
                  <strong>{filtered ? 'No call matches these filters.' : `No incoming calls logged ${periodWords}.`}</strong>
                </p>
                <p className="muted">
                  {filtered ? 'Clear a filter or the search.' : 'When an HR calls one of our students, log it here or on '}
                  {!filtered && <Link href="/assign?days=1">Assign numbers</Link>}
                  {!filtered && '.'}
                </p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table calls-table">
                  <thead>
                    <tr>
                      <th scope="col">Time</th>
                      <th scope="col">Company</th>
                      <th scope="col">HR</th>
                      <th scope="col">Course</th>
                      <th scope="col">Student</th>
                      <th scope="col">Found on</th>
                      <th scope="col">Outcome</th>
                      <th scope="col">Logged by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((call, index) => {
                      const c = courses.find((x) => x.id === call.course);
                      const day = istDayOf(call.at);
                      const newDay = !oneDay && day !== istDayOf(shown[index - 1]?.at ?? '1970-01-01');
                      return (
                        <Fragment key={call.id}>
                          {newDay && (
                            <tr className="iv-day">
                              <th scope="colgroup" colSpan={8}>
                                {dayHeading(day)} <span className="muted">· {formatNumber(shown.filter((x) => istDayOf(x.at) === day).length)}</span>
                              </th>
                            </tr>
                          )}
                          <tr>
                            <td className="nowrap">{formatTime(call.at)}</td>
                            <th scope="row" className="calls-company">
                              <span className="calls-company-name">{call.company}</span>
                              <span className={`calls-db ${call.inPortal ? 'in' : 'out'}`}>{call.inPortal ? 'In our HR database' : 'Not in our database'}</span>
                              {call.job && <span className="cv-sub">About: {call.job.title}</span>}
                              {call.number?.added && <span className="cv-sub">Number added to the opening</span>}
                              {call.number && !call.number.added && call.number.job && (
                                <span className="cv-sub">Number already on {call.number.job.title}</span>
                              )}
                              {call.note && <span className="cv-sub calls-note">“{call.note}”</span>}
                            </th>
                            <td>
                              <span className="cv-contact">
                                <span className="perf-value nowrap">{call.phone}</span>
                                <CopyButton value={call.phone} what="phone number" />
                              </span>
                              {call.hrName && <span className="cv-sub">{call.hrName}</span>}
                              {call.email && <span className="cv-sub">{call.email}</span>}
                            </td>
                            <td className="nowrap">
                              {c ? (
                                <span className="cv-course" style={{ '--course': COURSE_COLORS[c.id] } as CSSProperties}>
                                  <span className="dot" aria-hidden="true" />
                                  {c.name}
                                </span>
                              ) : (
                                <span className="muted">—</span>
                              )}
                            </td>
                            <td>{call.student || <span className="muted">Not said</span>}</td>
                            <td className="nowrap">{sourceLabel(call.source) || <span className="muted">—</span>}</td>
                            <td>
                              {mayLog ? (
                                <select
                                  className={`select calls-outcome ${call.outcome ? `is-${call.outcome}` : 'is-empty'}`}
                                  value={call.outcome}
                                  onChange={(e) => setCallOutcome(call, e.target.value as CallOutcome | '')}
                                  aria-label={`Outcome of the call from ${call.company}`}
                                >
                                  <option value="">Not said yet</option>
                                  {CALL_OUTCOMES.map((o) => (
                                    <option key={o.id} value={o.id}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                outcomeLabel(call.outcome) || <span className="muted">Not said</span>
                              )}
                              {problems[call.id] && (
                                <span className="field-error" role="alert">
                                  {problems[call.id]}
                                </span>
                              )}
                            </td>
                            <td>
                              <span className="calls-by">
                                <span>{call.createdBy?.name || call.createdBy?.email || '—'}</span>
                                {mayRemove(call) &&
                                  (confirming === call.id ? (
                                    <span className="calls-remove-confirm">
                                      <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(call)} disabled={busy === call.id}>
                                        {busy === call.id ? 'Removing…' : 'Remove'}
                                      </button>
                                      <button type="button" className="btn btn-sm" onClick={() => setConfirming(null)} disabled={busy === call.id}>
                                        Keep
                                      </button>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      className="icon-btn calls-remove"
                                      onClick={() => setConfirming(call.id)}
                                      aria-label={`Remove the call from ${call.company}`}
                                      title="Remove this call (logged by mistake)"
                                    >
                                      <CloseIcon size={14} />
                                    </button>
                                  ))}
                              </span>
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {logging && (
        <IncomingCallForm courses={courses} students={data?.students ?? []} onClose={() => setLogging(false)} onSaved={() => setReload((n) => n + 1)} />
      )}
    </main>
  );
}
