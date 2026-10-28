import type { CSSProperties } from 'react';
import { COURSE_COLORS, courseInitials, formatNumber, shareText, sumCounts } from '@/lib/format';
import type { ShowJobs } from '@/lib/jobFilters';
import type { ApiState, Course, Summary } from '@/lib/types';
import { ChevronRightIcon, PhoneIcon } from './Icons';
import { CardHeader, SectionError } from './PageParts';

// HR contact coverage: how many of the period's new openings have HR contact details (an HR name, profile link,
// phone, email or note, typed in by the team or found in the job post) and how many don't yet. On the left, all
// courses together (the share, a bar, and both counts); on the right, a table with each course's openings, both
// counts and its share. Every count opens the job list holding exactly those jobs (?hr=some or ?hr=none: the
// server counts them with the same test). It follows the period and the Filtered / Non-filtered / All switch,
// like the tiles above it (the same summary).
export default function HrDetails({ courses, state, onSelect }: { courses: Course[]; state: ApiState<Summary>; onSelect: ShowJobs }) {
  if (state.error) return <SectionError what="HR contact details" error={state.error} onRetry={state.reload} />;
  const data = state.data;
  const current = data?.current ?? {};
  const withHr = data?.withHrDetails ?? {};
  const total = sumCounts(current);
  const have = sumCounts(withHr);
  const without = total - have;
  // Until the numbers arrive (first load, or after the switch): a dash, never 0.
  const shown = (n: number) => (data ? formatNumber(n) : '—');
  const width = (part: number, whole: number) => `${whole && part ? Math.max((part / whole) * 100, 1) : 0}%`;

  return (
    <section className="card hr-card" aria-labelledby="hr-card-title">
      <CardHeader
        level={3}
        icon={<PhoneIcon />}
        title={<span id="hr-card-title">HR contact coverage</span>}
        description="How many of the new openings in this period have HR contact details: an HR name, phone, email, profile link or note, typed in by the team or found in the job post. Click a number to see those openings."
      />
      <div className="hr-body">
        <div className="hr-summary">
          <span className="hr-summary-label">All courses</span>
          <span className="hr-summary-value">{data ? shareText(have, total) : '—'}</span>
          <span className="hr-summary-note">
            of {shown(total)} new {total === 1 ? 'opening has' : 'openings have'} HR contact details
          </span>
          <span className="hr-meter" aria-hidden="true">
            <span style={{ width: width(have, total) }} />
          </span>
          <div className="hr-legend">
            <button
              type="button"
              className="hr-legend-row is-with"
              disabled={!have}
              onClick={() => onSelect({ hr: 'some' }, 'Openings with HR contact')}
              aria-label={`${formatNumber(have)} of ${formatNumber(total)} new openings have HR contact details. Show them`}
            >
              <span className="hr-key" aria-hidden="true" />
              With HR contact
              <strong>{shown(have)}</strong>
              <ChevronRightIcon size={14} />
            </button>
            <button
              type="button"
              className="hr-legend-row is-without"
              disabled={!data || without <= 0}
              onClick={() => onSelect({ hr: 'none' }, 'Openings with no HR contact yet')}
              aria-label={`${formatNumber(without)} of ${formatNumber(total)} new openings have no HR contact details yet. Show them`}
            >
              <span className="hr-key" aria-hidden="true" />
              No HR contact yet
              <strong>{shown(without)}</strong>
              <ChevronRightIcon size={14} />
            </button>
          </div>
        </div>

        <div className="hr-table-wrap">
          <table className="hr-table">
            <caption className="sr-only">HR contact coverage per course</caption>
            <thead>
              <tr>
                <th scope="col">Course</th>
                <th scope="col" className="num hide-xs">
                  Openings
                </th>
                <th scope="col" className="num">
                  With HR contact
                </th>
                <th scope="col" className="num">
                  No contact yet
                </th>
                <th scope="col" className="hr-cov-col">
                  Coverage
                </th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => {
                const all = current[course.id] ?? 0;
                const has = withHr[course.id] ?? 0;
                return (
                  <tr key={course.id} style={{ '--course': COURSE_COLORS[course.id] } as CSSProperties}>
                    <th scope="row">
                      <span className="hr-course-name">
                        <span className="kpi-badge" aria-hidden="true">
                          {courseInitials(course.name)}
                        </span>
                        {course.name}
                      </span>
                    </th>
                    <td className="num hide-xs">{shown(all)}</td>
                    <td className="num">
                      <button
                        type="button"
                        className="hr-num is-with"
                        disabled={!has}
                        onClick={() => onSelect({ course: course.id, hr: 'some' }, `${course.name} openings with HR contact`)}
                        aria-label={`${course.name}: ${formatNumber(has)} of ${formatNumber(all)} new openings have HR contact details. Show them`}
                      >
                        {shown(has)}
                      </button>
                    </td>
                    <td className="num">
                      <button
                        type="button"
                        className="hr-num"
                        disabled={!data || all - has <= 0}
                        onClick={() => onSelect({ course: course.id, hr: 'none' }, `${course.name} openings with no HR contact yet`)}
                        aria-label={`${course.name}: ${formatNumber(all - has)} of ${formatNumber(all)} new openings have no HR contact details yet. Show them`}
                      >
                        {shown(all - has)}
                      </button>
                    </td>
                    <td>
                      <span className="hr-cov">
                        <span className="hr-cov-track" aria-hidden="true">
                          <span style={{ width: width(has, all) }} />
                        </span>
                        <span className="hr-cov-pct">{data ? shareText(has, all) : '—'}</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
