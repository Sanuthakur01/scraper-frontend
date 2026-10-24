import { useMemo, useState, type CSSProperties } from 'react';
import { useApi } from '@/lib/api';
import { COURSE_COLORS, experienceRangeText, formatDate, formatDateTime, formatNumber, percent, periodParams, type ExperienceRange, type Period } from '@/lib/format';
import { useDataView } from '@/lib/dataView';
import type { ShowJobs } from '@/lib/jobFilters';
import type { Course, CourseId, InsightsResponse, SkillGapsResponse } from '@/lib/types';
import { ExternalIcon, SparklesIcon } from './Icons';
import { RankList } from './Insights';
import { CardHeader, SectionError, Segmented } from './PageParts';

const PILLS = 14; // skills offered to try
const JOBS_SHOWN = 25; // jobs listed before "Show all"
const SMALL_SAMPLE = 30; // fewer postings naming a skill than this: say the numbers are a rough signal

// "+30% vs now", or nothing when the course matches no job posts yet (no base to compare with).
const growth = (extra: number, now: number) => (now ? `+${Math.round((extra / now) * 100)}%` : '');

interface Props {
  courses: Course[];
  period: Period;
  experience: ExperienceRange;
  requested?: InsightsResponse['skills']; // most-requested skills per course, from /api/insights
  loading?: boolean;
  onSelect: ShowJobs; // a most-requested skill was clicked: show the course's jobs asking for it
}

// "Skills employers ask for": for one course, the skills its job posts ask for most, and a planner:
// which skills to add, one after another, would let students match how many more job posts, and which
// jobs those are (server/src/skillGaps.js).
export default function SkillsPanel({ courses, period, experience, requested, loading, onSelect }: Props) {
  const [courseId, setCourseId] = useState<CourseId>(courses[0].id);
  const [picked, setPicked] = useState<string[] | null>(null); // null = the ladder's first step
  const [showAllJobs, setShowAllJobs] = useState(false);
  const gaps = useApi<SkillGapsResponse>('skill-gaps', { course: courseId, ...periodParams(period) });
  const { view } = useDataView();
  const data = gaps.data;
  const color = COURSE_COLORS[courseId];
  const courseName = courses.find((c) => c.id === courseId)?.name ?? '';

  const ladder = data?.plan.ladder ?? [];
  const selected = picked ?? ladder.slice(0, 1).map((s) => s.skill);
  const opened = useMemo(() => {
    const set = new Set(selected);
    return set.size ? (data?.plan.jobs ?? []).filter((job) => job.missing.every((s) => set.has(s))) : [];
  }, [data, selected]);
  const pills = (data?.skills ?? []).slice(0, PILLS);
  const maxTotal = Math.max(1, ...ladder.map((s) => s.total));
  const now = data?.coveredNow ?? 0;

  const reset = (id: CourseId) => {
    setCourseId(id);
    setPicked(null);
    setShowAllJobs(false);
  };
  const toggle = (skill: string) => {
    setShowAllJobs(false);
    setPicked(selected.includes(skill) ? selected.filter((s) => s !== skill) : [...selected, skill].slice(-(data?.plan.maxAdd ?? 4)));
  };

  return (
    <section className="card">
      <CardHeader
        icon={<SparklesIcon />}
        level={3}
        title="Skill planner"
        description="Skills to add to a course, and how many more jobs students could then apply for"
        actions={
          <Segmented
            label="Course"
            value={courseId}
            onChange={reset}
            options={courses.map((c) => ({
              value: c.id,
              label: (
                <span className="seg-course" style={{ '--course': COURSE_COLORS[c.id] } as CSSProperties}>
                  <span className="dot" aria-hidden="true" />
                  {c.name}
                </span>
              ),
            }))}
          />
        }
      />

      <div className={`skills-layout ${loading || gaps.loading ? 'is-loading' : ''}`} style={{ '--course': color } as CSSProperties}>
        <div className="skills-col">
          <h4 className="subhead">Most requested skills</h4>
          <p className="subhead-note">Job posts naming each skill</p>
          <RankList
            items={requested?.[courseId] ?? []}
            color={color}
            empty={`No ${courseName} job posts in this period yet.`}
            onSelect={(item) => onSelect({ course: courseId, skill: item.name }, `${courseName} jobs asking for ${item.name}`)}
          />
        </div>

        <div className="skills-col">
          <h4 className="subhead">Plan new skills</h4>
          <p className="subhead-note">
            {courseName} teaches {data?.teaches.join(', ') ?? '…'}
            {data && data.named > 0 && (
              <>
                {' '}
                · students match <strong>{formatNumber(now)}</strong> of {formatNumber(data.named)} job posts now ({percent(now, data.named)})
              </>
            )}
          </p>
          {gaps.error && <SectionError what={`the skills for ${courseName}`} error={gaps.error} onRetry={gaps.reload} />}
          {data && data.postings === 0 && <p className="empty">No {courseName} job posts in this period yet.</p>}

          {data && data.postings > 0 && (
            <>
              {data.named > 0 && data.named < SMALL_SAMPLE && (
                <p className="note-warning">Only {formatNumber(data.named)} job posts to go on: a rough signal. Choose Last 30 days for a steadier picture.</p>
              )}

              {ladder.length > 0 && (
                <div className="plan-block">
                  <p className="plan-label">Best skills to add, in order</p>
                  <ol className="ladder">
                    {ladder.map((step, i) => {
                      const prefix = ladder.slice(0, i + 1).map((s) => s.skill);
                      const active = prefix.length === selected.length && prefix.every((s) => selected.includes(s));
                      return (
                        <li key={step.skill}>
                          <button
                            type="button"
                            className="ladder-step"
                            aria-pressed={active}
                            onClick={() => {
                              setPicked(prefix);
                              setShowAllJobs(false);
                            }}
                          >
                            <span className="ladder-num">{i + 1}</span>
                            <span className="ladder-skill">
                              {i > 0 && <span className="muted">+ </span>}
                              {step.skill}
                            </span>
                            <span className="ladder-bar" aria-hidden="true">
                              <span style={{ width: `${(step.total / maxTotal) * 100}%` }} />
                            </span>
                            <span className="ladder-total">
                              +{formatNumber(step.total)} jobs <span className="muted">{growth(step.total, now)}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}

              <div className="plan-block">
                <p className="plan-label">Or try your own combination (up to {data.plan.maxAdd})</p>
                <div className="skill-pills">
                  {pills.map((s) => (
                    <button key={s.skill} type="button" className="skill-pill" aria-pressed={selected.includes(s.skill)} onClick={() => toggle(s.skill)}>
                      {s.skill}
                      <span className="pill-count">{formatNumber(s.asking)}</span>
                    </button>
                  ))}
                </div>
              </div>

              {selected.length > 0 && (
                <div className="plan-result">
                  <p>
                    Teaching <strong>{selected.join(' + ')}</strong> would let students apply to{' '}
                    <strong>
                      {formatNumber(opened.length)} more job {opened.length === 1 ? 'post' : 'posts'}
                    </strong>
                    {now ? (
                      <>
                        {' '}
                        ({formatNumber(now)} → {formatNumber(now + opened.length)}, <strong>{growth(opened.length, now)}</strong>)
                      </>
                    ) : null}
                    .
                  </p>
                  {opened.length > 0 && (
                    <ul className="plan-jobs">
                      {(showAllJobs ? opened : opened.slice(0, JOBS_SHOWN)).map((job) => (
                        <li key={job.id}>
                          <div className="plan-job-main">
                            <a href={job.url} target="_blank" rel="noopener noreferrer" className="plan-job-title">
                              {job.title}
                              <ExternalIcon size={12} />
                            </a>
                            <span className="job-sub">
                              {job.company || 'Company not shown'}
                              {job.cities.length ? ` · ${job.cities.join(', ')}` : ''} · {job.platform}
                            </span>
                          </div>
                          <span className="plan-job-needs">needs {job.missing.join(', ')}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {opened.length > JOBS_SHOWN && (
                    <button type="button" className="btn-link" onClick={() => setShowAllJobs((v) => !v)}>
                      {showAllJobs ? `Show the first ${JOBS_SHOWN}` : `Show all ${formatNumber(opened.length)} jobs`}
                    </button>
                  )}
                </div>
              )}

              <details className="method">
                <summary>How is this calculated?</summary>
                <p>
                  Counted from {formatNumber(data.postings)} {courseName} job posts collected
                  {data.source.platforms.length ? ` from ${data.source.platforms.join(', ')}` : ''}
                  {data.source.firstSeenFrom ? `, first seen ${formatDate(data.source.firstSeenFrom)} – ${formatDate(data.source.firstSeenTo)}` : ''}{' '}
                  (India, {view === 'nonfiltered' ? 'only the jobs our filters leave out' : `${experienceRangeText(experience)} years' experience`}). Last updated {formatDateTime(data.source.lastRefreshed)}.
                </p>
                <p>
                  Students &ldquo;match&rdquo; a job post when the course teaches every skill it names, out of the {data.trackedSkillCount} we
                  look for. A plan counts the posts it would add on top of the ones matched now; posts needing more than{' '}
                  {data.plan.maxAdd} new skills are left out. {formatNumber(data.postings - data.named)} posts name no skill we track and
                  are not counted. Indeed and Glassdoor show only a short summary, so some of their skills are missed. These are counts of
                  job posts, not a forecast of hiring.
                </p>
              </details>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
