import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageSkeleton } from '@/components/PageParts';
import PerformanceReport from '@/components/PerformanceReport';

export const metadata: Metadata = { title: 'Performance report · India Job Tracker' };

// The report reads its period from the address (?days=7); in a static build that needs a Suspense boundary.
export default function PerformancePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PerformanceReport />
    </Suspense>
  );
}
