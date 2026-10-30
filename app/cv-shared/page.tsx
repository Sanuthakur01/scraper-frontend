import type { Metadata } from 'next';
import { Suspense } from 'react';
import CvShared from '@/components/CvShared';
import { PageSkeleton } from '@/components/PageParts';

export const metadata: Metadata = { title: 'CV shared · IJF HR Database' };

// The page reads its period from the address (?days=1, or ?from=&to=); in a static build that needs a Suspense boundary.
export default function CvSharedPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CvShared />
    </Suspense>
  );
}
