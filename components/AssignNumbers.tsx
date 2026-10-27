'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import { useApi } from '@/lib/api';
import { formatDate, formatNumber, istDayOf, periodFrom, periodParams, periodQuery, type Period } from '@/lib/format';
import { ACTIVITY_PERIODS, hasStudent, outcomeKey } from '@/lib/performance';
import type { Meta, PerformanceResponse, PerformanceRow } from '@/lib/types';
import { useFollowUps } from '@/lib/useFollowUps';
import { useAccess } from './AuthGate';
import ContactList, { SelectionBar, useJobWindow } from './ContactList';
import { FollowUps } from './FollowUpControls';
import { CheckIcon, ChevronLeftIcon, PhoneIcon, SearchIcon } from './Icons';
import { CardHeader, PageError, PageHeader, PageSkeleton, SectionError, Segmented } from './PageParts';
import PeriodTabs from './PeriodTabs';
import RetryCalls from './RetryCalls';

const PAGE = 100; // numbers shown at a time
type Kind = 'all' | 'phone' | 'email';

// "today", "in the last 7 days", "on 9–12 Oct"
const periodWords = (p: Period) => (p.from ? `on ${p.label}` : p.days === 1 ? 'today' : `in the ${p.label.toLowerCase()}`);
const plural = (n: number, one: string, many = `${one}s`) => `${formatNumber(n)} ${n === 1 ? one : many}`;

// The Assign numbers page (opened from the Review board): the HR numbers and emails the team added in the period
// that no student has yet, to give out. The same list as the Performance report's "All contacts": each number
// can go to one or more students, each with the remark on their call, and each choice saves by itself. Filters:
// the course, phones or emails, and a search (company, job or the number itself). A number given out stays in
// view, with its students, until a filter or the period changes: another student can be added or a name put
// right. Above the list: yesterday's unanswered calls (DNP, Busy, Switched off), to try again today. Numbers can be
// ticked (one by one, a Shift range, all shown, or all in the list) and copied together: the
// numbers and emails alone, separated by commas.
export default function AssignNumbers() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const period = periodFrom(searchParams, ACTIVITY_PERIODS);
  const meta = useApi<Meta>('meta');
  const [reload, setReload] = useState(0); // bumped after a save in a job's window: its numbers may change
  const perf = useApi<PerformanceResponse>('performance', { ...periodParams(period), r: reload || undefined }, { auth: true });
  const mayRecord = useAccess()?.can('record-outcomes') ?? false;
  const studentsId = useId();
  const data = perf.data;
  const { rows, students, saves, save } = useFollowUps(data);
  const jobWindow = useJobWindow(meta.data?.courses, () => setReload((n) => n + 1));
  const [course, setCourse] = useState(''); // '' = all courses
  const [kind, setKind] = useState<Kind>('all');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [picked, setPicked] = useState<Set<string>>(new Set()); // ticked numbers (outcomeKey), within the list

  // Every number and email once (the newest time it was added), and the ones no student has yet.
  const contacts = useMemo(() => {
    const seen = new Map<string, PerformanceRow>();
    for (const row of rows) if (!seen.has(outcomeKey(row))) seen.set(outcomeKey(row), row);
    return [...seen.values()];
  }, [rows]);
  const waiting = contacts.filter((row) => !hasStudent(row));

  // Which numbers the list shows is worked out when a filter or the data changes, not when one is given out.
  const words = search.trim().toLowerCase();
  const fits = (row: PerformanceRow) =>
    (!course || row.job.course === course) &&
    (kind === 'all' || row.field === kind) &&
    (!words || [row.job.company, row.job.title, row.value].join(' ').toLowerCase().includes(words));
  const filters = JSON.stringify([course, kind, words]);
  const [shown, setShown] = useState<{ filters: string; data: PerformanceResponse | null; keys: Set<string> } | null>(null);
  let keys = shown?.keys ?? new Set<string>();
  if (!shown || shown.filters !== filters || shown.data !== data) {
    keys = new Set(waiting.filter(fits).map(outcomeKey));
    setShown({ filters, data, keys });
    setLimit(PAGE);
    if (picked.size) setPicked(new Set()); // a new list: nothing ticked
  }

  if (meta.error) return <PageError title="Could not reach the server" error={meta.error} />;
  if (!meta.data) return <PageSkeleton />;

  const courses = meta.data.courses;
  const today = istDayOf(new Date().toISOString());
  const since = data?.since ?? null;
  const when = periodWords(period);
  const listed = contacts.filter((row) => keys.has(outcomeKey(row)));
  const givenHere = listed.filter(hasStudent).length; // given out since the list was made
  // The counts beside the filters: numbers not given out yet (phones and emails within the chosen course).
  const inCourse = (row: PerformanceRow) => !course || row.job.course === course;
  const countOf = (k: Kind) => waiting.filter((row) => inCourse(row) && (k === 'all' || row.field === k)).length;
  const courseCount = (id: string) => waiting.filter((row) => row.job.course === id).length;

  const select = (rowKeys: string[], on: boolean) =>
    setPicked((ticked) => {
      const next = new Set(ticked);
      for (const key of rowKeys) {
        if (on) next.add(key);
        else next.delete(key);
      }
      return next;
    });

  const followUps = (row: PerformanceRow) => (
    <FollowUps row={row} listId={studentsId} save={saves[outcomeKey(row)]} onChange={(op) => save(row, op)} readOnly={!mayRecord} className="ci-followups" />
  );

  return (
    <main className="page assign-page">
      <PageHeader
        eyebrow={
          <>
            <Link className="back-link" href={`/review?${periodQuery(period)}`}>
              <ChevronLeftIcon size={14} /> Review board
            </Link>
            {` · ${period.label}`}
          </>
        }
        title="Assign numbers"
        subtitle="The HR numbers and emails the team added that no student has yet. Give each one to a student, or to several: each saves by itself."
        actions={
          <PeriodTabs
            period={period}
            periods={ACTIVITY_PERIODS}
            first={since ? istDayOf(since) : null}
            last={today}
            data="changes"
            onChange={(query) => router.replace(`/assign?${query}`, { scroll: false })}
          />
        }
      >
        {since && <span className="status-pill">Counted since {formatDate(since)}, when the activity record began</span>}
      </PageHeader>

      <RetryCalls courses={courses} opening={jobWindow.opening} onOpenJob={jobWindow.openJob} />

      <section className="card card-flush perf-card assign-card">
        <CardHeader
          icon={<PhoneIcon />}
          title={
            <>
              Not given out yet {data && <span className="count-badge">{formatNumber(waiting.length)}</span>}
            </>
          }
          description={
            data
              ? `Of the ${plural(contacts.length, 'number and email', 'numbers and emails')} added ${when}, the newest first`
              : `The numbers and emails added ${when}`
          }
        />
        {data?.truncated && <p className="note-warning perf-note">Only the newest {formatNumber(data.rows.length)} added are looked at. Choose fewer days to see them all.</p>}
        {data && !mayRecord && <p className="note-warning perf-note">Your role can see these numbers but not give them out.</p>}
        <datalist id={studentsId}>
          {students.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        {perf.error ? (
          <SectionError what="the numbers" error={perf.error} onRetry={perf.reload} />
        ) : !data ? (
          <div className="activity-skeleton" aria-busy="true" aria-label="Loading the numbers">
            {[0, 1, 2].map((i) => (
              <span key={i} className="skeleton" />
            ))}
          </div>
        ) : !contacts.length ? (
          <div className="activity-empty">
            <span className="auth-icon" aria-hidden="true">
              <PhoneIcon size={22} />
            </span>
            <p>
              <strong>No HR phone numbers or emails were added {when}.</strong>
            </p>
            <p className="muted">Try a longer period.</p>
          </div>
        ) : (
          <div className={`contacts-view ${perf.loading ? 'is-loading' : ''}`}>
            <div className="toolbar contacts-toolbar">
              <label className="search">
                <SearchIcon />
                <input
                  type="search"
                  placeholder="Search company, job or number"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search the company, job, number or email"
                />
              </label>
              <select className="select course-select" value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Course">
                <option value="">All courses · {formatNumber(waiting.length)}</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {formatNumber(courseCount(c.id))}
                  </option>
                ))}
              </select>
              <Segmented
                label="Phones or emails"
                value={kind}
                onChange={setKind}
                options={[
                  { value: 'all', label: <>All {formatNumber(countOf('all'))}</> },
                  { value: 'phone', label: <>Phones {formatNumber(countOf('phone'))}</> },
                  { value: 'email', label: <>Emails {formatNumber(countOf('email'))}</> },
                ]}
              />
            </div>
            {givenHere > 0 && (
              <p className="assign-given" role="status">
                <CheckIcon size={13} />
                <span>
                  {plural(givenHere, 'number')} given out here. {givenHere === 1 ? 'It stays' : 'They stay'} in the list until you change a filter.
                </span>
                <button type="button" className="btn btn-sm" onClick={() => setShown(null)}>
                  Hide {givenHere === 1 ? 'it' : 'them'}
                </button>
              </p>
            )}
            {listed.length ? (
              <>
                <ContactList
                  rows={listed.slice(0, limit)}
                  courses={courses}
                  opening={jobWindow.opening}
                  onOpenJob={jobWindow.openJob}
                  followUps={followUps}
                  selected={picked}
                  onSelect={select}
                />
                {listed.length > PAGE && (
                  <div className="list-foot">
                    <span className="muted">
                      {formatNumber(Math.min(limit, listed.length))} of {formatNumber(listed.length)}
                    </span>
                    {limit < listed.length && (
                      <button type="button" className="btn" onClick={() => setLimit((n) => n + PAGE)}>
                        Show {formatNumber(Math.min(PAGE, listed.length - limit))} more
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : !waiting.length ? (
              <div className="activity-empty">
                <span className="auth-icon" aria-hidden="true">
                  <CheckIcon size={22} />
                </span>
                <p>
                  <strong>All given out: every number and email added {when} is with a student.</strong>
                </p>
                <p className="muted">
                  See how the calls went on the <Link href={`/review?${periodQuery(period)}`}>Review board</Link>.
                </p>
              </div>
            ) : (
              <div className="activity-empty">
                <p>
                  <strong>Nothing here.</strong>
                </p>
                <p className="muted">No number or email that is not given out yet matches these filters. Pick another course, or clear the search.</p>
              </div>
            )}
          </div>
        )}
      </section>

      <SelectionBar
        picked={listed.filter((row) => picked.has(outcomeKey(row)))}
        total={listed.length}
        onAll={() => setPicked(new Set(listed.map(outcomeKey)))}
        onClear={() => setPicked(new Set())}
      />
      {jobWindow.modal}
    </main>
  );
}
