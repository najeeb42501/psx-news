"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";

type Company = { symbol: string; name: string; sector: string | null };

let companiesCache: Promise<Company[]> | null = null;
function loadCompanies(): Promise<Company[]> {
  companiesCache ??= fetch("/api/companies").then((r) => (r.ok ? r.json() : [])).catch(() => []);
  return companiesCache;
}

/** Search box: instant company suggestions; Enter searches all announcements and news. */
export function HeaderSearch({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const matches = useMemo(() => {
    const t = q.trim().toUpperCase();
    if (t.length < 2) return [];
    const starts = companies.filter((c) => c.symbol.startsWith(t));
    const names = companies.filter((c) => !c.symbol.startsWith(t) && c.name.toUpperCase().includes(t));
    return [...starts, ...names].slice(0, 7);
  }, [q, companies]);

  function go(path: string) {
    setOpen(false);
    setQ("");
    router.push(path);
  }

  function submit() {
    const pick = matches[active];
    if (open && pick) return go(`/company/${encodeURIComponent(pick.symbol)}`);
    if (q.trim()) go(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <div ref={box} className="relative w-full">
      <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <input
        value={q}
        autoFocus={autoFocus}
        onFocus={() => {
          loadCompanies().then(setCompanies);
          setOpen(true);
        }}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, matches.length - 1));
          else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          else if (e.key === "Enter") submit();
          else if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search company, symbol or topic"
        aria-label="Search"
        className="w-full rounded-full border border-border bg-background py-2 ps-9 pe-3 text-sm outline-none focus:border-brand"
      />
      {open && q.trim().length >= 2 && (
        <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card text-sm shadow-lg">
          {matches.map((c, i) => (
            <li key={c.symbol}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(`/company/${encodeURIComponent(c.symbol)}`)}
                className={`flex w-full items-baseline gap-2 px-3 py-2 text-start ${i === active ? "bg-brand-soft" : ""}`}
              >
                <b className="text-brand">{c.symbol}</b>
                <span className="truncate text-muted">{c.name}</span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => go(`/search?q=${encodeURIComponent(q.trim())}`)}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-start text-muted hover:bg-brand-soft"
            >
              <Icon name="search" className="size-3.5" /> Search all news for “{q.trim()}”
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
