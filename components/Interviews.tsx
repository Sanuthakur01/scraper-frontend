'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useState, type CSSProperties } from 'react';
import { useApi } from '@/lib/api';
import { COURSE_COLORS, courseInitials, dayHeading, formatNumber, formatUpdated, istDayOf, periodFrom, periodParams } from '@/lib/format';
import { ACTIVITY_PERIODS } from '@/lib/performance';
import type { CourseId, Interview, InterviewsResponse, Meta } from '@/lib/types';
import { AlertIcon, BuildingIcon, CalendarIcon, HistoryIcon, SearchIcon, UsersIcon } from './Icons';
import { CardHeader, FilterKpi, PageError, PageHeader, PageSkeleton, SectionError } from './PageParts';
import PeriodTabs from './PeriodTabs';

// Why the sheet isn't connected, for whoever sets up the server: the settings it's missing (names only) and when it
// last started (settings added after that need a redeploy).
export function setupHint(data: InterviewsResponse) {
  const missing = data.missing?.length ? `Missing on the server: ${data.missing.join(', ')}.` : 'It needs GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY and INTERVIEWS_SHEET_ID.';
  return `${missing}${data.startedAt ? ` The server last started ${formatUpdated(data.startedAt)}: settings added after that need a redeploy.` : ''}`;
}

// The round filter's order: Round 1, Round 2… first, then the others, the most used first.
function roundsIn(items: Interview[]) {
  const counts = new Map<string, number>();
  for (const i of items) if (i.roundGroup) counts.set(i.roundGroup, (counts.get(i.roundGroup) ?? 0) + 1);
  const number = (r: string) => Number(/^Round (\d+)$/.exec(r)?.[1] ?? Infinity);
  return [...counts].sort(([a, na], [b, nb]) => number(a) - number(b) || nb - na || a.localeCompare(b)).map(([r]) => r);
}

// "RESCHEDULED FOR TOMORROW" -> "Rescheduled for tomorrow"
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

// The Interviews page (/interviews, opened from its box on the Home page): the students' interviews the staff
// list in their Google Sheet, in the period (today by default): the latest day first, each day by time, with
// the student, course, company, round and room. Boxes at the top: the totals, how many were rescheduled and each
// course's interviews; the rescheduled and course boxes filter the table, as do its course, round and status
// chips. A rescheduled interview ("RESCHEDULED" after its row) is listed and marked, but not counted. Read-only:
// the staff keep editing the sheet, and changes show here within 10 minutes. The period is in the address
// (?days=1, or ?from=&to=).
export default function Interviews() {
  const router = useRouter();
  const period = periodFrom(useSearchParams(), ACTIVITY_PERIODS);
  const meta = useApi<Meta>('meta');
  const state = useApi<InterviewsResponse>('interviews', periodParams(period), { auth: true });
  const [search, setSearch] = useState('');
  const [course, setCourse] = useState<CourseId | ''>('');
  const [round, setRound] = useState('');
  const [onlyRescheduled, setOnlyRescheduled] = useState(false);

  if (meta.error) return <PageError title="Could not reach the server" error={meta.error} />;
  if (!meta.data) return <PageSkeleton />;
  const { courses } = meta.data;
  const data = state.data;
  const items = data?.items ?? [];
  // The boxes count the interviews that go ahead: a rescheduled one isn't an interview that day.
  const held = items.filter((i) => !i.rescheduled);
  const query = search.trim().toLowerCase();
  // A row passes the filters, but the one named: a chip's count is the rows it would show, the other filters kept.
  const passes = (i: Interview, except?: 'course' | 'round' | 'status') =>
    (except === 'course' || !course || i.course === course) &&
    (except === 'round' || !round || i.roundGroup === round) &&
    (except === 'status' || !onlyRescheduled || i.rescheduled);
  const shown = items.filter((i) => passes(i)).filter((i) => !query || [i.name, i.company, i.round, i.room].some((t) => t.toLowerCase().includes(query)));
  const oneDay = data ? data.from === data.to : period.days === 1;
  const periodWords = period.key === '1' ? 'today' : 'in this period';
  const loading = !data;
  const filtered = Boolean(query || course || round || onlyRescheduled);
  // The chips: each with the rows it would show; one that would show none is left out, unless it's the one chosen.
  const courseCount = (id: CourseId) => items.filter((i) => passes(i, 'course') && i.course === id).length;
  const courseChips = courses.filter((c) => course === c.id || courseCount(c.id) > 0);
  const roundCount = (r: string) => items.filter((i) => passes(i, 'round') && i.roundGroup === r).length;
  const roundChips = roundsIn(items).filter((r) => round === r || roundCount(r) > 0);
  const tiles = [
    { icon: <CalendarIcon size={16} />, name: 'Interviews', value: held.length, note: `Scheduled ${periodWords}` },
    { icon: <UsersIcon size={16} />, name: 'Students', value: new Set(held.map((i) => i.name.toLowerCase())).size, note: 'With an interview' },
    { icon: <BuildingIcon size={16} />, name: 'Companies', value: new Set(held.map((i) => i.company.toLowerCase()).filter(Boolean)).size, note: 'Interviewing them' },
  ];

  return (
    <main className="page iv-page">
      <PageHeader
        eyebrow={`Interviews · ${period.label}`}
        title="Interviews"
        actions={
          <PeriodTabs
            period={period}
            periods={ACTIVITY_PERIODS}
            last={istDayOf(new Date().toISOString())}
            data="changes"
            onChange={(q) => router.replace(`/interviews?${q}`, { scroll: false })}
          />
        }
      >
        {data?.readAt && <span className="status-pill">From the interview sheet · read {formatUpdated(data.readAt)}</span>}
        {data?.error && (
          <span className="status-pill warn" title={data.error}>
            <AlertIcon size={13} /> The latest reading failed: showing the one before
          </span>
        )}
      </PageHeader>

      {state.error ? (
        <SectionError what="the interviews" error={state.error} onRetry={state.reload} />
      ) : data && !data.configured ? (
        <p className="note-warning">
          <strong>The interview sheet isn&apos;t connected on the server yet.</strong> {setupHint(data)}
        </p>
      ) : (
        <>
          <section className={`kpis kpis-4 iv-kpis ${state.loading ? 'is-loading' : ''}`} aria-label="Summary">
            {tiles.map((tile) => (
              <div key={tile.name} className="kpi">
                <div className="kpi-top">
                  <span className="kpi-badge" aria-hidden="true">
                    {tile.icon}
                  </span>
                  <span className="kpi-name">{tile.name}</span>
                </div>
                <p className="kpi-value">{loading ? '—' : formatNumber(tile.value)}</p>
                <p className="kpi-period">{tile.note}</p>
              </div>
            ))}
            <FilterKpi
              name="Rescheduled"
              icon={<HistoryIcon size={16} />}
              value={loading ? null : items.filter((i) => i.rescheduled).length}
              note="Not counted as interviews"
              active={onlyRescheduled}
              onClick={() => setOnlyRescheduled(!onlyRescheduled)}
            />
            {courses.map((c) => (
              <FilterKpi
                key={c.id}
                name={c.name}
                icon={courseInitials(c.name)}
                color={COURSE_COLORS[c.id]}
                value={loading ? null : held.filter((i) => i.course === c.id).length}
                note={`Interviews ${periodWords}`}
                active={course === c.id}
                onClick={() => setCourse(course === c.id ? '' : c.id)}
              />
            ))}
          </section>

          <section className="card card-flush">
            <CardHeader
              icon={<CalendarIcon />}
              title={
                <>
                  Interviews <span className="count-badge">{loading ? '—' : formatNumber(shown.length)}</span>
                </>
              }
              description={oneDay ? 'By time; "Anytime" last.' : 'The latest day first, each day by time.'}
            />
            <div className="toolbar iv-toolbar">
              <label className="search">
                <SearchIcon />
                <input type="search" placeholder="Search student, company, round or room" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search the interviews" />
              </label>
              <div className="iv-filters">
                <div className="filter-chips" role="group" aria-label="Course">
                  <span className="iv-filter-label">Course</span>
                  <button type="button" className="filter-chip" aria-pressed={!course} onClick={() => setCourse('')}>
                    All <span className="chip-count">{formatNumber(items.filter((i) => passes(i, 'course')).length)}</span>
                  </button>
                  {courseChips.map((c) => (
                    <button key={c.id} type="button" className="filter-chip" aria-pressed={course === c.id} onClick={() => setCourse(course === c.id ? '' : c.id)}>
                      {c.name} <span className="chip-count">{formatNumber(courseCount(c.id))}</span>
                    </button>
                  ))}
                </div>
                {roundChips.length > 0 && (
                  <div className="filter-chips" role="group" aria-label="Round">
                    <span className="iv-filter-label">Round</span>
                    <button type="button" className="filter-chip" aria-pressed={!round} onClick={() => setRound('')}>
                      All <span className="chip-count">{formatNumber(items.filter((i) => passes(i, 'round')).length)}</span>
                    </button>
                    {roundChips.map((r) => (
                      <button key={r} type="button" className="filter-chip" aria-pressed={round === r} onClick={() => setRound(round === r ? '' : r)}>
                        {r} <span className="chip-count">{formatNumber(roundCount(r))}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="filter-chips" role="group" aria-label="Status">
                  <span className="iv-filter-label">Status</span>
                  <button type="button" className="filter-chip" aria-pressed={!onlyRescheduled} onClick={() => setOnlyRescheduled(false)}>
                    All <span className="chip-count">{formatNumber(items.filter((i) => passes(i, 'status')).length)}</span>
                  </button>
                  <button type="button" className="filter-chip" aria-pressed={onlyRescheduled} onClick={() => setOnlyRescheduled(!onlyRescheduled)}>
                    Rescheduled <span className="chip-count">{formatNumber(items.filter((i) => passes(i, 'status') && i.rescheduled).length)}</span>
                  </button>
                </div>
              </div>
            </div>
            {loading ? (
              <div className="company-jobs-loading cv-loading" aria-busy="true" aria-label="Loading the interviews">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="skeleton" />
                ))}
              </div>
            ) : !shown.length ? (
              <p className="empty">{filtered ? 'No interview matches.' : `No interviews in the sheet ${periodWords}.`}</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table iv-table">
                  <thead>
                    <tr>
                      <th scope="col">Time</th>
                      <th scope="col">Student</th>
                      <th scope="col">Course</th>
                      <th scope="col">Company</th>
                      <th scope="col">Round</th>
                      <th scope="col">Room</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((item, index) => {
                      const c = courses.find((x) => x.id === item.course);
                      const newDay = !oneDay && item.date !== shown[index - 1]?.date;
                      return (
                        <Fragment key={item.id}>
                          {newDay && (
                            <tr className="iv-day">
                              <th scope="colgroup" colSpan={6}>
                                {dayHeading(item.date)} <span className="muted">· {formatNumber(shown.filter((i) => i.date === item.date).length)}</span>
                              </th>
                            </tr>
                          )}
                          <tr className={item.rescheduled ? 'iv-moved' : undefined}>
                            <td className="nowrap">{!item.time ? <span className="muted">—</span> : item.rescheduled ? <s>{item.time}</s> : item.time}</td>
                            <th scope="row" className="cv-student">
                              {item.name}
                              {item.rescheduled && <span className="iv-tag">{sentence(item.status)}</span>}
                            </th>
                            <td className="nowrap">
                              {c ? (
                                <span className="cv-course" style={{ '--course': COURSE_COLORS[c.id] } as CSSProperties}>
                                  <span className="dot" aria-hidden="true" />
                                  {c.name}
                                </span>
                              ) : (
                                <span className="muted">—</span>
                              )}
                            </td>
                            <td>{item.company || <span className="muted">Not written</span>}</td>
                            <td className="nowrap">{item.round || <span className="muted">—</span>}</td>
                            <td>{item.room || <span className="muted">—</span>}</td>
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
