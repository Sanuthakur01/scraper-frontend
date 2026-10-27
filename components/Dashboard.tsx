'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useApi } from '@/lib/api';
import { formatDay, formatNumber, percent, periodFrom, periodParams } from '@/lib/format';
import type { ShowJobs } from '@/lib/jobFilters';
import type { InsightsResponse, Meta, PlatformsResponse, RoleJobsResponse, Summary, TrendsResponse } from '@/lib/types';
import GlobalSearch from './GlobalSearch';
import HrDetails from './HrDetails';
import { LayersIcon, TrendIcon } from './Icons';
import Insights from './Insights';
import JobsDrawer, { type JobsView } from './JobsDrawer';
import { CardHeader, Freshness, PageError, PageHeader, PageSection, PageSkeleton, Segmented } from './PageParts';
import PeriodTabs from './PeriodTabs';
import PlatformChart from './PlatformChart';
import PlatformTable from './PlatformTable';
import SkillsPanel from './SkillsPanel';
import StatTiles from './StatTiles';
import TrendChart from './TrendChart';

// Three facts under the platform chart: the biggest source, jobs listed on several sites, and how many
// of the searched sites had new jobs (a site with none was probably blocked or down). The first two
// show their jobs when clicked.
function PlatformFacts({ data, sites, onSelect }: { data: PlatformsResponse | null; sites: number; onSelect: ShowJobs }) {
  const rows = data?.platforms ?? [];
  const total = rows.reduce((n, r) => n + r.total, 0);
  const top = rows.reduce<(typeof rows)[number] | null>((best, r) => (!best || r.total > best.total ? r : best), null);
  const multi = data?.multiPlatform ?? 0;
  return (
    <dl className="mini-stats">
      <div>
        <dt>Biggest source</dt>
        <dd>
          {top?.total ? (
            <button type="button" className="stat-btn" onClick={() => onSelect({ primary: top.platform }, `Jobs first posted on ${top.platform}`)}>
              {top.platform} <span className="muted">{percent(top.total, total)}</span>
            </button>
          ) : (
            '—'
          )}
        </dd>
      </div>
      <div>
        <dt>Listed on 2+ sites</dt>
        <dd>
          {multi ? (
            <button type="button" className="stat-btn" onClick={() => onSelect({ sites: '2' }, 'Jobs listed on 2+ sites')}>
              {formatNumber(multi)} <span className="muted">jobs</span>
            </button>
          ) : (
            <>
              0 <span className="muted">jobs</span>
            </>
          )}
        </dd>
      </div>
      <div>
        <dt>Sites with new jobs</dt>
        <dd>
          {rows.filter((r) => r.total > 0).length} <span className="muted">of {sites}</span>
        </dd>
      </div>
    </dl>
  );
}

// The main dashboard. The data changes daily and is fetched in the browser.
export default function Dashboard() {
  const router = useRouter();
  const period = periodFrom(useSearchParams());
  const range = periodParams(period);
  const [platformView, setPlatformView] = useState<'chart' | 'table'>('chart');
  // The side panel listing the jobs behind a clicked bar, day or name (null = closed).
  const [panel, setPanel] = useState<JobsView | null>(null);
  const showJobs: ShowJobs = (filters, title) => setPanel({ filters, title });

  const meta = useApi<Meta>('meta');
  const summary = useApi<Summary>('summary', range);
  const platforms = useApi<PlatformsResponse>('platforms', range);
  const trends = useApi<TrendsResponse>('trends', { days: 30 });
  const insights = useApi<InsightsResponse>('insights', range);
  // The SRE Openings tile: just the count (one job's worth of list).
  const sre = useApi<RoleJobsResponse>('role-jobs', { role: 'sre', ...range, limit: 1 }, { auth: true });

  if (meta.error) return <PageError title="Could not reach the server" error={meta.error} />;
  if (!meta.data) return <PageSkeleton />;

  const { courses, lastRun, scheduleLabel, demo } = meta.data;
  const anchor = summary.data?.anchor;

  return (
    <main className="page">
      {demo && (
        <p className="note-warning">
          <strong>Demo data.</strong> Every company, number and link on this page is generated for testing.
        </p>
      )}

      <PageHeader
        eyebrow={`India job market${period.from ? ` · ${period.label}` : anchor ? ` · ${formatDay(anchor)}` : ''}`}
        title="Job market overview"
        actions={
          <PeriodTabs
            period={period}
            first={meta.data.dataDays?.first}
            last={meta.data.dataDays?.last ?? anchor}
            onChange={(query) => router.replace(`/?${query}`, { scroll: false })}
          />
        }
      >
        <Freshness lastRun={lastRun} scheduleLabel={scheduleLabel} />
      </PageHeader>

      <GlobalSearch courses={courses} />

      <StatTiles courses={courses} state={summary} period={period} onShowAll={() => showJobs({}, 'All new jobs')} sre={sre} />

      <PageSection title="HR contacts">
        <HrDetails courses={courses} state={summary} onSelect={showJobs} />
      </PageSection>

      <PageSection title="Market activity">
        <div className="grid-2">
          <section className="card card-stretch">
            <CardHeader
              icon={<LayersIcon />}
              level={3}
              title="Where the jobs come from"
              description="Each job counted once, on the site that posted it first"
              actions={
                <Segmented
                  label="Show as"
                  value={platformView}
                  onChange={setPlatformView}
                  options={[
                    { value: 'chart', label: 'Chart' },
                    { value: 'table', label: 'Table' },
                  ]}
                />
              }
            />
            {platformView === 'chart' ? (
              <PlatformChart courses={courses} state={platforms} onSelect={showJobs} />
            ) : (
              <PlatformTable courses={courses} state={platforms} onSelect={showJobs} />
            )}
            <PlatformFacts data={platforms.data} sites={meta.data.platforms.length} onSelect={showJobs} />
          </section>

          <section className="card">
            <CardHeader level={3} icon={<TrendIcon />} title="New jobs per day" description="Last 30 days, per course" />
            <TrendChart courses={courses} state={trends} onSelectDay={(day) => showJobs({ day }, `Jobs found on ${formatDay(day)}`)} />
          </section>
        </div>
      </PageSection>

      <PageSection title="Who is hiring">
        <Insights courses={courses} state={insights} experienceRange={meta.data.filters.experience} onSelect={showJobs} />
      </PageSection>

      <PageSection title="Skills and curriculum">
        <SkillsPanel
          courses={courses}
          period={period}
          experience={meta.data.filters.experience}
          requested={insights.data?.skills}
          loading={insights.loading}
          onSelect={showJobs}
        />
      </PageSection>

      <JobsDrawer view={panel} period={period} courses={courses} onClose={() => setPanel(null)} />
    </main>
  );
}
