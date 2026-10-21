'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { addDays, dayCount, isDay, MAX_CUSTOM_DAYS, PERIODS, rangeLabel, type Period } from '@/lib/format';
import { CalendarIcon } from './Icons';
import { Segmented } from './PageParts';

interface Props {
  period: Period;
  periods?: Period[]; // the preset tabs (default: Latest day, Last 7 days, Last 30 days)
  first?: string | null; // the oldest and newest day with data (e.g. meta.dataDays): the dates to choose from
  last?: string;
  data?: 'jobs' | 'changes'; // what those days hold, for the panel's wording (default jobs)
  onChange: (query: string) => void; // "days=7" or "from=2026-10-12&to=2026-10-15", for the page address
}

// Latest day / Last 7 days / Last 30 days, or Custom: one chosen day, or a range of days (both
// included). Custom opens a small panel that starts on the days shown now.
const WORDING = {
  jobs: { held: 'Jobs are stored for', none: 'No jobs are stored for those days.' },
  changes: { held: 'Changes are recorded for', none: 'Nothing was recorded on those days.' },
};

export default function PeriodTabs({ period, periods = PERIODS, first, last, data = 'jobs', onChange }: Props) {
  const words = WORDING[data];
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'day' | 'range'>('day');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const customButton = useRef<HTMLButtonElement>(null);
  const firstInput = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const custom = period.key === 'custom';

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) customButton.current?.focus();
  };

  const openPanel = () => {
    const end = period.to ?? last ?? '';
    const start = period.from ?? (end ? addDays(end, -(period.days - 1)) : '');
    setMode(start === end ? 'day' : 'range');
    setFrom(start);
    setTo(end);
    setError('');
    setOpen(true);
  };

  // Opened: focus its first date. Esc or a click outside closes it.
  useEffect(() => {
    if (!open) return;
    firstInput.current?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) close(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close only sets state and focuses a ref
  }, [open]);

  const apply = (event: FormEvent) => {
    event.preventDefault();
    const [start, end] = mode === 'day' ? [from, from] : [from, to];
    if (!isDay(start) || !isDay(end)) return setError(mode === 'day' ? 'Choose a date.' : 'Choose both dates.');
    if (start > end) return setError('The start date must be on or before the end date.');
    if (dayCount(start, end) > MAX_CUSTOM_DAYS) return setError(`Choose at most ${MAX_CUSTOM_DAYS} days.`);
    if ((first && end < first) || (last && start > last)) return setError(`${words.none} Choose days within ${first && last ? rangeLabel(first, last) : 'those with data'}.`);
    close(true);
    onChange(`from=${start}&to=${end}`);
  };

  const limits = { min: first ?? undefined, max: last };
  return (
    <div className="period-picker" ref={box}>
      <div className="segmented" role="group" aria-label="Time period">
        {periods.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={period.key === p.key}
            onClick={() => {
              setOpen(false);
              onChange(`days=${p.days}`);
            }}
          >
            {p.tab}
          </button>
        ))}
        <button
          ref={customButton}
          type="button"
          className="period-custom"
          aria-pressed={custom}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label={custom ? `Custom dates: ${period.label}. Change` : 'Custom dates'}
          onClick={() => (open ? close(false) : openPanel())}
        >
          <CalendarIcon size={14} />
          {custom ? period.label : 'Custom'}
        </button>
      </div>

      {open && (
        <form id={panelId} className="period-panel" role="dialog" aria-label="Choose dates" onSubmit={apply} noValidate>
          <div className="period-panel-head">
            <p className="period-panel-title">Choose dates</p>
            <Segmented
              label="One day or a range"
              value={mode}
              onChange={(next) => {
                setMode(next);
                setError('');
                if (next === 'range' && (!to || to < from)) setTo(from);
              }}
              options={[
                { value: 'day', label: 'One day' },
                { value: 'range', label: 'Date range' },
              ]}
            />
          </div>

          {mode === 'day' ? (
            <label className="period-field">
              <span>Date</span>
              <input ref={firstInput} type="date" value={from} {...limits} onChange={(e) => setFrom(e.target.value)} required />
            </label>
          ) : (
            <div className="period-fields">
              <label className="period-field">
                <span>From</span>
                <input ref={firstInput} type="date" value={from} min={limits.min} max={to || last} onChange={(e) => setFrom(e.target.value)} required />
              </label>
              <label className="period-field">
                <span>To</span>
                <input type="date" value={to} min={from || limits.min} max={last} onChange={(e) => setTo(e.target.value)} required />
              </label>
            </div>
          )}

          {first && last && <p className="period-hint">
              {words.held} {rangeLabel(first, last)}.
            </p>}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}

          <div className="period-actions">
            <button type="button" className="btn btn-sm" onClick={() => close(true)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-sm btn-primary">
              Show
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
