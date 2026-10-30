'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, type CSSProperties, type ReactNode } from 'react';
import { useApi } from '@/lib/api';
import { COURSE_COLORS, courseInitials, formatDay, formatNumber, formatTime, istDayOf, sumCounts } from '@/lib/format';
import { countsOf } from '@/lib/performance';
import { isCvShared } from '@/lib/review';
import type { ApiState, InterviewsResponse, Meta, PerformanceResponse, ReviewResponse, Summary } from '@/lib/types';
import { ArrowRightIcon, BriefcaseIcon, CalendarIcon, MailIcon, PhoneIcon, SendIcon, UsersIcon } from './Icons';
import { setupHint } from './Interviews';
import { Freshness, PageError, PageHeader, PageSkeleton } from './PageParts';
import { Delta } from './StatTiles';

const RECENT = 3; // CVs shared listed in their box
const longDay = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long' });
const istHour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: 'numeric', hourCycle: 'h23' });

const plural = (n: number, one: string, many: string) => `${formatNumber(n)} ${n === 1 ? one : many}`;

// One box of the Home page: frosted glass tinted with its colour (tone: a tone-* class in globals.css), its icon and name,
// what it counts, and where it leads (a whole-box link). Without href it is a box still to come.
function HomeTile({ tone, icon, title, href, cta, label, children }: { tone: string; icon: ReactNode; title: string; href?: string; cta?: string; label?: string; children: ReactNode }) {
  const body = (
    <>
      <span className="home-tile-glow" aria-hidden="true" />
      <span className="home-tile-top">
        <span className="kpi-badge" aria-hidden="true">
          {icon}
        </span>
        <span className="home-tile-title">{title}</span>
        {href ? (
          <span className="kpi-go" aria-hidden="true">
            <ArrowRightIcon size={16} />
          </span>
        ) : (
          <span className="home-soon">Coming soon</span>
        )}
      </span>
      {children}
      {cta && (
        <span className="home-tile-cta">
          {cta} <ArrowRightIcon size={14} />
        </span>
      )}
    </>
  );
  return href ? (
    <Link className={`home-tile ${tone}`} href={href} aria-label={label}>
      {body}
    </Link>
  ) : (
    <div className={`home-tile is-soon ${tone}`}>{body}</div>
  );
}

// A box's number: a dash until it arrives, and a line saying so if it couldn't be loaded.
function TileValue({ state, value }: { state: ApiState<unknown>; value: number | null }) {
  return (
    <>
      <span className="home-tile-value">{value == null ? '—' : formatNumber(value)}</span>
      {state.error && <span className="home-tile-note is-error">Could not load this number. Refresh the page to try again.</span>}
    </>
  );
}

// The first page: today at a glance, five boxes. Job postings added today (opens the dashboard), HR contacts
// found today (the Performance report), CVs shared today (the CV shared page), and two still to come: incoming
// calls and interviews. Each box counts from the same data as the page it opens, so the two always agree. An old
// dashboard link (/?days=7) goes on to /dashboard.
export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oldLink = searchParams.has('days') || searchParams.has('from');
  useEffect(() => {
    if (oldLink) router.replace(`/dashboard?${searchParams.toString()}`);
  }, [oldLink, router, searchParams]);

  const meta = useApi<Meta>('meta');
  // The latest collection day (the dashboard's "Latest day"), and today's work (days end today, IST).
  const summary = useApi<Summary>('summary', { days: 1 }, { skip: oldLink });
  const performance = useApi<PerformanceResponse>('performance', { days: 1 }, { auth: true, skip: oldLink });
  const review = useApi<ReviewResponse>('review', { days: 1 }, { auth: true, skip: oldLink });
  const interviews = useApi<InterviewsResponse>('interviews', { days: 1 }, { auth: true, skip: oldLink });

  const contacts = useMemo(() => (performance.data ? countsOf(performance.data.rows) : null), [performance.data]);
  const finders = useMemo(() => new Set(performance.data?.rows.map((row) => row.actor.email)).size, [performance.data]);
  const cvRows = useMemo(() => (review.data?.rows ?? []).filter(isCvShared), [review.data]);

  if (meta.error) return <PageError title="Could not reach the server" error={meta.error} />;
  if (oldLink || !meta.data) return <PageSkeleton />;

  const { courses, lastRun, scheduleLabel } = meta.data;
  const now = new Date();
  const today = istDayOf(now.toISOString());
  const hour = Number(istHour.format(now));
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const s = summary.data;
  const jobs = s ? sumCounts(s.current) : null;
  const collectedToday = s?.anchor === today;
  const cv = review.data ? cvRows.length : null;
  const students = new Set(cvRows.map((row) => row.student.toLowerCase()).filter(Boolean)).size;
  const companies = new Set(cvRows.map((row) => (row.job.company ?? '').toLowerCase()).filter(Boolean)).size;
  // Today's interviews (from the staff's sheet, by time, "Anytime" last): the next few still to come; when none
  // is left, the day's last few.
  const iv = interviews.data;
  const ivItems = iv?.items ?? [];
  const minutesNow = hour * 60 + new Date(now.getTime() + 330 * 60_000).getUTCMinutes();
  const comingUp = ivItems.filter((i) => i.minutes == null || i.minutes >= minutesNow);
  const ivListed = comingUp.length ? comingUp.slice(0, RECENT) : ivItems.slice(-RECENT);
  const ivCompanies = new Set(ivItems.map((i) => i.company.toLowerCase()).filter(Boolean)).size;
  const placed = ivItems.filter((i) => i.placed).length;

  return (
    <main className="page home-page">
      {/* When the jobs were last collected sits at the right of the greeting (a row less: the boxes fit the screen). */}
      <PageHeader
        eyebrow={longDay.format(now)}
        title={greeting}
        subtitle="Today at IJF at a glance. Open any box for the full details."
        actions={<Freshness lastRun={lastRun} scheduleLabel={scheduleLabel} />}
      />

      <section className="home-grid" aria-label="Today">
        <HomeTile
          tone="tone-jobs"
          icon={<BriefcaseIcon size={20} />}
          title="Job postings added today"
          href="/dashboard"
          cta="Open the dashboard"
          label={`Job postings added today: ${jobs == null ? 'loading' : formatNumber(jobs)}. Open the dashboard`}
        >
          <TileValue state={summary} value={jobs} />
          {s && (
            <>
              <span className="home-tile-note">
                {collectedToday ? "New openings from today's collection" : `Today's collection hasn't run yet: these are from ${formatDay(s.anchor)}`}
              </span>
              <Delta current={jobs ?? 0} previous={sumCounts(s.previous)} label="the day before" comparable={s.comparable} quiet />
              <ul className="home-courses" aria-label="Per course">
                {courses.map((course) => (
                  // Short names ("DA"), so the four fit one line: the box stays short enough for the page to fit the screen.
                  <li key={course.id} style={{ '--course': COURSE_COLORS[course.id] } as CSSProperties} title={course.name}>
                    <span className="dot" aria-hidden="true" />
                    <span aria-hidden="true">{courseInitials(course.name)}</span>
                    <span className="sr-only">{course.name}</span>
                    <strong>{formatNumber(s.current[course.id] ?? 0)}</strong>
                  </li>
                ))}
              </ul>
            </>
          )}
        </HomeTile>

        <HomeTile
          tone="tone-contacts"
          icon={<UsersIcon size={20} />}
          title="Contacts found today"
          href="/performance?days=1"
          cta="Open the Performance report"
          label={`Contacts found today: ${contacts ? `${formatNumber(contacts.total)}, ${plural(contacts.phones, 'phone number', 'phone numbers')} and ${plural(contacts.emails, 'email', 'emails')}` : 'loading'}. Open the Performance report`}
        >
          <TileValue state={performance} value={contacts?.total ?? null} />
          {contacts && (
            <>
              <span className="home-tile-note">{contacts.total ? `HR contacts added by ${plural(finders, 'person', 'people')} today` : 'No HR contacts added yet today'}</span>
              <span className="home-split">
                <span>
                  <PhoneIcon size={15} />
                  <strong>{formatNumber(contacts.phones)}</strong> {contacts.phones === 1 ? 'Phone number' : 'Phone numbers'}
                </span>
                <span>
                  <MailIcon size={15} />
                  <strong>{formatNumber(contacts.emails)}</strong> {contacts.emails === 1 ? 'Email' : 'Emails'}
                </span>
              </span>
            </>
          )}
        </HomeTile>

        <HomeTile
          tone="tone-cv"
          icon={<SendIcon size={20} />}
          title="CV shared today"
          href="/cv-shared?days=1"
          cta="See every CV shared today"
          label={`CV shared today: ${cv == null ? 'loading' : formatNumber(cv)}. See who shared them, with each company`}
        >
          <TileValue state={review} value={cv} />
          {review.data && (
            <>
              <span className="home-tile-note">
                {cv ? `${plural(students, 'student', 'students')} · ${plural(companies, 'company', 'companies')}` : 'No CV shared yet today'}
              </span>
              {cv ? (
                <ul className="home-recent" aria-label="The latest">
                  {cvRows.slice(0, RECENT).map((row) => (
                    <li key={row.id}>
                      <strong>{row.student || 'No student'}</strong>
                      <span>{row.job.company || 'Company not shown'}</span>
                      <time dateTime={row.feedback!.at}>{formatTime(row.feedback!.at)}</time>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </HomeTile>

        <HomeTile tone="tone-calls" icon={<PhoneIcon size={20} />} title="Incoming calls today">
          <span className="home-tile-note">Calls from HR to students today, with who picked up.</span>
        </HomeTile>

        {iv && !iv.configured ? (
          <HomeTile tone="tone-interviews" icon={<CalendarIcon size={20} />} title="Interviews today">
            <span className="home-tile-note">The interview sheet isn&apos;t connected on the server yet.</span>
            <span className="home-tile-note home-setup-hint">{setupHint(iv)}</span>
          </HomeTile>
        ) : (
          <HomeTile
            tone="tone-interviews"
            icon={<CalendarIcon size={20} />}
            title="Interviews today"
            href="/interviews?days=1"
            cta="See today's interviews"
            label={`Interviews today: ${iv ? formatNumber(ivItems.length) : 'loading'}. See them, with each company and time`}
          >
            <TileValue state={interviews} value={iv ? ivItems.length : null} />
            {iv && (
              <>
                <span className="home-tile-note">
                  {ivItems.length
                    ? `${plural(ivCompanies, 'company', 'companies')}${placed ? ` · ${formatNumber(placed)} placed` : ''}`
                    : 'No interviews in the sheet for today'}
                  {iv.error && ' · showing the last reading of the sheet'}
                </span>
                {ivItems.length ? (
                  <span className="home-recent-label">{comingUp.length ? 'Coming up' : 'Earlier today'}</span>
                ) : null}
                {ivItems.length ? (
                  <ul className="home-recent" aria-label={comingUp.length ? 'Coming up' : 'Earlier today'}>
                    {ivListed.map((item) => (
                      <li key={item.id}>
                        <strong>{item.name}</strong>
                        <span>{item.company || 'Company not written'}</span>
                        <span className="home-recent-time">{item.time || '—'}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </HomeTile>
        )}
      </section>

      <p className="page-footnote">
        Contacts and CVs count today&apos;s work (IST). Job postings count the latest collection. Interviews come from the staff&apos;s interview sheet.
      </p>
    </main>
  );
}
