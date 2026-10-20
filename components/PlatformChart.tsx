import { useState, type FocusEvent, type MouseEvent } from 'react';
import { COURSE_COLORS, formatNumber } from '@/lib/format';
import type { ShowJobs } from '@/lib/jobFilters';
import type { ApiState, Course, PlatformsResponse } from '@/lib/types';
import Legend from './Legend';

interface Tip {
  platform: string;
  course: string;
  count: number;
  x: number;
  y: number;
}

// Stacked horizontal bars: one row per platform, one segment per course. Clicking a segment shows that
// course's jobs from that site; clicking a site's name or total shows all its jobs.
export default function PlatformChart({ courses, state, onSelect }: { courses: Course[]; state: ApiState<PlatformsResponse>; onSelect: ShowJobs }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const rows = state.data?.platforms ?? [];
  const max = Math.max(1, ...rows.map((r) => r.total));

  const show = (event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>, platform: string, course: string, count: number) => {
    const chart = event.currentTarget.closest('.platform-chart');
    if (!chart) return;
    const box = chart.getBoundingClientRect();
    const mark = event.currentTarget.getBoundingClientRect();
    setTip({ platform, course, count, x: mark.left - box.left + mark.width / 2, y: mark.top - box.top });
  };
  const showSite = (platform: string) => onSelect({ primary: platform }, `Jobs first posted on ${platform}`);

  return (
    <div className={`platform-chart ${state.loading ? 'is-loading' : ''}`} onMouseLeave={() => setTip(null)}>
      <Legend courses={courses} />
      {rows.every((r) => r.total === 0) && !state.loading ? (
        <p className="empty">No new jobs in this period yet.</p>
      ) : (
        rows.map((row) => (
          <div className="pbar-row" key={row.platform}>
            <button
              type="button"
              className="pbar-label"
              disabled={!row.total}
              onClick={() => showSite(row.platform)}
              aria-label={`${row.platform}: ${formatNumber(row.total)} jobs. Show them`}
            >
              {row.platform}
            </button>
            <div className="pbar-track">
              <div className="pbar" style={{ width: `${(row.total / max) * 100}%` }}>
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
                      onMouseEnter={(e) => show(e, row.platform, course.name, count)}
                      onFocus={(e) => show(e, row.platform, course.name, count)}
                      onBlur={() => setTip(null)}
                      onClick={() => onSelect({ primary: row.platform, course: course.id }, `${course.name} jobs first posted on ${row.platform}`)}
                    />
                  );
                })}
              </div>
              {/* The same as clicking the site's name, for the mouse (keyboard users have the name). */}
              <button type="button" className="pbar-total" tabIndex={-1} aria-hidden="true" disabled={!row.total} onClick={() => showSite(row.platform)}>
                {formatNumber(row.total)}
              </button>
            </div>
          </div>
        ))
      )}
      {tip && (
        <div className="tooltip" style={{ left: tip.x, top: tip.y }} role="status">
          <strong>{formatNumber(tip.count)}</strong>
          <span>
            {tip.course} · {tip.platform}
          </span>
          <span className="tooltip-hint">Click to see these jobs</span>
        </div>
      )}
    </div>
  );
}
