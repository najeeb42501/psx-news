"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMyStocks } from "@/lib/client-store";

type FeedItem = { id: number; symbol: string | null; headline_en: string | null; headline_ur: string | null };

/** Latest items for a list of symbols, fetched from /api/items. */
export function useStockItems<T = FeedItem>(symbols: string[] | null, limit: number): { key: string; items: T[] } {
  const key = symbols?.join(",") ?? "";
  const [result, setResult] = useState<{ key: string; items: T[] }>({ key: "", items: [] });
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetch(`/api/items?symbols=${encodeURIComponent(key)}&limit=${limit}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((items: T[]) => !cancelled && setResult({ key, items }))
      .catch(() => !cancelled && setResult({ key, items: [] }));
    return () => {
      cancelled = true;
    };
  }, [key, limit]);
  return result.key === key ? result : { key, items: [] };
}

/** On the home feed: latest items for the user's stocks, shown first. */
export function MyStocksFeed() {
  const symbols = useMyStocks();
  const { items } = useStockItems(symbols, 5);

  if (symbols === null) return null;
  if (!symbols.length) {
    return (
      <p className="rounded-xl border border-dashed border-border p-3 text-sm text-muted">
        Follow the companies you care about:{" "}
        <Link href="/my-stocks" className="text-brand underline">
          add your stocks
        </Link>{" "}
        and their news shows here first.
      </p>
    );
  }
  return (
    <section className="rounded-xl border border-brand/40 bg-brand-soft/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-bold">
          <span className="ui-en">My stocks</span>
          <span className="ui-ur ur ur-tight"> میرے شیئرز</span>
        </h2>
        <Link href="/my-stocks" className="text-sm text-brand underline">
          Edit / see all
        </Link>
      </div>
      {items.length ? (
        <ul className="space-y-2 text-sm">
          {items.map((it) => (
            <li key={it.id}>
              <Link href={`/item/${it.id}`} className="hover:underline">
                <span className="font-semibold text-brand">{it.symbol}</span>{" "}
                <span className="en-only">{it.headline_en}</span>
                <span className="ur-only ur ur-tight block">{it.headline_ur}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No recent news for {symbols.join(", ")}.</p>
      )}
    </section>
  );
}
