import type { ReactNode } from 'react';
import { formatDateTime, formatUpdated } from '@/lib/format';
import type { LastRun } from '@/lib/types';
import { AlertIcon } from './Icons';

// The top of a page: a small line above, a large title (no icon beside it, as on Apple's platforms),
// one line of explanation, a row of small facts (freshness), and the page's controls on the right.
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-heading">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
        {children && <div className="page-meta">{children}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

// A group of cards under a title saying what the group answers. Cards inside use <CardHeader level={3}>.
export function PageSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="page-section">
      <div className="section-heading">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}

// A card's title row: an icon tile (or a step number, for cards that are steps), the title, a short
// explanation, and controls on the right. level: 3 for cards inside a PageSection.
export function CardHeader({
  title,
  description,
  actions,
  icon,
  step,
  level = 2,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  step?: number;
  level?: 2 | 3;
}) {
  const Heading = level === 3 ? 'h3' : 'h2';
  return (
    <div className="card-header">
      <div className="card-heading">
        {step != null ? (
          <span className="card-step" aria-hidden="true">
            {step}
          </span>
        ) : (
          icon && (
            <span className="card-icon" aria-hidden="true">
              {icon}
            </span>
          )
        )}
        <div className="card-titles">
          <Heading>
            {step != null && <span className="sr-only">Step {step}: </span>}
            {title}
          </Heading>
          {description && <p className="card-description">{description}</p>}
        </div>
      </div>
      {actions && <div className="card-actions">{actions}</div>}
    </div>
  );
}

// "Updated today, 4:28 pm", and which sites didn't answer in the last collection (details on hover).
export function Freshness({ lastRun, scheduleLabel }: { lastRun: LastRun | null; scheduleLabel?: string }) {
  const failed = lastRun?.failedSearches ?? [];
  const sites = [...new Set(failed.map((f) => f.split(':')[0]))];
  return (
    <>
      <span className="status-pill" title={`${scheduleLabel ? `${scheduleLabel} · ` : ''}last collection finished ${formatDateTime(lastRun?.finishedAt)}`}>
        <span className={`status-dot ${lastRun ? 'ok' : ''}`} aria-hidden="true" />
        Updated {formatUpdated(lastRun?.finishedAt)}
      </span>
      {sites.length > 0 && (
        <span className="status-pill warn" title={`Searches that failed in the last collection:\n${failed.join('\n')}`}>
          <AlertIcon size={13} />
          No new data from {sites.join(', ')} in the last collection
        </span>
      )}
    </>
  );
}

// A part of a page that couldn't load, in place of what it would show: what went wrong (the server's
// own words, e.g. "Your sign-in has expired…") and Try again, which fetches it again. A page that can't
// load at all shows PageError instead.
export function SectionError({ what, error, onRetry }: { what: string; error: Error; onRetry?: () => void }) {
  return (
    <div className="section-error" role="alert">
      <span className="section-error-icon" aria-hidden="true">
        <AlertIcon size={18} />
      </span>
      <p className="section-error-text">
        <strong>Couldn&apos;t load {what}</strong>
        <span>{error.message}</span>
      </p>
      {onRetry && (
        <button type="button" className="btn btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

// Two to four options, one selected (period, course, chart or table).
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={String(option.value)} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

// Shown while a page's data loads: the page's shape in soft grey, so nothing jumps when it arrives.
export function PageSkeleton() {
  return (
    <main className="page" aria-busy="true">
      <span className="sr-only" role="status">
        Loading…
      </span>
      <div className="skeleton-header" aria-hidden="true">
        <span className="skeleton sk-eyebrow" />
        <span className="skeleton sk-title" />
        <span className="skeleton sk-line" />
      </div>
      <div className="kpis" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="kpi">
            <span className="skeleton sk-label" />
            <span className="skeleton sk-value" />
            <span className="skeleton sk-label" />
          </div>
        ))}
      </div>
      <div className="grid-2" aria-hidden="true">
        {[0, 1].map((i) => (
          <div key={i} className="card">
            <span className="skeleton sk-label" />
            <span className="skeleton sk-block" />
          </div>
        ))}
      </div>
    </main>
  );
}

// A page that could not load: what went wrong, what to check, and a button to try again.
export function PageError({ title, error }: { title: string; error?: Error | null }) {
  return (
    <main className="page">
      <div className="error-card" role="alert">
        <span className="error-icon" aria-hidden="true">
          <AlertIcon size={22} />
        </span>
        <h1>{title}</h1>
        {error?.message && <p className="error-detail">{error.message}</p>}
        <p className="muted">Check that the server is running and your internet is on, then try again.</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    </main>
  );
}
