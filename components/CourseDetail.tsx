'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApi } from '@/lib/api';
import {
  COURSE_COLORS,
  experienceBands,
  formatDateTime,
  formatDay,
  formatNumber,
  percent,
  PERIODS,
  periodFrom,
} from '@/lib/format';
import type { CourseDetailResponse, CourseId, Meta, PostingAgeBucket, TrendsResponse } from '@/lib/types';
import { RankList } from './Insights';
import FilterNote from './FilterNote';
import JobsTable from './JobsTable';
import PeriodTabs from './PeriodTabs';
import { Delta } from './StatTiles';
import TrendChart from './TrendChart';

const AGE_BUCKETS: { id: PostingAgeBucket; label: string }[] = [
  { id: 'day', label: 'Under 1 day' },
  { id: '3days', label: '1–3 days' },
  { id: 'week', label: '4–7 days' },
  { id: 'month', label: '1–4 weeks' },
  { id: 'older', label: 'Over a month' },
  { id: 'unknown', label: 'Date not shown' },
];

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }) : '—';

// Everything about one course: opened by clicking its tile on the dashboard.
export default function CourseDetail({ courseId }: { courseId: CourseId }) {
  const router = useRouter();
  const period = periodFrom(useSearchParams().get('days'));
  const { days } = period;

  const meta = useApi<Meta>('meta');
  const detail = useApi<CourseDetailResponse>(`course/${courseId}`, { days });
  const trends = useApi<TrendsResponse>('trends', { days: 30 });

  if (meta.error || detail.error) {
    return <p className="page-error">Could not load this course: {(meta.error ?? detail.error)?.message}</p>;
  }
  if (!meta.data || !detail.data) return <p className="page-loading">Loading…</p>;

  const d = detail.data;
  const course = d.course;
  const color = COURSE_COLORS[courseId];
  const range = meta.data.filters.experience;
  const bands = experienceBands(range);
  // Jobs at the lower end of the experience range (2–3 years by default).
  const earlyCareer = bands.slice(0, 2).reduce((n, b) => n + (d.experience[b.id] ?? 0), 0);
  const loading = detail.loading ? 'is-loading' : '';

  return (
    <main className="page">
      <Link className="back-link" href={`/?days=${days}`}>
        ← All courses
      </Link>

      <header className="page-header">
        <div>
          <p className="eyebrow">India · {formatDay(d.anchor)} · Course details</p>
          <h1 className="course-title">
            <span className="swatch swatch-lg" style={{ background: color }} aria-hidden="true" />
            {course.name}
          </h1>
          <p className="subtitle">New job openings for this course across {meta.data.platforms.join(', ')}</p>
          <FilterNote filters={meta.data.filters} />
        </div>
        <div className="refresh">
          <p>Last refreshed: {formatDateTime(d.freshness.lastRefreshed)}</p>
          <p>{meta.data.scheduleLabel}</p>
        </div>
      </header>

      <PeriodTabs periods={PERIODS} days={days} onChange={(n) => router.replace(`/course/${courseId}?days=${n}`, { scroll: false })} />

      <section className={`tiles ${loading}`} aria-label={`${course.name} summary`}>
        <div className="tile tile-total">
          <p className="tile-label">New jobs · {period.tab.toLowerCase()}</p>
          <p className="tile-value hero">{formatNumber(d.total)}</p>
          <Delta current={d.total} previous={d.previous} label={period.previous} />
        </div>
        <div className="tile">
          <p className="tile-label">Listed on 2+ platforms</p>
          <p className="tile-value">{formatNumber(d.multiPlatform)}</p>
          <p className="delta">{percent(d.multiPlatform, d.total)} of these jobs</p>
        </div>
        <div className="tile">
          <p className="tile-label">
            Asking {range.min}–{range.min + 1} years
          </p>
          <p className="tile-value">{formatNumber(earlyCareer)}</p>
          <p className="delta">{percent(earlyCareer, d.total)} of these jobs</p>
        </div>
        <div className="tile">
          <p className="tile-label">Salary shown</p>
          <p className="tile-value">{formatNumber(d.salaryShown)}</p>
          <p className="delta">
            {percent(d.salaryShown, d.total)} · remote / WFH: {formatNumber(d.remote)}
          </p>
        </div>
      </section>

      <div className={`detail-grid ${loading}`}>
        <section className="card">
          <h2>Where these jobs came from</h2>
          <p className="card-note">
            Each job counts once, under the platform where it was posted first. “Listed there” counts every job that
            appeared on that platform, including ones also found elsewhere.
          </p>
          <div className="table-wrap">
            <table className="data-table numeric">
              <thead>
                <tr>
                  <th scope="col">Platform</th>
                  <th scope="col">Jobs</th>
                  <th scope="col">Share</th>
                  <th scope="col">Listed there</th>
                </tr>
              </thead>
              <tbody>
                {d.platforms.map((p) => (
                  <tr key={p.platform}>
                    <th scope="row">{p.platform}</th>
                    <td>
                      <span className="cell-bar">
                        <span className="cell-bar-fill" style={{ width: `${d.total ? (p.counted / d.total) * 100 : 0}%`, background: color }} />
                        <span>{formatNumber(p.counted)}</span>
                      </span>
                    </td>
                    <td>{percent(p.counted, d.total)}</td>
                    <td>{formatNumber(p.listed)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">All platforms</th>
                  <td>{formatNumber(d.total)}</td>
                  <td>{d.total ? '100%' : '—'}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section className="card">
          <h2>How old the postings were when found</h2>
          <p className="card-note">Time between the platform’s posting date and when our collector first found the job.</p>
          <RankList items={AGE_BUCKETS.map((b) => ({ name: b.label, count: d.postingAge[b.id] ?? 0 }))} color={color} />
        </section>
      </div>

      <section className={`card ${loading}`}>
        <h2>Data freshness</h2>
        <dl className="facts">
          <div>
            <dt>Last refreshed</dt>
            <dd>{formatDateTime(d.freshness.lastRefreshed)}</dd>
          </div>
          <div>
            <dt>Jobs on this page were found</dt>
            <dd>
              {d.freshness.firstFoundInView
                ? `${formatDateTime(d.freshness.firstFoundInView)} – ${formatDateTime(d.freshness.lastFoundInView)}`
                : 'No jobs in this period'}
            </dd>
          </div>
          <div>
            <dt>Oldest record kept</dt>
            <dd>
              {formatDate(d.freshness.oldestKept)} <span className="muted">(records are kept {d.freshness.retentionDays} days)</span>
            </dd>
          </div>
          <div>
            <dt>Records stored for this course</dt>
            <dd>{formatNumber(d.freshness.storedTotal)} (all dates)</dd>
          </div>
        </dl>
      </section>

      <section className="card">
        <h2>Daily new {course.name} jobs, up to the last 30 days</h2>
        <TrendChart courses={[course]} state={trends} />
      </section>

      <div className={`insights ${loading}`}>
        <section className="card">
          <h2>Top hiring companies</h2>
          <RankList items={d.companies} color={color} />
        </section>
        <section className="card">
          <h2>Top cities</h2>
          <RankList items={d.cities} color={color} />
        </section>
        <section className="card">
          <h2>Experience asked for</h2>
          <RankList items={d.total ? bands.map((b) => ({ name: b.label, count: d.experience[b.id] ?? 0 })) : []} color={color} />
        </section>
        <section className="card">
          <h2>Most-requested skills</h2>
          <RankList items={d.skills} color={color} />
        </section>
      </div>

      <JobsTable courses={meta.data.courses} meta={meta.data} days={days} lockedCourse={courseId} title={`${course.name} postings`} />
    </main>
  );
}
