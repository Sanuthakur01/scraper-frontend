import Link from 'next/link';
import type { CSSProperties } from 'react';
import { changePercent, COURSE_COLORS, courseInitials, formatNumber, percent, periodQuery, sumCounts, type Period } from '@/lib/format';
import type { ApiState, Course, Summary } from '@/lib/types';
import { ArrowRightIcon, TrendIcon } from './Icons';

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
}

// The headline numbers: all courses together, then one colour-coded card per course (its share of
// all new jobs, the change vs the previous period when it can be compared) that opens its page.
export default function StatTiles({ courses, state, period }: Props) {
  const current = state.data?.current ?? {};
  // Until the numbers arrive (first load, or after the Filtered / Non-filtered switch): a dash, never 0.
  const shown = (n: number) => (state.data ? formatNumber(n) : '—');
  const previous = state.data?.previous ?? {};
  const total = sumCounts(current);

  return (
    <section className={`kpis ${state.loading ? 'is-loading' : ''}`} aria-label="New jobs per course">
      <div className="kpi kpi-total">
        <div className="kpi-top">
          <span className="kpi-badge" aria-hidden="true">
            <TrendIcon size={16} />
          </span>
          <span className="kpi-name">All courses</span>
        </div>
        <p className="kpi-value">{shown(total)}</p>
        <p className="kpi-period">{period.title}</p>
        <Delta current={total} previous={sumCounts(previous)} label={period.previous} />
      </div>
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
            </div>
            <p className="kpi-value">{shown(count)}</p>
            <div className="kpi-share">
              <span className="kpi-share-track" aria-hidden="true">
                <span style={{ width: total ? `${(count / total) * 100}%` : 0 }} />
              </span>
              {percent(count, total)} of all
            </div>
            <Delta current={count} previous={previous[course.id] ?? 0} label={period.previous} quiet />
            <span className="kpi-cta" aria-hidden="true">
              View jobs <ArrowRightIcon size={14} />
            </span>
          </Link>
        );
      })}
    </section>
  );
}
