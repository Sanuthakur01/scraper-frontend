'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const PAGES = [
  { href: '/', label: 'Dashboard', matches: (path: string) => path === '/' || path.startsWith('/course') },
  { href: '/report', label: 'Weekly report', matches: (path: string) => path.startsWith('/report') },
  { href: '/partners', label: 'Hiring partners', matches: (path: string) => path.startsWith('/partners') },
];

export default function TopNav() {
  const path = usePathname() ?? '/';
  return (
    <nav className="top-nav" aria-label="Pages">
      {PAGES.map((page) => (
        <Link key={page.href} href={page.href} aria-current={page.matches(path) ? 'page' : undefined}>
          {page.label}
        </Link>
      ))}
    </nav>
  );
}
