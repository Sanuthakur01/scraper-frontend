import type { Metadata } from 'next';
import Report from '@/components/Report';

export const metadata: Metadata = { title: 'Weekly report · India Job Tracker' };

export default function ReportPage() {
  return <Report />;
}
