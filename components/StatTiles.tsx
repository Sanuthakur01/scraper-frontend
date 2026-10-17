import Link from 'next/link';
import { changePercent, COURSE_COLORS, formatNumber, sumCounts, type Period } from '@/lib/format';
import type { ApiState, Course, Summary } from '@/lib/types';

export function Delta({ current, previous, label }: { current: number; previous: number; label: string }) {
  const pct = changePercent(current, previous);
  if (pct == null) return <p className="delta">No earlier data to compare</p>;
  const direction = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  const arrow = { up: '▲', down: '▼', flat: '■' }[direction];
  return (
    <p className={`delta delta-${direction}`}>
      {arrow} {pct > 0 ? '+' : ''}
      {pct}% <span>vs {label}</span>
    </p>
  );
}

interface Props {
  courses: Course[];
  state: ApiState<Summary>;
  period: Period;
}

// Total + one tile per course. Each course tile opens that course's detail page.
export default function StatTiles({ courses, state, period }: Props) {
  const current = state.data?.current ?? {};
  const previous = state.data?.previous ?? {};

  return (
    <section className={`tiles ${state.loading ? 'is-loading' : ''}`} aria-label="New jobs per course">
      <div className="tile tile-total">
        <p className="tile-label">All four courses</p>
        <p className="tile-value hero">{formatNumber(sumCounts(current))}</p>
        <Delta current={sumCounts(current)} previous={sumCounts(previous)} label={period.previous} />
      </div>
      {courses.map((course) => (
        <Link
          className="tile tile-link"
          key={course.id}
          href={`/course/${course.id}?days=${period.days}`}
          aria-label={`${course.name}: ${formatNumber(current[course.id])} new jobs. View details`}
        >
          <p className="tile-label">
            <span className="swatch" style={{ background: COURSE_COLORS[course.id] }} aria-hidden="true" />
            {course.name}
          </p>
          <p className="tile-value">{formatNumber(current[course.id])}</p>
          <Delta current={current[course.id] ?? 0} previous={previous[course.id] ?? 0} label={period.previous} />
          <span className="tile-more" aria-hidden="true">
            View details →
          </span>
        </Link>
      ))}
    </section>
  );
}
