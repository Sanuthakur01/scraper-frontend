'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useAccess, UserMenu } from './AuthGate';
import DataViewToggle from './DataViewToggle';
import { ChartIcon, DashboardIcon, HistoryIcon, UsersIcon } from './Icons';
import ThemeToggle from './ThemeToggle';

// short: the label on phones, where the three full labels don't fit in one row.
const PAGES: { href: string; label: string; short: string; icon: ReactNode; matches: (path: string) => boolean }[] = [
  { href: '/', label: 'Dashboard', short: 'Dashboard', icon: <DashboardIcon />, matches: (path) => path === '/' || path.startsWith('/course') },
  { href: '/performance', label: 'Performance report', short: 'Performance', icon: <ChartIcon />, matches: (path) => path.startsWith('/performance') },
  { href: '/partners', label: 'Hiring partners', short: 'Partners', icon: <UsersIcon />, matches: (path) => path.startsWith('/partners') },
  { href: '/activity', label: 'Activity', short: 'Activity', icon: <HistoryIcon />, matches: (path) => path.startsWith('/activity') },
];

// The bar across the top of every page: the product name, the four main pages, light/dark, the
// signed-in person's role and account menu (profile, sign out), and the Filtered / Non-filtered switch
// (on phones it gets a row of its own).
export default function AppHeader() {
  const path = usePathname() ?? '/';
  const access = useAccess();
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
          {access && (
            <span className="role-badge" title={`Signed in as ${access.label}`}>
              {access.label}
            </span>
          )}
          <span className="user-menu">
            <UserMenu />
          </span>
        </div>
        <div className="app-header-view">
          <DataViewToggle />
        </div>
      </div>
    </header>
  );
}
