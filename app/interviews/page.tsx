import type { Metadata } from 'next';
import { Suspense } from 'react';
import Interviews from '@/components/Interviews';
import { PageSkeleton } from '@/components/PageParts';

export const metadata: Metadata = { title: 'Interviews · IJF HR Database' };

// The page reads its period from the address (?days=1, or ?from=&to=); in a static build that needs a Suspense boundary.
export default function InterviewsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Interviews />
    </Suspense>
  );
}
