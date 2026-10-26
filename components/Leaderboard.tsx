'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useApi } from '@/lib/api';
import { addDays, formatDay, formatNumber, istDayOf } from '@/lib/format';
import { standings, type Standing } from '@/lib/performance';
import type { ApiState, PerformanceResponse } from '@/lib/types';
import Avatar from './Avatar';
import { CrownIcon, MailIcon, PhoneIcon, TrophyIcon } from './Icons';
import { CardHeader, SectionError } from './PageParts';

const LIVE_EVERY_MS = 60_000; // today's board is fetched again every minute while the page is in view
const LEAD_NOTE_MS = 6_000; // how long "Took the lead" shows

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
const contacts = (n: number) => (n === 1 ? 'contact' : 'contacts');

// A number that counts up to its value: from 0 the first time, then from where it was. Screen readers get
// the value itself.
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
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
      const next = Math.round(start + (value - start) * (1 - (1 - t) ** 3));
      from.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return (
    <>
      <span aria-hidden="true">{formatNumber(shown)}</span>
      <span className="sr-only">{formatNumber(value)}</span>
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

// Yesterday's winner (or joint winners), in the spotlight: crowned, with a turning gold ring.
function YesterdayWinner({ state, day }: { state: ApiState<PerformanceResponse>; day: string }) {
  const board = state.data ? standings(state.data.rows) : [];
  const winners = board.filter((p) => p.rank === 1);
  const runnerUp = board.find((p) => p.rank > 1);
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
          <p>No contacts were added yesterday.</p>
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
              <CountUp value={winner.total} />
            </strong>{' '}
            {contacts(winner.total)}
            {winners.length > 1 ? ' each' : ''}
          </p>
          {winners.length === 1 && (
            <p className="lb-champ-split">
              <span>
                <PhoneIcon size={13} /> {formatNumber(winner.phones)} {winner.phones === 1 ? 'phone' : 'phones'}
              </span>
              <span>
                <MailIcon size={13} /> {formatNumber(winner.emails)} {winner.emails === 1 ? 'email' : 'emails'}
              </span>
            </p>
          )}
          <p className="lb-champ-margin">
            {winners.length > 1
              ? 'A tie for first place'
              : runnerUp
                ? `${formatNumber(winner.total - runnerUp.total)} more than ${runnerUp.name}`
                : 'The only one to add contacts'}
          </p>
        </>
      )}
    </div>
  );
}

// "Leading by 4", "Tied for 1st", "4 behind"
function gapText(person: Standing, board: Standing[]) {
  const leader = board[0];
  if (person.rank > 1) return `${formatNumber(leader.total - person.total)} behind`;
  if (board.filter((p) => p.rank === 1).length > 1) return 'Tied for 1st';
  const second = board.find((p) => p.rank > 1);
  return second ? `Leading by ${formatNumber(person.total - second.total)}` : 'Leading';
}

// Today's standings, live: rows slide to their new place when someone overtakes, and a new leader is
// called out for a few seconds.
function TodayBoard({ state }: { state: ApiState<PerformanceResponse> }) {
  const board = state.data ? standings(state.data.rows) : [];
  const max = Math.max(1, ...board.map((p) => p.total));
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
  const order = board.map((p) => `${p.email}:${p.total}`).join('|');
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
            <strong>No contacts added yet today.</strong>
          </p>
          <p className="muted">The first HR phone number or email takes the lead.</p>
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
                  {formatNumber(p.phones)} {p.phones === 1 ? 'phone' : 'phones'} · {formatNumber(p.emails)} {p.emails === 1 ? 'email' : 'emails'}
                </span>
                <span className="lb-track" aria-hidden="true">
                  <span className="lb-fill" style={{ width: `${(p.total / max) * 100}%` }} />
                </span>
              </span>
              <span className="lb-score">
                <strong className="lb-total">
                  <CountUp value={p.total} />
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

// The daily leaderboard: who added the most HR contact details (phone numbers + emails, counted as the
// report's Total) yesterday and so far today. It doesn't follow the report's period: it is always these
// two days (IST). refresh: bumped by the report after a save, to count it at once.
export default function Leaderboard({ refresh = 0 }: { refresh?: number }) {
  const today = istDayOf(new Date().toISOString());
  const yesterday = addDays(today, -1);
  const todayState = useApi<PerformanceResponse>('performance', { days: 1, r: refresh || undefined }, { auth: true });
  const yesterdayState = useApi<PerformanceResponse>('performance', { from: yesterday, to: yesterday }, { auth: true });

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
        description="Who found the most HR contacts: phone numbers and emails added. A new race starts every day at midnight."
      />
      <div className="lb-grid">
        <YesterdayWinner state={yesterdayState} day={yesterday} />
        <TodayBoard state={todayState} />
      </div>
    </section>
  );
}
