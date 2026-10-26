import { useState, type FocusEvent, type MouseEvent } from 'react';
import { COURSE_COLORS, formatNumber } from '@/lib/format';
import type { ShowJobs } from '@/lib/jobFilters';
import type { ApiState, Course, PlatformRow, PlatformsResponse } from '@/lib/types';
import { byKeyboard, ChartTip, CourseBreakdown, tipAt, type TipAt } from './ChartTip';
import Legend from './Legend';
import { SectionError } from './PageParts';

// The site under the pointer, and the course when it is one segment of the bar.
interface Tip {
  row: PlatformRow;
  course?: Course;
  at: TipAt;
}

// A scale for the bars: 2 to 4 steps of 1, 2 or 5 times a power of ten (0, 100, 200, 300, 400), ending
// at or just above the biggest total.
export function niceScale(max: number) {
  const raw = Math.max(1, max) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((f) => f * magnitude).find((s) => s >= raw) ?? 10 * magnitude;
  const top = Math.max(step, Math.ceil(max / step) * step);
  return { top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) };
}

// Stacked horizontal bars: one row per platform, one segment per course, over a scale with gridlines.
// Hovering a segment, a site's name or its total shows the site's jobs for every course. Clicking a
// segment shows that course's jobs from that site; clicking a site's name or total shows all its jobs.
export default function PlatformChart({ courses, state, onSelect }: { courses: Course[]; state: ApiState<PlatformsResponse>; onSelect: ShowJobs }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const rows = state.data?.platforms ?? [];
  const { top, ticks } = niceScale(Math.max(1, ...rows.map((r) => r.total)));
  const at = (value: number) => `${(value / top) * 100}%`;

  const show = (event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>, row: PlatformRow, course?: Course) => {
    const at = row.total ? tipAt(event) : null;
    setTip(at && { row, course, at });
  };
  const tipProps = (row: PlatformRow, course?: Course) => ({
    onMouseEnter: (e: MouseEvent<HTMLElement>) => show(e, row, course),
    onFocus: (e: FocusEvent<HTMLElement>) => byKeyboard(e) && show(e, row, course),
    onBlur: () => setTip(null),
  });
  const showSite = (platform: string) => onSelect({ primary: platform }, `Jobs first posted on ${platform}`);

  return (
    <div className={`platform-chart tip-root ${state.loading ? 'is-loading' : ''}`} onMouseLeave={() => setTip(null)}>
      <Legend courses={courses} />
      {state.error ? (
        <SectionError what="the sites" error={state.error} onRetry={state.reload} />
      ) : rows.every((r) => r.total === 0) && !state.loading ? (
        <p className="empty">No new jobs in this period yet.</p>
      ) : (
        <div className="pbar-plot">
          <div className="pbar-grid" aria-hidden="true">
            {ticks.map((t) => (
              <span key={t} style={{ left: at(t) }} />
            ))}
          </div>
          {rows.map((row) => (
            <div className="pbar-row" key={row.platform}>
              <button
                type="button"
                className="pbar-label"
                disabled={!row.total}
                onClick={() => showSite(row.platform)}
                aria-label={`${row.platform}: ${formatNumber(row.total)} jobs. Show them`}
                {...tipProps(row)}
              >
                {row.platform}
              </button>
              <div className="pbar-track">
                <div className="pbar" style={{ width: `calc((100% - var(--pbar-room)) * ${row.total / top})` }}>
                  {courses.map((course) => {
                    const count = row.byCourse[course.id] ?? 0;
                    if (!count) return null;
                    return (
                      <button
                        type="button"
                        key={course.id}
                        className="pbar-seg"
                        aria-label={`${row.platform}, ${course.name}: ${formatNumber(count)} jobs. Show them`}
                        style={{ flexGrow: count, background: COURSE_COLORS[course.id] }}
                        {...tipProps(row, course)}
                        onClick={() => onSelect({ primary: row.platform, course: course.id }, `${course.name} jobs first posted on ${row.platform}`)}
                      />
                    );
                  })}
                </div>
                {/* The same as clicking the site's name, for the mouse (keyboard users have the name). */}
                <button
                  type="button"
                  className="pbar-total"
                  tabIndex={-1}
                  aria-hidden="true"
                  disabled={!row.total}
                  onClick={() => showSite(row.platform)}
                  onMouseEnter={(e) => show(e, row)}
                >
                  {formatNumber(row.total)}
                </button>
              </div>
            </div>
          ))}
          <div className="pbar-axis" aria-hidden="true">
            {ticks.map((t) => (
              <span key={t} style={{ left: at(t) }}>
                {formatNumber(t)}
              </span>
            ))}
          </div>
        </div>
      )}
      {tip && (
        <ChartTip at={tip.at}>
          <CourseBreakdown
            title={`First posted on ${tip.row.platform}`}
            total={tip.row.total}
            counts={tip.row.byCourse}
            courses={courses}
            current={tip.course?.id}
            hint={tip.course ? `Click to see the ${tip.course.name} jobs` : 'Click to see all its jobs'}
          />
        </ChartTip>
      )}
    </div>
  );
}
