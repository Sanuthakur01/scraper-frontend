'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useApi } from '@/lib/api';
import { useDataView } from '@/lib/dataView';
import { COURSE_COLORS, courseInitials, experienceBands, formatDate, formatDay, formatNumber, percent, periodFrom, periodParams, periodQuery } from '@/lib/format';
import { filtersFromAddress, POSTING_AGES, useJobFilters, type JobFilters } from '@/lib/jobFilters';
import type { CourseDetailResponse, CourseId, Meta, PostingAgeBucket, TrendsResponse } from '@/lib/types';
import {
  ArrowDownIcon,
  BriefcaseIcon,
  BuildingIcon,
  CheckIcon,
  ChevronLeftIcon,
  ClockIcon,
  LayersIcon,
  MapPinIcon,
  RupeeIcon,
  SparklesIcon,
  TrendIcon,
} from './Icons';
import { ExperienceColumns, RankList } from './Insights';
import JobsTable from './JobsTable';
import { CardHeader, Freshness, PageError, PageHeader, PageSection, PageSkeleton } from './PageParts';
import PeriodTabs from './PeriodTabs';
import { Delta } from './StatTiles';
import TrendChart from './TrendChart';

// A table number that shows its jobs in the job list when clicked (plain text when there are none).
function CountButton({ count, label, onClick }: { count: number; label: string; onClick: () => void }) {
  if (!count) return <>{formatNumber(count)}</>;
  return (
    <button type="button" className="cell-btn" onClick={onClick} aria-label={`${label}: ${formatNumber(count)}. Show them`}>
      {formatNumber(count)}
    </button>
  );
}

// A number card that, when clicked, shows the jobs it counts in the job list below.
function CardButton({
  icon,
  name,
  value,
  note,
  extra,
  active,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  name: string;
  value: ReactNode;
  note: ReactNode;
  extra?: ReactNode;
  active: boolean; // the list below shows exactly this card's jobs
  disabled: boolean; // no jobs to show
  onClick: () => void;
}) {
  return (
    <button type="button" className="kpi kpi-action" aria-pressed={active} disabled={disabled} onClick={onClick}>
      <span className="kpi-top">
        <span className="kpi-badge" aria-hidden="true">
          {icon}
        </span>
        <span className="kpi-name">{name}</span>
      </span>
      <span className="kpi-value">{value}</span>
      <span className="kpi-period">{note}</span>
      {extra}
      {!disabled && (
        <span className="kpi-cta">
          {active ? (
            <>
              <CheckIcon size={14} /> Showing below
            </>
          ) : (
            <>
              Show these jobs <ArrowDownIcon size={14} />
            </>
          )}
        </span>
      )}
    </button>
  );
}

// Everything about one course: opened by clicking its card on the dashboard. The job list comes first
// (that's what people open a course for), then where the jobs come from and what they ask for.
export default function CourseDetail({ courseId }: { courseId: CourseId }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const period = periodFrom(searchParams);
  const query = periodQuery(period);
  // Filters in the address (a link from IJF AI): shown in the job list, scrolled into view.
  const linked = JSON.stringify(filtersFromAddress(searchParams));
  const jobFilters = useJobFilters();
  const { view } = useDataView();

  const meta = useApi<Meta>('meta');
  const detail = useApi<CourseDetailResponse>(`course/${courseId}`, periodParams(period));
  const trends = useApi<TrendsResponse>('trends', { days: 30 });

  // A link's filters: applied once each, then the job list scrolled into view when it is there.
  const applied = useRef('');
  useEffect(() => {
    if (linked === '{}' || applied.current === linked) return;
    applied.current = linked;
    jobFilters.show(JSON.parse(linked));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the address's filters change
  }, [linked]);
  const loaded = Boolean(detail.data);
  useEffect(() => {
    if (linked === '{}' || !loaded) return;
    const timer = setTimeout(() => document.getElementById('jobs')?.scrollIntoView({ block: 'start' }), 200);
    return () => clearTimeout(timer);
  }, [linked, loaded]);

  if (meta.error || detail.error) return <PageError title="Could not load this course" error={meta.error ?? detail.error} />;
  if (!meta.data || !detail.data) return <PageSkeleton />;

  const d = detail.data;
  const course = d.course;
  const color = COURSE_COLORS[courseId];
  const experience = experienceBands(meta.data.filters.experience, view).map((b) => ({ id: b.id, name: b.label, count: d.experience[b.id] ?? 0 }));
  const topExperience = experience.reduce((best, e) => (e.count > best.count ? e : best), experience[0]);
  const loading = detail.loading ? 'is-loading' : '';

  // The jobs behind a card or a chart, in the job list (every other filter cleared, so the list holds
  // exactly what that number counts), scrolled into view.
  const showJobs = (only: Partial<JobFilters>) => {
    jobFilters.show(only);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('jobs')?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <main className="page course-page" style={{ '--course': color } as CSSProperties}>
      <PageHeader
        eyebrow={
          <Link className="back-link" href={`/?${query}`}>
            <ChevronLeftIcon size={14} /> Dashboard
          </Link>
        }
        title={course.name}
        subtitle={`New openings for this course on ${meta.data.platforms.join(', ')} · ${period.from ? period.label : formatDay(d.anchor)}`}
        actions={
          <PeriodTabs
            period={period}
            first={meta.data.dataDays?.first}
            last={meta.data.dataDays?.last ?? d.anchor}
            onChange={(next) => router.replace(`/course/${courseId}?${next}`, { scroll: false })}
          />
        }
      >
        <Freshness lastRun={meta.data.lastRun} scheduleLabel={meta.data.scheduleLabel} />
      </PageHeader>

      <nav className="course-tabs" aria-label="Courses">
        {meta.data.courses.map((c) => (
          <Link
            key={c.id}
            href={`/course/${c.id}?${query}`}
            aria-current={c.id === courseId ? 'page' : undefined}
            style={{ '--course': COURSE_COLORS[c.id] } as CSSProperties}
          >
            <span className="dot" aria-hidden="true" />
            {c.name}
          </Link>
        ))}
      </nav>

      <section className={`kpis kpis-4 ${loading}`} aria-label={`${course.name}: click a card to see its jobs in the list below`}>
        <CardButton
          icon={<TrendIcon size={16} />}
          name="New jobs"
          value={formatNumber(d.total)}
          note={period.title}
          extra={<Delta current={d.total} previous={d.previous} label={period.previous} quiet />}
          active={jobFilters.showing({})}
          disabled={!d.total}
          onClick={() => showJobs({})}
        />
        <CardButton
          icon={<LayersIcon size={16} />}
          name="Listed on 2+ sites"
          value={formatNumber(d.multiPlatform)}
          note={`${percent(d.multiPlatform, d.total)} of these jobs`}
          active={jobFilters.showing({ sites: '2' })}
          disabled={!d.multiPlatform}
          onClick={() => showJobs({ sites: '2' })}
        />
        <CardButton
          icon={<BriefcaseIcon size={16} />}
          name="Most asked experience"
          value={topExperience.count ? topExperience.name : '—'}
          note={
            topExperience.count
              ? `${formatNumber(topExperience.count)} jobs · ${percent(topExperience.count, d.total)} of these`
              : 'No jobs in this period'
          }
          active={topExperience.count > 0 && jobFilters.showing({ exp: topExperience.id })}
          disabled={!topExperience.count}
          onClick={() => showJobs({ exp: topExperience.id })}
        />
        <CardButton
          icon={<RupeeIcon size={16} />}
          name="Salary shown"
          value={formatNumber(d.salaryShown)}
          note={`${percent(d.salaryShown, d.total)} of these jobs`}
          active={jobFilters.showing({ salary: 'shown' })}
          disabled={!d.salaryShown}
          onClick={() => showJobs({ salary: 'shown' })}
        />
      </section>

      <JobsTable
        courses={meta.data.courses}
        meta={meta.data}
        period={period}
        filterState={jobFilters}
        lockedCourse={courseId}
        title={`${course.name} jobs`}
      />

      <PageSection title="About these jobs" description="Where this course's new jobs come from, who posts them and what they ask for">
        <div className={`grid-2 ${loading}`}>
          <section className="card">
            <CardHeader
              icon={<LayersIcon />}
              level={3}
              title="Where they come from"
              description="Counted once, on the site posted first. “On site” includes jobs also found elsewhere."
            />
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Site</th>
                    <th scope="col" className="num">
                      Jobs
                    </th>
                    <th scope="col" className="num">
                      Share
                    </th>
                    <th scope="col" className="num">
                      On site
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.platforms.map((p) => (
                    <tr key={p.platform}>
                      <th scope="row">{p.platform}</th>
                      <td className="num">
                        <span className="cell-bar">
                          <span className="cell-bar-track" aria-hidden="true">
                            {p.counted > 0 && <span className="cell-bar-fill" style={{ width: `${(p.counted / d.total) * 100}%` }} />}
                          </span>
                          <CountButton count={p.counted} label={`First posted on ${p.platform}`} onClick={() => showJobs({ primary: p.platform })} />
                        </span>
                      </td>
                      <td className="num muted">{percent(p.counted, d.total)}</td>
                      <td className="num">
                        <CountButton count={p.listed} label={`Listed on ${p.platform}`} onClick={() => showJobs({ platform: p.platform })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">All sites</th>
                    <td className="num">
                      <CountButton count={d.total} label="All new jobs" onClick={() => showJobs({})} />
                    </td>
                    <td className="num muted">{d.total ? '100%' : '—'}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section className="card">
            <CardHeader
              icon={<ClockIcon />}
              level={3}
              title="How fresh the posts were"
              description="Time from the site's posting date to when we found the job"
            />
            <RankList
              items={POSTING_AGES.map((b) => ({ id: b.id, name: b.label, count: d.postingAge[b.id as PostingAgeBucket] ?? 0 }))}
              color={color}
              selected={jobFilters.filters.age}
              onSelect={(item) => showJobs({ age: item.id })}
            />
          </section>
        </div>

        <section className="card">
          <CardHeader level={3} icon={<TrendIcon />} title="New jobs per day" description="The last 30 days" />
          <TrendChart courses={[course]} state={trends} onSelectDay={(day) => showJobs({ day })} />
        </section>

        <div className={`grid-2 ${loading}`}>
          <section className="card">
            <CardHeader level={3} icon={<BuildingIcon />} title="Top hiring companies" description="Most new openings for this course" />
            <RankList items={d.companies} color={color} selected={jobFilters.filters.company} onSelect={(item) => showJobs({ company: item.name })} />
          </section>
          <section className="card">
            <CardHeader level={3} icon={<MapPinIcon />} title="Top cities" description="Where these openings are" />
            <RankList items={d.cities} color={color} selected={jobFilters.filters.city} onSelect={(item) => showJobs({ city: item.name })} />
          </section>
          <section className="card card-grow">
            <CardHeader level={3} icon={<BriefcaseIcon />} title="Experience asked for" description="Minimum years in the job post (5+ = more than 5)" />
            <ExperienceColumns
              items={d.total ? experience : []}
              color={color}
              selected={jobFilters.filters.exp}
              onSelect={(item) => showJobs({ exp: item.id })}
            />
          </section>
          <section className="card">
            <CardHeader level={3} icon={<SparklesIcon />} title="Most requested skills" description="Job posts naming each skill" />
            <RankList items={d.skills} color={color} selected={jobFilters.filters.skill} onSelect={(item) => showJobs({ skill: item.name })} />
          </section>
        </div>
      </PageSection>

      <p className="page-footnote">
        Records are kept {d.freshness.retentionDays} days · oldest: {formatDate(d.freshness.oldestKept)} ·{' '}
        {formatNumber(d.freshness.storedTotal)} {course.name} jobs stored in all
        {d.freshness.firstFoundInView ? ` · jobs on this page were found ${formatDate(d.freshness.firstFoundInView)} – ${formatDate(d.freshness.lastFoundInView)}` : ''}
      </p>
    </main>
  );
}
