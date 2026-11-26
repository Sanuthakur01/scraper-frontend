'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useApi } from '@/lib/api';
import { addDays, formatDay, formatNumber, istDayOf } from '@/lib/format';
import { formatPoints, POINTS, standings, teamCvShared, type Standing } from '@/lib/performance';
import type { ApiState, PerformanceResponse } from '@/lib/types';
import Avatar from './Avatar';
import { CheckIcon, CrownIcon, MailIcon, PhoneIcon, TrophyIcon } from './Icons';
import { CardHeader, SectionError } from './PageParts';

const LIVE_EVERY_MS = 60_000; // today's board is fetched again every minute while the page is in view
const LEAD_NOTE_MS = 6_000; // how long "Took the lead" shows

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
const plural = (n: number, one: string, many = `${one}s`) => `${formatNumber(n)} ${n === 1 ? one : many}`;
const cvs = (n: number) => `${formatNumber(n)} ${n === 1 ? 'CV' : 'CVs'} shared`;

// The board: who has how many points today (or had yesterday), from the contacts they added and the CVs shared
// on contacts they found.
const boardOf = (data: PerformanceResponse) => standings(data.rows, teamCvShared(data.cvShared));

// A number that counts up to its value: from 0 the first time, then from where it was. Points move in halves
// (1.5 a phone number). Screen readers get the value itself.
function CountUp({ value, points = false }: { value: number; points?: boolean }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  const text = points ? formatPoints : formatNumber;
  useEffect(() => {
    const start = from.current;
    if (reducedMotion() || start === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const began = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / 900);
      const at = start + (value - start) * (1 - (1 - t) ** 3);
      const next = points ? Math.round(at * 2) / 2 : Math.round(at);
      from.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, points]);
  return (
    <>
      <span aria-hidden="true">{text(shown)}</span>
      <span className="sr-only">{text(value)}</span>
    </>
  );
}

// 1st, 2nd and 3rd place: gold, silver and bronze, with the place written on it.
function Medal({ rank }: { rank: number }) {
  const metal = ['', 'gold', 'silver', 'bronze'][rank] ?? '';
  return (
    <span className={`lb-medal ${metal}`}>
      <span aria-hidden="true">{rank}</span>
      <span className="sr-only">{ordinal(rank)} place</span>
    </span>
  );
}

function BoardSkeleton({ rows }: { rows: number }) {
  return (
    <div className="lb-skeleton" aria-busy="true" aria-label="Loading the leaderboard">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="skeleton" />
      ))}
    </div>
  );
}

// What the points came from: "3 phones · 2 emails · 1 CV shared" (the CVs only when there are any).
function Split({ person, icons = false }: { person: Standing; icons?: boolean }) {
  const parts = [
    { icon: <PhoneIcon size={13} />, text: plural(person.phones, 'phone') },
    { icon: <MailIcon size={13} />, text: plural(person.emails, 'email') },
    ...(person.cvShared ? [{ icon: <CheckIcon size={13} />, text: cvs(person.cvShared) }] : []),
  ];
  if (!icons) return <>{parts.map((p) => p.text).join(' · ')}</>;
  return (
    <>
      {parts.map((p) => (
        <span key={p.text}>
          {p.icon} {p.text}
        </span>
      ))}
    </>
  );
}

// Yesterday's winner (or joint winners), in the spotlight: crowned, with a turning gold ring.
function YesterdayWinner({ state, day }: { state: ApiState<PerformanceResponse>; day: string }) {
  const board = state.data ? boardOf(state.data) : [];
  const winners = board.filter((p) => p.rank === 1);
  const [winner] = winners;
  return (
    <div className={`lb-winner ${winner ? 'has-winner' : ''}`}>
      <p className="lb-eyebrow">
        <TrophyIcon size={14} className="lb-eyebrow-icon" />
        Yesterday&apos;s {winners.length > 1 ? 'winners' : 'winner'} · {formatDay(day)}
      </p>
      {state.error ? (
        <SectionError what="yesterday's winner" error={state.error} onRetry={state.reload} />
      ) : !state.data ? (
        <BoardSkeleton rows={2} />
      ) : !winner ? (
        <div className="lb-winner-empty">
          <span className="lb-empty-icon" aria-hidden="true">
            <TrophyIcon size={22} />
          </span>
          <p>No points were scored yesterday.</p>
        </div>
      ) : (
        <>
          <div className="lb-champ" aria-hidden="true">
            <span className="lb-crown">
              <CrownIcon size={28} />
            </span>
            <span className="lb-champ-avatars">
              {winners.slice(0, 3).map((w) => (
                <Avatar key={w.email} name={w.name} email={w.email} className="lb-champ-avatar" />
              ))}
            </span>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} className={`lb-spark s${i}`} />
            ))}
          </div>
          <p className="lb-champ-name">{winners.map((w) => w.name).join(' & ')}</p>
          <p className="lb-champ-score">
            <strong>
              <CountUp value={winner.points} points />
            </strong>{' '}
            {winner.points === 1 ? 'point' : 'points'}
            {winners.length > 1 ? ' each' : ''}
          </p>
          {winners.length === 1 && (
            <p className="lb-champ-split">
              <Split person={winner} icons />
            </p>
          )}
        </>
      )}
    </div>
  );
}

// "Leading by 4.5", "Tied for 1st", "4.5 behind"
function gapText(person: Standing, board: Standing[]) {
  const leader = board[0];
  if (person.rank > 1) return `${formatPoints(leader.points - person.points)} behind`;
  if (board.filter((p) => p.rank === 1).length > 1) return 'Tied for 1st';
  const second = board.find((p) => p.rank > 1);
  return second ? `Leading by ${formatPoints(person.points - second.points)}` : 'Leading';
}

// Today's standings, live: rows slide to their new place when someone overtakes, and a new leader is
// called out for a few seconds.
function TodayBoard({ state }: { state: ApiState<PerformanceResponse> }) {
  const board = state.data ? boardOf(state.data) : [];
  const max = Math.max(1, ...board.map((p) => p.points));
  const leaders = board.filter((p) => p.rank === 1);
  const leader = leaders.length === 1 ? leaders[0].email : null;

  // A new sole leader (not the first one seen): "Took the lead" on their row for a few seconds.
  const lastLeader = useRef<string | null>(null);
  const [tookLead, setTookLead] = useState<string | null>(null);
  useEffect(() => {
    const before = lastLeader.current;
    if (leader) lastLeader.current = leader;
    if (!leader || !before || before === leader) return;
    setTookLead(leader);
    const timer = setTimeout(() => setTookLead(null), LEAD_NOTE_MS);
    return () => {
      clearTimeout(timer);
      setTookLead(null);
    };
  }, [leader]);

  // Rows that changed place glide from where they were (FLIP).
  const rowEls = useRef(new Map<string, HTMLLIElement>());
  const tops = useRef(new Map<string, number>());
  const order = board.map((p) => `${p.email}:${p.points}`).join('|');
  useLayoutEffect(() => {
    const moved = new Map<string, number>();
    for (const [key, el] of rowEls.current) {
      const top = el.offsetTop;
      const before = tops.current.get(key);
      moved.set(key, top);
      if (before !== undefined && before !== top && !reducedMotion()) {
        el.animate([{ transform: `translateY(${before - top}px)` }, { transform: 'translateY(0)' }], {
          duration: 650,
          easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        });
      }
    }
    tops.current = moved;
  }, [order]);

  return (
    <div className="lb-today">
      <div className="lb-today-head">
        <p className="lb-eyebrow">Today</p>
        <span className="lb-live" title="Updated every minute">
          <span className="lb-live-dot" aria-hidden="true" />
          Live
        </span>
      </div>
      {state.error ? (
        <SectionError what="today's leaderboard" error={state.error} onRetry={state.reload} />
      ) : !state.data ? (
        <BoardSkeleton rows={3} />
      ) : !board.length ? (
        <div className="lb-today-empty">
          <p>
            <strong>No points yet today.</strong>
          </p>
          <p className="muted">The first HR phone number or email found takes the lead.</p>
        </div>
      ) : (
        <ol className="lb-list" aria-label="Today's leaderboard">
          {board.map((p, i) => (
            <li
              key={p.email}
              ref={(el) => {
                if (el) rowEls.current.set(p.email, el);
                else rowEls.current.delete(p.email);
              }}
              className={`lb-row ${p.rank === 1 ? 'is-leader' : ''} ${tookLead === p.email ? 'took-lead' : ''}`}
              style={{ '--i': i } as CSSProperties}
            >
              <Medal rank={p.rank} />
              <Avatar name={p.name} email={p.email} className="lb-avatar" />
              <span className="lb-who">
                <span className="lb-name">
                  <span className="lb-name-text">{p.name}</span>
                  {tookLead === p.email && <span className="lb-took">Took the lead</span>}
                </span>
                <span className="lb-split">
                  <Split person={p} />
                </span>
                <span className="lb-track" aria-hidden="true">
                  <span className="lb-fill" style={{ width: `${(p.points / max) * 100}%` }} />
                </span>
              </span>
              <span className="lb-score">
                <strong className="lb-total">
                  <CountUp value={p.points} points />
                  <span className="lb-unit">pts</span>
                </strong>
                <span className={`lb-gap ${p.rank === 1 ? 'is-lead' : ''}`}>{gapText(p, board)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// The daily leaderboard: who scored the most points yesterday and so far today (lib/performance.ts POINTS: for
// each phone number and email found, and each CV shared on a contact they found, on the day it was shared). It
// doesn't follow the report's period: it is always these two days (IST). refresh: bumped by the report after a
// save, to count it at once.
export default function Leaderboard({ refresh = 0 }: { refresh?: number }) {
  const today = istDayOf(new Date().toISOString());
  const yesterday = addDays(today, -1);
  const todayState = useApi<PerformanceResponse>('performance', { days: 1, r: refresh || undefined }, { auth: true });
  const yesterdayState = useApi<PerformanceResponse>('performance', { from: yesterday, to: yesterday, r: refresh || undefined }, { auth: true });

  const { reload } = todayState;
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') reload?.();
    }, LIVE_EVERY_MS);
    return () => clearInterval(timer);
  }, [reload]);

  return (
    <section className="card lb-card">
      <CardHeader
        icon={<TrophyIcon />}
        title="Daily leaderboard"
        description={`Who scored the most points: ${formatPoints(POINTS.phone)} for each phone number found, ${formatPoints(POINTS.email)} for each email, ${formatPoints(POINTS.cvShared)} for each CV shared on a contact they found. A new race starts every day at midnight.`}
      />
      <div className="lb-grid">
        <YesterdayWinner state={yesterdayState} day={yesterday} />
        <TodayBoard state={todayState} />
      </div>
    </section>
  );
}
