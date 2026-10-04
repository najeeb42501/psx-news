"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStockItems } from "@/components/my-stocks";
import { setMyStocks, useMyStocks } from "@/lib/client-store";

type Company = { symbol: string; name: string; sector: string | null };
type Item = { id: number; symbol: string | null; headline_en: string | null; headline_ur: string | null };

export function MyStocksManager() {
  const symbols = useMyStocks();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [query, setQuery] = useState("");
  const { items } = useStockItems<Item>(symbols, 30);

  useEffect(() => {
    fetch("/api/companies")
      .then((r) => r.json())
      .then(setCompanies)
      .catch(() => setCompanies([]));
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (q.length < 2 || !symbols) return [];
    return companies
      .filter((c) => !symbols.includes(c.symbol) && (c.symbol.startsWith(q) || c.name.toUpperCase().includes(q)))
      .slice(0, 8);
  }, [query, companies, symbols]);

  if (symbols === null) return null;

  return (
    <div className="space-y-4">
      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Add a company: type a symbol or name, e.g. HBL or Engro"
          aria-label="Add a company"
          className="w-full rounded-md border border-border bg-card px-3 py-2"
        />
        {matches.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow">
            {matches.map((c) => (
              <li key={c.symbol}>
                <button
                  type="button"
                  onClick={() => {
                    setMyStocks([...symbols, c.symbol]);
                    setQuery("");
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-brand-soft"
                >
                  <b>{c.symbol}</b> <span className="text-muted">{c.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {symbols.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {symbols.map((s) => (
            <span key={s} className="flex items-center gap-1 rounded-full bg-brand-soft px-3 py-1 text-sm">
              <Link href={`/company/${encodeURIComponent(s)}`} className="font-semibold">
                {s}
              </Link>
              <button type="button" aria-label={`Remove ${s}`} onClick={() => setMyStocks(symbols.filter((x) => x !== s))} className="px-1">
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">You are not following any companies yet.</p>
      )}

      {items.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold">Latest for your stocks</h2>
          {items.map((it) => (
            <Link key={it.id} href={`/item/${it.id}`} className="block rounded-xl border border-border bg-card p-3 text-sm">
              <span className="font-bold text-brand">{it.symbol}</span> <span className="en-only">{it.headline_en}</span>
              <span className="ur-only ur ur-tight block">{it.headline_ur}</span>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
