import type { Metadata } from 'next';
import Partners from '@/components/Partners';

export const metadata: Metadata = { title: 'Hiring partners · India Job Tracker' };

export default function PartnersPage() {
  return <Partners />;
}
