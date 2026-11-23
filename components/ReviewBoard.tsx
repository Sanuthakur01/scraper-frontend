'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { apiUrl, ApiError, sendJson, useApi } from '@/lib/api';
import { COURSE_COLORS, courseInitials, formatDate, formatDateTime, formatNumber, formatUpdated, istDayOf, periodFrom, periodParams, periodQuery, shareText, type Period } from '@/lib/format';
import { ACTIVITY_PERIODS, csvCell, istStamp, REMARKS, remarkName } from '@/lib/performance';
import {
  byCourse,
  byFinder,
  byGiver,
  byStudent,
  commonNotes,
  finderOf,
  FOUND_EARLIER,
  FOUND_POST,
  groupRows,
  matchesReview,
  NO_REVIEW_FILTERS,
  perDay,
  studentOf,
  summaryOf,
  withRemarkAdded,
  type RemarkFilter,
  type ReviewFilters,
  type ReviewGroup,
} from '@/lib/review';
import { signInHeader } from '@/lib/session';
import type { ContactOutcome, Course, Job, JobsResponse, Meta, RemarkStatus, ReviewResponse, ReviewRow } from '@/lib/types';
import type { SaveState } from '@/lib/useFollowUps';
import { useAccess } from './AuthGate';
import Avatar from './Avatar';
import { AlertIcon, BuildingIcon, CheckIcon, ClockIcon, DownloadIcon, MailIcon, MessageIcon, PhoneIcon, SearchIcon, SendIcon, TrendIcon, UsersIcon } from './Icons';
import { RemarkAdd, SaveMark } from './FollowUpControls';
import JobDetailsModal from './JobDetailsModal';
import { CardHeader, PageError, PageHeader, PageSkeleton, SectionError } from './PageParts';
import PeriodTabs from './PeriodTabs';

// The Review board: how good the HR contacts turn out. From the activity record, for a period of people's
// work (the days end today): every HR number and email given to a student, who gave it to whom, the feedback on
// the call, and who found the number (lib/review.ts counts them). "Reached the right person" is the share of
// the calls that got through (CV shared or No openings, against a wrong number/email or not the correct person)
// that reached the right HR: the clearest measure of a contact's quality.

const PAGE = 50;
const EMPTY: ReviewRow[] = [];

// "today", "in the last 7 days", "on 9–12 Oct"
const periodWords = (p: Period) => (p.from ? `on ${p.label}` : p.days === 1 ? 'today' : `in the ${p.label.toLowerCase()}`);
const personLabel = (p: { email: string; name: string }) => p.name.trim() || p.email;
const plural = (n: number, one: string, many = `${one}s`) => `${formatNumber(n)} ${n === 1 ? one : many}`;

// "CV shared", "Wrong email", "Others: call after 5 pm".
const feedbackWords = (row: ReviewRow, status: RemarkStatus | '' | undefined, note = '') =>
  !status ? '' : status === 'other' ? (note ? `Others: ${note}` : 'Others') : remarkName(status, row.field);
const toneOf = (status: RemarkStatus | '' | undefined) => REMARKS.find((r) => r.id === status)?.tone ?? 'neutral';

// "in 40 min", "in 3 h", "in 2 days": how long after it was given out the feedback came.
function hoursWords(hours: number | null | undefined) {
  if (hours == null) return '';
  if (hours < 1) return `in ${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `in ${Math.round(hours)} h`;
  return `in ${Math.round(hours / 24)} days`;
}

const foundWords = (row: ReviewRow) =>
  row.found.source === 'team' && row.found.by
    ? personLabel(row.found.by)
    : row.found.source === 'copy'
      ? "The company's earlier job"
      : row.found.source === 'post'
        ? 'The job post'
        : 'Before the record began';

// One line per number or email, for a spreadsheet.
function reviewCsv(rows: ReviewRow[], courseName: (id: string) => string) {
  const header = [
    'Given out (IST)', 'Given by', 'Student', 'Detail', 'Number or email', 'Company', 'Job', 'Course', 'Filtered / Non-filtered',
    'Found by', 'Added (IST)', 'Feedback', 'Feedback by', 'Feedback at (IST)', 'Hours to feedback', 'Remark now', 'All remarks (oldest first)',
  ];
  const lines = rows.map((r) =>
    [
      r.given ? istStamp(r.given.at) : '',
      r.given ? personLabel(r.given.by) : '',
      studentOf(r),
      r.field === 'phone' ? 'Phone' : 'Email',
      r.value,
      r.job.company ?? '',
      r.job.title ?? '',
      r.job.course ? courseName(r.job.course) : '',
      r.job.set === 'nonfiltered' ? 'Non-filtered' : 'Filtered',
      foundWords(r),
      r.added ? istStamp(r.added.at) : '',
      r.feedback ? feedbackWords(r, r.feedback.status, r.feedback.note) : '',
      r.feedback ? personLabel(r.feedback.by) : '',
      r.feedback ? istStamp(r.feedback.at) : '',
      r.feedback?.hours != null ? r.feedback.hours.toFixed(1) : '',
      feedbackWords(r, r.now?.status, r.now?.note),
      (r.now?.history ?? []).map((h) => feedbackWords(r, h.status, h.note)).join(' → '),
    ]
      .map(csvCell)
      .join(','),
  );
  return `﻿${[header.join(','), ...lines].join('\r\n')}`;
}

// The list's "Show" choices: everything, each tile's numbers, the calls that reached the right person, each remark.
const REMARK_FILTERS: { value: RemarkFilter; label: string }[] = [
  { value: '', label: 'Every number' },
  { value: 'given', label: 'Given out' },
  { value: 'not-given', label: 'Not given out yet' },
  { value: 'feedback', label: 'With feedback' },
  { value: 'awaiting', label: 'Awaiting feedback' },
  { value: 'wrong-any', label: 'Wrong contacts' },
  { value: 'not-reached', label: 'Not reached (DNP, Busy, Switched off)' },
  { value: 'reached', label: 'Reached the right person' },
  { value: 'through', label: 'Got through (right or wrong person)' },
  ...REMARKS.map((r) => ({ value: r.id as RemarkFilter, label: r.label })),
];

export default function ReviewBoard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const period = periodFrom(searchParams, ACTIVITY_PERIODS);
  const meta = useApi<Meta>('meta');
  const [reload, setReload] = useState(0);
  const review = useApi<ReviewResponse>('review', { ...periodParams(period), r: reload || undefined }, { auth: true });
  const [filters, setFilters] = useState<ReviewFilters>(NO_REVIEW_FILTERS);
  const [shown, setShown] = useState(PAGE);
  const [detail, setDetail] = useState<Job | null>(null);
  const [opening, setOpening] = useState<{ id: string; problem: string } | null>(null);
  const list = useRef<HTMLElement>(null);

  const mayRecord = useAccess()?.can('record-outcomes') ?? false;
  // Remarks added here since the board loaded: the rows they changed (until it loads again), each save's state, and
  // the rows that stay in the list until a filter changes (so a call doesn't vanish from "DNP" the moment it gets
  // "CV shared").
  const [edits, setEdits] = useState<{ base: ReviewResponse | null; rows: Record<string, ReviewRow> }>({ base: null, rows: {} });
  const [saves, setSaves] = useState<Record<string, SaveState | undefined>>({});
  const [stay, setStay] = useState<{ filters: ReviewFilters | null; ids: Set<string> }>({ filters: null, ids: new Set() });

  const data = review.data;
  const rows = useMemo(() => {
    const all = data?.rows ?? EMPTY;
    return edits.base === data ? all.map((row) => edits.rows[row.id] ?? row) : all;
  }, [data, edits]);
  const summary = useMemo(() => summaryOf(rows), [rows]);
  const filtered = useMemo(
    () => rows.filter((row) => matchesReview(row, filters) || (stay.filters === filters && stay.ids.has(row.id))),
    [rows, filters, stay],
  );

  // A new period: the list from its top again.
  const periodKey = `${period.key}${period.from ?? ''}${period.to ?? ''}`;
  const [shownKey, setShownKey] = useState(periodKey);
  if (shownKey !== periodKey) {
    setShownKey(periodKey);
    setShown(PAGE);
  }

  if (meta.error) return <PageError title="Could not reach the server" error={meta.error} />;
  if (!meta.data) return <PageSkeleton />;
  const courses = meta.data.courses;
  const courseName = (id: string) => courses.find((c) => c.id === id)?.name ?? id;
  const today = istDayOf(new Date().toISOString());
  const since = data?.since ?? null;
  const words = periodWords(period);

  // A number on the board: the list below with only those numbers, scrolled into view.
  const show = (patch: Partial<ReviewFilters>) => {
    setFilters({ ...NO_REVIEW_FILTERS, ...patch });
    setShown(PAGE);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => list.current?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' }));
  };

  const openJob = async (row: ReviewRow) => {
    setOpening({ id: row.id, problem: '' });
    try {
      const params = { id: row.job.id, days: 1, view: row.job.set === 'nonfiltered' ? 'nonfiltered' : undefined };
      const res = await fetch(apiUrl('jobs', params), { headers: await signInHeader() });
      const body = (await res.json().catch(() => null)) as JobsResponse | null;
      const job = body?.items?.[0];
      if (!res.ok || !job) {
        setOpening({ id: row.id, problem: 'This job is no longer stored (jobs are kept for 90 days after they were last seen).' });
        return;
      }
      setOpening(null);
      setDetail(job);
    } catch {
      setOpening({ id: row.id, problem: 'Could not reach the server. Check your connection and try again.' });
    }
  };

  // A remark added to a student's call: saved (added after the ones before, never replacing them), then the row shows
  // what the server answered: every remark, and the feedback when the remark falls in the period.
  const addRemark = async (row: ReviewRow, patch: { status: RemarkStatus; note?: string }) => {
    if (!data) return;
    const base = data;
    setStay((st) => ({ filters, ids: new Set([...(st.filters === filters ? st.ids : []), row.id]) }));
    setSaves((sv) => ({ ...sv, [row.id]: { state: 'saving' } }));
    try {
      const body = { job: row.job.id, field: row.field, value: row.value, student: row.student, status: patch.status, note: patch.status === 'other' ? (patch.note ?? '') : '' };
      const answer = await sendJson<{ outcomes: ContactOutcome[] }>('outcomes', 'PUT', body);
      const mine = answer.outcomes.find((o) => o.student.toLowerCase() === row.student.toLowerCase());
      if (mine) {
        const now = { student: mine.student, status: mine.status, note: mine.note, history: mine.history };
        const latest = mine.history?.at(-1);
        const inPeriod = Boolean(latest?.at && istDayOf(latest.at) <= base.to);
        const changed = withRemarkAdded(row, now, feedbackWords(row, mine.status, mine.note), inPeriod);
        setEdits((e) => ({ base, rows: { ...(e.base === base ? e.rows : {}), [row.id]: changed } }));
      }
      setSaves((sv) => ({ ...sv, [row.id]: { state: 'saved' } }));
      setTimeout(() => setSaves((sv) => (sv[row.id]?.state === 'saved' ? { ...sv, [row.id]: undefined } : sv)), 2500);
    } catch (err) {
      setSaves((sv) => ({ ...sv, [row.id]: { state: 'error', message: `Not saved: ${err instanceof ApiError || err instanceof Error ? err.message : 'try again'}` } }));
    }
  };

  const download = () => {
    const blob = new Blob([reviewCsv(filtered, courseName)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `review-${data?.from}${data && data.to !== data.from ? `-to-${data.to}` : ''}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const s = summary;
  // Each tile opens exactly the numbers it counts in the list below.
  const tiles: { name: string; icon: ReactNode; tone: string; value: string; note: string; filter: RemarkFilter; label: string }[] = [
    {
      name: 'Numbers given out',
      icon: <SendIcon size={16} />,
      tone: 'var(--accent)',
      value: formatNumber(s.given),
      note: s.given
        ? `${s.givenNumbers !== s.given ? `${plural(s.givenNumbers, 'number')} ` : ''}to ${plural(s.students, 'student')} · by ${plural(s.givers, 'person', 'people')}`
        : `None given out ${words}`,
      filter: 'given',
      label:
        s.givenNumbers !== s.given
          ? `${formatNumber(s.givenNumbers)} numbers and emails given to students ${words}, ${formatNumber(s.given)} times in all (some to more than one student)`
          : `${formatNumber(s.given)} numbers and emails given to students ${words}`,
    },
    {
      name: 'Not given out yet',
      icon: <PhoneIcon size={16} />,
      tone: 'var(--text-secondary)',
      value: formatNumber(s.notGiven),
      note: s.added ? `of ${plural(s.added, 'number')} the team added ${words}` : `None added ${words}`,
      filter: 'not-given',
      label: `${formatNumber(s.notGiven)} of the ${formatNumber(s.added)} HR numbers and emails added ${words} are not given to a student yet`,
    },
    {
      name: 'Feedback recorded',
      icon: <MessageIcon size={16} />,
      tone: 'var(--accent)',
      value: formatNumber(s.feedback),
      note: s.mostCommon ? `Most common: ${REMARKS.find((r) => r.id === s.mostCommon!.status)?.label} (${formatNumber(s.mostCommon.count)})` : 'None yet',
      filter: 'feedback',
      label: `${formatNumber(s.feedback)} calls with feedback recorded ${words}`,
    },
    {
      name: 'CV shared',
      icon: <CheckIcon size={16} />,
      tone: 'var(--good-text)',
      value: formatNumber(s.cvShared),
      note: s.feedback ? `${shareText(s.cvShared, s.feedback)} of the feedback` : 'No feedback yet',
      filter: 'cv-shared',
      label: `${formatNumber(s.cvShared)} calls ended with a CV shared`,
    },
    {
      name: 'Wrong contacts',
      icon: <AlertIcon size={16} />,
      tone: 'var(--bad-text)',
      value: formatNumber(s.wrong),
      note: `${formatNumber(s.byRemark.wrong)} wrong number · ${formatNumber(s.byRemark['not-person'])} wrong person`,
      filter: 'wrong-any',
      label: `${formatNumber(s.wrong)} wrong contacts: wrong numbers or emails, or not the correct person`,
    },
    {
      name: 'Awaiting feedback',
      icon: <ClockIcon size={16} />,
      tone: 'var(--warn-text)',
      value: formatNumber(s.awaiting),
      note: s.waitingOverDay ? `${plural(s.waitingOverDay, 'number')} given out over a day ago` : s.awaiting ? 'All given out within a day' : 'Nothing waiting',
      filter: 'awaiting',
      label: `${formatNumber(s.awaiting)} numbers given out ${words} have no feedback yet`,
    },
  ];

  return (
    <main className="page review-page">
      <PageHeader
        eyebrow={`HR contact quality · ${period.label}`}
        title="Review board"
        subtitle="The HR numbers and emails given to students, and the feedback on the calls: who gave which number to whom, what the calls found, and how good the contacts turn out."
        actions={
          <>
            <Link href={`/assign?${periodQuery(period)}`} className="btn btn-primary assign-link" title="Give the numbers no student has yet to students">
              <SendIcon size={15} /> Assign numbers
            </Link>
            <PeriodTabs
              period={period}
              periods={ACTIVITY_PERIODS}
              first={since ? istDayOf(since) : null}
              last={today}
              data="changes"
              onChange={(query) => router.replace(`/review?${query}`, { scroll: false })}
            />
          </>
        }
      >
        {since && <span className="status-pill">Counted since {formatDate(since)}, when the activity record began</span>}
      </PageHeader>

      {review.error ? (
        <SectionError what="the review board" error={review.error} onRetry={review.reload} />
      ) : (
        <>
          <section className={`kpis kpis-6 review-kpis ${review.loading ? 'is-loading' : ''}`} aria-label="How the HR contacts turned out">
            {tiles.map((tile) => {
              const body = (
                <>
                  <span className="kpi-top">
                    <span className="kpi-badge" aria-hidden="true">
                      {tile.icon}
                    </span>
                    <span className="kpi-name">{tile.name}</span>
                  </span>
                  <span className="kpi-value">{data ? tile.value : '—'}</span>
                  <span className="kpi-period">{data ? tile.note : ' '}</span>
                </>
              );
              return (
                <button
                  key={tile.name}
                  type="button"
                  className="kpi kpi-action"
                  style={{ '--course': tile.tone } as CSSProperties}
                  aria-pressed={filters.remark === tile.filter}
                  disabled={!data}
                  onClick={() => show({ remark: tile.filter })}
                  aria-label={`${tile.label}. Show them in the list`}
                >
                  {body}
                </button>
              );
            })}
          </section>

          <div className="grid-2">
            <FeedbackCard rows={rows} loading={!data} words={words} total={s.feedback} filters={filters} onShow={show} />
            <GroupTable
              title="Contact quality by who found the number"
              description="Each person's numbers and emails, and the job posts', by what the calls found"
              icon={<UsersIcon />}
              groups={groupRows(rows, byFinder)}
              loading={!data}
              empty={`No numbers given out or called ${words}.`}
              filterKey="finder"
              filters={filters}
              onShow={show}
              who={(g) =>
                g.key === FOUND_POST ? (
                  <span className="review-who-icon" aria-hidden="true">
                    <BuildingIcon size={14} />
                  </span>
                ) : g.key === FOUND_EARLIER ? (
                  <span className="review-who-icon" aria-hidden="true">
                    <ClockIcon size={14} />
                  </span>
                ) : (
                  <Avatar name={g.label} email={g.email ?? g.key} className="activity-avatar review-avatar" />
                )
              }
              columns={['given', 'feedback', 'reached', 'wrong', 'accuracy']}
            />
          </div>

          <div className="grid-2">
            <GroupTable
              title="Students"
              description="The numbers each student was given, and how their calls went"
              icon={<UsersIcon />}
              groups={groupRows(rows, byStudent)}
              loading={!data}
              empty={`No numbers given to students ${words}.`}
              filterKey="student"
              filters={filters}
              onShow={show}
              columns={['given', 'feedback', 'cvShared', 'notReached', 'awaiting']}
              limit={8}
            />
            <GroupTable
              title="Courses"
              description="Whose jobs the numbers came from"
              icon={<TrendIcon />}
              groups={groupRows(rows, byCourse).map((g) => ({ ...g, label: courseName(g.key) }))}
              loading={!data}
              empty={`No numbers given out or called ${words}.`}
              filterKey="course"
              filters={filters}
              onShow={show}
              who={(g) => (
                <span className="kpi-badge review-course-badge" style={{ '--course': COURSE_COLORS[g.key as Course['id']] } as CSSProperties} aria-hidden="true">
                  {courseInitials(g.label)}
                </span>
              )}
              columns={['given', 'feedback', 'cvShared', 'wrong', 'accuracy']}
            />
          </div>

          <div className="grid-2">
            <GroupTable
              title="Who gave numbers out"
              description="The people who gave numbers and emails to students"
              icon={<SendIcon />}
              groups={groupRows(rows, byGiver)}
              loading={!data}
              empty={`No numbers given out ${words}.`}
              filterKey="giver"
              filters={filters}
              onShow={show}
              who={(g) => <Avatar name={g.label} email={g.email ?? g.key} className="activity-avatar review-avatar" />}
              columns={['given', 'awaiting', 'cvShared', 'wrong']}
            />
            <SpeedCard rows={rows} loading={!data} medianHours={s.medianHours} words={words} />
          </div>

          {period.days > 1 && data && <DaysCard rows={rows} from={data.from} to={data.to} />}

          <section className="card card-flush review-list" ref={list} aria-labelledby="review-list-title">
            <CardHeader
              icon={<PhoneIcon />}
              title={
                <span id="review-list-title">
                  Numbers and emails {data && <span className="count-badge">{formatNumber(filtered.length)}</span>}
                </span>
              }
              description={`Each one added, given to a student, or called ${words}: who found it, who gave it to whom, and the feedback`}
              actions={
                <button type="button" className="btn" onClick={download} disabled={!filtered.length}>
                  <DownloadIcon /> Download CSV
                </button>
              }
            />
            <div className="toolbar">
              <label className="search">
                <SearchIcon />
                <input
                  type="search"
                  placeholder="Search number, company, student or note"
                  value={filters.q}
                  onChange={(e) => {
                    setFilters((f) => ({ ...f, q: e.target.value }));
                    setShown(PAGE);
                  }}
                  aria-label="Search the number or email, company, job, student, note or person"
                />
              </label>
              <FilterSelect label="Show" value={filters.remark} options={REMARK_FILTERS} onChange={(remark) => setFilters((f) => ({ ...f, remark: remark as RemarkFilter }))} />
              <FilterSelect
                label="Phones or emails"
                value={filters.field}
                options={[
                  { value: '', label: 'Phones and emails' },
                  { value: 'phone', label: 'Phone numbers' },
                  { value: 'email', label: 'Emails' },
                ]}
                onChange={(field) => setFilters((f) => ({ ...f, field: field as ReviewFilters['field'] }))}
              />
              <FilterSelect
                label="Student"
                value={filters.student}
                options={[{ value: '', label: 'All students' }, ...groupRows(rows, byStudent).map((g) => ({ value: g.key, label: g.label }))]}
                onChange={(student) => setFilters((f) => ({ ...f, student }))}
              />
              <FilterSelect
                label="Course"
                value={filters.course}
                options={[{ value: '', label: 'All courses' }, ...courses.map((c) => ({ value: c.id, label: c.name }))]}
                onChange={(course) => setFilters((f) => ({ ...f, course }))}
              />
              <FilterSelect
                label="Found by"
                value={filters.finder}
                options={[{ value: '', label: 'Found by anyone' }, ...[...new Map(rows.map((r) => [finderOf(r).key, finderOf(r)])).values()].map((g) => ({ value: g.key, label: g.label }))]}
                onChange={(finder) => setFilters((f) => ({ ...f, finder }))}
              />
              <FilterSelect
                label="Given by"
                value={filters.giver}
                options={[{ value: '', label: 'Given by anyone' }, ...groupRows(rows, byGiver).map((g) => ({ value: g.key, label: g.label }))]}
                onChange={(giver) => setFilters((f) => ({ ...f, giver }))}
              />
              {Object.values(filters).some(Boolean) && (
                <button type="button" className="btn btn-sm" onClick={() => setFilters(NO_REVIEW_FILTERS)}>
                  Clear filters
                </button>
              )}
            </div>
            {data?.truncated && <p className="note-warning">Only the latest {formatNumber(rows.length)} are shown: choose a shorter period to see them all.</p>}
            {!data ? (
              <div className="company-jobs-loading" aria-busy="true" aria-label="Loading the numbers">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="skeleton" />
                ))}
              </div>
            ) : !filtered.length ? (
              <p className="empty">{rows.length ? 'No numbers match these filters.' : `No numbers added, given out or called ${words}.`}</p>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data-table review-table">
                    <thead>
                      <tr>
                        <th scope="col">Number or email</th>
                        <th scope="col">Job</th>
                        <th scope="col">Found by</th>
                        <th scope="col">Given to</th>
                        <th scope="col">Feedback</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(0, shown).map((row) => (
                        <ReviewLine
                          key={row.id}
                          row={row}
                          courseName={courseName}
                          opening={opening?.id === row.id ? opening : null}
                          onOpen={() => openJob(row)}
                          // A student's call, while they still have the number: a remark can be added to it.
                          onRemark={mayRecord && row.student && row.now ? (patch) => addRemark(row, patch) : undefined}
                          save={saves[row.id]}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="review-list-foot">
                  <span className="muted">
                    {formatNumber(Math.min(shown, filtered.length))} of {formatNumber(filtered.length)}
                  </span>
                  {shown < filtered.length && (
                    <button type="button" className="btn" onClick={() => setShown((n) => n + PAGE)}>
                      Show {formatNumber(Math.min(PAGE, filtered.length - shown))} more
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        </>
      )}

      {detail && (
        <JobDetailsModal
          job={detail}
          courses={courses}
          onClose={() => setDetail(null)}
          onSaved={(job) => {
            setDetail(job);
            setReload((n) => n + 1);
          }}
          onOpenJob={(job) => setDetail(job)}
        />
      )}
    </main>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {options.map((o) => (
        <option key={o.value || 'all'} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// The feedback recorded in the period, per remark (the most common marked), then what "Others" said.
function FeedbackCard({
  rows,
  loading,
  words,
  total,
  filters,
  onShow,
}: {
  rows: ReviewRow[];
  loading: boolean;
  words: string;
  total: number;
  filters: ReviewFilters;
  onShow: (patch: Partial<ReviewFilters>) => void;
}) {
  const stats = groupRows(rows, () => ({ key: 'all', label: 'all' }))[0];
  const max = Math.max(1, ...REMARKS.map((r) => stats?.byRemark[r.id] ?? 0));
  const top = REMARKS.reduce<RemarkStatus | null>((best, r) => ((stats?.byRemark[r.id] ?? 0) > (best ? (stats?.byRemark[best] ?? 0) : 0) ? r.id : best), null);
  const notes = commonNotes(rows);
  return (
    <section className="card" aria-labelledby="review-feedback-title">
      <CardHeader level={3} icon={<MessageIcon />} title={<span id="review-feedback-title">Feedback</span>} description={`What the calls found ${words}, by remark`} />
      {loading ? (
        <div className="company-jobs-loading" aria-busy="true" aria-label="Loading the feedback">
          {[0, 1, 2].map((i) => (
            <span key={i} className="skeleton" />
          ))}
        </div>
      ) : !total ? (
        <p className="empty">No feedback recorded {words}.</p>
      ) : (
        <>
          <ul className="review-bars">
            {REMARKS.map((r) => {
              const n = stats?.byRemark[r.id] ?? 0;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`review-bar tone-${r.tone}`}
                    disabled={!n}
                    aria-pressed={filters.remark === r.id}
                    onClick={() => onShow({ remark: r.id })}
                    aria-label={`${r.label}: ${formatNumber(n)} of ${formatNumber(total)} calls (${shareText(n, total)}). Show them`}
                  >
                    <span className="review-bar-name">
                      <span className="tone-dot" aria-hidden="true" />
                      {r.label}
                      {r.id === top && <span className="review-top">Most common</span>}
                    </span>
                    <span className="review-bar-value">
                      <strong>{formatNumber(n)}</strong> <span className="muted">{shareText(n, total)}</span>
                    </span>
                    <span className="review-bar-track" aria-hidden="true">
                      {n > 0 && <span style={{ width: `${(n / max) * 100}%` }} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {notes.length > 0 && (
            <div className="review-notes">
              <h4>&ldquo;Others&rdquo;, in the callers&rsquo; words</h4>
              <ul>
                {notes.map((note) => (
                  <li key={note.text}>
                    <button type="button" className="review-note" onClick={() => onShow({ remark: 'other', q: note.text })} title="Show these in the list">
                      {note.text} <span className="count-badge">{formatNumber(note.count)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// One column of a group table: its heading, the number from a group's counts, and the rows that number counts
// (filter: clicking it shows them in the list), in words for screen readers.
type Column = { head: string; title: string; filter: RemarkFilter; count: (g: ReviewGroup) => number; value: (g: ReviewGroup) => string; words: (g: ReviewGroup) => string };
const COLUMNS = {
  given: {
    head: 'Given',
    title: 'Numbers and emails given to students in the period (phones and emails below)',
    filter: 'given',
    count: (g) => g.given,
    value: (g) => formatNumber(g.given),
    words: (g) => `${plural(g.given, 'number or email', 'numbers and emails')} given out (${plural(g.givenPhones, 'phone number')}, ${plural(g.givenEmails, 'email')})`,
  },
  feedback: { head: 'Feedback', title: 'Calls with feedback recorded in the period', filter: 'feedback', count: (g) => g.feedback, value: (g) => formatNumber(g.feedback), words: (g) => `${plural(g.feedback, 'call')} with feedback` },
  cvShared: { head: 'CV shared', title: 'Calls that ended with a CV shared', filter: 'cv-shared', count: (g) => g.cvShared, value: (g) => formatNumber(g.cvShared), words: (g) => `${plural(g.cvShared, 'call')} with a CV shared` },
  reached: { head: 'Reached', title: 'Reached the right person: CV shared or No openings', filter: 'reached', count: (g) => g.reached, value: (g) => formatNumber(g.reached), words: (g) => `${plural(g.reached, 'call')} that reached the right person` },
  wrong: { head: 'Wrong', title: 'Wrong number or email, or not the correct person', filter: 'wrong-any', count: (g) => g.wrong, value: (g) => formatNumber(g.wrong), words: (g) => plural(g.wrong, 'wrong contact') },
  notReached: { head: 'Not reached', title: 'DNP, Busy or Switched off: call again', filter: 'not-reached', count: (g) => g.notReached, value: (g) => formatNumber(g.notReached), words: (g) => `${plural(g.notReached, 'call')} not reached (DNP, Busy or Switched off)` },
  awaiting: { head: 'Awaiting', title: 'Given out in the period, no feedback yet', filter: 'awaiting', count: (g) => g.awaiting, value: (g) => formatNumber(g.awaiting), words: (g) => `${plural(g.awaiting, 'number')} awaiting feedback` },
  accuracy: {
    head: 'Right person',
    title: 'Of the calls that got through, the share that reached the right person',
    filter: 'through',
    count: (g) => g.reached + g.wrong,
    value: (g) => (g.accuracy == null ? '—' : shareText(g.reached, g.reached + g.wrong)),
    words: (g) => `${shareText(g.reached, g.reached + g.wrong)} of the ${plural(g.reached + g.wrong, 'call')} that got through reached the right person`,
  },
} satisfies Record<string, Column>;

// A table of groups (students, people, courses): each name shows all its rows in the list below, and each number
// exactly the rows it counts (Given also by phones and by emails). filterKey: the list filter a group sets.
function GroupTable({
  title,
  description,
  icon,
  groups,
  loading,
  empty,
  filterKey,
  filters,
  onShow,
  who,
  columns,
  limit,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  groups: ReviewGroup[];
  loading: boolean;
  empty: string;
  filterKey: 'student' | 'course' | 'finder' | 'giver';
  filters: ReviewFilters;
  onShow: (patch: Partial<ReviewFilters>) => void;
  who?: (group: ReviewGroup) => ReactNode;
  columns: (keyof typeof COLUMNS)[];
  limit?: number; // show the first this many, and a button for the rest
}) {
  const [all, setAll] = useState(false);
  const shown = limit && !all ? groups.slice(0, limit) : groups;
  // The list shows exactly this: the button for it is pressed.
  const showing = (key: string, remark: RemarkFilter, field: ReviewFilters['field'] = '') =>
    filters[filterKey] === key && filters.remark === remark && filters.field === field && !filters.q;
  const count = (g: ReviewGroup, label: ReactNode, n: number, remark: RemarkFilter, field: ReviewFilters['field'], words: string, className = 'review-cell') =>
    n ? (
      <button
        type="button"
        className={className}
        aria-pressed={showing(g.key, remark, field)}
        onClick={() => onShow({ [filterKey]: g.key, remark, field })}
        aria-label={`${g.label}: ${words}. Show them in the list`}
        title="Show them in the list"
      >
        {label}
      </button>
    ) : (
      <span className={`${className} is-zero`}>{label}</span>
    );
  return (
    <section className="card review-group">
      <CardHeader level={3} icon={icon} title={title} description={description} />
      {loading ? (
        <div className="company-jobs-loading" aria-busy="true" aria-label={`Loading: ${title}`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="skeleton" />
          ))}
        </div>
      ) : !groups.length ? (
        <p className="empty">{empty}</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table numeric review-group-table">
            <thead>
              <tr>
                <th scope="col">{title === 'Students' ? 'Student' : title === 'Courses' ? 'Course' : 'Person'}</th>
                {columns.map((c) => (
                  <th key={c} scope="col" title={COLUMNS[c].title}>
                    {COLUMNS[c].head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((g) => (
                <tr key={g.key || 'none'} className={filters[filterKey] === g.key ? 'is-selected' : ''}>
                  <th scope="row">
                    <button type="button" className="review-who" onClick={() => onShow({ [filterKey]: g.key })} aria-pressed={showing(g.key, '')} title="Show all of these in the list">
                      {who?.(g)}
                      <span>{g.label}</span>
                    </button>
                  </th>
                  {columns.map((c) => {
                    const col = COLUMNS[c];
                    return (
                      <td key={c} className={c === 'accuracy' ? 'strong' : ''}>
                        {count(g, col.value(g), col.count(g), col.filter, '', col.words(g))}
                        {c === 'given' && g.given > 0 && (
                          <span className="review-split">
                            {count(g, <><PhoneIcon size={11} /> {formatNumber(g.givenPhones)}</>, g.givenPhones, 'given', 'phone', `${plural(g.givenPhones, 'phone number')} given out`, 'review-split-link is-phone')}
                            {count(g, <><MailIcon size={11} /> {formatNumber(g.givenEmails)}</>, g.givenEmails, 'given', 'email', `${plural(g.givenEmails, 'email')} given out`, 'review-split-link is-email')}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length < groups.length && (
            <button type="button" className="btn btn-sm review-more" onClick={() => setAll(true)}>
              Show all {formatNumber(groups.length)}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// How long after a number was given out its feedback came: the middle value, and how many in each stretch.
const SPEEDS: { label: string; upTo: number }[] = [
  { label: 'Within 1 hour', upTo: 1 },
  { label: '1–4 hours', upTo: 4 },
  { label: '4–24 hours', upTo: 24 },
  { label: '1–3 days', upTo: 72 },
  { label: 'Over 3 days', upTo: Infinity },
];

function SpeedCard({ rows, loading, medianHours, words }: { rows: ReviewRow[]; loading: boolean; medianHours: number | null; words: string }) {
  const hours = rows.map((r) => r.feedback?.hours).filter((h): h is number => h != null);
  const counts = SPEEDS.map((band, i) => hours.filter((h) => h <= band.upTo && (i === 0 || h > SPEEDS[i - 1].upTo)).length);
  const max = Math.max(1, ...counts);
  return (
    <section className="card" aria-labelledby="review-speed-title">
      <CardHeader
        level={3}
        icon={<ClockIcon />}
        title={<span id="review-speed-title">How fast feedback comes</span>}
        description={`From giving a number out to its feedback, for the calls ${words}`}
      />
      {loading ? (
        <div className="company-jobs-loading" aria-busy="true" aria-label="Loading">
          {[0, 1].map((i) => (
            <span key={i} className="skeleton" />
          ))}
        </div>
      ) : !hours.length ? (
        <p className="empty">No feedback on numbers given out yet {words}.</p>
      ) : (
        <>
          <p className="review-median">
            <strong>{hoursWords(medianHours).replace(/^in /, '')}</strong> <span className="muted">is the middle value, over {plural(hours.length, 'call')}</span>
          </p>
          <ul className="review-bars">
            {SPEEDS.map((band, i) => (
              <li key={band.label}>
                <div className="review-bar tone-accent is-static">
                  <span className="review-bar-name">{band.label}</span>
                  <span className="review-bar-value">
                    <strong>{formatNumber(counts[i])}</strong> <span className="muted">{shareText(counts[i], hours.length)}</span>
                  </span>
                  <span className="review-bar-track" aria-hidden="true">
                    {counts[i] > 0 && <span style={{ width: `${(counts[i] / max) * 100}%` }} />}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// Each day of a longer period: numbers given out, feedback, CVs shared and wrong contacts.
function DaysCard({ rows, from, to }: { rows: ReviewRow[]; from: string; to: string }) {
  const days = perDay(rows, from, to).reverse();
  const max = Math.max(1, ...days.map((d) => Math.max(d.given, d.feedback)));
  return (
    <section className="card" aria-labelledby="review-days-title">
      <CardHeader level={3} icon={<TrendIcon />} title={<span id="review-days-title">Day by day</span>} description="Numbers given out and the feedback on each day, the latest first" />
      <div className="table-wrap">
        <table className="data-table numeric review-days">
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Given out</th>
              <th scope="col">Feedback</th>
              <th scope="col">CV shared</th>
              <th scope="col">Wrong</th>
              <th scope="col" aria-label="Given out and feedback, as bars">
                <span className="review-legend">
                  <span className="review-swatch is-given" /> Given <span className="review-swatch is-feedback" /> Feedback
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day}>
                <th scope="row">{formatDate(`${d.day}T12:00:00+05:30`)}</th>
                <td>{formatNumber(d.given)}</td>
                <td>{formatNumber(d.feedback)}</td>
                <td>{formatNumber(d.cvShared)}</td>
                <td>{formatNumber(d.wrong)}</td>
                <td className="review-day-bars" aria-hidden="true">
                  <span className="is-given" style={{ width: `${(d.given / max) * 100}%` }} />
                  <span className="is-feedback" style={{ width: `${(d.feedback / max) * 100}%` }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// One number or email: the job (opens its details), who found it, who gave it to whom, and the feedback, with a
// box to add another remark to the call (onRemark: when it can have one; the ones before stay).
function ReviewLine({
  row,
  courseName,
  opening,
  onOpen,
  onRemark,
  save,
}: {
  row: ReviewRow;
  courseName: (id: string) => string;
  opening: { problem: string } | null;
  onOpen: () => void;
  onRemark?: (patch: { status: RemarkStatus; note?: string }) => void;
  save?: SaveState;
}) {
  const remark = row.feedback ? feedbackWords(row, row.feedback.status, row.feedback.note) : '';
  const nowRemark = feedbackWords(row, row.now?.status, row.now?.note);
  const awaiting = row.given?.inPeriod && !row.now?.status;
  const history = row.now?.history ?? []; // every remark on the call, oldest first
  return (
    <tr>
      <td className="review-contact">
        <span className="review-contact-value">
          {row.field === 'phone' ? <PhoneIcon size={13} /> : <MailIcon size={13} />}
          {row.value}
        </span>
        {row.job.set === 'nonfiltered' && <span className="badge-muted">Non-filtered</span>}
      </td>
      <td>
        <button type="button" className="company-link review-company" onClick={onOpen} aria-haspopup="dialog" title="Open: HR contact, students, notes and job details">
          {row.job.company || 'Company not shown'}
        </button>
        <span className="review-sub">
          {row.job.course && <span className="review-course-dot" style={{ '--course': COURSE_COLORS[row.job.course] } as CSSProperties} aria-hidden="true" />}
          {row.job.course ? `${courseName(row.job.course)} · ` : ''}
          {row.job.title}
        </span>
        {opening?.problem && (
          <span className="review-sub review-problem" role="alert">
            {opening.problem}
          </span>
        )}
      </td>
      <td>
        {row.found.source === 'team' && row.found.by ? personLabel(row.found.by) : <span className="muted">{foundWords(row)}</span>}
      </td>
      <td>
        {row.given ? (
          <>
            <strong>{row.given.student}</strong>
            <span className="review-sub">
              by {personLabel(row.given.by)} · {row.given.inPeriod ? formatDateTime(row.given.at) : `earlier, ${formatDate(row.given.at)}`}
            </span>
            {row.withStudents > 1 && <span className="review-sub">One of {formatNumber(row.withStudents)} students with it</span>}
          </>
        ) : row.student ? (
          <>
            <strong>{row.student}</strong>
            {!row.now && <span className="review-sub">Taken back since</span>}
          </>
        ) : row.withStudents ? (
          <>
            <span className="muted">No student then</span>
            <span className="review-sub">A remark from before it was given out · now with {plural(row.withStudents, 'student')}</span>
          </>
        ) : (
          <>
            <span className="remark-chip tone-neutral">Not given out yet</span>
            {row.added && (
              <span className="review-sub">
                added by {personLabel(row.added.by)} · {formatDateTime(row.added.at)}
              </span>
            )}
          </>
        )}
      </td>
      <td>
        {row.feedback ? (
          <>
            <span className={`remark-chip tone-${toneOf(row.feedback.status)}`}>{remark}</span>
            <span className="review-sub">
              by {personLabel(row.feedback.by)} · {formatDateTime(row.feedback.at)}
              {row.feedback.hours != null ? ` · ${hoursWords(row.feedback.hours)}` : ''}
            </span>
            {nowRemark && nowRemark !== remark && <span className="review-sub">Now: {nowRemark}</span>}
          </>
        ) : awaiting ? (
          <span className="remark-chip tone-warn">
            <ClockIcon size={12} /> Awaiting feedback
          </span>
        ) : nowRemark ? (
          <span className="muted">Earlier: {nowRemark}</span>
        ) : (
          <span className="muted">—</span>
        )}
        {history.length > 1 && (
          <span className="review-sub review-remarks">
            All {history.length} remarks:{' '}
            {history.map((h) => `${feedbackWords(row, h.status, h.note)}${h.at ? ` (${formatUpdated(h.at)})` : ''}`).join(' → ')}
          </span>
        )}
        {onRemark && (
          <span className="remark-field review-add-remark">
            <RemarkAdd
              field={row.field}
              hasRemarks={history.length > 0 || Boolean(row.now?.status)}
              label={`${row.value}, ${row.student}'s call`}
              disabled={save?.state === 'saving'}
              onSave={onRemark}
            />
            <SaveMark save={save} />
          </span>
        )}
      </td>
    </tr>
  );
}
