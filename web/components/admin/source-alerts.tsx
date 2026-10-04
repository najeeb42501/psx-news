import Link from "next/link";
import { type SourceAlert } from "@/lib/admin";
import { sourceLabel } from "@/lib/categories";
import { formatDateTime } from "@/lib/format";

/** Red banner on every admin page while a source keeps failing. */
export function SourceAlerts({ alerts }: { alerts: SourceAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <div role="alert" className="space-y-1 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100">
      {alerts.map((a) => (
        <p key={a.source_id} className="break-words">
          <b>{sourceLabel(a.source_id)}</b> has failed in its last {a.failures} runs (since {formatDateTime(a.since)}).{" "}
          <span className="text-xs opacity-80">Last error: {a.lastError}</span>
        </p>
      ))}
      <p className="text-xs">
        Other sources are not affected. Check the source website, then see{" "}
        <Link href="/admin/jobs" className="underline">
          Jobs &amp; health
        </Link>{" "}
        for the full logs.
      </p>
    </div>
  );
}
