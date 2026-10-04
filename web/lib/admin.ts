// Admin-only database access, with the server-side secret key (bypasses row-level security).
// Never import this from a Client Component.
import "server-only";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "sk_admin";

/** The cookie holds a hash of ADMIN_TOKEN, never the token itself. */
export async function adminCookieValue(): Promise<string> {
  const data = new TextEncoder().encode(`sharekhabar-admin:${process.env.ADMIN_TOKEN ?? ""}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(hash).toString("hex");
}

export async function isAdmin(): Promise<boolean> {
  if (!process.env.ADMIN_TOKEN) return false;
  const value = (await cookies()).get(ADMIN_COOKIE)?.value;
  return !!value && value === (await adminCookieValue());
}

export async function requireAdmin() {
  if (!(await isAdmin())) throw new Error("Not signed in as admin");
}

const BASE = `${process.env.SUPABASE_URL}/rest/v1`;

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: process.env.SUPABASE_SECRET_KEY ?? "",
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Admin request failed (${res.status}): ${await res.text()}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export type AdminSummary = { lang: string; headline: string; body: string; model: string; prompt_version: string; created_at: string };
export type AdminItem = {
  id: number;
  symbol: string | null;
  category: string;
  importance: number;
  review_status: string;
  facts: Record<string, unknown> & { review_notes?: string[] };
  created_at: string;
  documents: { title: string; url: string; published_at: string | null; source_id: string };
  summaries: AdminSummary[];
};

const ITEM_SELECT =
  "id,symbol,category,importance,review_status,facts,created_at," +
  "documents(title,url,published_at,source_id),summaries(lang,headline,body,model,prompt_version,created_at)";

export function latestSummary(item: AdminItem, lang: "en" | "ur"): AdminSummary | undefined {
  return item.summaries.filter((s) => s.lang === lang).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

export async function reviewQueue(): Promise<AdminItem[]> {
  return call<AdminItem[]>(`items?select=${ITEM_SELECT}&review_status=eq.needs_review&order=created_at.desc&limit=100`);
}

/** Latest published items: important ones by default, or everything for one symbol. */
export async function recentPublished(symbol?: string, limit = 30): Promise<AdminItem[]> {
  const filter = symbol
    ? `symbol=eq.${encodeURIComponent(symbol.toUpperCase())}`
    : "importance=gte.2";
  return call<AdminItem[]>(
    `items?select=${ITEM_SELECT}&review_status=in.(auto,approved)&${filter}&order=created_at.desc&limit=${limit}`,
  );
}

export async function hiddenItems(limit = 30): Promise<AdminItem[]> {
  return call<AdminItem[]>(`items?select=${ITEM_SELECT}&review_status=eq.hidden&order=created_at.desc&limit=${limit}`);
}

export async function setReviewStatus(id: number, status: "approved" | "hidden" | "auto") {
  await call(`items?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ review_status: status }) });
}

/** Save an admin's corrected summary as the newest version for that language. */
export async function saveManualSummary(itemId: number, lang: "en" | "ur", headline: string, body: string) {
  await call("summaries?on_conflict=item_id,lang,prompt_version", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      item_id: itemId, lang, headline, body, model: "admin", prompt_version: "manual", created_at: new Date().toISOString(),
    }),
  });
}

export type QueuedPost = {
  id: number;
  kind: string;
  item_id: number | null;
  platform: string;
  text_en: string;
  text_ur: string;
  image_url: string | null;
  link_url: string | null;
  status: string;
  scheduled_for: string | null;
  posted_at: string | null;
};

export async function whatsappQueue(): Promise<QueuedPost[]> {
  return call<QueuedPost[]>(
    "posts?select=*&platform=eq.whatsapp_queue&status=in.(queued,ready)&order=scheduled_for.asc.nullsfirst,id.asc&limit=50",
  );
}

export async function recentlyPosted(limit = 10): Promise<QueuedPost[]> {
  return call<QueuedPost[]>(`posts?select=*&platform=eq.whatsapp_queue&status=eq.posted&order=posted_at.desc&limit=${limit}`);
}

export async function markPosted(id: number) {
  await call(`posts?id=eq.${id}&platform=eq.whatsapp_queue`, {
    method: "PATCH",
    body: JSON.stringify({ status: "posted", posted_at: new Date().toISOString() }),
  });
}

// --- Jobs & health ----------------------------------------------------------------

export type IngestSummary = {
  source_id: string;
  fetched: number;
  new: number;
  already_known: number;
  failed: number;
  errors: string[];
  listed: { date_from: string; date_to: string; listed: number } | null;
};

export type JobRun = {
  id: number;
  job: string;
  params: Record<string, unknown>;
  triggered_by: string;
  status: "running" | "success" | "failed";
  started_at: string;
  finished_at: string | null;
  summary: {
    ingest?: IngestSummary[];
    process?: { processed: number; needs_review: number; failed: number; deferred: number; by_category: Record<string, number>; notes: string[] };
  };
  log: string | null;
};

export async function jobRuns(limit = 20): Promise<JobRun[]> {
  return call<JobRun[]>(`job_runs?select=*&order=started_at.desc&limit=${limit}`);
}

/** A source could not be read at all (same rule as IngestResult.source_error in Python). */
function sourceFailed(s: IngestSummary): boolean {
  return s.fetched === 0 && s.errors.length > 0;
}

export const ALERT_AFTER_FAILURES = 3;

export type SourceAlert = { source_id: string; failures: number; since: string; lastError: string };

/** Sources that failed in each of their last ALERT_AFTER_FAILURES runs. runs: newest first. */
export function sourceAlerts(runs: JobRun[]): SourceAlert[] {
  const streaks = new Map<string, SourceAlert>();
  const ended = new Set<string>(); // sources whose failure streak was broken by a success
  for (const r of runs) {
    for (const s of r.summary.ingest ?? []) {
      if (ended.has(s.source_id)) continue;
      if (!sourceFailed(s)) {
        ended.add(s.source_id);
        continue;
      }
      const cur = streaks.get(s.source_id) ?? { source_id: s.source_id, failures: 0, since: r.started_at, lastError: s.errors[0] };
      cur.failures += 1;
      cur.since = r.started_at;
      streaks.set(s.source_id, cur);
    }
  }
  return [...streaks.values()].filter((a) => a.failures >= ALERT_AFTER_FAILURES);
}

export type Health = {
  documents: Record<string, number>;
  items: Record<string, number>;
  sources: { id: string; kind: string; enabled: boolean; last_run_at: string | null; last_error: string | null }[];
  docs_by_day: { source_id: string; day: string; n: number }[];
  llm_today: { provider: string; model: string; ok: number; failed: number; prompt_tokens: number; completion_tokens: number }[];
};

export async function health(): Promise<Health> {
  return call<Health>("rpc/admin_health", { method: "POST", body: "{}" });
}
