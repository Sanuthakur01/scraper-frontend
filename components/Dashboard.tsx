'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useApi } from '@/lib/api';
import { formatDay, formatNumber, percent, PERIODS, periodFrom } from '@/lib/format';
import type { InsightsResponse, Meta, PlatformsResponse, Summary, TrendsResponse } from '@/lib/types';
import { DashboardIcon, LayersIcon, TrendIcon } from './Icons';
import Insights from './Insights';
import { CardHeader, Freshness, PageError, PageHeader, PageSection, PageSkeleton, Segmented } from './PageParts';
import PeriodTabs from './PeriodTabs';
import PlatformChart from './PlatformChart';
import PlatformTable from './PlatformTable';
import SkillsPanel from './SkillsPanel';
import StatTiles from './StatTiles';
import TrendChart from './TrendChart';

// Three facts under the platform chart: the biggest source, jobs listed on several sites, and how many
// of the searched sites had new jobs (a site with none was probably blocked or down).
function PlatformFacts({ data, sites }: { data: PlatformsResponse | null; sites: number }) {
  const rows = data?.platforms ?? [];
  const total = rows.reduce((n, r) => n + r.total, 0);
  const top = rows.reduce<(typeof rows)[number] | null>((best, r) => (!best || r.total > best.total ? r : best), null);
  return (
    <dl className="mini-stats">
      <div>
        <dt>Biggest source</dt>
        <dd>
          {top?.total ? (
            <>
              {top.platform} <span className="muted">{percent(top.total, total)}</span>
            </>
          ) : (
            '—'
          )}
        </dd>
      </div>
      <div>
        <dt>Listed on 2+ sites</dt>
        <dd>
          {formatNumber(data?.multiPlatform)} <span className="muted">jobs</span>
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
  const period = periodFrom(useSearchParams().get('days'));
  const { days } = period;
  const [platformView, setPlatformView] = useState<'chart' | 'table'>('chart');

  const meta = useApi<Meta>('meta');
  const summary = useApi<Summary>('summary', { days });
  const platforms = useApi<PlatformsResponse>('platforms', { days });
  const trends = useApi<TrendsResponse>('trends', { days: 30 });
  const insights = useApi<InsightsResponse>('insights', { days });

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
        icon={<DashboardIcon size={20} />}
        eyebrow={`India job market${anchor ? ` · ${formatDay(anchor)}` : ''}`}
        title="Job market overview"
        subtitle={`New openings for your ${courses.length} courses, collected every day from ${meta.data.platforms.join(', ')}.`}
        actions={<PeriodTabs periods={PERIODS} days={days} onChange={(d) => router.replace(`/?days=${d}`, { scroll: false })} />}
      >
        <Freshness lastRun={lastRun} scheduleLabel={scheduleLabel} />
      </PageHeader>

      <StatTiles courses={courses} state={summary} period={period} />

      <PageSection title="Market activity" description="Which sites the new jobs come from, and how many appear each day">
        <div className="grid-2">
          <section className="card card-stretch">
            <CardHeader
              level={3}
              icon={<LayersIcon />}
              title="Where the jobs come from"
              description="Each job counted once, on the site where it was posted first"
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
            {platformView === 'chart' ? <PlatformChart courses={courses} state={platforms} /> : <PlatformTable courses={courses} state={platforms} />}
            <PlatformFacts data={platforms.data} sites={meta.data.platforms.length} />
          </section>

          <section className="card">
            <CardHeader level={3} icon={<TrendIcon />} title="New jobs per day" description="The last 30 days, per course" />
            <TrendChart courses={courses} state={trends} />
          </section>
        </div>
      </PageSection>

      <PageSection title="Who is hiring" description="Companies, cities and experience levels in this period's new jobs">
        <Insights state={insights} experienceRange={meta.data.filters.experience} />
      </PageSection>

      <PageSection title="Skills and curriculum" description="What employers ask for, and how many more jobs students could apply for if a course added a skill">
        <SkillsPanel
          courses={courses}
          days={days}
          experience={meta.data.filters.experience}
          requested={insights.data?.skills}
          loading={insights.loading}
        />
      </PageSection>
    </main>
  );
}
