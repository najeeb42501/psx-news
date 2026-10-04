"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { L } from "@/components/l";
import { useStockItems } from "@/components/my-stocks";
import { markSeen, setMyStocks, useMyStocks, useSeenAt } from "@/lib/client-store";
import { stripSymbol } from "@/lib/format";

type Company = { symbol: string; name: string; sector: string | null };
type Item = { id: number; symbol: string | null; headline_en: string | null; headline_ur: string | null; category: string; sort_time: string };
type Event = { item_id: number; symbol: string | null; kind: string; event_date: string; end_date: string | null; event_time: string | null };

const KIND: Record<string, string> = { board: "Board meeting", agm: "AGM", eogm: "EOGM", briefing: "Briefing", book_closure: "Book closure" };
const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Karachi" });

export function MyStocksManager() {
  const symbols = useMyStocks();
  const seenAt = useSeenAt();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [events, setEvents] = useState<{ key: string; list: Event[] }>({ key: "", list: [] });
  const [query, setQuery] = useState("");
  const { items } = useStockItems<Item>(symbols, 40);
  // Remember the previous visit for "new" badges, then mark this visit as seen.
  const [previousVisit] = useState(() => seenAt);
  const key = symbols?.join(",") ?? "";

  useEffect(() => {
    fetch("/api/companies").then((r) => r.json()).then(setCompanies).catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetch(`/api/events?symbols=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Event[]) => !cancelled && setEvents({ key, list }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => {
    if (items.length) markSeen();
  }, [items.length]);

  const matches = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (q.length < 2 || !symbols) return [];
    return companies
      .filter((c) => !symbols.includes(c.symbol) && (c.symbol.startsWith(q) || c.name.toUpperCase().includes(q)))
      .slice(0, 8);
  }, [query, companies, symbols]);

  if (symbols === null) return null;
  const nameOf = (s: string) => companies.find((c) => c.symbol === s)?.name ?? "";
  const since = previousVisit ?? seenAt;
  const isNew = (it: Item) => !!since && it.sort_time > since;
  const upcoming = events.key === key ? events.list : [];

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="relative">
          <Icon name="plus" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Add a company: type a symbol or name, e.g. HBL or Engro"
            aria-label="Add a company"
            className="w-full rounded-full border border-border bg-background py-2 ps-9 pe-3"
          />
          {matches.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
              {matches.map((c) => (
                <li key={c.symbol}>
                  <button
                    type="button"
                    onClick={() => {
                      setMyStocks([...symbols, c.symbol]);
                      setQuery("");
                    }}
                    className="flex w-full items-baseline gap-2 px-3 py-2 text-start text-sm hover:bg-brand-soft"
                  >
                    <b className="text-brand">{c.symbol}</b> <span className="truncate text-muted">{c.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {symbols.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {symbols.map((s) => (
              <span key={s} className="flex items-center gap-1 rounded-full bg-brand-soft py-1 ps-3 pe-1 text-sm">
                <Link href={`/company/${encodeURIComponent(s)}`} className="font-semibold" title={nameOf(s)}>
                  {s}
                </Link>
                <button
                  type="button"
                  aria-label={`Remove ${s}`}
                  onClick={() => setMyStocks(symbols.filter((x) => x !== s))}
                  className="rounded-full p-1 hover:bg-card"
                >
                  <Icon name="x" className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">
            <L en="You are not following any companies yet. Add a few above." ur="آپ ابھی کسی کمپنی کو فالو نہیں کر رہے۔ اوپر سے شامل کریں۔" />
          </p>
        )}
      </section>

      {symbols.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="min-w-0 space-y-2">
            <h2 className="font-bold">
              <L en="Latest news for your stocks" ur="آپ کے شیئرز کی تازہ خبریں" />
            </h2>
            {items.length === 0 && <p className="text-sm text-muted">No recent announcements for these companies.</p>}
            <div className="space-y-2">
              {items.map((it) => (
                <Link
                  key={it.id}
                  href={`/item/${it.id}`}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 text-sm hover:border-brand"
                >
                  <span className="w-16 shrink-0 font-bold text-brand">{it.symbol}</span>
                  <span className="min-w-0 flex-1">
                    <span className="en-only">{stripSymbol(it.headline_en, it.symbol)}</span>
                    <span className="ur-only ur ur-tight block">{stripSymbol(it.headline_ur, it.symbol)}</span>
                    <span className="mt-0.5 block text-xs text-muted">{timeFmt.format(new Date(it.sort_time))}</span>
                  </span>
                  {isNew(it) && <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-white">New</span>}
                </Link>
              ))}
            </div>
          </section>
          <section className="space-y-2">
            <h2 className="flex items-center gap-2 font-bold">
              <Icon name="calendar" className="size-4 text-brand" />
              <L en="Coming up for your stocks" ur="آپ کے شیئرز کے ایونٹس" />
            </h2>
            {upcoming.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-3 text-sm text-muted">No upcoming meetings or book closures.</p>
            ) : (
              <ul className="divide-y divide-border rounded-2xl border border-border bg-card px-3 text-sm">
                {upcoming.map((e) => (
                  <li key={`${e.item_id}-${e.kind}`} className="flex items-baseline gap-2 py-2">
                    <b className="text-brand">{e.symbol}</b>
                    <span className="flex-1">{KIND[e.kind] ?? e.kind}</span>
                    <span className="text-muted">
                      {dateFmt.format(new Date(`${e.event_date}T00:00:00Z`))}
                      {e.end_date && e.end_date !== e.event_date && ` – ${dateFmt.format(new Date(`${e.end_date}T00:00:00Z`))}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
