'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { DashboardIcon, ReportIcon, UsersIcon } from './Icons';
import ThemeToggle from './ThemeToggle';

// short: the label on phones, where the three full labels don't fit in one row.
const PAGES: { href: string; label: string; short: string; icon: ReactNode; matches: (path: string) => boolean }[] = [
  { href: '/', label: 'Dashboard', short: 'Dashboard', icon: <DashboardIcon />, matches: (path) => path === '/' || path.startsWith('/course') },
  { href: '/report', label: 'Weekly report', short: 'Report', icon: <ReportIcon />, matches: (path) => path.startsWith('/report') },
  { href: '/partners', label: 'Hiring partners', short: 'Partners', icon: <UsersIcon />, matches: (path) => path.startsWith('/partners') },
];

// The bar across the top of every page: the product name, the three main pages, and light/dark.
export default function AppHeader() {
  const path = usePathname() ?? '/';
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link href="/" className="brand" aria-label="IJF Job Tracker: dashboard">
          <span className="brand-mark" aria-hidden="true">
            IJF
          </span>
          <span className="brand-text">
            <span className="brand-name">Job Tracker</span>
            <span className="brand-tag">India hiring insights</span>
          </span>
        </Link>
        <nav className="app-nav" aria-label="Pages">
          {PAGES.map((page) => (
            <Link key={page.href} href={page.href} aria-current={page.matches(path) ? 'page' : undefined}>
              <span className="nav-icon" aria-hidden="true">
                {page.icon}
              </span>
              <span className="label-long">{page.label}</span>
              <span className="label-short">{page.short}</span>
            </Link>
          ))}
        </nav>
        <div className="app-header-end">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
