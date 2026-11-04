'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useState, type CSSProperties } from 'react';
import { adderName, linkHost, mayRemoveAddedJob } from '@/lib/addedJob';
import { ApiError, apiUrl, OFFLINE, useApi } from '@/lib/api';
import { COURSE_COLORS, dayHeading, formatDateTime, formatNumber, formatTime, istDayOf, LEFT_OUT_LABELS, periodFrom, periodParams, shownCities, TEAM_PLATFORM } from '@/lib/format';
import { ACTIVITY_PERIODS } from '@/lib/performance';
import { signInHeader } from '@/lib/session';
import type { AddedJob, AddedJobsResponse, Meta } from '@/lib/types';
import AddJobForm from './AddJobForm';
import { useAccess } from './AuthGate';
import Avatar from './Avatar';
import { contactSummary, ContactIcons } from './ContactForm';
import { useJobWindow } from './ContactList';
import { BriefcaseIcon, CheckIcon, ChevronLeftIcon, CloseIcon, ExternalIcon, LayersIcon, PhoneIcon, PlusIcon, SearchIcon, UsersIcon } from './Icons';
import { CardHeader, Kpi, PageError, PageHeader, PageSkeleton, SectionError } from './PageParts';
import PeriodTabs from './PeriodTabs';

const addedAt = (job: AddedJob) => job.addedBy?.at ?? job.firstSeenAt;

// The Jobs added by the team page (/added-jobs, from the dashboard): the openings the scraper missed that the team
// added by hand in the period (today by default), the latest first. Boxes: how many, how many went under Filtered and
// under Non-filtered, how many came with HR details, and how many people added them. A job's title opens its window;
// the person who added a job, or an admin, can remove it (not once the scraper has found it too). The period is in
// the address (?days=1, or ?from=&to=).
export default function AddedJobs() {
  const router = useRouter();
  const period = periodFrom(useSearchParams(), ACTIVITY_PERIODS);
  const meta = useApi<Meta>('meta');
  const [reload, setReload] = useState(0);
  const state = useApi<AddedJobsResponse>('added-jobs', { ...periodParams(period), r: reload || undefined }, { auth: true });
  const access = useAccess();
  const mayAdd = access?.can('add-jobs') ?? false;
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  // Removed here since the list loaded (gone at once, before it loads again), and why a removal failed.
  const [removed, setRemoved] = useState<Record<string, true>>({});
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  // A job's window: what is saved there shows here once the list loads again.
  const { showJob, modal } = useJobWindow(meta.data?.courses, () => setReload((n) => n + 1));

  if (meta.error) return <PageError title="Could not reach the server" error={meta.error} />;
  if (!meta.data) return <PageSkeleton />;
  const { courses } = meta.data;
  const data = state.data;
  const loading = !data;
  const items = (data?.items ?? []).filter((job) => !removed[job._id]);
  const query = search.trim().toLowerCase();
  const shown = query
    ? items.filter((job) => [job.title, job.company ?? '', job.addedBy?.name ?? '', job.addedBy?.email ?? '', ...(job.cities ?? [])].some((t) => t.toLowerCase().includes(query)))
    : items;
  const oneDay = data ? data.from === data.to : period.days === 1;
  const periodWords = period.key === '1' ? 'today' : 'in this period';
  const top = data?.people[0];
  const person = access ? { email: access.email, role: access.role } : null;
  const mayRemove = (job: AddedJob) => mayAdd && mayRemoveAddedJob(job.addedBy, person);
  const alsoScraped = (job: AddedJob) => job.platforms.some((p) => p !== TEAM_PLATFORM); // then it stays

  const remove = async (job: AddedJob) => {
    setBusy(job._id);
    setProblems((p) => ({ ...p, [job._id]: '' }));
    try {
      const res = await fetch(apiUrl(`added-jobs/${job._id}`), { method: 'DELETE', headers: await signInHeader() });
      if (!res.ok) throw new ApiError((await res.json().catch(() => null))?.error ?? `Could not remove it (error ${res.status}).`);
      setRemoved((r) => ({ ...r, [job._id]: true }));
      setReload((n) => n + 1);
    } catch (err) {
      setProblems((p) => ({ ...p, [job._id]: err instanceof ApiError ? err.message : OFFLINE }));
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  const addButton = mayAdd && (
    <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
      <PlusIcon size={16} /> Add a job
    </button>
  );

  return (
    <main className="page added-page">
      <PageHeader
        eyebrow={
          <Link className="back-link" href="/dashboard">
            <ChevronLeftIcon size={14} /> Job market overview
          </Link>
        }
        title="Jobs added by the team"
        subtitle="Openings the scraper missed, added by hand. They show in the job lists like any other job."
        actions={
          <PeriodTabs
            period={period}
            periods={ACTIVITY_PERIODS}
            first={null}
            last={istDayOf(new Date().toISOString())}
            data="changes"
            onChange={(q) => router.replace(`/added-jobs?${q}`, { scroll: false })}
          />
        }
      >
        {addButton}
      </PageHeader>

      {state.error ? (
        <SectionError what="the jobs added by the team" error={state.error} onRetry={state.reload} />
      ) : (
        <>
          <section className={`kpis added-kpis ${state.loading ? 'is-loading' : ''}`} aria-label="Summary">
            <Kpi icon={<BriefcaseIcon size={16} />} name="Jobs added" value={data?.total ?? null} note={`Added by hand ${periodWords}`} />
            <Kpi icon={<CheckIcon size={16} />} name="In Filtered" value={data?.filtered ?? null} note="They pass our filters" />
            <Kpi icon={<LayersIcon size={16} />} name="In Non-filtered" value={data?.nonfiltered ?? null} note="Our filters leave them out" />
            <Kpi icon={<PhoneIcon size={16} />} name="With HR details" value={data?.withHr ?? null} note="HR contact typed with the job" />
            <Kpi
              icon={<UsersIcon size={16} />}
              name="People"
              value={data ? data.people.length : null}
              note={top ? `Most: ${top.name || top.email} (${formatNumber(top.count)})` : 'Who added them'}
            />
          </section>

          <section className="card card-flush">
            <CardHeader
              icon={<BriefcaseIcon />}
              title={
                <>
                  Jobs <span className="count-badge">{loading ? '—' : formatNumber(shown.length)}</span>
                </>
              }
              description={oneDay ? 'The latest added first.' : 'The latest day first, each day the latest added first.'}
            />
            {data && data.total > data.items.length && (
              <p className="note-warning perf-note">Only the latest {formatNumber(data.items.length)} jobs are shown. Choose fewer days to see them all.</p>
            )}
            <div className="toolbar">
              <label className="search">
                <SearchIcon />
                <input
                  type="search"
                  placeholder="Search job, company, city or who added it"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search the jobs added by the team"
                />
              </label>
            </div>

            {loading ? (
              <div className="company-jobs-loading cv-loading" aria-busy="true" aria-label="Loading the jobs">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="skeleton" />
                ))}
              </div>
            ) : !shown.length ? (
              <div className="activity-empty">
                <span className="auth-icon" aria-hidden="true">
                  <BriefcaseIcon size={22} />
                </span>
                <p>
                  <strong>{query ? 'No job matches this search.' : `No jobs added ${periodWords}.`}</strong>
                </p>
                <p className="muted">
                  {query ? 'Clear the search.' : 'When the scraper misses a company or an opening, add it here: it shows in the job lists at once.'}
                </p>
                {!query && addButton}
              </div>
            ) : (
              <div className={`table-wrap ${state.loading ? 'is-loading' : ''}`}>
                <table className="data-table added-table">
                  <thead>
                    <tr>
                      <th scope="col">Added</th>
                      <th scope="col">Added by</th>
                      <th scope="col">Job</th>
                      <th scope="col">Course</th>
                      <th scope="col">List</th>
                      <th scope="col">HR contact</th>
                      <th scope="col">Link</th>
                      <th scope="col">
                        <span className="sr-only">Remove</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((job, index) => {
                      const c = courses.find((x) => x.id === job.course);
                      const at = addedAt(job);
                      const day = istDayOf(at);
                      const newDay = !oneDay && (index === 0 || day !== istDayOf(addedAt(shown[index - 1])));
                      const cities = shownCities(job.cities);
                      const url = job.links[TEAM_PLATFORM];
                      return (
                        <Fragment key={job._id}>
                          {newDay && (
                            <tr className="iv-day">
                              <th scope="colgroup" colSpan={8}>
                                {dayHeading(day)} <span className="muted">· {formatNumber(shown.filter((x) => istDayOf(addedAt(x)) === day).length)}</span>
                              </th>
                            </tr>
                          )}
                          <tr>
                            <td className="nowrap" title={formatDateTime(at)}>
                              {formatTime(at)}
                            </td>
                            <td>
                              {job.addedBy ? (
                                <span className="added-by">
                                  <Avatar name={job.addedBy.name} email={job.addedBy.email} className="activity-avatar review-avatar" />
                                  <span>{adderName(job.addedBy)}</span>
                                </span>
                              ) : (
                                <span className="muted">—</span>
                              )}
                            </td>
                            <th scope="row" className="added-job">
                              <button type="button" className="activity-job" onClick={() => showJob(job)} aria-haspopup="dialog" title="Open: HR contact, students, notes and job details">
                                {job.title}
                              </button>
                              <span className="cv-sub">
                                {job.company || 'Company not shown'}
                                {cities.length ? ` · ${cities.join(', ')}` : ''}
                              </span>
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
                            <td>
                              <span className={`added-set is-${job.set}`}>{job.set === 'filtered' ? 'Filtered' : 'Non-filtered'}</span>
                              {job.leftOutBy && <span className="reason-pill added-reason">{LEFT_OUT_LABELS[job.leftOutBy] ?? job.leftOutBy}</span>}
                            </td>
                            <td>
                              {contactSummary(job.contact).any ? (
                                <button type="button" className="contact-icons-btn" onClick={() => showJob(job)} aria-haspopup="dialog" aria-label={`${contactSummary(job.contact).text}. Open ${job.title}`}>
                                  <ContactIcons contact={job.contact} />
                                </button>
                              ) : (
                                <span className="muted">—</span>
                              )}
                            </td>
                            <td>
                              {url ? (
                                <a className="site-chip" href={url} target="_blank" rel="noopener noreferrer" title={url}>
                                  {linkHost(url)}
                                  <ExternalIcon size={12} />
                                </a>
                              ) : (
                                <span className="muted">—</span>
                              )}
                              {alsoScraped(job) && <span className="cv-sub">The scraper found it too</span>}
                            </td>
                            <td className="added-remove">
                              {mayRemove(job) &&
                                !alsoScraped(job) &&
                                (confirming === job._id ? (
                                  <span className="calls-remove-confirm">
                                    <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(job)} disabled={busy === job._id}>
                                      {busy === job._id ? 'Removing…' : 'Remove'}
                                    </button>
                                    <button type="button" className="btn btn-sm" onClick={() => setConfirming(null)} disabled={busy === job._id}>
                                      Keep
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className="icon-btn calls-remove"
                                    onClick={() => setConfirming(job._id)}
                                    aria-label={`Remove the job ${job.title}`}
                                    title="Remove this job (added by mistake)"
                                  >
                                    <CloseIcon size={14} />
                                  </button>
                                ))}
                              {problems[job._id] && (
                                <span className="field-error" role="alert">
                                  {problems[job._id]}
                                </span>
                              )}
                            </td>
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

      {adding && <AddJobForm courses={courses} onClose={() => setAdding(false)} onSaved={() => setReload((n) => n + 1)} onOpenJob={showJob} />}
      {modal}
    </main>
  );
}
