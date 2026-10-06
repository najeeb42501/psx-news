"use client";

// Results explorer: search, sector and period filters on one row, a count summary, then the table.
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { type Column, DataTable, type Row } from "@/components/ui/data-table";
import { T } from "@/components/ui/primitives";

export type ResultMeta = { sector: string; period: string; search: string; profit: number | null; dividend: boolean };

const PERIODS = [
  { key: "", label: "All periods" },
  { key: "year", label: "Full year" },
  { key: "half_year", label: "Half year" },
  { key: "nine_months", label: "Nine months" },
  { key: "quarter", label: "Quarter" },
];

const COLUMNS: Column[] = [
  { key: "company", label: "Company", mobile: true },
  { key: "period", label: "Period", hideBelow: "lg" },
  { key: "revenue", label: "Revenue", numeric: true, hideBelow: "lg" },
  { key: "pat", label: "Profit after tax", numeric: true, mobile: true },
  { key: "change", label: "vs last year", numeric: true },
  { key: "eps", label: "EPS", numeric: true, mobile: true },
  { key: "dividend", label: "Dividend", numeric: true, mobile: true },
  { key: "announced", label: "Announced", numeric: true },
];

export function ResultsExplorer({ rows, meta }: { rows: Row[]; meta: Record<string, ResultMeta> }) {
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("");
  const [period, setPeriod] = useState("");
  const sectors = useMemo(() => [...new Set(Object.values(meta).map((m) => m.sector).filter(Boolean))].sort(), [meta]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => {
      const m = meta[r.key];
      return (!t || m.search.includes(t)) && (!sector || m.sector === sector) && (!period || m.period === period);
    });
  }, [rows, meta, q, sector, period]);
  const profit = shown.filter((r) => (meta[r.key].profit ?? 0) > 0).length;
  const loss = shown.filter((r) => (meta[r.key].profit ?? 0) < 0).length;
  const dividend = shown.filter((r) => meta[r.key].dividend).length;
  // A column no company has a figure for (e.g. "vs last year" before both years are extracted) is left out.
  const columns = useMemo(() => COLUMNS.filter((c) => c.mobile || rows.some((r) => r.cells[c.key]?.text)), [rows]);
  const field = "h-11 rounded-[var(--radius-control)] border border-hairline bg-surface px-3 text-body text-fg";

  return (
    <div className="space-y-8">
      <div className="grid gap-3 md:grid-cols-[1fr_220px_180px]">
        <label className="relative block">
          <span className="sr-only">Search companies</span>
          <Search size={18} strokeWidth={1.5} aria-hidden className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-fg-tertiary" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Company or symbol"
            className={`${field} w-full ps-10`}
          />
        </label>
        <label className="block">
          <span className="sr-only">Sector</span>
          <select value={sector} onChange={(e) => setSector(e.target.value)} className={`${field} w-full`}>
            <option value="">All sectors</option>
            {sectors.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">Period</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className={`${field} w-full`}>
            {PERIODS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { en: "Companies", ur: "کمپنیاں", n: shown.length, tone: "" },
          { en: "Reported a profit", ur: "منافع", n: profit, tone: "text-positive" },
          { en: "Reported a loss", ur: "نقصان", n: loss, tone: "text-negative" },
          { en: "Declared a cash dividend", ur: "کیش ڈیویڈنڈ", n: dividend, tone: "" },
        ].map((s) => (
          <div key={s.en} className="rounded-[var(--radius-card)] bg-surface p-4">
            <dd className={`tabular text-headline ${s.tone}`}>{s.n}</dd>
            <dt className="text-caption text-fg-secondary">
              <T en={s.en} ur={s.ur} />
            </dt>
          </div>
        ))}
      </dl>

      {shown.length ? (
        <DataTable columns={columns} rows={shown} initialSort={{ key: "announced", dir: "desc" }} caption="Latest results by company" />
      ) : (
        <p className="border-y border-hairline py-10 text-body text-fg-secondary">
          <T en="No company matches these filters." ur="ان فلٹرز کے مطابق کوئی کمپنی نہیں۔" />
        </p>
      )}
    </div>
  );
}
