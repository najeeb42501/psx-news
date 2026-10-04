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
