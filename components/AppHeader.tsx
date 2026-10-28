'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAccess, UserMenu } from './AuthGate';
import DataViewToggle from './DataViewToggle';
import ThemeToggle from './ThemeToggle';

// short: the tab's label (the five pages' full names don't fit the bar at any width; label is its title,
// shown on hover). The tabs are words only: with icons too, a longer role badge pushed tabs out of the bar.
const PAGES: { href: string; label: string; short: string; matches: (path: string) => boolean }[] = [
  { href: '/', label: 'Dashboard', short: 'Dashboard', matches: (path) => path === '/' || path.startsWith('/course') },
  { href: '/performance', label: 'Performance report', short: 'Performance', matches: (path) => path.startsWith('/performance') },
  { href: '/partners', label: 'Hiring partners', short: 'Partners', matches: (path) => path.startsWith('/partners') || path.startsWith('/servicenow') },
  { href: '/activity', label: 'Activity', short: 'Activity', matches: (path) => path.startsWith('/activity') },
  { href: '/review', label: 'Review board', short: 'Review', matches: (path) => path.startsWith('/review') || path.startsWith('/assign') },
];

// The bar across the top of every page: the product name, the five main pages, light/dark, the
// signed-in person's role and account menu (profile, sign out), and the Filtered / Non-filtered switch
// (on phones it gets a row of its own).
export default function AppHeader() {
  const path = usePathname() ?? '/';
  const access = useAccess();
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link href="/" className="brand" aria-label="IJF HR Database: dashboard">
          <span className="brand-mark" aria-hidden="true">
            IJF
          </span>
          <span className="brand-text">
            <span className="brand-name">HR Database</span>
            <span className="brand-tag">India hiring insights</span>
          </span>
        </Link>
        <nav className="app-nav" aria-label="Pages">
          {PAGES.map((page) => (
            <Link key={page.href} href={page.href} aria-current={page.matches(path) ? 'page' : undefined} title={page.label}>
              {page.short}
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
