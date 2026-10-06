// /latest: the full, filterable feed (moved here from Home). Type tabs, a filters sheet for sector
// and dates, rows grouped by day, "Load more".
import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/feedback";
import { FilterBar } from "@/components/ui/filter-bar";
import { ButtonLink, T } from "@/components/ui/primitives";
import { ThumbRow } from "@/components/ui/stories";
import { type FeedFilters, PAGE_SIZE, type WebItem, getFeed, getSectors } from "@/lib/data";
import { currentTime, dayLabel, pktDay } from "@/lib/format";

export const revalidate = 60;
export const metadata: Metadata = { title: "Latest updates", description: "Every PSX company filing and Pakistan business story, newest first." };

const TABS = [
  { key: "all", en: "All", ur: "سب", filter: {} as FeedFilters },
  { key: "filings", en: "Company filings", ur: "کمپنی فائلنگز", filter: { source: "filings" } as FeedFilters },
  { key: "results", en: "Results", ur: "رزلٹس", filter: { type: "results" } as FeedFilters },
  { key: "dividends", en: "Dividends", ur: "ڈیویڈنڈ", filter: { type: "dividends" } as FeedFilters },
  { key: "economy", en: "Economy", ur: "معیشت", filter: { source: "news", importantOnly: true } as FeedFilters },
];

type Search = { type?: string; sector?: string; from?: string; to?: string; page?: string };

export default async function LatestPage({ searchParams }: PageProps<"/latest">) {
  const sp = (await searchParams) as Search;
  const tab = TABS.find((t) => t.key === sp.type) ?? TABS[0];
  const page = Math.max(1, Number(sp.page) || 1);
  const [items, sectors] = await Promise.all([
    getFeed({ ...tab.filter, sector: sp.sector || undefined, from: sp.from, to: sp.to, page }),
    getSectors(),
  ]);
  const now = currentTime();
  const query = (extra: Record<string, string>) => {
    const q = new URLSearchParams(Object.entries({ ...sp, ...extra }).filter(([, v]) => v) as [string, string][]);
    return `/latest${q.size ? `?${q}` : ""}`;
  };
  const days: { day: string; items: WebItem[] }[] = [];
  for (const it of items) {
    const day = pktDay(it.sort_time);
    if (days.at(-1)?.day !== day) days.push({ day, items: [] });
    days.at(-1)!.items.push(it);
  }

  return (
    <div className="space-y-8 pt-8 md:pt-12">
      <header className="space-y-2">
        <h1 className="text-display-sm md:text-display">
          <T en="Latest updates" ur="تازہ ترین" />
        </h1>
        <p className="text-body text-fg-secondary">
          <T en="Every company filing and business story, newest first." ur="ہر کمپنی فائلنگ اور کاروباری خبر، تازہ ترین پہلے۔" />
        </p>
      </header>
      <FilterBar
        active={tab.key}
        tabs={TABS.map((t) => ({ key: t.key, en: t.en, ur: t.ur, href: t.key === "all" ? "/latest" : `/latest?type=${t.key}` }))}
        sheet={{ action: "/latest", keep: tab.key === "all" ? {} : { type: tab.key }, sectors, sector: sp.sector, from: sp.from, to: sp.to }}
      />
      <div className="max-w-[820px] space-y-8">
        {days.length === 0 && (
          <EmptyState icon={Inbox} text={{ en: "Nothing matches these filters.", ur: "ان فلٹرز کے مطابق کچھ نہیں ملا۔" }} action={{ href: "/latest", label: { en: "Clear filters", ur: "فلٹرز ہٹائیں" } }} />
        )}
        {days.map((d) => {
          const label = dayLabel(`${d.day}T12:00:00+05:00`, now);
          return (
            <section key={d.day} aria-label={label.en}>
              <h2 className="eyebrow sticky top-16 z-10 border-b border-hairline bg-background/95 py-2 text-fg-tertiary backdrop-blur">
                <T en={label.en} ur={label.ur} />
              </h2>
              {d.items.map((it) => (
                <ThumbRow key={it.id} item={it} now={now} />
              ))}
            </section>
          );
        })}
        {items.length === PAGE_SIZE && (
          <ButtonLink href={query({ page: String(page + 1) })}>
            <T en="Load more" ur="مزید دیکھیں" />
          </ButtonLink>
        )}
      </div>
    </div>
  );
}
