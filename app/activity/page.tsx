import type { Metadata } from 'next';
import ActivityLog from '@/components/ActivityLog';

export const metadata: Metadata = { title: 'Activity · India Job Tracker' };

export default function ActivityPage() {
  return <ActivityLog />;
}
