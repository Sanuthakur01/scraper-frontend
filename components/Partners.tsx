'use client';

import Link from 'next/link';
import { Fragment, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { useApi, useApiUrl } from '@/lib/api';
import { COURSE_COLORS, formatDate, formatNumber, percent, shownCities } from '@/lib/format';
import type { CourseId, Meta, Partner, PartnersResponse, RoleJobsResponse } from '@/lib/types';
import CompanyJobs from './CompanyJobs';
import { ArrowDownIcon, ArrowRightIcon, BriefcaseIcon, BuildingIcon, CheckIcon, ChevronRightIcon, DownloadIcon, LayersIcon, PhoneIcon, SearchIcon } from './Icons';
import { CardHeader, Freshness, PageError, PageHeader, PageSkeleton, Segmented } from './PageParts';

const SHOWN = 25; // companies listed before "Show all"

type ContactFilter = 'all' | 'with' | 'without';
const hasContact = (p: Partner) => p.phones.length > 0 || p.emails.length > 0;

// A number box that, when clicked, lists the companies it counts in the Companies list below.
function ShowBox({ icon, name, value, note, cta, active, onClick }: { icon: ReactNode; name: string; value: ReactNode; note: ReactNode; cta: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className="kpi kpi-action" aria-pressed={active} onClick={onClick}>
      <span className="kpi-top">
        <span className="kpi-badge" aria-hidden="true">
          {icon}
        </span>
        <span className="kpi-name">{name}</span>
      </span>
      <span className="kpi-value">{value}</span>
      <span className="kpi-period">{note}</span>
      <span className="kpi-cta">
        {active ? (
          <>
            <CheckIcon size={14} /> Showing below
          </>
        ) : (
          <>
            {cta} <ArrowDownIcon size={14} />
          </>
        )}
      </span>
    </button>
  );
}

// Companies that keep posting openings for the courses: who to approach for hiring partnerships. A
// company's row opens its openings right under it (CompanyJobs), with a pill per course.
export default function Partners() {
  const meta = useApi<Meta>('meta');
  const state = useApi<PartnersResponse>('partners');
  // ServiceNow Openings: how many jobs with ServiceNow in the title were found in the page's period (the
  // server's config/roleBoxes.js), in the view's set like the rest of the page. Just the count.
  const serviceNow = useApi<RoleJobsResponse>('role-jobs', { role: 'servicenow', days: state.data?.days, limit: 1 }, { auth: true, skip: !state.data });
  const apiUrl = useApiUrl();
  const [search, setSearch] = useState('');
  const [contactFilter, setContactFilter] = useState<ContactFilter>('all');
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null); // the company whose openings are shown

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
  const toggle = (key: string) => setOpen((current) => (current === key ? null : key));
  // A click anywhere on a row opens it, except on its links and buttons (a phone number, an email).
  const onRow = (event: MouseEvent, key: string) => {
    if ((event.target as Element).closest('a, button')) return;
    toggle(key);
  };
  const pickFilter = (value: ContactFilter) => {
    setContactFilter(value);
    setShowAll(false);
  };
  // A box was clicked: every company it counts (no search, not just the top 25), scrolled into view.
  const showCompanies = (value: ContactFilter) => {
    setContactFilter(value);
    setSearch('');
    setShowAll(true);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('companies')?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
  };
  const showing = (value: ContactFilter) => contactFilter === value && !query && showAll;
  const serviceNowNote = serviceNow.error ? 'Could not load the count' : 'with ServiceNow in the job title';

  return (
    <main className="page">
      <PageHeader
        eyebrow={`Sales · last ${data.days} days`}
        title="Hiring partners"
        subtitle="Companies that keep hiring for your courses. Approach them for hiring partnerships, campus drives and corporate training."
      >
        <Freshness lastRun={meta.data.lastRun} scheduleLabel={meta.data.scheduleLabel} />
        <span className="status-pill">
          {data.minOpenings}+ openings{data.from ? ` since ${formatDate(data.from)}` : ''}
        </span>
      </PageHeader>

      {/* The first three list what they count in Companies below; ServiceNow opens its own page, for the
          same period as its count. */}
      <section className="kpis kpis-4" aria-label="Summary">
        <ShowBox
          icon={<BuildingIcon size={16} />}
          name="Companies hiring again and again"
          value={formatNumber(data.partners.length)}
          note={`with ${data.minOpenings} or more openings`}
          cta="Show these companies"
          active={showing('all')}
          onClick={() => showCompanies('all')}
        />
        <ShowBox
          icon={<BriefcaseIcon size={16} />}
          name="Openings from them"
          value={formatNumber(openings)}
          note={`${percent(openings, data.jobs)} of all openings`}
          cta="See them by company"
          active={showing('all')}
          onClick={() => showCompanies('all')}
        />
        <ShowBox
          icon={<PhoneIcon size={16} />}
          name="With an HR contact"
          value={
            <>
              {formatNumber(withContact)} <span className="kpi-of">of {formatNumber(data.partners.length)}</span>
            </>
          }
          note="Add contacts in any course's job list"
          cta="Show these companies"
          active={showing('with')}
          onClick={() => showCompanies('with')}
        />
        {serviceNow.data ? (
          <Link className="kpi kpi-action" href={`/servicenow?from=${serviceNow.data.from}&to=${serviceNow.data.to}`}>
            <span className="kpi-top">
              <span className="kpi-badge" aria-hidden="true">
                <LayersIcon size={16} />
              </span>
              <span className="kpi-name">ServiceNow Openings</span>
            </span>
            <span className="kpi-value">{formatNumber(serviceNow.data.total)}</span>
            <span className="kpi-period">{serviceNowNote}</span>
            <span className="kpi-cta">
              See the openings <ArrowRightIcon size={14} />
            </span>
          </Link>
        ) : (
          <div className="kpi">
            <div className="kpi-top">
              <span className="kpi-badge" aria-hidden="true">
                <LayersIcon size={16} />
              </span>
              <span className="kpi-name">ServiceNow Openings</span>
            </div>
            <p className="kpi-value">—</p>
            <p className="kpi-period">{serviceNowNote}</p>
          </div>
        )}
      </section>

      <section className="card card-flush" id="companies">
        <CardHeader
          icon={<BuildingIcon />}
          title={
            <>
              Companies <span className="count-badge">{formatNumber(matches.length)}</span>
            </>
          }
          description="Most openings first. A company spelled differently on different sites counts once."
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
        <div className="table-wrap partners-wrap">
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
              {rows.map((p, index) => {
                const isOpen = Boolean(p.key) && open === p.key;
                const panelId = `partner-jobs-${index}`;
                return (
                  <Fragment key={p.key ?? p.name}>
                    <tr className={`partner-row ${p.key ? 'can-open' : ''} ${isOpen ? 'is-open' : ''}`} onClick={p.key ? (e) => onRow(e, p.key) : undefined}>
                      <th scope="row" className="job-cell">
                        {p.key ? (
                          <button type="button" className="partner-toggle" aria-expanded={isOpen} aria-controls={isOpen ? panelId : undefined} onClick={() => toggle(p.key)}>
                            <ChevronRightIcon size={16} className="partner-chevron" />
                            <span className="job-title">{p.name}</span>
                          </button>
                        ) : (
                          <span className="job-title">{p.name}</span>
                        )}
                        <span className="job-sub">{shownCities(p.cities).length ? shownCities(p.cities).join(', ') : 'City not shown'}</span>
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
                    {isOpen && (
                      <tr className="partner-detail" id={panelId}>
                        <td colSpan={5}>
                          <CompanyJobs companyKey={p.key} courses={courses} days={data.days} label={p.name} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
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
