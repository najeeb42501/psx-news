"use client";

import { useActionState } from "react";
import { type RunState, startJob } from "@/app/admin/jobs/actions";

const SOURCES = [
  ["", "All sources"],
  ["psx_companies", "PSX company announcements"],
  ["psx_notices", "PSX notices"],
  ["secp_notices", "SECP notices"],
  ["dawn_business", "Dawn"],
  ["brecorder_latest", "Business Recorder"],
  ["tribune_business", "Express Tribune"],
  ["propakistani_business", "ProPakistani"],
];

function Button({ job, label, hint, pending }: { job: string; label: string; hint: string; pending: boolean }) {
  return (
    <button
      name="job"
      value={job}
      disabled={pending}
      className="flex flex-col items-start rounded-xl border border-border bg-background p-3 text-start hover:border-brand disabled:opacity-50"
    >
      <span className="font-semibold">{label}</span>
      <span className="text-xs text-muted">{hint}</span>
    </button>
  );
}

export function RunJobForm({ busy }: { busy: boolean }) {
  const [state, action, pending] = useActionState<RunState, FormData>(startJob, {});
  const disabled = pending || busy;
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <Button job="pipeline" label="▶ Run both" hint="Fetch new items, then summarise them" pending={disabled} />
        <Button job="ingest" label="Fetch new announcements" hint="PSX, SECP and news feeds since the last run" pending={disabled} />
        <Button job="process" label="Summarise new items" hint="English + Urdu summaries for anything not done yet" pending={disabled} />
      </div>
      <details className="rounded-xl border border-border p-3 text-sm">
        <summary className="cursor-pointer font-medium">Options (a specific day, one source, AI budget)</summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs text-muted">Fetch this day only (Pakistan time)</span>
            <input type="date" name="date" className="w-full rounded-md border border-border bg-background px-2 py-1.5" />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted">Source</span>
            <select name="source" className="w-full rounded-md border border-border bg-background px-2 py-1.5">
              {SOURCES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted">Max items needing AI (free-tier budget)</span>
            <input type="number" name="max_ai" defaultValue={25} min={1} max={200} className="w-full rounded-md border border-border bg-background px-2 py-1.5" />
          </label>
        </div>
        <p className="mt-2 text-xs text-muted">Options apply to whichever button you press.</p>
      </details>
      {busy && <p className="text-sm text-amber-700 dark:text-amber-400">A job is running. Buttons unlock when it finishes.</p>}
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-green-700">{state.ok}</p>}
    </form>
  );
}
