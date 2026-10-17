import { Suspense } from 'react';
import Dashboard from '@/components/Dashboard';

// The dashboard reads the period from the address (?days=7); in a static build that needs a Suspense boundary.
export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="page-loading">Loading…</p>}>
      <Dashboard />
    </Suspense>
  );
}
