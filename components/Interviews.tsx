'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useState, type CSSProperties } from 'react';
import { useApi } from '@/lib/api';
import { COURSE_COLORS, dayHeading, formatNumber, formatUpdated, istDayOf, periodFrom, periodParams } from '@/lib/format';
import { ACTIVITY_PERIODS } from '@/lib/performance';
import type { CourseId, InterviewsResponse, Meta } from '@/lib/types';
import { AlertIcon, BuildingIcon, CalendarIcon, CheckIcon, SearchIcon, UsersIcon } from './Icons';
import { CardHeader, PageError, PageHeader, PageSkeleton, SectionError } from './PageParts';
import PeriodTabs from './PeriodTabs';

// The Interviews page (/interviews, opened from its box on the Home page): the students' interviews the staff
// list in their Google Sheet, in the period (today by default): the latest day first, each day by time, with
// the student, course, company, round and room (how many were placed: a box at the top). Read-only: the staff keep editing the
// sheet, and changes show here within 10 minutes. The period is in the address (?days=1, or ?from=&to=).
export default function Interviews() {
  const router = useRouter();
  const period = periodFrom(useSearchParams(), ACTIVITY_PERIODS);
  const meta = useApi<Meta>('meta');
  const state = useApi<InterviewsResponse>('interviews', periodParams(period), { auth: true });
  const [search, setSearch] = useState('');
  const [course, setCourse] = useState<CourseId | ''>('');

  if (meta.error) return <PageError title="Could not reach the server" error={meta.error} />;
  if (!meta.data) return <PageSkeleton />;
  const { courses } = meta.data;
  const data = state.data;
  const items = data?.items ?? [];
  const query = search.trim().toLowerCase();
  const shown = items
    .filter((i) => !course || i.course === course)
    .filter((i) => !query || [i.name, i.company, i.round, i.room].some((t) => t.toLowerCase().includes(query)));
  const oneDay = data ? data.from === data.to : period.days === 1;
  const periodWords = period.key === '1' ? 'today' : 'in this period';
  const loading = !data;
  const count = (id: CourseId) => items.filter((i) => i.course === id).length;
  const tiles = [
    { icon: <CalendarIcon size={16} />, name: 'Interviews', value: items.length, note: `Scheduled ${periodWords}` },
    { icon: <UsersIcon size={16} />, name: 'Students', value: new Set(items.map((i) => i.name.toLowerCase())).size, note: 'With an interview' },
    { icon: <BuildingIcon size={16} />, name: 'Companies', value: new Set(items.map((i) => i.company.toLowerCase()).filter(Boolean)).size, note: 'Interviewing them' },
    { icon: <CheckIcon size={16} />, name: 'Placed', value: items.filter((i) => i.placed).length, note: 'Marked PLACED in the sheet' },
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
          <strong>The interview sheet isn&apos;t connected on the server yet.</strong> It needs GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY and
          INTERVIEWS_SHEET_ID.
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
            <div className="toolbar">
              <label className="search">
                <SearchIcon />
                <input type="search" placeholder="Search student, company, round or room" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search the interviews" />
              </label>
              <div className="filter-chips" role="group" aria-label="Course">
                <button type="button" className="filter-chip" aria-pressed={!course} onClick={() => setCourse('')}>
                  All <span className="chip-count">{formatNumber(items.length)}</span>
                </button>
                {courses
                  .filter((c) => count(c.id) > 0)
                  .map((c) => (
                    <button key={c.id} type="button" className="filter-chip" aria-pressed={course === c.id} onClick={() => setCourse(course === c.id ? '' : c.id)}>
                      {c.name} <span className="chip-count">{formatNumber(count(c.id))}</span>
                    </button>
                  ))}
              </div>
            </div>
            {loading ? (
              <div className="company-jobs-loading cv-loading" aria-busy="true" aria-label="Loading the interviews">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="skeleton" />
                ))}
              </div>
            ) : !shown.length ? (
              <p className="empty">{query || course ? 'No interview matches.' : `No interviews in the sheet ${periodWords}.`}</p>
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
                          <tr>
                            <td className="nowrap">{item.time || <span className="muted">—</span>}</td>
                            <th scope="row" className="cv-student">
                              {item.name}
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
