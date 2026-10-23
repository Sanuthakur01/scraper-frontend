import type { Metadata } from 'next';
import ActivityLog from '@/components/ActivityLog';

export const metadata: Metadata = { title: 'Activity · IJF HR Database' };

export default function ActivityPage() {
  return <ActivityLog />;
}
