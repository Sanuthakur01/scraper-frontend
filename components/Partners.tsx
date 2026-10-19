'use client';

import { useState, type CSSProperties } from 'react';
import { apiUrl, useApi } from '@/lib/api';
import { COURSE_COLORS, formatDate, formatNumber, percent } from '@/lib/format';
import type { CourseId, Meta, Partner, PartnersResponse } from '@/lib/types';
import { BriefcaseIcon, BuildingIcon, DownloadIcon, PhoneIcon, SearchIcon, UsersIcon } from './Icons';
import { CardHeader, Freshness, PageError, PageHeader, PageSkeleton, Segmented } from './PageParts';

const SHOWN = 25; // companies listed before "Show all"

type ContactFilter = 'all' | 'with' | 'without';
const hasContact = (p: Partner) => p.phones.length > 0 || p.emails.length > 0;

// Companies that keep posting openings for the courses: who to approach for hiring partnerships.
export default function Partners() {
  const meta = useApi<Meta>('meta');
  const state = useApi<PartnersResponse>('partners');
  const [search, setSearch] = useState('');
  const [contactFilter, setContactFilter] = useState<ContactFilter>('all');
  const [showAll, setShowAll] = useState(false);

  if (state.error || meta.error) return <PageError title="Could not load hiring partners" error={state.error ?? meta.error} />;
  if (!state.data || !meta.data) return <PageSkeleton />;

  const data = state.data;
  const courses = meta.data.courses;
  const withContact = data.partners.filter(hasContact).length;
  const openings = data.partners.reduce((n, p) => n + p.openings, 0);
  const maxOpenings = Math.max(1, ...data.partners.map((p) => p.openings));

  const query = search.trim().toLowerCase();
  const matches = data.partners
    .filter((p) => contactFilter === 'all' || (contactFilter === 'with') === hasContact(p))
    .filter((p) => !query || p.name.toLowerCase().includes(query));
  const rows = showAll || query ? matches : matches.slice(0, SHOWN);
  const pickFilter = (value: ContactFilter) => {
    setContactFilter(value);
    setShowAll(false);
  };

  return (
    <main className="page">
      <PageHeader
        icon={<UsersIcon size={20} />}
        eyebrow={`Sales · last ${data.days} days`}
        title="Hiring partners"
        subtitle="Companies that keep hiring for your courses. Approach them for hiring partnerships, campus drives and corporate training."
      >
        <Freshness lastRun={meta.data.lastRun} scheduleLabel={meta.data.scheduleLabel} />
        <span className="status-pill">
          {data.minOpenings}+ openings{data.from ? ` since ${formatDate(data.from)}` : ''}
        </span>
      </PageHeader>

      <section className="kpis kpis-3" aria-label="Summary">
        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-badge" aria-hidden="true">
              <BuildingIcon size={16} />
            </span>
            <span className="kpi-name">Companies hiring again and again</span>
          </div>
          <p className="kpi-value">{formatNumber(data.partners.length)}</p>
          <p className="kpi-period">with {data.minOpenings} or more openings</p>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-badge" aria-hidden="true">
              <BriefcaseIcon size={16} />
            </span>
            <span className="kpi-name">Openings from them</span>
          </div>
          <p className="kpi-value">{formatNumber(openings)}</p>
          <p className="kpi-period">{percent(openings, data.jobs)} of all openings</p>
        </div>
        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-badge" aria-hidden="true">
              <PhoneIcon size={16} />
            </span>
            <span className="kpi-name">With an HR contact</span>
          </div>
          <p className="kpi-value">
            {formatNumber(withContact)} <span className="kpi-of">of {formatNumber(data.partners.length)}</span>
          </p>
          <p className="kpi-period">Add contacts in any course&apos;s job list</p>
        </div>
      </section>

      <section className="card card-flush">
        <CardHeader
          icon={<BuildingIcon />}
          title={
            <>
              Companies <span className="count-badge">{formatNumber(matches.length)}</span>
            </>
          }
          description="Most openings first. The same company spelled differently on different sites counts once."
          actions={
            <a className="btn" href={apiUrl('partners.csv')}>
              <DownloadIcon /> Download CSV
            </a>
          }
        />
        <div className="toolbar">
          <label className="search">
            <SearchIcon />
            <input type="search" placeholder="Search company" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search company" />
          </label>
          <Segmented
            label="HR contact"
            value={contactFilter}
            onChange={pickFilter}
            options={[
              { value: 'all', label: `All · ${formatNumber(data.partners.length)}` },
              { value: 'with', label: `With HR contact · ${formatNumber(withContact)}` },
              { value: 'without', label: `No contact yet · ${formatNumber(data.partners.length - withContact)}` },
            ]}
          />
        </div>
        <div className="table-wrap">
          <table className="data-table partners-table">
            <thead>
              <tr>
                <th scope="col">Company</th>
                <th scope="col" className="num">
                  Openings
                </th>
                <th scope="col">Hiring for</th>
                <th scope="col">Last posted</th>
                <th scope="col">HR contact</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.name}>
                  <th scope="row" className="job-cell">
                    <span className="job-title">{p.name}</span>
                    <span className="job-sub">{p.cities.length ? p.cities.join(', ') : 'City not shown'}</span>
                  </th>
                  <td className="num">
                    <span className="cell-bar">
                      <span className="cell-bar-track" aria-hidden="true">
                        <span className="cell-bar-fill" style={{ width: `${(p.openings / maxOpenings) * 100}%` }} />
                      </span>
                      <span className="big-num">{formatNumber(p.openings)}</span>
                    </span>
                  </td>
                  <td>
                    <ul className="course-counts">
                      {courses
                        .filter((c) => p.courses[c.id])
                        .map((c) => (
                          <li key={c.id} style={{ '--course': COURSE_COLORS[c.id as CourseId] } as CSSProperties}>
                            <span className="dot" aria-hidden="true" />
                            {c.name}
                            <span className="muted">{p.courses[c.id]}</span>
                          </li>
                        ))}
                    </ul>
                  </td>
                  <td className="nowrap muted">{formatDate(p.lastPosted)}</td>
                  <td className="contact-cell email">
                    {p.phones.map((phone) => (
                      <a key={phone} className="contact-value" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>
                        {phone}
                      </a>
                    ))}
                    {p.emails.map((email) => (
                      <a key={email} className="contact-value" href={`mailto:${email}`}>
                        {email}
                      </a>
                    ))}
                    {!hasContact(p) && <span className="badge-muted">No contact yet</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!query && matches.length > SHOWN && (
            <div className="pager">
              <span>
                Showing {formatNumber(rows.length)} of {formatNumber(matches.length)}
              </span>
              <button type="button" className="btn btn-sm" onClick={() => setShowAll((v) => !v)}>
                {showAll ? `Show the top ${SHOWN}` : `Show all ${formatNumber(matches.length)}`}
              </button>
            </div>
          )}
          {!rows.length && (
            <p className="empty">
              {query
                ? 'No company matches this search.'
                : contactFilter === 'with'
                  ? 'No company has an HR contact yet. Add one from a course’s job list (Phone and Email columns).'
                  : contactFilter === 'without'
                    ? 'Every company here has an HR contact.'
                    : 'No company has posted more than once yet. The list grows as collection continues.'}
            </p>
          )}
        </div>
      </section>
      <p className="page-footnote">
        Based on {formatNumber(data.jobs)} openings collected from {meta.data.platforms.join(', ')}.
      </p>
    </main>
  );
}
