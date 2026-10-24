'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PulseIcon } from './Icons';

// "SRE Openings" at the top right of every page, right under the Filtered / Non-filtered switch (where the
// team asked for it, 24 Oct 2026, instead of a tab in the top bar). Highlighted on the SRE page itself.
export default function SreQuickLink() {
  const here = (usePathname() ?? '').startsWith('/sre');
  return (
    <Link href="/sre" className="quick-link" aria-current={here ? 'page' : undefined}>
      <PulseIcon size={14} />
      SRE Openings
    </Link>
  );
}
