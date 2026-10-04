"use client";

// Search everywhere: opened by the header's search button, Ctrl/Cmd+K or "/". Jumps to pages and
// companies as you type; Enter on free text searches all news.
import { Building2, CornerDownLeft, FileText, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type Company = { symbol: string; name: string; sector: string | null };
type Entry = { key: string; label: string; hint: string; href: string; kind: "page" | "company" | "search" };

const PAGES: Entry[] = [
  { key: "p-home", label: "Home", hint: "Today's market news", href: "/", kind: "page" },
  { key: "p-today", label: "Today", hint: "10 things from the last trading day", href: "/today", kind: "page" },
  { key: "p-results", label: "Results", hint: "Every company's latest results", href: "/results", kind: "page" },
  { key: "p-calendar", label: "Calendar", hint: "Board meetings, AGMs, book closures", href: "/upcoming", kind: "page" },
  { key: "p-my", label: "My stocks", hint: "News for the companies you follow", href: "/my-stocks", kind: "page" },
  { key: "p-about", label: "About ShareKhabar", hint: "Sources and how it works", href: "/about", kind: "page" },
];

let companiesCache: Company[] | null = null;

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [companies, setCompanies] = useState<Company[]>(companiesCache ?? []);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (open && !companiesCache) {
      fetch("/api/companies")
        .then((r) => (r.ok ? r.json() : []))
        .then((list: Company[]) => {
          companiesCache = list;
          setCompanies(list);
        })
        .catch(() => {});
    }
  }, [open]);

  const entries = useMemo<Entry[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PAGES;
    const pages = PAGES.filter((p) => p.label.toLowerCase().includes(q) || p.hint.toLowerCase().includes(q));
    const cos = companies
      .filter((c) => c.symbol.toLowerCase().startsWith(q) || c.name.toLowerCase().includes(q))
      .sort((a, b) => Number(!a.symbol.toLowerCase().startsWith(q)) - Number(!b.symbol.toLowerCase().startsWith(q)))
      .slice(0, 6)
      .map<Entry>((c) => ({ key: `c-${c.symbol}`, label: c.symbol, hint: c.name, href: `/company/${c.symbol}`, kind: "company" }));
    const search: Entry = { key: "search", label: `Search news for “${query.trim()}”`, hint: "", href: `/search?q=${encodeURIComponent(query.trim())}`, kind: "search" };
    return [...cos, ...pages, search];
  }, [query, companies]);

  function go(entry: Entry | undefined) {
    if (!entry) return;
    onClose();
    router.push(entry.href);
  }

  function close() {
    setQuery("");
    setActive(0);
    onClose();
  }

  return (
    <dialog
      ref={ref}
      onClose={close}
      onClick={(e) => e.target === ref.current && close()}
      aria-label="Search"
      className="palette m-0 mx-auto mt-[12vh] w-[min(640px,calc(100vw-2rem))] max-w-none overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-surface-raised p-0 text-fg shadow-[var(--shadow-pop)]"
    >
      <div className="flex items-center gap-3 border-b border-hairline px-4">
        <Search size={20} strokeWidth={1.5} aria-hidden className="text-fg-tertiary" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, entries.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(entries[active]);
            }
          }}
          placeholder="Search companies, symbols or news"
          aria-label="Search companies, symbols or news"
          aria-controls="palette-results"
          aria-activedescendant={entries[active] ? `palette-${entries[active].key}` : undefined}
          className="h-14 flex-1 bg-transparent text-title font-normal outline-none placeholder:text-fg-tertiary focus-visible:outline-none"
        />
        <kbd className="hidden rounded-md border border-hairline px-1.5 py-0.5 text-[11px] text-fg-tertiary sm:block">Esc</kbd>
      </div>
      <PaletteResults entries={entries} active={active} onHover={setActive} onPick={go} />
    </dialog>
  );
}

export function PaletteResults({ entries, active, onHover, onPick }: {
  entries: Entry[];
  active: number;
  onHover?: (i: number) => void;
  onPick?: (e: Entry) => void;
}) {
  return (
    <ul id="palette-results" role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-2">
      {entries.map((e, i) => {
        const I = e.kind === "company" ? Building2 : e.kind === "search" ? Search : FileText;
        return (
          <li
            key={e.key}
            id={`palette-${e.key}`}
            role="option"
            aria-selected={i === active}
            onMouseEnter={() => onHover?.(i)}
            onClick={() => onPick?.(e)}
            className={`flex cursor-pointer items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 ${i === active ? "bg-surface" : ""}`}
          >
            <I size={18} strokeWidth={1.5} aria-hidden className="shrink-0 text-fg-tertiary" />
            <span className={e.kind === "company" ? "font-mono text-[13px] font-semibold" : "text-body"}>{e.label}</span>
            {e.hint && <span className="truncate text-caption text-fg-tertiary">{e.hint}</span>}
            {i === active && <CornerDownLeft size={16} strokeWidth={1.5} aria-hidden className="ms-auto shrink-0 text-fg-tertiary" />}
          </li>
        );
      })}
    </ul>
  );
}

export type { Entry as PaletteEntry };
