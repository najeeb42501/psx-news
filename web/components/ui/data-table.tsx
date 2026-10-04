"use client";

// Sortable data table: sticky header, hairline rows, right-aligned tabular numbers, "—" with a
// tooltip for values a filing doesn't state. On phones it becomes a list (name + 2–3 key numbers).
// Rows are plain data (text + sort value), so server pages can pass them in.
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export type Column = {
  key: string;
  label: string;
  numeric?: boolean; // right-aligned, tabular
  mobile?: boolean; // shown in the phone list
  hideBelow?: "lg"; // hidden on narrower screens instead of squeezing
};
export type Cell = { text: string | null; sort?: number | string | null; tone?: "pos" | "neg"; sub?: string };
export type Row = { key: string; href?: string; cells: Record<string, Cell> };

const MISSING_TIP = "Not stated in the filing";

function Value({ cell }: { cell: Cell | undefined }) {
  if (!cell || cell.text === null || cell.text === "") {
    return (
      <span title={MISSING_TIP} aria-label={MISSING_TIP} className="cursor-help text-fg-tertiary">
        —
      </span>
    );
  }
  const tone = cell.tone === "pos" ? "text-positive" : cell.tone === "neg" ? "text-negative" : "";
  return (
    <span className={tone}>
      {cell.tone && <span aria-hidden>{cell.tone === "pos" ? "▲ " : "▼ "}</span>}
      {cell.text}
      {cell.sub && <span className="block text-caption font-normal text-fg-tertiary">{cell.sub}</span>}
    </span>
  );
}

export function DataTable({ columns, rows, initialSort, caption }: {
  columns: Column[];
  rows: Row[];
  initialSort?: { key: string; dir: "asc" | "desc" };
  caption?: string;
}) {
  const [sort, setSort] = useState(initialSort ?? { key: columns[0].key, dir: "asc" as const });
  const sorted = useMemo(() => {
    const val = (r: Row) => r.cells[sort.key]?.sort ?? r.cells[sort.key]?.text ?? null;
    return [...rows].sort((a, b) => {
      const x = val(a), y = val(b);
      if (x === null && y === null) return 0;
      if (x === null) return 1; // missing values always last
      if (y === null) return -1;
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return sort.dir === "asc" ? c : -c;
    });
  }, [rows, sort]);

  const first = columns[0];
  const mobileCols = columns.filter((c) => c.mobile && c.key !== first.key);
  const hide = (c: Column) => (c.hideBelow === "lg" ? "hidden lg:table-cell" : "");

  return (
    <>
      <div className="hidden md:block">
        <table className="w-full border-collapse text-body">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="sticky top-16 z-10 bg-background/95 backdrop-blur">
            <tr className="border-b border-hairline">
              {columns.map((c) => {
                const on = sort.key === c.key;
                const I = !on ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    className={`py-3 font-medium text-fg-secondary ${c.numeric ? "text-end" : "text-start"} ${hide(c)}`}
                  >
                    <button
                      type="button"
                      onClick={() => setSort({ key: c.key, dir: on && sort.dir === "desc" ? "asc" : on ? "desc" : c.numeric ? "desc" : "asc" })}
                      className={`inline-flex items-center gap-1 text-caption hover:text-fg ${c.numeric ? "flex-row-reverse" : ""}`}
                    >
                      {c.label}
                      <I size={14} strokeWidth={1.5} aria-hidden className={on ? "text-fg" : "text-fg-tertiary"} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.key} className="border-b border-hairline transition-colors duration-150 hover:bg-surface">
                {columns.map((c, i) => (
                  <td key={c.key} className={`py-3.5 align-top ${c.numeric ? "tabular text-end font-medium" : ""} ${hide(c)}`}>
                    {i === 0 && r.href ? (
                      <Link href={r.href} className="font-semibold hover:text-brand">
                        <Value cell={r.cells[c.key]} />
                      </Link>
                    ) : (
                      <Value cell={r.cells[c.key]} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-hairline border-y border-hairline md:hidden">
        {sorted.map((r) => (
          <li key={r.key}>
            <Link href={r.href ?? "#"} className="block py-3.5">
              <div className="font-semibold">
                <Value cell={r.cells[first.key]} />
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-3">
                {mobileCols.slice(0, 3).map((c) => (
                  <div key={c.key}>
                    <dt className="text-caption text-fg-tertiary">{c.label}</dt>
                    <dd className="tabular text-body font-medium">
                      <Value cell={r.cells[c.key]} />
                    </dd>
                  </div>
                ))}
              </dl>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
