import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageSkeleton } from '@/components/PageParts';
import ReviewBoard from '@/components/ReviewBoard';

export const metadata: Metadata = { title: 'Review board · IJF HR Database' };

// The board reads its period from the address (?days=7); in a static build that needs a Suspense boundary.
export default function ReviewPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReviewBoard />
    </Suspense>
  );
}
