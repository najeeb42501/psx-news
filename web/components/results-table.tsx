"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";

export type ResultRow = {
  id: number;
  symbol: string;
  company: string;
  sector: string;
  period: string | null; // YYYY-MM-DD period end
  periodKind: string | null;
  revenue: number | null; // Rs million
  profit: number | null; // Rs million, negative = loss
  eps: number | null;
  dividendRs: number | null;
  dividendPct: number | null;
  date: string; // announcement day (PKT)
};

type Key = "symbol" | "date" | "revenue" | "profit" | "eps" | "dividendRs";
const PERIOD: Record<string, string> = { year: "FY", half_year: "H1", quarter: "Q", nine_months: "9M" };
const fmt = (v: number | null, d = 1) => (v === null ? "" : v.toLocaleString("en-US", { maximumFractionDigits: d }));
const monthYear = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });

export function ResultsTable({ rows }: { rows: ResultRow[] }) {
  const [sort, setSort] = useState<{ key: Key; desc: boolean }>({ key: "date", desc: true });
  const [sector, setSector] = useState("");
  const [q, setQ] = useState("");
  const sectors = useMemo(() => [...new Set(rows.map((r) => r.sector).filter(Boolean))].sort(), [rows]);

  const shown = useMemo(() => {
    const t = q.trim().toUpperCase();
    const list = rows.filter(
      (r) => (!sector || r.sector === sector) && (!t || r.symbol.includes(t) || r.company.toUpperCase().includes(t)),
    );
    const dir = sort.desc ? -1 : 1;
    return list.sort((a, b) => {
      const x = a[sort.key], y = b[sort.key];
      if (x === null || x === "") return 1; // blanks always last
      if (y === null || y === "") return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }, [rows, sort, sector, q]);

  const header = (key: Key, label: string, right = true) => (
    <th scope="col" className={`whitespace-nowrap px-3 py-2 font-semibold ${right ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== "symbol" }))}
        className="inline-flex items-center gap-1 hover:text-brand"
      >
        {label}
        {sort.key === key && <span aria-hidden>{sort.desc ? "↓" : "↑"}</span>}
      </button>
    </th>
  );

  return (
    <div className="space-y-3" dir="ltr">
      <div className="flex flex-wrap gap-2 text-sm">
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by company"
            aria-label="Filter by company"
            className="rounded-full border border-border bg-card py-1.5 pl-8 pr-3"
          />
        </div>
        <select value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sector" className="rounded-full border border-border bg-card px-3 py-1.5">
          <option value="">All sectors</option>
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="self-center text-muted">{shown.length} companies</span>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-background/60 text-xs text-muted">
            <tr>
              {header("symbol", "Company", false)}
              <th scope="col" className="px-3 py-2 text-left font-semibold">Period</th>
              {header("revenue", "Revenue (m)")}
              {header("profit", "Profit after tax (m)")}
              {header("eps", "EPS (Rs)")}
              {header("dividendRs", "Dividend")}
              {header("date", "Announced")}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.map((r) => (
              <tr key={r.id} className="hover:bg-background/60">
                <td className="px-3 py-2">
                  <Link href={`/item/${r.id}`} className="font-bold text-brand hover:underline">
                    {r.symbol}
                  </Link>
                  <div className="max-w-48 truncate text-xs text-muted">{r.company}</div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-muted">
                  {r.period ? `${r.periodKind ? PERIOD[r.periodKind] ?? "" : ""} ${monthYear.format(new Date(`${r.period}T00:00:00Z`))}` : ""}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.revenue)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${r.profit !== null && r.profit < 0 ? "text-rose-600" : ""}`}>
                  {r.profit !== null && r.profit < 0 ? `(${fmt(-r.profit)})` : fmt(r.profit)}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${r.eps !== null && r.eps < 0 ? "text-rose-600" : ""}`}>
                  {r.eps !== null && r.eps < 0 ? `(${fmt(-r.eps, 4)})` : fmt(r.eps, 4)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {r.dividendRs !== null ? `Rs ${fmt(r.dividendRs, 4)}` : r.dividendPct !== null ? `${fmt(r.dividendPct)}%` : ""}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-muted">{r.date.slice(8)}/{r.date.slice(5, 7)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Losses are shown in brackets, e.g. (4.2).</p>
    </div>
  );
}
