import type { Metadata } from 'next';
import { Suspense } from 'react';
import IncomingCalls from '@/components/IncomingCalls';
import { PageSkeleton } from '@/components/PageParts';

export const metadata: Metadata = { title: 'Incoming calls · IJF HR Database' };

// The page reads its period from the address (?days=1, or ?from=&to=); in a static build that needs a Suspense boundary.
export default function IncomingCallsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <IncomingCalls />
    </Suspense>
  );
}
