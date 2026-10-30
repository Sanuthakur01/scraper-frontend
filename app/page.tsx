import { Suspense } from 'react';
import { PageSkeleton } from '@/components/PageParts';
import Home from '@/components/Home';

// The first page: today's numbers, each opening its page. It reads the address (an old dashboard link,
// /?days=7, is sent on to /dashboard); in a static build that needs a Suspense boundary.
export default function HomePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Home />
    </Suspense>
  );
}
