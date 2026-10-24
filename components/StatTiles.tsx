import Link from 'next/link';
import type { CSSProperties } from 'react';
import { changePercent, COURSE_COLORS, courseInitials, formatNumber, percent, periodQuery, sumCounts, type Period } from '@/lib/format';
import type { ApiState, Course, Summary } from '@/lib/types';
import { ArrowRightIcon, TrendIcon } from './Icons';
import { SectionError } from './PageParts';

// "▲ 12%" in a green (up) or red (down) badge, then "vs previous 7 days".
// quiet: say nothing (instead of "no earlier data") when there is nothing to compare with.
export function Delta({ current, previous, label, quiet = false }: { current: number; previous: number; label: string; quiet?: boolean }) {
  const pct = changePercent(current, previous);
  // A span (not a p) so it can also sit inside a clickable card, which is a button.
  if (pct == null) return quiet ? null : <span className="delta">No fully collected earlier period to compare with</span>;
  const direction = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  return (
    <span className="delta">
      <span className={`delta-badge ${direction}`}>
        {{ up: '▲', down: '▼', flat: '■' }[direction]} {Math.abs(pct)}%
      </span>
      vs {label}
    </span>
  );
}

interface Props {
  courses: Course[];
  state: ApiState<Summary>;
  period: Period;
  onShowAll: () => void; // "All courses" was clicked: show every new job of the period
}

// The headline numbers: all courses together (it shows those jobs in the side panel), then one
// colour-coded card per course (its share of all new jobs, the change vs the previous period when it
// can be compared) that opens its page.
export default function StatTiles({ courses, state, period, onShowAll }: Props) {
  const current = state.data?.current ?? {};
  // Until the numbers arrive (first load, or after the Filtered / Non-filtered switch): a dash, never 0.
  const shown = (n: number) => (state.data ? formatNumber(n) : '—');
  const previous = state.data?.previous ?? {};
  const total = sumCounts(current);

  return (
    <section className={`kpis ${state.loading ? 'is-loading' : ''}`} aria-label="New jobs per course">
      {state.error && <SectionError what="the numbers" error={state.error} onRetry={state.reload} />}
      <button
        type="button"
        className="kpi kpi-total"
        onClick={onShowAll}
        disabled={!state.data}
        aria-label={`All courses: ${shown(total)} new jobs, ${period.title.toLowerCase()}. Show them`}
      >
        <span className="kpi-top">
          <span className="kpi-badge" aria-hidden="true">
            <TrendIcon size={16} />
          </span>
          <span className="kpi-name">All courses</span>
          <span className="kpi-go" aria-hidden="true">
            <ArrowRightIcon size={16} />
          </span>
        </span>
        <span className="kpi-value">{shown(total)}</span>
        <span className="kpi-period">{period.title}</span>
        <Delta current={total} previous={sumCounts(previous)} label={period.previous} />
      </button>
      {courses.map((course) => {
        const count = current[course.id] ?? 0;
        return (
          <Link
            className="kpi kpi-course"
            key={course.id}
            href={`/course/${course.id}?${periodQuery(period)}`}
            style={{ '--course': COURSE_COLORS[course.id] } as CSSProperties}
            aria-label={`${course.name}: ${formatNumber(count)} new jobs, ${percent(count, total)} of all. Open the course page`}
          >
            <div className="kpi-top">
              <span className="kpi-badge" aria-hidden="true">
                {courseInitials(course.name)}
              </span>
              <span className="kpi-name">{course.name}</span>
              <span className="kpi-go" aria-hidden="true">
                <ArrowRightIcon size={16} />
              </span>
            </div>
            <p className="kpi-value">{shown(count)}</p>
            <div className="kpi-share">
              <span className="kpi-share-track" aria-hidden="true">
                <span style={{ width: total ? `${(count / total) * 100}%` : 0 }} />
              </span>
              {percent(count, total)} of all
            </div>
            <Delta current={count} previous={previous[course.id] ?? 0} label={period.previous} quiet />
          </Link>
        );
      })}
    </section>
  );
}
