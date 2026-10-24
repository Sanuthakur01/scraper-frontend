import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageSkeleton } from '@/components/PageParts';
import SreOpenings from '@/components/SreOpenings';

export const metadata: Metadata = { title: 'SRE Openings · IJF HR Database' };

// The page reads its period from the address (?days=7); in a static build that needs a Suspense boundary.
export default function SrePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SreOpenings />
    </Suspense>
  );
}
