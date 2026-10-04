import Link from "next/link";
import { AutoRefresh } from "@/components/admin/auto-refresh";
import { RunJobForm } from "@/components/admin/run-job-form";
import { type Health, type JobRun, health, jobRuns, requireAdmin } from "@/lib/admin";
import { sourceLabel } from "@/lib/categories";
import { formatDateTime } from "@/lib/format";

function duration(r: JobRun): string {
  const end = r.finished_at ? new Date(r.finished_at).getTime() : Date.parse(new Date().toISOString());
  const s = Math.max(0, Math.round((end - new Date(r.started_at).getTime()) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function minutes(m: number): string {
  if (m < 60) return `${m} min`;
  if (m < 48 * 60) return `${Math.round(m / 6) / 10} h`;
  return `${Math.round(m / 144) / 10} days`;
}

const STATUS = {
  running: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  success: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  failed: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
};

/** Latest PSX portal total per source vs documents we stored for the same days. */
function captureChecks(runs: JobRun[], h: Health) {
  const latest = new Map<string, { date_from: string; date_to: string; listed: number; runId: number }>();
  for (const r of runs) {
    for (const s of r.summary.ingest ?? []) {
      if (s.listed && !latest.has(s.source_id)) latest.set(s.source_id, { ...s.listed, runId: r.id });
    }
  }
  return [...latest.entries()].map(([source, l]) => {
    const stored = h.docs_by_day
      .filter((d) => d.source_id === source && d.day >= l.date_from && d.day <= l.date_to)
      .reduce((sum, d) => sum + d.n, 0);
    const pct = l.listed ? Math.round((stored / l.listed) * 1000) / 10 : 100;
    return { source, ...l, stored, pct };
  });
}

export default async function JobsPage() {
  await requireAdmin();
  const [runs, h] = await Promise.all([jobRuns(25), health()]);
  const running = runs.some((r) => r.status === "running");
  const checks = captureChecks(runs, h);

  return (
    <div className="space-y-6">
      <AutoRefresh active={running} />

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h1 className="text-lg font-bold">Run the pipeline</h1>
        <p className="text-sm text-muted">
          Nothing runs on a schedule yet: jobs only run when you press a button here. Each run makes a few polite requests
          per source and uses the free AI quota for new important items.
        </p>
        <RunJobForm busy={running} />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-bold">Capture check (PSX portal vs stored)</h2>
          {checks.length === 0 ? (
            <p className="text-sm text-muted">Run “Fetch new announcements” to measure this.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="text-start font-normal">Source</th>
                  <th className="text-start font-normal">Days</th>
                  <th className="text-end font-normal">Portal</th>
                  <th className="text-end font-normal">Stored</th>
                  <th className="text-end font-normal">Captured</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c) => (
                  <tr key={c.source} className="border-t border-border">
                    <td className="py-1">{sourceLabel(c.source)}</td>
                    <td className="py-1 text-muted">{c.date_from === c.date_to ? c.date_from : `${c.date_from} – ${c.date_to}`}</td>
                    <td className="py-1 text-end tabular-nums">{c.listed}</td>
                    <td className="py-1 text-end tabular-nums">{c.stored}</td>
                    <td className={`py-1 text-end font-semibold tabular-nums ${c.pct >= 98 ? "text-emerald-600" : "text-rose-600"}`}>
                      {c.pct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-xs text-muted">Target: at least 98%. Items whose download failed are retried on the next run.</p>
        </div>

        <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-bold">Work waiting</h2>
          <ul className="space-y-1 text-sm">
            <li>
              Documents not yet summarised: <b>{h.documents.new ?? 0}</b>
            </li>
            <li>
              Documents that failed processing: <b className={(h.documents.failed ?? 0) > 0 ? "text-rose-600" : ""}>{h.documents.failed ?? 0}</b>
            </li>
            <li>
              Items waiting for review: <b>{h.items.needs_review ?? 0}</b>{" "}
              {(h.items.needs_review ?? 0) > 0 && (
                <Link href="/admin" className="text-brand underline">
                  review now
                </Link>
              )}
            </li>
            <li>
              Published items: <b>{(h.items.auto ?? 0) + (h.items.approved ?? 0)}</b> · hidden: {h.items.hidden ?? 0}
            </li>
          </ul>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-bold">Sources</h2>
          <table className="w-full text-sm">
            <tbody>
              {h.sources.map((s) => (
                <tr key={s.id} className="border-t border-border first:border-0 align-top">
                  <td className="py-1.5">{sourceLabel(s.id)}</td>
                  <td className="py-1.5 text-end text-xs text-muted">
                    {s.last_run_at ? formatDateTime(s.last_run_at) : "never"}
                    {s.last_success_at && s.last_success_at !== s.last_run_at && (
                      <span className="block">complete up to {formatDateTime(s.last_success_at)}</span>
                    )}
                  </td>
                  <td className="py-1.5 ps-2 text-end">
                    {s.last_error ? (
                      <span title={s.last_error} className="text-xs text-rose-600">error</span>
                    ) : (
                      <span className="text-xs text-emerald-600">ok</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {h.sources.filter((s) => s.last_error).map((s) => (
            <p key={s.id} className="break-words rounded-md bg-rose-50 p-2 text-xs text-rose-800 dark:bg-rose-950 dark:text-rose-200">
              <b>{sourceLabel(s.id)}:</b> {s.last_error}
            </p>
          ))}
        </div>

        <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-bold">AI use today (free quotas reset at 5:00 am PKT)</h2>
          {h.llm_today.length === 0 ? (
            <p className="text-sm text-muted">No AI calls yet today.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="text-start font-normal">Model</th>
                  <th className="text-end font-normal">OK</th>
                  <th className="text-end font-normal">Failed</th>
                  <th className="text-end font-normal">Tokens</th>
                </tr>
              </thead>
              <tbody>
                {h.llm_today.map((m) => (
                  <tr key={m.model} className="border-t border-border">
                    <td className="py-1">{m.model}</td>
                    <td className="py-1 text-end tabular-nums">{m.ok}</td>
                    <td className={`py-1 text-end tabular-nums ${m.failed ? "text-amber-600" : ""}`}>{m.failed}</td>
                    <td className="py-1 text-end tabular-nums">{(m.prompt_tokens + m.completion_tokens).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-xs text-muted">Failed calls are usually “busy” or “daily quota reached”; the pipeline then tries the next model.</p>
        </div>
      </section>

      <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-bold">Delays, last 7 days</h2>
        {h.delays.length === 0 ? (
          <p className="text-sm text-muted">No items from the last 7 days yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="text-start font-normal">Source</th>
                <th className="text-end font-normal">Items</th>
                <th className="text-end font-normal">Published → stored (median / slowest 10%)</th>
                <th className="text-end font-normal">Stored → on site</th>
              </tr>
            </thead>
            <tbody>
              {h.delays.map((d) => (
                <tr key={d.source_id} className="border-t border-border">
                  <td className="py-1">{sourceLabel(d.source_id)}</td>
                  <td className="py-1 text-end tabular-nums">{d.n}</td>
                  <td className={`py-1 text-end tabular-nums ${d.stored_median > 15 ? "text-amber-700 dark:text-amber-400" : "text-emerald-600"}`}>
                    {minutes(d.stored_median)} / {minutes(d.stored_p90)}
                  </td>
                  <td className="py-1 text-end tabular-nums">
                    {minutes(d.summarised_median)} / {minutes(d.summarised_p90)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-xs text-muted">
          Target in market hours: published → on site within 15 minutes. While runs are started by hand, the first column
          mostly shows how long until someone pressed Run.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-bold">Recent runs</h2>
        {runs.length === 0 && <p className="text-sm text-muted">No runs yet.</p>}
        {runs.map((r) => {
          const ing = r.summary.ingest ?? [];
          const fetchedNew = ing.reduce((s, x) => s + x.new, 0);
          const failed = ing.reduce((s, x) => s + x.failed, 0);
          const p = r.summary.process;
          return (
            <details key={r.id} className="rounded-xl border border-border bg-card p-3 text-sm" open={r.status === "running"}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[r.status]}`}>{r.status}</span>
                <b>#{r.id}</b>
                <span>{r.job === "pipeline" ? "fetch + summarise" : r.job === "ingest" ? "fetch" : "summarise"}</span>
                {Object.keys(r.params).length > 0 && <span className="text-xs text-muted">{JSON.stringify(r.params)}</span>}
                <span className="text-xs text-muted">
                  {formatDateTime(r.started_at)} · {duration(r)} · {r.triggered_by}
                </span>
                <span className="ms-auto text-xs">
                  {[
                    ing.length > 0 ? `new docs ${fetchedNew}${failed ? `, failed ${failed}` : ""}` : "",
                    p
                      ? `summarised ${p.processed}, review ${p.needs_review}, waiting ${p.deferred}` +
                        (p.duplicates ? `, duplicates ${p.duplicates}` : "") +
                        (p.seconds ? ` (AI ${Math.round(p.seconds.ai ?? 0)}s)` : "")
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </summary>
              {ing.length > 0 && (
                <table className="mt-2 w-full text-xs">
                  <thead className="text-muted">
                    <tr>
                      <th className="text-start font-normal">Source</th>
                      <th className="text-end font-normal">Found</th>
                      <th className="text-end font-normal">New</th>
                      <th className="text-end font-normal">Already had</th>
                      <th className="text-end font-normal">Failed</th>
                      <th className="text-end font-normal">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ing.map((s) => (
                      <tr key={s.source_id} className="border-t border-border">
                        <td className="py-0.5">{sourceLabel(s.source_id)}</td>
                        <td className="py-0.5 text-end">{s.fetched}</td>
                        <td className="py-0.5 text-end">{s.new}</td>
                        <td className="py-0.5 text-end">{s.already_known}</td>
                        <td className={`py-0.5 text-end ${s.failed ? "text-rose-600" : ""}`}>{s.failed}</td>
                        <td className="py-0.5 text-end text-muted">{s.seconds != null ? `${Math.round(s.seconds)}s` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {r.log && (
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-background p-2 font-mono text-xs">{r.log}</pre>
              )}
            </details>
          );
        })}
      </section>
    </div>
  );
}
