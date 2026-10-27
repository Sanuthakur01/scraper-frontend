import type { CSSProperties } from 'react';
import { COURSE_COLORS, courseInitials, formatNumber, shareText, sumCounts } from '@/lib/format';
import type { ShowJobs } from '@/lib/jobFilters';
import type { ApiState, Course, Summary } from '@/lib/types';
import { CheckIcon, PhoneIcon } from './Icons';
import { CardHeader, SectionError } from './PageParts';

// How many of the period's new jobs have HR details (an HR name, profile link, phone, email or note, typed in
// by the team or found in the job post) and how many don't yet: all courses together, then each course with
// a bar filled as far as it has them. Every number opens the job list holding exactly those jobs (?hr=some or
// ?hr=none: the server counts them with the same test). It follows the period and the Filtered / Non-filtered
// / All switch, like the tiles above it (the same summary).
export default function HrDetails({ courses, state, onSelect }: { courses: Course[]; state: ApiState<Summary>; onSelect: ShowJobs }) {
  if (state.error) return <SectionError what="HR contact details" error={state.error} onRetry={state.reload} />;
  const data = state.data;
  const current = data?.current ?? {};
  const withHr = data?.withHrDetails ?? {};
  const total = sumCounts(current);
  const have = sumCounts(withHr);
  // Until the numbers arrive (first load, or after the switch): a dash, never 0.
  const shown = (n: number) => (data ? formatNumber(n) : '—');

  return (
    <section className="card hr-card" aria-labelledby="hr-card-title">
      <CardHeader
        level={3}
        icon={<PhoneIcon />}
        title={<span id="hr-card-title">New jobs with and without HR details</span>}
        description="HR details: an HR name, phone, email, profile link or note, typed in by the team or found in the job post"
      />
      <div className="hr-body">
        <div className="hr-totals">
          <button
            type="button"
            className="hr-stat is-with"
            disabled={!have}
            onClick={() => onSelect({ hr: 'some' }, 'Jobs with HR details')}
            aria-label={`${formatNumber(have)} of ${formatNumber(total)} new jobs have HR details (${shareText(have, total)}). Show them`}
          >
            <span className="hr-stat-label">
              <CheckIcon size={14} /> With HR details
            </span>
            <span className="hr-stat-value">{shown(have)}</span>
            <span className="hr-stat-note">
              {shareText(have, total)} of {shown(total)} new jobs
            </span>
          </button>
          <button
            type="button"
            className="hr-stat is-without"
            disabled={!data || total - have <= 0}
            onClick={() => onSelect({ hr: 'none' }, 'Jobs with no HR details yet')}
            aria-label={`${formatNumber(total - have)} of ${formatNumber(total)} new jobs have no HR details yet (${shareText(total - have, total)}). Show them`}
          >
            <span className="hr-stat-label">No HR details yet</span>
            <span className="hr-stat-value">{shown(total - have)}</span>
            <span className="hr-stat-note">
              {shareText(total - have, total)} of {shown(total)} new jobs
            </span>
          </button>
        </div>

        <ul className="hr-courses" aria-label="Per course">
          {courses.map((course) => {
            const all = current[course.id] ?? 0;
            const has = withHr[course.id] ?? 0;
            return (
              <li key={course.id} className="hr-course" style={{ '--course': COURSE_COLORS[course.id] } as CSSProperties}>
                <span className="hr-course-name">
                  <span className="kpi-badge" aria-hidden="true">
                    {courseInitials(course.name)}
                  </span>
                  {course.name}
                </span>
                <span className="hr-course-share">{data ? shareText(has, all) : '—'}</span>
                <span className="hr-course-track" aria-hidden="true">
                  {has > 0 && <span style={{ width: `${Math.max((has / all) * 100, 1)}%` }} />}
                </span>
                <span className="hr-course-counts">
                  <button
                    type="button"
                    disabled={!has}
                    onClick={() => onSelect({ course: course.id, hr: 'some' }, `${course.name} jobs with HR details`)}
                    aria-label={`${course.name}: ${formatNumber(has)} of ${formatNumber(all)} new jobs have HR details. Show them`}
                  >
                    <strong>{shown(has)}</strong> with
                  </button>
                  <button
                    type="button"
                    disabled={!data || all - has <= 0}
                    onClick={() => onSelect({ course: course.id, hr: 'none' }, `${course.name} jobs with no HR details yet`)}
                    aria-label={`${course.name}: ${formatNumber(all - has)} of ${formatNumber(all)} new jobs have no HR details yet. Show them`}
                  >
                    <strong>{shown(all - has)}</strong> without
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
