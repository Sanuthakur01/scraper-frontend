import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageSkeleton } from '@/components/PageParts';
import ServiceNowOpenings from '@/components/ServiceNowOpenings';

export const metadata: Metadata = { title: 'ServiceNow Openings · IJF HR Database' };

// The page reads its period from the address (?from=&to=); in a static build that needs a Suspense boundary.
export default function ServiceNowPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ServiceNowOpenings />
    </Suspense>
  );
}
