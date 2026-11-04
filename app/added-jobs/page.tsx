import type { Metadata } from 'next';
import { Suspense } from 'react';
import AddedJobs from '@/components/AddedJobs';
import { PageSkeleton } from '@/components/PageParts';

export const metadata: Metadata = { title: 'Jobs added by the team · IJF HR Database' };

// The page reads its period from the address (?days=1, or ?from=&to=); in a static build that needs a Suspense boundary.
export default function AddedJobsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AddedJobs />
    </Suspense>
  );
}
