"use client";

// Type tabs (All, Company filings, Results, Dividends, Economy) as text with a brand underline,
// plus one "Filters" button that opens a sheet for sector and dates. No rows of coloured chips.
import { SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { Button, T } from "@/components/ui/primitives";

export type FilterTab = { key: string; en: string; ur: string; href: string };
export type SheetOptions = {
  action: string; // where the form submits (GET)
  keep?: Record<string, string>; // other query values to keep, e.g. the active tab
  sectors: string[];
  sector?: string;
  from?: string;
  to?: string;
};

export function FilterBar({ tabs, active, sheet }: { tabs: FilterTab[]; active: string; sheet?: SheetOptions }) {
  const ref = useRef<HTMLDialogElement>(null);
  const applied = sheet ? [sheet.sector, sheet.from, sheet.to].filter(Boolean).length : 0;
  return (
    <div className="flex items-center gap-4 border-b border-hairline">
      <nav
        aria-label="Type"
        className="no-scrollbar -mb-px flex flex-1 gap-6 overflow-x-auto max-md:pe-6 max-md:ltr:[mask-image:linear-gradient(to_right,black_85%,transparent)] max-md:rtl:[mask-image:linear-gradient(to_left,black_85%,transparent)]"
      >
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={`shrink-0 border-b-2 py-3 text-body font-medium transition-colors duration-150 ${
                on ? "border-brand text-fg" : "border-transparent text-fg-secondary hover:text-fg"
              }`}
            >
              <T en={t.en} ur={t.ur} />
            </Link>
          );
        })}
      </nav>
      {sheet && (
        <>
          <button
            type="button"
            onClick={() => ref.current?.showModal()}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3 text-caption text-fg-secondary transition-colors duration-150 hover:bg-surface hover:text-fg"
          >
            <SlidersHorizontal size={18} strokeWidth={1.5} aria-hidden />
            <T en="Filters" ur="فلٹرز" />
            {applied > 0 && <span className="rounded-full bg-fg px-1.5 text-[11px] font-semibold text-background">{applied}</span>}
          </button>
          <dialog
            ref={ref}
            aria-label="Filters"
            onClick={(e) => e.target === ref.current && ref.current?.close()}
            className="sheet m-0 mt-auto w-full max-w-none rounded-t-[var(--radius-card)] border border-hairline bg-surface-raised p-0 text-fg shadow-[var(--shadow-pop)] md:m-auto md:w-[440px] md:rounded-[var(--radius-card)]"
          >
            <SheetForm sheet={sheet} onClose={() => ref.current?.close()} />
          </dialog>
        </>
      )}
    </div>
  );
}

export function SheetForm({ sheet, onClose }: { sheet: SheetOptions; onClose?: () => void }) {
  const field = "h-11 w-full rounded-[var(--radius-control)] border border-hairline bg-surface px-3 text-body text-fg";
  return (
    <form method="get" action={sheet.action} className="space-y-5 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between">
        <h2 className="text-title">
          <T en="Filters" ur="فلٹرز" />
        </h2>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full hover:bg-surface">
            <X size={20} strokeWidth={1.5} aria-hidden />
          </button>
        )}
      </div>
      {Object.entries(sheet.keep ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className="block space-y-1.5">
        <span className="text-caption text-fg-secondary">
          <T en="Sector" ur="سیکٹر" />
        </span>
        <select name="sector" defaultValue={sheet.sector ?? ""} className={field}>
          <option value="">All sectors</option>
          {sheet.sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <span className="text-caption text-fg-secondary">
            <T en="From" ur="سے" />
          </span>
          <input type="date" name="from" defaultValue={sheet.from} className={field} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-caption text-fg-secondary">
            <T en="To" ur="تک" />
          </span>
          <input type="date" name="to" defaultValue={sheet.to} className={field} />
        </label>
      </div>
      <div className="flex gap-3">
        <Button type="submit" variant="primary" className="flex-1">
          <T en="Show results" ur="نتائج دکھائیں" />
        </Button>
        <a href={sheet.action} className="inline-flex h-11 items-center rounded-[var(--radius-control)] px-4 text-body text-brand hover:bg-surface">
          <T en="Reset" ur="ری سیٹ" />
        </a>
      </div>
    </form>
  );
}
