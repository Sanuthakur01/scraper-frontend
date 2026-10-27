import type { Metadata } from 'next';
import { Suspense } from 'react';
import AssignNumbers from '@/components/AssignNumbers';
import { PageSkeleton } from '@/components/PageParts';

export const metadata: Metadata = { title: 'Assign numbers · IJF HR Database' };

// The page reads its period from the address (?days=7); in a static build that needs a Suspense boundary.
export default function AssignPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AssignNumbers />
    </Suspense>
  );
}
