'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, type CSSProperties } from 'react';
import { useApi } from '@/lib/api';
import { COURSE_COLORS, formatDate, formatDateTime, formatNumber, formatTime, istDayOf, periodFrom, periodParams } from '@/lib/format';
import { ACTIVITY_PERIODS } from '@/lib/performance';
import { isCvShared } from '@/lib/review';
import type { Meta, ReviewPerson, ReviewResponse, ReviewRow } from '@/lib/types';
import { useJobWindow } from './ContactList';
import { BuildingIcon, MailIcon, PhoneIcon, SearchIcon, SendIcon, UsersIcon } from './Icons';
import { CopyButton } from './JobDetailsModal';
import { CardHeader, PageError, PageHeader, PageSkeleton, SectionError } from './PageParts';
import PeriodTabs from './PeriodTabs';

const personName = (p: ReviewPerson) => p.name.trim() || p.email;
// "3 h", "45 min", "2 days": how long after the number was given to the student the CV was shared.
const after = (hours: number) => (hours < 1 ? `${Math.max(1, Math.round(hours * 60))} min` : hours < 48 ? `${Math.round(hours)} h` : `${Math.round(hours / 24)} days`);

// Who found the number: the person who added it to the job, the job post, or before the activity record began.
function FoundBy({ row }: { row: ReviewRow }) {
  if (row.found.by) return <span>{personName(row.found.by)}</span>;
  return <span className="muted">{row.found.source === 'post' ? 'The job post' : 'Before the record began'}</span>;
}

// The CV shared page (/cv-shared, opened from its box on the Home page): every student's call that ended in "CV
// shared" in the period (today by default), newest first, from the Review board's data: when and who recorded
// it, the student, the HR number or email, the company and job (opens its window), who found the number and who
// gave it to the student. The period is in the address (?days=1, or ?from=&to=).
export default function CvShared() {
  const router = useRouter();
  const period = periodFrom(useSearchParams(), ACTIVITY_PERIODS);
  const meta = useApi<Meta>('meta');
  const review = useApi<ReviewResponse>('review', periodParams(period), { auth: true });
  // A job's window: what is saved there shows here at once (the list loads again).
  const { opening, openJob, modal } = useJobWindow(meta.data?.courses, () => review.reload?.());
  const [search, setSearch] = useState('');

  const rows = useMemo(
    () => (review.data?.rows ?? []).filter(isCvShared).sort((a, b) => Date.parse(b.feedback!.at) - Date.parse(a.feedback!.at)),
    [review.data],
  );
  const query = search.trim().toLowerCase();
  const shown = query
    ? rows.filter((row) =>
        [row.student, row.value, row.job.company, row.job.title, row.found.by?.name, row.given?.by.name, row.feedback?.by.name].some((text) => text?.toLowerCase().includes(query)),
      )
    : rows;

  if (meta.error) return <PageError title="Could not reach the server" error={meta.error} />;
  if (!meta.data) return <PageSkeleton />;
  const { courses } = meta.data;
  const today = istDayOf(new Date().toISOString());
  const since = review.data?.since;
  const oneDay = review.data ? review.data.from === review.data.to : period.days === 1;
  const when = (at: string) => (oneDay ? formatTime(at) : formatDateTime(at));
  const students = new Set(rows.map((row) => row.student.toLowerCase()).filter(Boolean)).size;
  const companies = new Set(rows.map((row) => (row.job.company ?? '').toLowerCase()).filter(Boolean)).size;
  const loading = !review.data;
  const periodWords = period.key === '1' ? 'today' : 'in this period';

  return (
    <main className="page cv-page">
      <PageHeader
        eyebrow={`Review · ${period.label}`}
        title="CV shared"
        subtitle="Every student's call that ended in CV shared: the HR contact, the student it was given to, the company and job, and who found and gave out the number."
        actions={
          <PeriodTabs
            period={period}
            periods={ACTIVITY_PERIODS}
            first={since ? istDayOf(since) : null}
            last={today}
            data="changes"
            onChange={(query) => router.replace(`/cv-shared?${query}`, { scroll: false })}
          />
        }
      >
        {since && <span className="status-pill">Counted since {formatDate(since)}, when the activity record began</span>}
      </PageHeader>

      {review.error ? (
        <SectionError what="the CVs shared" error={review.error} onRetry={review.reload} />
      ) : (
        <>
          <section className={`kpis kpis-3 cv-kpis ${review.loading ? 'is-loading' : ''}`} aria-label="Summary">
            {[
              { icon: <SendIcon size={16} />, name: 'CVs shared', value: rows.length, note: `Calls that ended in CV shared ${periodWords}` },
              { icon: <UsersIcon size={16} />, name: 'Students', value: students, note: 'Who shared them' },
              { icon: <BuildingIcon size={16} />, name: 'Companies', value: companies, note: 'Their CVs went to' },
            ].map((tile) => (
              <div key={tile.name} className="kpi cv-kpi">
                <div className="kpi-top">
                  <span className="kpi-badge" aria-hidden="true">
                    {tile.icon}
                  </span>
                  <span className="kpi-name">{tile.name}</span>
                </div>
                <p className="kpi-value">{loading ? '—' : formatNumber(tile.value)}</p>
                <p className="kpi-period">{tile.note}</p>
              </div>
            ))}
          </section>

          <section className="card card-flush">
            <CardHeader
              icon={<SendIcon />}
              title={
                <>
                  CVs shared <span className="count-badge">{loading ? '—' : formatNumber(shown.length)}</span>
                </>
              }
              description="Newest first. Click a company to open its job and HR details."
            />
            <div className="toolbar">
              <label className="search">
                <SearchIcon />
                <input
                  type="search"
                  placeholder="Search student, company, number or person"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search the CVs shared"
                />
              </label>
            </div>
            {loading ? (
              <div className="company-jobs-loading cv-loading" aria-busy="true" aria-label="Loading the CVs shared">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="skeleton" />
                ))}
              </div>
            ) : !shown.length ? (
              <p className="empty">
                {query
                  ? 'Nothing matches this search.'
                  : `No CV shared ${periodWords} yet. A call shows here once its remark is set to CV shared (Review board, Assign numbers or the Performance report).`}
              </p>
            ) : (
              <div className="table-wrap">
                <table className="data-table cv-table">
                  <thead>
                    <tr>
                      <th scope="col">Shared</th>
                      <th scope="col">Student</th>
                      <th scope="col">HR contact</th>
                      <th scope="col">Company and job</th>
                      <th scope="col">Found by</th>
                      <th scope="col">Given out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((row) => {
                      const course = courses.find((c) => c.id === row.job.course);
                      const feedback = row.feedback!;
                      return (
                        <tr key={row.id}>
                          <td className="nowrap">
                            <time dateTime={feedback.at}>{when(feedback.at)}</time>
                            <span className="cv-sub">by {personName(feedback.by)}</span>
                          </td>
                          <th scope="row" className="cv-student">
                            {row.student || <span className="muted">No student</span>}
                          </th>
                          <td>
                            <span className="cv-contact">
                              <span className={`perf-kind ${row.field}`}>
                                {row.field === 'phone' ? <PhoneIcon size={13} /> : <MailIcon size={13} />}
                                <span className="sr-only">{row.field === 'phone' ? 'Phone' : 'Email'}</span>
                              </span>
                              <span className="perf-value">{row.value}</span>
                              <CopyButton value={row.value} what={row.field === 'phone' ? 'phone number' : 'email'} />
                            </span>
                          </td>
                          <td className="cv-job">
                            <button type="button" className="ci-job-open" onClick={() => openJob(row.id, row.job)} aria-haspopup="dialog" title="Open this job">
                              <strong>{row.job.company || 'Company not shown'}</strong>
                              <span>{row.job.title}</span>
                            </button>
                            {course && (
                              <span className="cv-course" style={{ '--course': COURSE_COLORS[course.id] } as CSSProperties}>
                                <span className="dot" aria-hidden="true" />
                                {course.name}
                              </span>
                            )}
                            {opening?.id === row.id && opening.problem && (
                              <span className="field-error" role="status">
                                {opening.problem}
                              </span>
                            )}
                          </td>
                          <td>
                            <FoundBy row={row} />
                          </td>
                          <td>
                            {row.given ? (
                              <>
                                <span>{personName(row.given.by)}</span>
                                <span className="cv-sub">
                                  {when(row.given.at)}
                                  {feedback.hours != null && ` · CV ${after(feedback.hours)} later`}
                                </span>
                              </>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {review.data?.truncated && <p className="page-footnote">Only the latest calls of this period are counted. Choose fewer days to see them all.</p>}
          </section>
        </>
      )}
      {modal}
    </main>
  );
}
