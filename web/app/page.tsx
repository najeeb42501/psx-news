import Link from "next/link";
import { EventList } from "@/components/event-list";
import { Icon } from "@/components/icons";
import { Chips, Feed } from "@/components/item-card";
import { L } from "@/components/l";
import { MyStocksFeed } from "@/components/my-stocks";
import { TYPE_GROUPS, groupOf } from "@/lib/categories";
import { PAGE_SIZE, type WebItem, getFeed, getHighlights, getSectors, getUpcoming } from "@/lib/data";
import { keyChips } from "@/lib/facts";
import { formatPlainDate, pktDay } from "@/lib/format";
import { UrduText } from "@/components/urdu-text";

export const revalidate = 60;

type Search = { symbol?: string; sector?: string; type?: string; date?: string; page?: string; imp?: string };

function HighlightTile({ item }: { item: WebItem }) {
  const g = groupOf(item.category);
  const chips = keyChips(item.facts).slice(0, 2);
  return (
    <Link
      href={`/item/${item.id}`}
      className={`flex w-64 shrink-0 flex-col gap-2 rounded-2xl border border-l-4 border-border ${g.accent} bg-card p-3 shadow-sm hover:shadow-md`}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <b className="text-brand">{item.symbol ?? "Economy"}</b>
        <span className={`rounded-full px-2 py-0.5 ${g.badge}`}>
          <L en={g.en} ur={g.ur} />
        </span>
      </div>
      <p className="line-clamp-2 text-sm font-semibold leading-snug">
        <span className="en-only">{item.headline_en}</span>
        <span className="ur-only ur ur-tight">{item.headline_ur && <UrduText text={item.headline_ur} />}</span>
      </p>
      <div className="mt-auto">
        <Chips chips={chips} />
      </div>
    </Link>
  );
}

export default async function FeedPage({ searchParams }: PageProps<"/">) {
  const sp = (await searchParams) as Search;
  const page = Math.max(1, Number(sp.page) || 1);
  const filters = {
    symbol: sp.symbol?.trim() || undefined,
    sector: sp.sector || undefined,
    type: sp.type || undefined,
    date: sp.date || undefined,
  };
  const importantOnly = sp.imp === "1";
  const filtered = Object.values(filters).some(Boolean);
  const [items, sectors, highlights, week] = await Promise.all([
    getFeed({ ...filters, page, importantOnly }),
    getSectors(),
    !filtered && page === 1 ? getHighlights() : Promise.resolve([]),
    getUpcoming(undefined, 7),
  ]);

  const link = (changes: Record<string, string | undefined>) => {
    const all = { ...filters, imp: importantOnly ? "1" : undefined, page: undefined as string | undefined, ...changes };
    const q = new URLSearchParams(Object.entries(all).filter(([, v]) => v) as [string, string][]);
    return q.size ? `/?${q.toString()}` : "/";
  };
  const chip = (active: boolean) =>
    `flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
      active ? "border-brand bg-brand text-white" : "border-border bg-card hover:border-brand"
    }`;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        {highlights.length > 0 && (
          <section>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">
              <Icon name="star" className="size-4" />
              <L en={`Highlights · ${formatPlainDate(pktDay(highlights[0].sort_time))}`} ur="اہم خبریں" />
            </h2>
            <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
              {highlights.map((it) => (
                <HighlightTile key={it.id} item={it} />
              ))}
            </div>
          </section>
        )}

        {!filtered && page === 1 && <MyStocksFeed />}

        <section className="space-y-2">
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            <Link href={link({ type: undefined })} className={chip(!filters.type)}>
              <L en="All" ur="سب" />
            </Link>
            {TYPE_GROUPS.map((g) => (
              <Link key={g.key} href={link({ type: g.key })} className={chip(filters.type === g.key)}>
                <Icon name={g.icon} className="size-3.5" />
                <L en={g.en} ur={g.ur} />
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link href={link({ imp: importantOnly ? undefined : "1" })} className={chip(importantOnly)}>
              <Icon name={importantOnly ? "check" : "filter"} className="size-3.5" />
              <L en="Important only" ur="صرف اہم" />
            </Link>
            <details className="group relative" open={!!(filters.symbol || filters.sector || filters.date)}>
              <summary className={`${chip(!!(filters.symbol || filters.sector || filters.date))} cursor-pointer list-none`}>
                <Icon name="filter" className="size-3.5" />
                <L en="More filters" ur="مزید فلٹر" />
              </summary>
              <form method="get" action="/" className="mt-2 grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-4">
                {filters.type && <input type="hidden" name="type" value={filters.type} />}
                {importantOnly && <input type="hidden" name="imp" value="1" />}
                <input
                  name="symbol"
                  defaultValue={filters.symbol}
                  placeholder="Symbol, e.g. HBL"
                  aria-label="Company symbol"
                  className="rounded-md border border-border bg-background px-2 py-1.5 uppercase"
                />
                <select name="sector" defaultValue={filters.sector ?? ""} aria-label="Sector" className="rounded-md border border-border bg-background px-2 py-1.5">
                  <option value="">All sectors</option>
                  {sectors.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <input type="date" name="date" defaultValue={filters.date} aria-label="Date" className="rounded-md border border-border bg-background px-2 py-1.5" />
                <button className="rounded-md bg-brand px-3 py-1.5 font-semibold text-white">
                  <L en="Apply" ur="لاگو کریں" />
                </button>
              </form>
            </details>
            {(filtered || importantOnly) && (
              <Link href="/" className="inline-flex items-center gap-1 text-muted hover:text-foreground">
                <Icon name="x" className="size-3.5" /> <L en="Clear all" ur="سب صاف کریں" />
              </Link>
            )}
          </div>
        </section>

        <Feed items={items} empty={{ en: "No announcements match these filters.", ur: "ان فلٹرز کے مطابق کوئی اعلان نہیں۔" }} />

        <nav className="flex justify-between text-sm">
          {page > 1 ? (
            <Link href={link({ page: String(page - 1) })} className="rounded-full border border-border px-4 py-2">
              ← <L en="Newer" ur="نئی" />
            </Link>
          ) : (
            <span />
          )}
          {items.length === PAGE_SIZE && (
            <Link href={link({ page: String(page + 1) })} className="rounded-full border border-border px-4 py-2">
              <L en="Older" ur="پرانی" /> →
            </Link>
          )}
        </nav>
      </div>

      <aside className="hidden space-y-4 lg:block">
        <div className="sticky top-[calc(var(--header-h)+1rem)] space-y-4">
          <section className="space-y-2">
            <h2 className="flex items-center justify-between text-sm font-bold">
              <span className="flex items-center gap-2">
                <Icon name="calendar" className="size-4 text-brand" />
                <L en="Coming up this week" ur="اس ہفتے" />
              </span>
              <Link href="/upcoming" className="text-xs font-normal text-brand underline">
                <L en="Full calendar" ur="مکمل کیلنڈر" />
              </Link>
            </h2>
            <EventList events={week.slice(0, 8)} compact />
          </section>
          <Link href="/results" className="block rounded-2xl border border-border bg-card p-4 hover:border-brand">
            <div className="flex items-center gap-2 font-bold">
              <Icon name="table" className="size-4 text-brand" /> <L en="Results tracker" ur="رزلٹس ٹریکر" />
            </div>
            <p className="mt-1 text-sm text-muted">
              <L en="Every company's latest results in one table: revenue, profit, EPS and dividend." ur="تمام کمپنیوں کے تازہ رزلٹس ایک ٹیبل میں۔" />
            </p>
          </Link>
        </div>
      </aside>
    </div>
  );
}
