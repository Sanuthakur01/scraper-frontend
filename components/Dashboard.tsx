'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useApi } from '@/lib/api';
import { formatDateTime, formatDay, formatNumber, PERIODS, periodFrom } from '@/lib/format';
import type { InsightsResponse, Meta, PlatformsResponse, Summary, TrendsResponse } from '@/lib/types';
import PeriodTabs from './PeriodTabs';
import StatTiles from './StatTiles';
import PlatformChart from './PlatformChart';
import PlatformTable from './PlatformTable';
import TrendChart from './TrendChart';
import Insights from './Insights';
import Placements from './Placements';
import SkillGaps from './SkillGaps';
import FilterNote from './FilterNote';

// The main dashboard. The data changes daily and is fetched in the browser.
export default function Dashboard() {
  const router = useRouter();
  const period = periodFrom(useSearchParams().get('days'));
  const { days } = period;

  const meta = useApi<Meta>('meta');
  const summary = useApi<Summary>('summary', { days });
  const platforms = useApi<PlatformsResponse>('platforms', { days });
  const trends = useApi<TrendsResponse>('trends', { days: 30 });
  const insights = useApi<InsightsResponse>('insights', { days });

  if (meta.error) return <p className="page-error">Could not reach the server: {meta.error.message}</p>;
  if (!meta.data) return <p className="page-loading">Loading…</p>;

  const { courses, lastRun, scheduleLabel, demo } = meta.data;
  const anchor = summary.data?.anchor;
  const failedSearches = lastRun?.failedSearches ?? [];

  return (
    <main className="page">
      {demo && (
        <p className="banner">
          <strong>Demo data.</strong> Every company, number and link on this page is generated for testing. Real
          figures appear once the collector runs with your Apify token.
        </p>
      )}

      <header className="page-header">
        <div>
          <p className="eyebrow">India · {anchor ? formatDay(anchor) : '—'}</p>
          <h1>{period.title}</h1>
          <p className="subtitle">
            {courses.map((c) => c.name).join(', ')} roles across {meta.data.platforms.join(', ')}
          </p>
          <FilterNote filters={meta.data.filters} />
        </div>
        <div className="refresh">
          <p>Last refreshed: {formatDateTime(lastRun?.finishedAt)}</p>
          <p>{scheduleLabel}</p>
          {failedSearches.length > 0 && (
            <p className="refresh-warning" title={failedSearches.join('\n')}>
              ⚠ {failedSearches.length} of the searches failed in the last run
            </p>
          )}
        </div>
      </header>

      <PeriodTabs periods={PERIODS} days={days} onChange={(d) => router.replace(`/?days=${d}`, { scroll: false })} />

      <StatTiles courses={courses} state={summary} period={period} />

      <Placements days={days} />

      <section className="card">
        <h2>New jobs by platform</h2>
        <p className="card-note">
          Each job counts once, under the platform where it was posted first.
          {platforms.data?.multiPlatform
            ? ` ${formatNumber(platforms.data.multiPlatform)} of these jobs were listed on more than one platform.`
            : ''}
        </p>
        <PlatformChart courses={courses} state={platforms} />
      </section>

      <section className="card">
        <h2>Counts by platform and course</h2>
        <PlatformTable courses={courses} state={platforms} />
      </section>

      <section className="card">
        <h2>Daily new jobs, up to the last 30 days</h2>
        <TrendChart courses={courses} state={trends} />
      </section>

      <Insights courses={courses} state={insights} experienceRange={meta.data.filters.experience} />

      <SkillGaps courses={courses} days={days} experience={meta.data.filters.experience} />
    </main>
  );
}
