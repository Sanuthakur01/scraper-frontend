'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useApi } from '@/lib/api';
import { useDataView } from '@/lib/dataView';
import { periodFrom } from '@/lib/format';
import type { Meta } from '@/lib/types';
import { Freshness, PageError, PageHeader, PageSkeleton } from './PageParts';
import PeriodTabs from './PeriodTabs';
import RoleOpenings from './RoleOpenings';

// The "SRE Openings" page (/sre): every Site Reliability Engineer opening of the chosen period, in the
// Filtered or Non-filtered jobs as the switch at the top says. Its period is in the address (?days=7, or
// ?from=&to=).
export default function SreOpenings() {
  const router = useRouter();
  const period = periodFrom(useSearchParams());
  const meta = useApi<Meta>('meta');
  const { view } = useDataView();

  if (meta.error) return <PageError title="Could not reach the server" error={meta.error} />;
  if (!meta.data) return <PageSkeleton />;
  const { courses, lastRun, scheduleLabel, dataDays } = meta.data;

  return (
    <main className="page">
      <PageHeader
        eyebrow={`Production Support · ${period.label}`}
        title="SRE Openings"
        subtitle="Every Site Reliability Engineer opening we found, in the Filtered or Non-filtered jobs (the switch at the top). Click a job to add its HR details."
        actions={
          <PeriodTabs
            period={period}
            first={dataDays?.first}
            last={dataDays?.last}
            onChange={(query) => router.replace(`/sre?${query}`, { scroll: false })}
          />
        }
      >
        <Freshness lastRun={lastRun} scheduleLabel={scheduleLabel} />
      </PageHeader>

      <RoleOpenings
        role="sre"
        title="Openings"
        noun="SRE openings"
        description={view === 'nonfiltered' ? 'Non-filtered · newest first, each tagged with why our filters leave it out' : 'Filtered · newest first'}
        period={period}
        courses={courses}
      />
    </main>
  );
}
