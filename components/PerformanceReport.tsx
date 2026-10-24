'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ApiError, apiUrl, sendJson, useApi } from '@/lib/api';
import { ROLE_LABELS, roleFrom } from '@/lib/access';
import { COURSE_COLORS, formatDate, formatDateTime, formatNumber, formatUpdated, istDayOf, percent, periodFrom, periodParams, type Period } from '@/lib/format';
import { ACTIVITY_PERIODS, allIds, buildTree, countsOf, outcomeKey, performanceCsv, REMARKS, type PerfNode } from '@/lib/performance';
import { signInHeader } from '@/lib/session';
import type { ContactOutcome, Job, JobsResponse, Meta, PerformanceResponse, PerformanceRow, RemarkStatus } from '@/lib/types';
import { useAccess } from './AuthGate';
import { OutcomeText, RemarkField, SaveMark, StudentField, type OutcomePatch, type SaveState } from './FollowUpControls';
import { BriefcaseIcon, BuildingIcon, ChartIcon, CheckIcon, ChevronRightIcon, DownloadIcon, ExternalIcon, ListIcon, MailIcon, PhoneIcon, SearchIcon, UsersIcon } from './Icons';
import JobDetailsModal, { CopyButton } from './JobDetailsModal';
import { CardHeader, PageError, PageHeader, PageSkeleton, SectionError, Segmented } from './PageParts';
import PeriodTabs from './PeriodTabs';

// "Riya Sharma" -> "RS"; "riya@ijf.in" -> "R"
const initials = (name: string, email: string) =>
  (name.trim() && name !== email ? name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]) : [email[0] ?? '?']).join('').toUpperCase();

// "today", "in the last 7 days", "on 9–12 Oct"
const periodWords = (p: Period) => (p.from ? `on ${p.label}` : p.days === 1 ? 'today' : `in the ${p.label.toLowerCase()}`);

const NEXT_LEVEL = { person: 'courses', course: 'companies', company: 'jobs', job: 'numbers and emails' } as const;

// The "All contacts" list's filters: everything, what still needs doing, or one remark.
type Filter = 'all' | 'no-remark' | 'unassigned' | RemarkStatus;
const matches = (row: PerformanceRow, filter: Filter) =>
  filter === 'all' ? true : filter === 'no-remark' ? !row.outcome?.status : filter === 'unassigned' ? !row.outcome?.student : row.outcome?.status === filter;
const filterName = (filter: Filter) =>
  filter === 'all' ? 'All' : filter === 'no-remark' ? 'No remark yet' : filter === 'unassigned' ? 'Not assigned' : (REMARKS.find((r) => r.id === filter)?.label ?? filter);
// What the list's search looks in: the number/email, company, job, student and who added it.
const searchText = (row: PerformanceRow) =>
  [row.value, row.job.company, row.job.title, row.outcome?.student, row.outcome?.note, row.actor.name, row.actor.email].join(' ').toLowerCase();

const EMPTY_OUTCOME: ContactOutcome = { student: '', status: '', note: '', updatedAt: null, updatedBy: null };

// Up to this width the follow-up goes under each number/email instead of in two columns of its own.
function useNarrow(query = '(max-width: 1023px)') {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setNarrow(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return narrow;
}

// One row of the drill-down: a person, a course, a company or a job, with its counts. Its toggle shows
// the level below; a job shows each number and email added to it (the final grain).
function NodeLabel({ node }: { node: PerfNode }) {
  if (node.level === 'person' && node.person) {
    const role = roleFrom({ role: node.person.role ?? '' });
    return (
      <>
        <span className="activity-avatar perf-avatar" aria-hidden="true">
          {initials(node.person.name, node.person.email)}
        </span>
        <span className="perf-person">
          <strong>{node.label}</strong>
          {node.label !== node.person.email && <span className="muted perf-email">{node.person.email}</span>}
        </span>
        {role && <span className="activity-role">{ROLE_LABELS[role]}</span>}
      </>
    );
  }
  if (node.level === 'course') {
    return (
      <span className="perf-course" style={{ '--course': node.course ? COURSE_COLORS[node.course] : 'var(--border-strong)' } as CSSProperties}>
        <span className="dot" aria-hidden="true" />
        {node.label}
      </span>
    );
  }
  if (node.level === 'company') {
    return (
      <span className="perf-company">
        <BuildingIcon size={14} />
        {node.label}
      </span>
    );
  }
  return (
    <span className="perf-job">
      <BriefcaseIcon size={14} />
      <span>{node.label}</span>
      {node.job?.set === 'nonfiltered' && <span className="badge-muted">Non-filtered</span>}
    </span>
  );
}

interface Opening {
  id: string;
  problem: string;
}

// The performance report: who added how many HR phone numbers and emails (a drill-down, person →
// course → company → job → each number and email), and their follow-up by the calling team: the student
// each number/email was given to and how it went, edited in place (each choice saves at once). "All
// contacts" lists every number and email once, to work through without opening any level.
export default function PerformanceReport() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const period = periodFrom(searchParams, ACTIVITY_PERIODS);
  const meta = useApi<Meta>('meta');
  const [reload, setReload] = useState(0); // bumped after a save in a job's window: the counts may change
  const perf = useApi<PerformanceResponse>('performance', { ...periodParams(period), r: reload || undefined }, { auth: true });
  const mayRecord = useAccess()?.can('record-outcomes') ?? false;
  const studentsId = useId();
  const narrow = useNarrow();
  // ?show=contacts&filter=no-remark (a link from IJF AI's reminders) opens "All contacts" with that filter.
  const linkedShow = searchParams.get('show') === 'contacts' ? 'contacts' : null;
  const linkedFilter = searchParams.get('filter') ?? '';
  const [view, setView] = useState<'people' | 'contacts'>(linkedShow ?? 'people');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>((linkedFilter as Filter) || 'all');
  useEffect(() => {
    if (linkedShow) setView(linkedShow);
    if (linkedFilter) setFilter(linkedFilter as Filter);
  }, [linkedShow, linkedFilter]);
  const [search, setSearch] = useState('');
  const [course, setCourse] = useState(''); // "All contacts": one course's numbers/emails ('' = all)
  // A job opened from its row, or why it couldn't be.
  const [detail, setDetail] = useState<Job | null>(null);
  const [saved, setSaved] = useState<Record<string, Job>>({});
  const [opening, setOpening] = useState<Opening | null>(null);

  // Follow-ups changed here since the report loaded (shown at once, before the server answers), and how
  // each save is going. Saves of one number/email go one after another, in the order they were made.
  const data = perf.data;
  const [changed, setChanged] = useState<{ base: PerformanceResponse | null; map: Record<string, ContactOutcome | null> }>({ base: null, map: {} });
  const [saves, setSaves] = useState<Record<string, SaveState>>({});
  const [addedStudents, setAddedStudents] = useState<string[]>([]);
  const queue = useRef<Record<string, Promise<void>>>({});
  const pending = useRef<Record<string, number>>({});

  const local = changed.base === data ? changed.map : null;
  const rows = useMemo(
    () => (data?.rows ?? []).map((row) => (local && outcomeKey(row) in local ? { ...row, outcome: local[outcomeKey(row)] } : row)),
    [data, local],
  );
  const tree = useMemo(() => buildTree(rows, (id) => meta.data?.courses.find((c) => c.id === id)?.name ?? id), [rows, meta.data]);
  // Every number and email once (the newest time it was added), for "All contacts".
  const contacts = useMemo(() => {
    const seen = new Map<string, PerformanceRow>();
    for (const row of rows) if (!seen.has(outcomeKey(row))) seen.set(outcomeKey(row), row);
    return [...seen.values()];
  }, [rows]);
  const students = useMemo(
    () => [...new Set([...(data?.students ?? []), ...addedStudents])].sort((a, b) => a.localeCompare(b)),
    [data, addedStudents],
  );

  // Which contacts the list shows is worked out when the course, the filter, the search or the data
  // changes, not when a follow-up is saved: a number given a remark under "No remark yet" stays in view
  // until then.
  const inCourse = (row: PerformanceRow) => !course || row.job.course === course;
  const [shown, setShown] = useState<{ course: string; filter: Filter; search: string; data: PerformanceResponse | null; keys: Set<string> } | null>(null);
  let listKeys = shown?.keys ?? new Set<string>();
  if (!shown || shown.course !== course || shown.filter !== filter || shown.search !== search || shown.data !== data) {
    const words = search.trim().toLowerCase();
    listKeys = new Set(contacts.filter((row) => inCourse(row) && matches(row, filter) && (!words || searchText(row).includes(words))).map(outcomeKey));
    setShown({ course, filter, search, data, keys: listKeys });
  }

  if (meta.error) return <PageError title="Could not load the performance report" error={meta.error} />;
  if (!meta.data) return <PageSkeleton />;

  const courses = meta.data.courses;
  const courseName = (id: string) => courses.find((c) => c.id === id)?.name ?? id;
  const totals = countsOf(rows);
  const top = Math.max(1, ...tree.map((p) => p.total));
  const since = data?.since ?? null;
  const today = istDayOf(new Date().toISOString());
  const startsBeforeTracking = since && data && data.from < istDayOf(since);
  const listed = contacts.filter((row) => listKeys.has(outcomeKey(row)));
  const filters: Filter[] = ['all', 'no-remark', 'unassigned', ...REMARKS.map((r) => r.id)];
  // The chips count within the chosen course.
  const countOf = (f: Filter) => contacts.filter((row) => inCourse(row) && matches(row, f)).length;
  const inCourseCount = (id: string) => contacts.filter((row) => row.job.course === id).length;

  const toggle = (id: string) =>
    setOpen((ids) => {
      const next = new Set(ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const download = () => {
    const blob = new Blob([performanceCsv(rows, courseName)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `performance-${data?.from}${data && data.to !== data.from ? `-to-${data.to}` : ''}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Saves one change to a number/email's follow-up: shown at once, sent in order, put back if refused.
  const saveOutcome = (row: PerformanceRow, patch: OutcomePatch) => {
    if (!data) return;
    const key = outcomeKey(row);
    const before = row.outcome;
    const next: ContactOutcome = { ...(before ?? EMPTY_OUTCOME), ...patch, ...('status' in patch && patch.status !== 'other' ? { note: '' } : {}) };
    const put = (outcome: ContactOutcome | null) =>
      setChanged((c) => ({ base: data, map: { ...(c.base === data ? c.map : {}), [key]: outcome } }));
    put(next.student || next.status ? next : null);
    setSaves((s) => ({ ...s, [key]: { state: 'saving' } }));
    pending.current[key] = (pending.current[key] ?? 0) + 1;
    const send = async () => {
      try {
        const answer = await sendJson<{ outcome: ContactOutcome | null }>('outcomes', 'PUT', { job: row.job.id, field: row.field, value: row.value, ...patch });
        if (pending.current[key] === 1) put(answer.outcome); // the newest save: the server's answer is what is stored
        if ('student' in patch && patch.student) setAddedStudents((names) => (names.includes(patch.student) ? names : [...names, patch.student]));
        setSaves((s) => ({ ...s, [key]: { state: 'saved' } }));
        setTimeout(() => setSaves((s) => (s[key]?.state === 'saved' ? { ...s, [key]: undefined as unknown as SaveState } : s)), 2500);
      } catch (err) {
        put(before);
        const message = err instanceof ApiError || err instanceof Error ? err.message : 'Not saved';
        setSaves((s) => ({ ...s, [key]: { state: 'error', message: `Not saved: ${message}` } }));
      } finally {
        pending.current[key] -= 1;
      }
    };
    queue.current[key] = (queue.current[key] ?? Promise.resolve()).then(send);
  };

  // The follow-up controls of one number/email (or what it says, for a role that can't change it).
  const studentOf = (row: PerformanceRow) =>
    mayRecord ? (
      <StudentField value={row.outcome?.student ?? ''} label={row.value} listId={studentsId} onSave={(student) => saveOutcome(row, { student })} />
    ) : (
      <span>{row.outcome?.student || <span className="muted">—</span>}</span>
    );
  const remarkOf = (row: PerformanceRow) =>
    mayRecord ? (
      <span className="remark-cell">
        <RemarkField field={row.field} status={row.outcome?.status ?? ''} note={row.outcome?.note ?? ''} label={row.value} onSave={(p) => saveOutcome(row, p)} />
        <SaveMark save={saves[outcomeKey(row)]} />
      </span>
    ) : (
      <OutcomeText outcome={row.outcome ? { ...row.outcome, student: '' } : null} field={row.field} />
    );

  // Opens a job (in the set it was in), if it is still stored.
  const openJob = async (id: string, ref: PerformanceRow['job']) => {
    setOpening({ id, problem: '' });
    try {
      const params = { id: ref.id, days: 1, view: ref.set === 'nonfiltered' ? 'nonfiltered' : undefined };
      const res = await fetch(apiUrl('jobs', params), { headers: await signInHeader() });
      const body = (await res.json().catch(() => null)) as JobsResponse | null;
      const job = body?.items?.[0];
      if (!res.ok || !job) {
        setOpening({ id, problem: 'This job is no longer stored (jobs are kept for 90 days after they were last seen).' });
        return;
      }
      setOpening(null);
      setDetail(saved[job._id] ?? job);
    } catch {
      setOpening({ id, problem: 'Could not reach the server. Check your connection and try again.' });
    }
  };

  // "2 of 3": how many of a level's numbers/emails have a student / a remark.
  const progress = (done: number, total: number) => (
    <span className={`perf-progress ${done === total ? 'done' : ''}`}>
      {done === total ? <CheckIcon size={12} /> : null}
      {formatNumber(done)} of {formatNumber(total)}
    </span>
  );

  const renderNode = (node: PerfNode): ReactNode => {
    const isOpen = open.has(node.id);
    const depth = { '--depth': node.depth } as CSSProperties;
    return (
      <Fragment key={node.id}>
        <tr className={`perf-row level-${node.level} ${isOpen ? 'is-open' : ''}`}>
          <th scope="row">
            <div className="perf-name" style={depth}>
              <button
                type="button"
                className="perf-toggle"
                aria-expanded={isOpen}
                onClick={() => toggle(node.id)}
                title={`${isOpen ? 'Hide' : 'Show'} the ${NEXT_LEVEL[node.level]}`}
              >
                <ChevronRightIcon size={15} className="perf-chevron" />
                <NodeLabel node={node} />
              </button>
              {node.level === 'job' && node.job && (
                <button type="button" className="perf-open" onClick={() => node.job && openJob(node.id, node.job)} aria-haspopup="dialog" title="Open this job">
                  <ExternalIcon size={13} />
                  <span className="sr-only">Open {node.label}</span>
                </button>
              )}
            </div>
            {opening?.id === node.id && opening.problem && (
              <p className="field-error perf-problem" style={depth} role="status">
                {opening.problem}
              </p>
            )}
          </th>
          <td className="num hide-sm">{formatNumber(node.phones)}</td>
          <td className="num hide-sm">{formatNumber(node.emails)}</td>
          <td className="num">
            {node.level === 'person' ? (
              <span className="cell-bar">
                <span className="cell-bar-track" aria-hidden="true">
                  <span className="cell-bar-fill" style={{ width: `${(node.total / top) * 100}%` }} />
                </span>
                <span className="big-num">{formatNumber(node.total)}</span>
              </span>
            ) : (
              <span className="strong">{formatNumber(node.total)}</span>
            )}
          </td>
          <td className="num">{formatNumber(node.jobs)}</td>
          {!narrow && (
            <>
              <td>{progress(node.assigned, node.total)}</td>
              <td>{progress(node.remarked, node.total)}</td>
            </>
          )}
        </tr>
        {isOpen && node.children.map(renderNode)}
        {isOpen &&
          node.level === 'job' &&
          node.rows.map((row) => (
            <tr key={`${row.record}-${row.field}-${row.value}`} className="perf-leaf">
              <td colSpan={5}>
                <div className="perf-name" style={{ '--depth': node.depth + 1 } as CSSProperties}>
                  <span className={`perf-kind ${row.field}`}>
                    {row.field === 'phone' ? <PhoneIcon size={13} /> : <MailIcon size={13} />}
                    {row.field === 'phone' ? 'Phone' : 'Email'}
                  </span>
                  <span className="perf-value">{row.value}</span>
                  <time className="muted perf-time" dateTime={row.at} title={formatDateTime(row.at)}>
                    added {formatUpdated(row.at)}
                  </time>
                </div>
                {narrow && (
                  <div className="leaf-followup" style={{ '--depth': node.depth + 1 } as CSSProperties}>
                    {studentOf(row)}
                    {remarkOf(row)}
                  </div>
                )}
              </td>
              {!narrow && (
                <>
                  <td className="followup-cell">{studentOf(row)}</td>
                  <td className="followup-cell">{remarkOf(row)}</td>
                </>
              )}
            </tr>
          ))}
      </Fragment>
    );
  };

  return (
    <main className="page">
      <PageHeader
        eyebrow={`Team · ${period.label}`}
        title="Performance report"
        subtitle="How many HR phone numbers and emails each person added, and where; and for each one, the student it was given to and how it went."
        actions={
          <PeriodTabs
            period={period}
            periods={ACTIVITY_PERIODS}
            first={since ? istDayOf(since) : null}
            last={today}
            data="changes"
            onChange={(query) => router.replace(`/performance?${query}`, { scroll: false })}
          />
        }
      >
        {since && <span className="status-pill">Counted since {formatDate(since)}, when the activity record began</span>}
      </PageHeader>

      <section className={`kpis kpis-4 ${perf.loading ? 'is-loading' : ''}`} aria-label="Contact details added">
        {[
          { icon: <UsersIcon size={16} />, name: 'Contact details added', value: totals.total, note: period.title },
          { icon: <PhoneIcon size={16} />, name: 'Phone numbers', value: totals.phones, note: `${percent(totals.phones, totals.total)} of them` },
          { icon: <MailIcon size={16} />, name: 'Emails', value: totals.emails, note: `${percent(totals.emails, totals.total)} of them` },
          { icon: <BriefcaseIcon size={16} />, name: 'Jobs', value: totals.jobs, note: `with new details, by ${formatNumber(tree.length)} ${tree.length === 1 ? 'person' : 'people'}` },
        ].map((card) => (
          <div className="kpi" key={card.name}>
            <div className="kpi-top">
              <span className="kpi-badge" aria-hidden="true">
                {card.icon}
              </span>
              <span className="kpi-name">{card.name}</span>
            </div>
            <p className="kpi-value">{data ? formatNumber(card.value) : '—'}</p>
            <p className="kpi-period">{card.note}</p>
          </div>
        ))}
      </section>

      <section className="card card-flush perf-card">
        <CardHeader
          icon={view === 'people' ? <ChartIcon /> : <ListIcon />}
          title={
            <>
              {view === 'people' ? 'Who added what' : 'All contacts'}{' '}
              {data && <span className="count-badge">{formatNumber(view === 'people' ? tree.length : contacts.length)}</span>}
            </>
          }
          description={
            view === 'people'
              ? "Most first. Each number and email counts once; one already in the job post doesn't count."
              : 'Every number and email once, newest first. Assign a student and pick a remark: each saves by itself.'
          }
          actions={
            rows.length > 0 && (
              <div className="perf-actions">
                <Segmented
                  label="Show"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'people', label: 'By person' },
                    { value: 'contacts', label: 'All contacts' },
                  ]}
                />
                {view === 'people' && (
                  <>
                    <button type="button" className="btn btn-sm" onClick={() => setOpen(new Set(allIds(tree)))}>
                      Expand all
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => setOpen(new Set())} disabled={!open.size}>
                      Collapse all
                    </button>
                  </>
                )}
                <button type="button" className="btn btn-sm" onClick={download}>
                  <DownloadIcon /> Download CSV
                </button>
              </div>
            )
          }
        />

        {data?.truncated && <p className="note-warning perf-note">Only the newest {formatNumber(rows.length)} are counted. Choose fewer days to see them all.</p>}
        <datalist id={studentsId}>
          {students.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        {perf.error ? (
          <SectionError what="the report" error={perf.error} onRetry={perf.reload} />
        ) : !data ? (
          <div className="activity-skeleton" aria-busy="true" aria-label="Loading the report">
            {[0, 1, 2].map((i) => (
              <span key={i} className="skeleton" />
            ))}
          </div>
        ) : !rows.length ? (
          <div className="activity-empty">
            <span className="auth-icon" aria-hidden="true">
              <ChartIcon size={22} />
            </span>
            <p>
              <strong>{since ? `No HR phone numbers or emails were added ${periodWords(period)}.` : 'Nothing recorded yet.'}</strong>
            </p>
            <p className="muted">
              {since
                ? startsBeforeTracking
                  ? `Counting began on ${formatDate(since)}; work before that wasn't recorded.`
                  : 'Try a longer period.'
                : 'Counting starts with the first HR phone number or email someone adds after signing in.'}
            </p>
          </div>
        ) : view === 'people' ? (
          <div className={`table-wrap ${perf.loading ? 'is-loading' : ''}`}>
            <table className={`data-table perf-table ${narrow ? '' : 'with-followup'}`}>
              <thead>
                <tr>
                  <th scope="col">Person, then course, company and job</th>
                  <th scope="col" className="num hide-sm">
                    Phones
                  </th>
                  <th scope="col" className="num hide-sm">
                    Emails
                  </th>
                  <th scope="col" className="num">
                    Total
                  </th>
                  <th scope="col" className="num">
                    Jobs
                  </th>
                  {!narrow && (
                    <>
                      <th scope="col">Assigned to</th>
                      <th scope="col">Remark</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>{tree.map(renderNode)}</tbody>
              <tfoot>
                <tr>
                  <th scope="row">All</th>
                  <td className="num hide-sm">{formatNumber(totals.phones)}</td>
                  <td className="num hide-sm">{formatNumber(totals.emails)}</td>
                  <td className="num">{formatNumber(totals.total)}</td>
                  <td className="num">{formatNumber(totals.jobs)}</td>
                  {!narrow && (
                    <>
                      <td>{progress(totals.assigned, totals.total)}</td>
                      <td>{progress(totals.remarked, totals.total)}</td>
                    </>
                  )}
                </tr>
              </tfoot>
            </table>
            {startsBeforeTracking && <p className="perf-footnote muted">Counting began on {formatDate(since)}; work before that wasn&apos;t recorded.</p>}
          </div>
        ) : (
          <div className={`contacts-view ${perf.loading ? 'is-loading' : ''}`}>
            <div className="toolbar contacts-toolbar">
              <label className="search">
                <SearchIcon />
                <input
                  type="search"
                  placeholder="Search number, company, job or student"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search number, email, company, job or student"
                />
              </label>
              <select className="select course-select" value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Course">
                <option value="">All courses · {formatNumber(contacts.length)}</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {formatNumber(inCourseCount(c.id))}
                  </option>
                ))}
              </select>
              <div className="filter-chips" role="group" aria-label="Show contacts">
                {filters
                  .filter((f) => f === 'all' || f === 'no-remark' || f === 'unassigned' || countOf(f) > 0)
                  .map((f) => (
                    <button key={f} type="button" className={`filter-chip ${f}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                      {filterName(f)} <span className="chip-count">{formatNumber(countOf(f))}</span>
                    </button>
                  ))}
              </div>
            </div>
            {listed.length ? (
              <ul className="contact-list">
                <li className="contact-item contact-head" aria-hidden="true">
                  <span>Number / email</span>
                  <span>Company and job</span>
                  <span>Added</span>
                  <span>Assigned to</span>
                  <span>Remark</span>
                </li>
                {listed.map((row) => {
                  const key = outcomeKey(row);
                  const course = courses.find((c) => c.id === row.job.course);
                  return (
                    <li key={key} className="contact-item">
                      <span className="ci-contact">
                        <span className={`perf-kind ${row.field}`}>
                          {row.field === 'phone' ? <PhoneIcon size={13} /> : <MailIcon size={13} />}
                          <span className="sr-only">{row.field === 'phone' ? 'Phone' : 'Email'}</span>
                        </span>
                        <span className="perf-value">{row.value}</span>
                        <CopyButton value={row.value} what={row.field === 'phone' ? 'phone number' : 'email'} />
                      </span>
                      <span className="ci-job">
                        <button type="button" className="ci-job-open" onClick={() => openJob(key, row.job)} aria-haspopup="dialog" title="Open this job">
                          <strong>{row.job.company || 'Company not shown'}</strong>
                          <span>{row.job.title}</span>
                        </button>
                        <span className="ci-tags">
                          {course && (
                            <span className="ci-course">
                              <span className="dot" style={{ background: COURSE_COLORS[course.id] }} aria-hidden="true" />
                              {course.name}
                            </span>
                          )}
                          {row.job.set === 'nonfiltered' && <span className="badge-muted">Non-filtered</span>}
                        </span>
                        {opening?.id === key && opening.problem && (
                          <span className="field-error" role="status">
                            {opening.problem}
                          </span>
                        )}
                      </span>
                      <span className="ci-added muted">
                        by {row.actor.name || row.actor.email}
                        <br />
                        <time dateTime={row.at} title={formatDateTime(row.at)}>
                          {formatUpdated(row.at)}
                        </time>
                      </span>
                      <span className="ci-student">{studentOf(row)}</span>
                      <span className="ci-remark">{remarkOf(row)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="activity-empty">
                <p>
                  <strong>Nothing here.</strong>
                </p>
                <p className="muted">
                  No number or email {course ? `for ${courseName(course)} ` : ''}matches {search.trim() ? 'this search' : `"${filterName(filter)}"`}. Pick another
                  course or filter, or clear the search.
                </p>
              </div>
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
            setSaved((jobs) => ({ ...jobs, [job._id]: job }));
            setReload((n) => n + 1);
          }}
          onOpenJob={(job) => setDetail(saved[job._id] ?? job)}
        />
      )}
    </main>
  );
}
