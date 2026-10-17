import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import TopNav from '@/components/TopNav';
import './globals.css';

export const metadata: Metadata = {
  title: 'India Job Tracker',
  description: 'New job openings in India for Data Analyst, Data Science, Data Engineering and Production Support roles',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TopNav />
        {children}
      </body>
    </html>
  );
}
