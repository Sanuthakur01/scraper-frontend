'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useApi } from '@/lib/api';
import { useDataView } from '@/lib/dataView';
import { periodFrom } from '@/lib/format';
import type { Meta } from '@/lib/types';
import { Freshness, PageError, PageHeader, PageSkeleton } from './PageParts';
import PeriodTabs from './PeriodTabs';
import RoleOpenings from './RoleOpenings';

interface Props {
  role: string; // a role box's id on the server (config/roleBoxes.js), e.g. 'sre'
  path: string; // this page's address, e.g. '/sre'
  eyebrow: string; // before the period at the top, e.g. 'Production Support'
  title: string;
  subtitle: string;
  noun: string; // what it lists, in messages ("No SRE openings in this period")
}

// One role's page (/sre, /servicenow): every opening of the chosen period with that role's job titles,
// in the Filtered or Non-filtered jobs as the switch at the top says. Its period is in the address
// (?days=7, or ?from=&to=).
export default function RolePage({ role, path, eyebrow, title, subtitle, noun }: Props) {
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
        eyebrow={`${eyebrow} · ${period.label}`}
        title={title}
        subtitle={subtitle}
        actions={
          <PeriodTabs
            period={period}
            first={dataDays?.first}
            last={dataDays?.last}
            onChange={(query) => router.replace(`${path}?${query}`, { scroll: false })}
          />
        }
      >
        <Freshness lastRun={lastRun} scheduleLabel={scheduleLabel} />
      </PageHeader>

      <RoleOpenings
        role={role}
        title="Openings"
        noun={noun}
        description={
          view === 'nonfiltered'
            ? 'Non-filtered · newest first, each tagged with why our filters leave it out'
            : view === 'all'
              ? 'All (Filtered and Non-filtered) · newest first, each Non-filtered one tagged with why'
              : 'Filtered · newest first'
        }
        period={period}
        courses={courses}
      />
    </main>
  );
}
