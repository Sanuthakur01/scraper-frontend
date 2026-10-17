'use client';

import Link from 'next/link';
import { useState } from 'react';
import { apiUrl, useApi } from '@/lib/api';
import { COURSE_COLORS, formatDate, formatDateTime, formatNumber } from '@/lib/format';
import type { CourseId, Meta, PartnersResponse } from '@/lib/types';

// Companies that keep posting openings for the courses: who to approach for hiring partnerships.
export default function Partners() {
  const meta = useApi<Meta>('meta');
  const state = useApi<PartnersResponse>('partners');
  const [search, setSearch] = useState('');

  if (state.error || meta.error) return <p className="page-error">Could not load: {(state.error ?? meta.error)?.message}</p>;
  if (!state.data || !meta.data) return <p className="page-loading">Loading…</p>;

  const data = state.data;
  const courses = meta.data.courses;
  const query = search.trim().toLowerCase();
  const rows = query ? data.partners.filter((p) => p.name.toLowerCase().includes(query)) : data.partners;
  const withContact = data.partners.filter((p) => p.phones.length || p.emails.length).length;

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Sales · last {data.days} days</p>
          <h1>Hiring partners</h1>
          <p className="subtitle">
            {formatNumber(data.partners.length)} companies posted {data.minOpenings} or more openings for your courses
            {data.from ? ` since ${formatDate(data.from)}` : ''}. Approach them for hiring partnerships, campus drives
            and corporate training.
          </p>
          <p className="filter-note">
            Large IT services firms are already left out. {formatNumber(withContact)} of these companies have an HR
            contact; add more with Edit in the job list on a course page and they appear here.
          </p>
        </div>
        <div className="refresh">
          <p>Last updated: {formatDateTime(data.lastRefreshed)}</p>
        </div>
      </header>

      <section className="card">
        <div className="filters">
          <input
            type="search"
            placeholder="Search company"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search company"
          />
          <a className="button" href={apiUrl('partners.csv')}>
            Download CSV
          </a>
        </div>
        <div className="table-wrap">
          <table className="data-table partners-table">
            <thead>
              <tr>
                <th scope="col">Company</th>
                <th scope="col">Openings</th>
                <th scope="col">For courses</th>
                <th scope="col">Cities</th>
                <th scope="col">Last posted</th>
                <th scope="col">HR contact</th>
                <th scope="col">Your progress</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.name}>
                  <th scope="row" className="strong">
                    {p.name}
                  </th>
                  <td className="strong">{formatNumber(p.openings)}</td>
                  <td>
                    <ul className="course-counts">
                      {courses
                        .filter((c) => p.courses[c.id])
                        .map((c) => (
                          <li key={c.id}>
                            <span className="swatch" style={{ background: COURSE_COLORS[c.id as CourseId] }} aria-hidden="true" />
                            {c.name} {p.courses[c.id]}
                          </li>
                        ))}
                    </ul>
                  </td>
                  <td>{p.cities.length ? p.cities.join(', ') : '—'}</td>
                  <td className="nowrap">{formatDate(p.lastPosted)}</td>
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
                    {!p.phones.length && !p.emails.length && <span className="muted">—</span>}
                  </td>
                  <td className="nowrap">
                    {p.placed || p.inProgress ? (
                      <>
                        {p.placed > 0 && <span className="status-badge status-placed">{p.placed} placed</span>}
                        {p.inProgress > 0 && <span className="contact-source">{p.inProgress} in progress</span>}
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <p className="empty">
              {query ? 'No company matches this search.' : 'No company has posted more than once yet. The list grows as collection continues.'}
            </p>
          )}
        </div>
        <p className="card-note">
          Based on {formatNumber(data.jobs)} openings collected from {meta.data.platforms.join(', ')}. The same
          company written differently on different sites (&ldquo;ABC Pvt Ltd&rdquo;, &ldquo;ABC India&rdquo;) counts once.{' '}
          <Link href="/">Back to the dashboard</Link>
        </p>
      </section>
    </main>
  );
}
