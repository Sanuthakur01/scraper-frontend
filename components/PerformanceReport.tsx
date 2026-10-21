'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { apiUrl, useApi } from '@/lib/api';
import { ROLE_LABELS, roleFrom } from '@/lib/access';
import { COURSE_COLORS, formatDate, formatDateTime, formatNumber, formatUpdated, istDayOf, percent, periodFrom, periodParams, type Period } from '@/lib/format';
import { ACTIVITY_PERIODS, allIds, buildTree, countsOf, performanceCsv, type PerfNode } from '@/lib/performance';
import { signInHeader } from '@/lib/session';
import type { Job, JobsResponse, Meta, PerformanceResponse } from '@/lib/types';
import { BriefcaseIcon, BuildingIcon, ChartIcon, ChevronRightIcon, DownloadIcon, ExternalIcon, MailIcon, PhoneIcon, UsersIcon } from './Icons';
import JobDetailsModal from './JobDetailsModal';
import { CardHeader, PageError, PageHeader, PageSkeleton } from './PageParts';
import PeriodTabs from './PeriodTabs';

// "Riya Sharma" -> "RS"; "riya@ijf.in" -> "R"
const initials = (name: string, email: string) =>
  (name.trim() && name !== email ? name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]) : [email[0] ?? '?']).join('').toUpperCase();

// "today", "in the last 7 days", "on 9–12 Oct"
const periodWords = (p: Period) => (p.from ? `on ${p.label}` : p.days === 1 ? 'today' : `in the ${p.label.toLowerCase()}`);

const NEXT_LEVEL = { person: 'courses', course: 'companies', company: 'jobs', job: 'numbers and emails' } as const;

// One row of the drill-down: a person, a course, a company or a job, with its counts. Its toggle shows
// the level below; a job shows each number and email added to it (the final grain).
function NodeLabel({ node }: { node: PerfNode }) {
  if (node.level === 'person' && node.person) {
    const role = roleFrom({ role: node.person.role ?? '' });
    return (
      <>
        <span className="activity-avatar perf-avatar" aria-hidden="true">
          {initials(node.person.name, node.person.email)}
        </span>
        <span className="perf-person">
          <strong>{node.label}</strong>
          {node.label !== node.person.email && <span className="muted perf-email">{node.person.email}</span>}
        </span>
        {role && <span className="activity-role">{ROLE_LABELS[role]}</span>}
      </>
    );
  }
  if (node.level === 'course') {
    return (
      <span className="perf-course" style={{ '--course': node.course ? COURSE_COLORS[node.course] : 'var(--border-strong)' } as CSSProperties}>
        <span className="dot" aria-hidden="true" />
        {node.label}
      </span>
    );
  }
  if (node.level === 'company') {
    return (
      <span className="perf-company">
        <BuildingIcon size={14} />
        {node.label}
      </span>
    );
  }
  return (
    <span className="perf-job">
      <BriefcaseIcon size={14} />
      <span>{node.label}</span>
      {node.job?.set === 'nonfiltered' && <span className="badge-muted">Non-filtered</span>}
    </span>
  );
}

interface Opening {
  id: string;
  problem: string;
}

export default function PerformanceReport() {
  const router = useRouter();
  const period = periodFrom(useSearchParams(), ACTIVITY_PERIODS);
  const meta = useApi<Meta>('meta');
  const [reload, setReload] = useState(0); // bumped after a save in a job's window: the counts may change
  const perf = useApi<PerformanceResponse>('performance', { ...periodParams(period), r: reload || undefined }, { auth: true });
  const [open, setOpen] = useState<Set<string>>(new Set());
  // A job opened from its row, or why it couldn't be.
  const [detail, setDetail] = useState<Job | null>(null);
  const [saved, setSaved] = useState<Record<string, Job>>({});
  const [opening, setOpening] = useState<Opening | null>(null);

  const courses = meta.data?.courses ?? [];
  const courseName = (id: string) => courses.find((c) => c.id === id)?.name ?? id;
  const data = perf.data;
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const tree = useMemo(() => buildTree(rows, (id) => meta.data?.courses.find((c) => c.id === id)?.name ?? id), [rows, meta.data]);

  if (meta.error) return <PageError title="Could not load the performance report" error={meta.error} />;
  if (!meta.data) return <PageSkeleton />;

  const totals = countsOf(rows);
  const top = Math.max(1, ...tree.map((p) => p.total));
  const since = data?.since ?? null;
  const today = istDayOf(new Date().toISOString());
  const startsBeforeTracking = since && data && data.from < istDayOf(since);

  const toggle = (id: string) =>
    setOpen((ids) => {
      const next = new Set(ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const download = () => {
    const blob = new Blob([performanceCsv(rows, courseName)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `performance-${data?.from}${data && data.to !== data.from ? `-to-${data.to}` : ''}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Opens a job (in the set it was in), if it is still stored.
  const openJob = async (node: PerfNode) => {
    if (!node.job) return;
    setOpening({ id: node.id, problem: '' });
    try {
      const params = { id: node.job.id, days: 1, view: node.job.set === 'nonfiltered' ? 'nonfiltered' : undefined };
      const res = await fetch(apiUrl('jobs', params), { headers: await signInHeader() });
      const body = (await res.json().catch(() => null)) as JobsResponse | null;
      const job = body?.items?.[0];
      if (!res.ok || !job) {
        setOpening({ id: node.id, problem: 'This job is no longer stored (jobs are kept for 90 days after they were last seen).' });
        return;
      }
      setOpening(null);
      setDetail(saved[job._id] ?? job);
    } catch {
      setOpening({ id: node.id, problem: 'Could not reach the server. Check your connection and try again.' });
    }
  };

  const renderNode = (node: PerfNode): ReactNode => {
    const isOpen = open.has(node.id);
    const depth = { '--depth': node.depth } as CSSProperties;
    return (
      <Fragment key={node.id}>
        <tr className={`perf-row level-${node.level} ${isOpen ? 'is-open' : ''}`}>
          <th scope="row">
            <div className="perf-name" style={depth}>
              <button
                type="button"
                className="perf-toggle"
                aria-expanded={isOpen}
                onClick={() => toggle(node.id)}
                title={`${isOpen ? 'Hide' : 'Show'} the ${NEXT_LEVEL[node.level]}`}
              >
                <ChevronRightIcon size={15} className="perf-chevron" />
                <NodeLabel node={node} />
              </button>
              {node.level === 'job' && (
                <button type="button" className="perf-open" onClick={() => openJob(node)} aria-haspopup="dialog" title="Open this job">
                  <ExternalIcon size={13} />
                  <span className="sr-only">Open {node.label}</span>
                </button>
              )}
            </div>
            {opening?.id === node.id && opening.problem && (
              <p className="field-error perf-problem" style={depth} role="status">
                {opening.problem}
              </p>
            )}
          </th>
          <td className="num hide-sm">{formatNumber(node.phones)}</td>
          <td className="num hide-sm">{formatNumber(node.emails)}</td>
          <td className="num">
            {node.level === 'person' ? (
              <span className="cell-bar">
                <span className="cell-bar-track" aria-hidden="true">
                  <span className="cell-bar-fill" style={{ width: `${(node.total / top) * 100}%` }} />
                </span>
                <span className="big-num">{formatNumber(node.total)}</span>
              </span>
            ) : (
              <span className="strong">{formatNumber(node.total)}</span>
            )}
          </td>
          <td className="num">{formatNumber(node.jobs)}</td>
        </tr>
        {isOpen && node.children.map(renderNode)}
        {isOpen &&
          node.level === 'job' &&
          node.rows.map((row) => (
            <tr key={`${row.record}-${row.field}-${row.value}`} className="perf-leaf">
              <td colSpan={5}>
                <div className="perf-name" style={{ '--depth': node.depth + 1 } as CSSProperties}>
                  <span className={`perf-kind ${row.field}`}>
                    {row.field === 'phone' ? <PhoneIcon size={13} /> : <MailIcon size={13} />}
                    {row.field === 'phone' ? 'Phone' : 'Email'}
                  </span>
                  <span className="perf-value">{row.value}</span>
                  <time className="muted perf-time" dateTime={row.at} title={formatDateTime(row.at)}>
                    added {formatUpdated(row.at)}
                  </time>
                </div>
              </td>
            </tr>
          ))}
      </Fragment>
    );
  };

  return (
    <main className="page">
      <PageHeader
        icon={<ChartIcon size={20} />}
        eyebrow={`Team · ${period.label}`}
        title="Performance report"
        subtitle="How many HR phone numbers and emails each person added, and where. Click a row to drill down: person, course, company, job, then each number and email."
        actions={
          <PeriodTabs
            period={period}
            periods={ACTIVITY_PERIODS}
            first={since ? istDayOf(since) : null}
            last={today}
            data="changes"
            onChange={(query) => router.replace(`/performance?${query}`, { scroll: false })}
          />
        }
      >
        {since && <span className="status-pill">Counted since {formatDate(since)}, when the activity record began</span>}
      </PageHeader>

      <section className={`kpis kpis-4 ${perf.loading ? 'is-loading' : ''}`} aria-label="Contact details added">
        {[
          { icon: <UsersIcon size={16} />, name: 'Contact details added', value: totals.total, note: period.title },
          { icon: <PhoneIcon size={16} />, name: 'Phone numbers', value: totals.phones, note: `${percent(totals.phones, totals.total)} of them` },
          { icon: <MailIcon size={16} />, name: 'Emails', value: totals.emails, note: `${percent(totals.emails, totals.total)} of them` },
          { icon: <BriefcaseIcon size={16} />, name: 'Jobs', value: totals.jobs, note: `with new details, by ${formatNumber(tree.length)} ${tree.length === 1 ? 'person' : 'people'}` },
        ].map((card) => (
          <div className="kpi" key={card.name}>
            <div className="kpi-top">
              <span className="kpi-badge" aria-hidden="true">
                {card.icon}
              </span>
              <span className="kpi-name">{card.name}</span>
            </div>
            <p className="kpi-value">{data ? formatNumber(card.value) : '—'}</p>
            <p className="kpi-period">{card.note}</p>
          </div>
        ))}
      </section>

      <section className="card card-flush perf-card">
        <CardHeader
          icon={<ChartIcon />}
          title={
            <>
              Who added what {data && <span className="count-badge">{formatNumber(tree.length)}</span>}
            </>
          }
          description="Most first at every level. Phone numbers and emails count once each; a number already in the job's posting, or only written differently, doesn't count."
          actions={
            rows.length > 0 && (
              <div className="perf-actions">
                <button type="button" className="btn btn-sm" onClick={() => setOpen(new Set(allIds(tree)))}>
                  Expand all
                </button>
                <button type="button" className="btn btn-sm" onClick={() => setOpen(new Set())} disabled={!open.size}>
                  Collapse all
                </button>
                <button type="button" className="btn btn-sm" onClick={download}>
                  <DownloadIcon /> Download CSV
                </button>
              </div>
            )
          }
        />

        {data?.truncated && <p className="note-warning perf-note">Only the newest {formatNumber(rows.length)} are counted. Choose fewer days to see them all.</p>}

        {perf.error ? (
          <p className="activity-empty" role="alert">
            {perf.error.message}
          </p>
        ) : !data ? (
          <div className="activity-skeleton" aria-busy="true" aria-label="Loading the report">
            {[0, 1, 2].map((i) => (
              <span key={i} className="skeleton" />
            ))}
          </div>
        ) : !rows.length ? (
          <div className="activity-empty">
            <span className="auth-icon" aria-hidden="true">
              <ChartIcon size={22} />
            </span>
            <p>
              <strong>{since ? `No HR phone numbers or emails were added ${periodWords(period)}.` : 'Nothing recorded yet.'}</strong>
            </p>
            <p className="muted">
              {since
                ? startsBeforeTracking
                  ? `Counting began on ${formatDate(since)}; work before that wasn't recorded.`
                  : 'Try a longer period.'
                : 'Counting starts with the first HR phone number or email someone adds after signing in.'}
            </p>
          </div>
        ) : (
          <div className={`table-wrap ${perf.loading ? 'is-loading' : ''}`}>
            <table className="data-table perf-table">
              <thead>
                <tr>
                  <th scope="col">Person, then course, company and job</th>
                  <th scope="col" className="num hide-sm">
                    Phones
                  </th>
                  <th scope="col" className="num hide-sm">
                    Emails
                  </th>
                  <th scope="col" className="num">
                    Total
                  </th>
                  <th scope="col" className="num">
                    Jobs
                  </th>
                </tr>
              </thead>
              <tbody>{tree.map(renderNode)}</tbody>
              <tfoot>
                <tr>
                  <th scope="row">All</th>
                  <td className="num hide-sm">{formatNumber(totals.phones)}</td>
                  <td className="num hide-sm">{formatNumber(totals.emails)}</td>
                  <td className="num">{formatNumber(totals.total)}</td>
                  <td className="num">{formatNumber(totals.jobs)}</td>
                </tr>
              </tfoot>
            </table>
            {startsBeforeTracking && <p className="perf-footnote muted">Counting began on {formatDate(since)}; work before that wasn&apos;t recorded.</p>}
          </div>
        )}
      </section>

      {detail && (
        <JobDetailsModal
          job={saved[detail._id] ?? detail}
          courses={courses}
          saved={saved}
          onClose={() => setDetail(null)}
          onSaved={(job) => {
            setSaved((jobs) => ({ ...jobs, [job._id]: job }));
            setReload((n) => n + 1);
          }}
          onOpenJob={(job) => setDetail(saved[job._id] ?? job)}
        />
      )}
    </main>
  );
}
