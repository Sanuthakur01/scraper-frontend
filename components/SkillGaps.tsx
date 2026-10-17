import { useState } from 'react';
import { useApi } from '@/lib/api';
import { COURSE_COLORS, formatDate, formatDateTime, formatNumber, percent, type ExperienceRange } from '@/lib/format';
import type { Course, CourseId, SkillGap, SkillGapsResponse } from '@/lib/types';

const SHOWN = 10; // skills listed before "Show all"
const SMALL_SAMPLE = 30; // fewer named postings than this: say the numbers are a rough signal

// Covered now (grey) and the extra postings this skill would cover (course colour), out of all named postings.
function CoverageBar({ now, gained, total, color }: { now: number; gained: number; total: number; color: string }) {
  if (!total) return null;
  return (
    <span className="coverage-track" aria-hidden="true">
      <span className="coverage-now" style={{ width: `${(now / total) * 100}%` }} />
      <span className="coverage-gain" style={{ width: `${(gained / total) * 100}%`, background: color }} />
    </span>
  );
}

function Headline({ data }: { data: SkillGapsResponse }) {
  const { named, coveredNow, skills } = data;
  const top = skills[0];
  if (!named) return null;
  if (!top) return <p className="gap-headline">Every skill named in these postings is already taught.</p>;
  const mostNamed = [...skills].sort((a, b) => b.asking - a.asking || b.gained - a.gained)[0];
  if (!top.gained) {
    return (
      <p className="gap-headline">
        No single skill would fully cover more postings: each posting not covered yet names two or more skills the
        course doesn&apos;t teach. The missing skill named most often is <strong>{mostNamed.skill}</strong> (
        {formatNumber(mostNamed.asking)} postings).
      </p>
    );
  }
  return (
    <p className="gap-headline">
      Biggest gain: adding <strong>{top.skill}</strong> would cover every skill named in{' '}
      <strong>
        {formatNumber(top.gained)} more {top.gained === 1 ? 'posting' : 'postings'}
      </strong>
      , from {formatNumber(coveredNow)} to {formatNumber(top.coveredAfter)} of {formatNumber(named)} ({percent(coveredNow, named)} →{' '}
      {percent(top.coveredAfter, named)}).
      {mostNamed !== top && (
        <>
          {' '}
          The missing skill named most often is <strong>{mostNamed.skill}</strong>, in {formatNumber(mostNamed.asking)} postings (
          {percent(mostNamed.asking, named)}).
        </>
      )}
    </p>
  );
}

function GapTable({ rows, data, color }: { rows: SkillGap[]; data: SkillGapsResponse; color: string }) {
  const { named, coveredNow } = data;
  return (
    <div className="table-wrap">
      <table className="data-table gap-table">
        <thead>
          <tr>
            <th scope="col">Skill to add</th>
            <th scope="col">Postings naming it</th>
            <th scope="col">More postings fully covered</th>
            <th scope="col">Fully covered after adding</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.skill}>
              <th scope="row">{row.skill}</th>
              <td className="nowrap">
                {formatNumber(row.asking)} <span className="muted">({percent(row.asking, named)})</span>
              </td>
              <td className={row.gained ? 'gap-gain' : 'muted'}>{row.gained ? `+${formatNumber(row.gained)}` : '0'}</td>
              <td className="nowrap">
                <CoverageBar now={coveredNow} gained={row.gained} total={named} color={color} />
                {formatNumber(row.coveredAfter)} <span className="muted">({percent(row.coveredAfter, named)})</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface Props {
  courses: Course[];
  days: number;
  experience: ExperienceRange;
}

// "Skills that would open up more jobs": for one course, which skill it doesn't teach yet would let
// students match the most additional postings. Worked out from the collected postings after every
// collection, against the skills each course teaches (server/src/config/courses.js); nothing to set here.
export default function SkillGaps({ courses, days, experience }: Props) {
  const [courseId, setCourseId] = useState<CourseId>(courses[0].id);
  const [showAll, setShowAll] = useState(false);
  const state = useApi<SkillGapsResponse>('skill-gaps', { course: courseId, days });
  const data = state.data;
  const color = COURSE_COLORS[courseId];

  return (
    <section className="card">
      <div>
        <h2>Skills that would open up more jobs</h2>
        <p className="card-note">
          For each course: if it also taught one more skill, how many more real postings would ask only for skills the
          course teaches.
        </p>
      </div>

      <nav className="period-tabs course-tabs" aria-label="Course">
        {courses.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={c.id === courseId}
            onClick={() => {
              setCourseId(c.id);
              setShowAll(false);
            }}
          >
            <span className="swatch" style={{ background: COURSE_COLORS[c.id] }} aria-hidden="true" />
            {c.name}
          </button>
        ))}
      </nav>

      {state.error && <p className="empty">Could not load: {state.error.message}</p>}
      {data && (
        <div className={`gap-body ${state.loading ? 'is-loading' : ''}`}>
          <p className="muted">
            <strong className="course-skills-label">{data.course.name} teaches:</strong> {data.teaches.join(' · ')}
          </p>

          {data.postings === 0 ? (
            <p className="empty">No new {data.course.name} postings in this period yet.</p>
          ) : (
            <>
              <p>
                <strong>{formatNumber(data.named)}</strong> of the {formatNumber(data.postings)} new {data.course.name}{' '}
                postings in this period name at least one skill we track. The course already covers every skill named in{' '}
                <strong>{formatNumber(data.coveredNow)}</strong> of them ({percent(data.coveredNow, data.named)}).
              </p>
              {data.named > 0 && data.named < SMALL_SAMPLE && (
                <p className="banner">
                  Only {formatNumber(data.named)} postings to go on, so each one moves these numbers by about{' '}
                  {Math.round(100 / data.named)} percentage points. Treat them as a rough signal, or choose Last 30 days
                  above.
                </p>
              )}
              <Headline data={data} />
              {data.skills.length > 0 && (
                <>
                  <GapTable rows={showAll ? data.skills : data.skills.slice(0, SHOWN)} data={data} color={color} />
                  {data.skills.length > SHOWN && (
                    <button type="button" className="link-button" onClick={() => setShowAll((v) => !v)}>
                      {showAll ? `Show the top ${SHOWN}` : `Show all ${data.skills.length} skills`}
                    </button>
                  )}
                </>
              )}
            </>
          )}

          <div className="source-note">
            <p>
              <strong>Source:</strong> {formatNumber(data.postings)} {data.course.name} job postings collected by this
              dashboard{data.source.platforms.length ? ` from ${data.source.platforms.join(', ')}` : ''}
              {data.source.firstSeenFrom &&
                `, first seen ${formatDate(data.source.firstSeenFrom)}${
                  formatDate(data.source.firstSeenTo) !== formatDate(data.source.firstSeenFrom) ? ` – ${formatDate(data.source.firstSeenTo)}` : ''
                }`}
              . The same postings as the course&apos;s tile: in India, asking {experience.min}–{experience.max} years&apos;
              experience, large IT services firms left out.
            </p>
            <p>
              <strong>Last updated:</strong> {formatDateTime(data.source.lastRefreshed)}
            </p>
            <p>
              <strong>How it&apos;s counted:</strong> a posting is &ldquo;fully covered&rdquo; when every skill it names,
              out of the {data.trackedSkillCount} skills we look for, is taught. The{' '}
              {formatNumber(data.postings - data.named)} postings that name none of them are left out. Skills are read
              from the posting text we collect; Indeed and Glassdoor give only a short summary, so some of their skills
              are missed. These are counts of postings, not a forecast of hiring: employers also weigh experience,
              degree and interviews.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
