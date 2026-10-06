// All database reads for the public website (Part 2.3). They go through the read-only
// web_* views with the publishable key, so row-level security limits them to published items.
// Swapping the database only means changing this file.
import "server-only";
import { groupCategories } from "@/lib/categories";
import { pktDay } from "@/lib/format";

export type WebItem = {
  id: number;
  symbol: string | null;
  company_name: string | null;
  sector: string | null;
  category: string;
  importance: number;
  facts: Record<string, unknown>;
  created_at: string;
  source_url: string;
  source_title: string;
  source_id: string;
  published_at: string | null;
  headline_en: string | null;
  body_en: string | null;
  headline_ur: string | null;
  body_ur: string | null;
  sort_time: string;
};

export type WebEvent = {
  item_id: number;
  symbol: string | null;
  company_name: string | null;
  sector: string | null;
  kind: "board" | "agm" | "eogm" | "briefing" | "book_closure";
  event_date: string;
  end_date: string | null;
  event_time: string | null;
  headline_en: string | null;
  headline_ur: string | null;
};

export type Company = { symbol: string; name: string; sector: string | null };

const BASE = `${process.env.SUPABASE_URL}/rest/v1`;
const REVALIDATE = 60; // seconds: new items appear within a minute of being processed

async function get<T>(path: string, revalidate = REVALIDATE): Promise<T> {
  if (!process.env.SUPABASE_URL) {
    // e.g. the CI build, which has no database: render empty pages instead of failing.
    console.warn(`SUPABASE_URL is not set; returning no data for ${path.split("?")[0]}`);
    return [] as T;
  }
  const res = await fetch(`${BASE}/${path}`, {
    headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY ?? "" },
    next: { revalidate, tags: ["items"] },
  });
  if (!res.ok) throw new Error(`Data request failed (${res.status}): ${await res.text()}`);
  return res.json() as Promise<T>;
}

const enc = encodeURIComponent;
const inList = (values: string[]) => `in.(${values.map((v) => `"${v.replace(/"/g, "")}"`).join(",")})`;

/** Start of a Pakistan-time day as an ISO instant. */
const dayStart = (ymd: string) => `${ymd}T00:00:00+05:00`;
const nextDay = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

export type FeedFilters = {
  symbol?: string;
  sector?: string;
  type?: string;
  date?: string;
  page?: number;
  importantOnly?: boolean; // hide routine filings (importance 1)
  source?: "filings" | "news"; // PSX/SECP announcements only, or business news only
  sectors?: string[]; // any of these PSX sector names
  from?: string; // YYYY-MM-DD, Pakistan time
  to?: string;
  limit?: number;
};
export const PAGE_SIZE = 30;
const FILING_SOURCES = ["psx_companies", "psx_notices", "secp_notices"];

export async function getFeed(f: FeedFilters = {}): Promise<WebItem[]> {
  const size = f.limit ?? PAGE_SIZE;
  const q = ["select=*", `importance=gte.${f.importantOnly ? 2 : 1}`, "order=sort_time.desc,id.desc", `limit=${size}`];
  if (f.page && f.page > 1) q.push(`offset=${(f.page - 1) * size}`);
  if (f.source) q.push(`source_id=${f.source === "filings" ? "in" : "not.in"}.(${FILING_SOURCES.join(",")})`);
  if (f.sectors?.length) q.push(`sector=${enc(inList(f.sectors))}`);
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) q.push(`sort_time=gte.${enc(dayStart(f.from))}`);
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) q.push(`sort_time=lt.${enc(dayStart(nextDay(f.to)))}`);
  if (f.symbol) q.push(`symbol=eq.${enc(f.symbol.toUpperCase())}`);
  if (f.sector) q.push(`sector=eq.${enc(f.sector)}`);
  const cats = groupCategories(f.type);
  if (cats) q.push(`category=${enc(inList(cats))}`);
  if (f.date && /^\d{4}-\d{2}-\d{2}$/.test(f.date)) {
    q.push(`sort_time=gte.${enc(dayStart(f.date))}`, `sort_time=lt.${enc(dayStart(nextDay(f.date)))}`);
  }
  return get<WebItem[]>(`web_items?${q.join("&")}`);
}

export async function getItem(id: number): Promise<WebItem | null> {
  const rows = await get<WebItem[]>(`web_items?select=*&id=eq.${id}`);
  return rows[0] ?? null;
}

export async function getItemsBySymbols(symbols: string[], limit = 40): Promise<WebItem[]> {
  const clean = symbols.map((s) => s.toUpperCase().replace(/[^A-Z0-9-]/g, "")).filter(Boolean).slice(0, 50);
  if (!clean.length) return [];
  return get<WebItem[]>(
    `web_items?select=*&importance=gte.1&symbol=${enc(inList(clean))}&order=sort_time.desc,id.desc&limit=${limit}`,
  );
}

export async function getCompany(symbol: string): Promise<Company | null> {
  const rows = await get<Company[]>(`web_companies?select=symbol,name,sector&symbol=eq.${enc(symbol.toUpperCase())}`, 3600);
  return rows[0] ?? null;
}

/** Everything about one company, including items kept out of the main feed (e.g. fund distributions). */
export async function getCompanyItems(symbol: string, limit = 60): Promise<WebItem[]> {
  return get<WebItem[]>(
    `web_items?select=*&symbol=eq.${enc(symbol.toUpperCase())}&order=sort_time.desc,id.desc&limit=${limit}`,
  );
}

export async function getCompanies(): Promise<Company[]> {
  return get<Company[]>("web_companies?select=symbol,name,sector&order=symbol", 86400);
}

export async function getSectors(): Promise<string[]> {
  const companies = await getCompanies();
  return [...new Set(companies.map((c) => c.sector).filter((s): s is string => !!s))].sort();
}

/** "Today's 10 things": the most important items of the latest day that has any (weekends show Friday). */
export async function getToday(): Promise<{ day: string | null; items: WebItem[] }> {
  const latest = await get<{ sort_time: string }[]>("web_items?select=sort_time&importance=gte.1&order=sort_time.desc&limit=1");
  if (!latest.length) return { day: null, items: [] };
  const day = pktDay(latest[0].sort_time);
  const items = await get<WebItem[]>(
    `web_items?select=*&importance=gte.1&sort_time=gte.${enc(dayStart(day))}&sort_time=lt.${enc(dayStart(nextDay(day)))}` +
      "&order=importance.desc,sort_time.desc&limit=10",
  );
  return { day, items };
}

export async function getUpcoming(symbol?: string, days = 45, kinds?: string[], symbols?: string[]): Promise<WebEvent[]> {
  const today = pktDay();
  const until = new Date(`${today}T12:00:00Z`);
  until.setUTCDate(until.getUTCDate() + days);
  const q = [
    "select=*",
    `or=${enc(`(event_date.gte.${today},end_date.gte.${today})`)}`,
    `event_date=lte.${until.toISOString().slice(0, 10)}`,
    "order=event_date.asc,symbol.asc",
    "limit=200",
  ];
  if (symbol) q.push(`symbol=eq.${enc(symbol.toUpperCase())}`);
  if (symbols?.length) q.push(`symbol=${enc(inList(symbols.map((s) => s.toUpperCase())))}`);
  if (kinds?.length) q.push(`kind=${enc(inList(kinds))}`);
  const rows = await get<WebEvent[]>(`web_events?${q.join("&")}`);
  // The same meeting is often announced more than once (notice, then results): show it once.
  const seen = new Set<string>();
  return rows.filter((e) => {
    const key = `${e.symbol}|${e.kind}|${e.event_date}|${e.end_date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function search(q: string, symbol?: string): Promise<WebItem[]> {
  const term = q.trim().slice(0, 100);
  if (!term) return [];
  const params = [`q=${enc(term)}`, "lim=40"];
  if (symbol) params.push(`sym=${enc(symbol)}`);
  return get<WebItem[]>(`rpc/web_search?${params.join("&")}`, 300);
}

/** Results, dividends and policy news of the latest day that has any. */
export async function getHighlights(limit = 12): Promise<WebItem[]> {
  const latest = await get<{ sort_time: string }[]>("web_items?select=sort_time&importance=gte.3&order=sort_time.desc&limit=1");
  if (!latest.length) return [];
  const day = pktDay(latest[0].sort_time);
  return get<WebItem[]>(
    `web_items?select=*&importance=gte.3&sort_time=gte.${enc(dayStart(day))}&sort_time=lt.${enc(dayStart(nextDay(day)))}` +
      `&order=sort_time.desc&limit=${limit}`,
  );
}

/** Latest financial results with their verified facts (results tracker). */
export async function getResults(limit = 300): Promise<WebItem[]> {
  return get<WebItem[]>(`web_items?select=*&category=eq.results&order=sort_time.desc&limit=${limit}`, 300);
}

/** Other recent items of the same company. */
export async function getRelated(symbol: string, excludeId: number, limit = 6): Promise<WebItem[]> {
  return get<WebItem[]>(
    `web_items?select=*&symbol=eq.${enc(symbol.toUpperCase())}&id=neq.${excludeId}&importance=gte.1&order=sort_time.desc&limit=${limit}`,
  );
}

/** A light list of recent items (for counts on Home: sectors, dividends, results). */
export type LiteItem = Pick<WebItem, "id" | "symbol" | "sector" | "category" | "source_id" | "sort_time" | "headline_en" | "body_en" | "source_title" | "facts">;
export async function getRecentLite(days = 7): Promise<LiteItem[]> {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  return get<LiteItem[]>(
    `web_items?select=id,symbol,sector,category,source_id,sort_time,headline_en,body_en,source_title,facts&importance=gte.1` +
      `&sort_time=gte.${enc(since)}&order=sort_time.desc&limit=600`,
  );
}
