// Admin-only database access, with the server-side secret key (bypasses row-level security).
// Never import this from a Client Component.
import "server-only";
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE, readSession } from "@/lib/session";

/** The signed-in admin's email, or null. The signed cookie must be valid and unexpired, and the
 *  email must still be in admin_users (removing a row there signs that person out). */
export async function adminEmail(): Promise<string | null> {
  const email = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  return email && (await isAdminEmail(email)) ? email : null;
}

export async function isAdmin(): Promise<boolean> {
  return (await adminEmail()) !== null;
}

export async function requireAdmin() {
  if (!(await isAdmin())) throw new Error("Not signed in as admin");
}

export async function isAdminEmail(email: string): Promise<boolean> {
  const rows = await call<{ email: string }[]>(`admin_users?select=email&email=eq.${encodeURIComponent(email.trim().toLowerCase())}`);
  return rows.length > 0;
}

// --- sign-in throttle ---------------------------------------------------------------
export const MAX_FAILURES = 5;
export const FAILURE_WINDOW_MIN = 15;

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
}

/** True if this address had MAX_FAILURES failed sign-ins in the last FAILURE_WINDOW_MIN minutes. */
export async function tooManyFailures(ip: string): Promise<boolean> {
  const since = new Date(Date.now() - FAILURE_WINDOW_MIN * 60_000).toISOString();
  const rows = await call<{ id: number }[]>(
    `admin_login_attempts?select=id&ip=eq.${encodeURIComponent(ip)}&ok=eq.false&at=gte.${encodeURIComponent(since)}&limit=${MAX_FAILURES}`,
  );
  return rows.length >= MAX_FAILURES;
}

export async function recordAttempt(ip: string, ok: boolean) {
  await call("admin_login_attempts", { method: "POST", body: JSON.stringify({ ip, ok }) });
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

/** Approve several items waiting for review at once (only ones still in the queue). */
export async function approveMany(ids: number[]) {
  if (!ids.length) return;
  await call(`items?id=in.(${ids.join(",")})&review_status=eq.needs_review`, {
    method: "PATCH",
    body: JSON.stringify({ review_status: "approved" }),
  });
}

/** What an edit's numbers are checked against: the filing text, its title, the company and the facts. */
export async function itemSources(id: number): Promise<{ texts: string[]; before: { en: string; ur: string } }> {
  const [item] = await call<(AdminItem & { documents: { text: string | null } })[]>(
    `items?select=facts,symbol,documents(title,text),summaries(lang,headline,body,created_at)&id=eq.${id}`,
  );
  if (!item) throw new Error(`item ${id} not found`);
  const latest = (lang: string) =>
    item.summaries.filter((s) => s.lang === lang).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const text = (s?: AdminSummary) => (s ? `${s.headline}\n${s.body}` : "");
  return {
    texts: [item.documents.title, item.documents.text ?? "", JSON.stringify(item.facts)],
    before: { en: text(latest("en")), ur: text(latest("ur")) },
  };
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
  listed: { date_from: string; date_to: string; listed: number; read?: number } | null;
  seconds?: number;
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
    process?: {
      processed: number; needs_review: number; failed: number; deferred: number; duplicates?: number;
      seconds?: Record<string, number>; by_category: Record<string, number>; notes: string[];
    };
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
  sources: { id: string; kind: string; enabled: boolean; last_run_at: string | null; last_success_at: string | null; last_error: string | null }[];
  delays: { source_id: string; n: number; stored_median: number; stored_p90: number; summarised_median: number; summarised_p90: number }[];
  docs_by_day: { source_id: string; day: string; n: number }[];
  llm_today: { provider: string; model: string; ok: number; failed: number; prompt_tokens: number; completion_tokens: number }[];
};

export async function health(): Promise<Health> {
  return call<Health>("rpc/admin_health", { method: "POST", body: "{}" });
}
