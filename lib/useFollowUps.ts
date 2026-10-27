'use client';

import { useMemo, useRef, useState } from 'react';
import { ApiError, sendJson } from './api';
import { applyFollowUp, followUpBody, outcomeKey, type FollowUpOp } from './performance';
import type { ContactOutcome, PerformanceResponse, PerformanceRow } from './types';

export type SaveState = { state: 'saving' | 'saved' | 'error'; message?: string };

type Waiting = { id: number; op: FollowUpOp };
type Entry = { confirmed: ContactOutcome[]; waiting: Waiting[] }; // the server's last answer, and the changes still on their way

// The follow-ups of GET /performance's numbers and emails, with the changes made on this page since it loaded:
// shown at once, before the server answers. A number's saves go one after another, in the order they were made,
// and what it shows is the server's last answer with the changes still on their way on top (one refused is just
// left out). Loading the report again starts from what the server has. Used by the Performance report and the
// Assign numbers page.
export function useFollowUps(data: PerformanceResponse | null) {
  const [changes, setChanges] = useState<{ base: PerformanceResponse | null; map: Record<string, Entry> }>({ base: null, map: {} });
  const [saves, setSaves] = useState<Record<string, SaveState | undefined>>({});
  const [added, setAdded] = useState<string[]>([]); // students named here, for the suggestions
  const queue = useRef<Record<string, Promise<void>>>({});
  const lastId = useRef(0);
  const inFlight = useRef<Record<string, number>>({});
  const failed = useRef<Record<string, string>>({}); // a save of this burst refused: its message stays

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    const map = changes.base === data ? changes.map : null;
    if (!map) return all;
    return all.map((row) => {
      const entry = map[outcomeKey(row)];
      return entry ? { ...row, outcomes: entry.waiting.reduce((list, w) => applyFollowUp(list, w.op), entry.confirmed) } : row;
    });
  }, [data, changes]);

  // Every student named so far, each once (in any case), A–Z.
  const students = useMemo(() => {
    const names = new Map<string, string>();
    for (const name of [...(data?.students ?? []), ...added]) if (!names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
    return [...names.values()].sort((a, b) => a.localeCompare(b));
  }, [data, added]);

  const save = (row: PerformanceRow, op: FollowUpOp) => {
    if (!data) return;
    const base = data;
    const key = outcomeKey(row);
    const id = ++lastId.current;
    const original = base.rows.find((r) => outcomeKey(r) === key)?.outcomes ?? [];
    setChanges((c) => {
      const map = c.base === base ? c.map : {};
      const entry = map[key] ?? { confirmed: original, waiting: [] };
      return { base, map: { ...map, [key]: { ...entry, waiting: [...entry.waiting, { id, op }] } } };
    });
    // The change is done with: the server's answer (null: refused) replaces what it had.
    const settle = (confirmed: ContactOutcome[] | null) =>
      setChanges((c) => {
        const entry = c.base === base ? c.map[key] : undefined;
        if (!entry) return c; // loaded again since: the report shows what the server has
        return { base, map: { ...c.map, [key]: { confirmed: confirmed ?? entry.confirmed, waiting: entry.waiting.filter((w) => w.id !== id) } } };
      });

    if (!inFlight.current[key]) delete failed.current[key];
    inFlight.current[key] = (inFlight.current[key] ?? 0) + 1;
    setSaves((s) => ({ ...s, [key]: { state: 'saving' } }));
    const finish = () => {
      inFlight.current[key] -= 1;
      if (inFlight.current[key]) return;
      if (failed.current[key]) {
        setSaves((s) => ({ ...s, [key]: { state: 'error', message: failed.current[key] } }));
        return;
      }
      setSaves((s) => ({ ...s, [key]: { state: 'saved' } }));
      setTimeout(() => setSaves((s) => (s[key]?.state === 'saved' ? { ...s, [key]: undefined } : s)), 2500);
    };
    const send = async () => {
      try {
        const answer = await sendJson<{ outcomes: ContactOutcome[] }>('outcomes', 'PUT', { job: row.job.id, field: row.field, value: row.value, ...followUpBody(op) });
        settle(answer.outcomes ?? null);
        const named = 'add' in op ? op.add : 'remove' in op ? '' : op.student;
        if (named) setAdded((names) => (names.includes(named) ? names : [...names, named]));
      } catch (err) {
        settle(null);
        failed.current[key] = `Not saved: ${err instanceof ApiError || err instanceof Error ? err.message : 'try again'}`;
      } finally {
        finish();
      }
    };
    queue.current[key] = (queue.current[key] ?? Promise.resolve()).then(send);
  };

  return { rows, students, saves, save };
}
