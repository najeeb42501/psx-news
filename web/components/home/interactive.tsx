"use client";

// Interactive parts of Home. Everything they show is rendered on the server and passed in, so they
// only add behaviour (tabs, carousel arrows, the day strip, "Your stocks" from this browser).
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { SymbolBadge, T } from "@/components/ui/primitives";
import { StoryCard } from "@/components/ui/stories";
import { useMyStocks } from "@/lib/client-store";
import type { WebItem } from "@/lib/data";

/** Remembers that this browser has seen Home, so the next visit gets the compact hero. */
export function VisitMarker() {
  useEffect(() => {
    try {
      localStorage.setItem("visited", "1");
    } catch {}
  }, []);
  return null;
}

/** "Your stocks": only when this browser follows companies (none for first-time visitors). */
export function YourStocks({ now }: { now: string }) {
  const symbols = useMyStocks();
  const [items, setItems] = useState<WebItem[] | null>(null);
  const key = symbols?.join(",") ?? "";
  useEffect(() => {
    if (!key) return;
    let live = true;
    fetch(`/api/items?symbols=${encodeURIComponent(key)}&limit=4`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: WebItem[]) => live && setItems(list))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [key]);
  if (!key || !items?.length) return null;
  return (
    <section aria-labelledby="your-stocks" className="space-y-5">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="your-stocks" className="text-headline">
          <T en="Your stocks" ur="آپ کے شیئرز" />
        </h2>
        <Link href="/my-stocks" className="text-caption text-brand hover:underline">
          <T en="See all" ur="سب دیکھیں" />
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {symbols!.slice(0, 8).map((s) => (
          <SymbolBadge key={s} symbol={s} href={`/company/${s}`} />
        ))}
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it) => (
          <StoryCard key={it.id} item={it} now={new Date(now)} />
        ))}
      </div>
    </section>
  );
}

/** Horizontal scroll-snap row with arrow buttons on desktop; the next card peeks in. */
export function Carousel({ children, label, seeAll }: { children: ReactNode; label: string; seeAll?: { href: string; en: string; ur: string } }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    el.scrollBy({ left: dir * (rtl ? -1 : 1) * el.clientWidth * 0.8, behavior: "smooth" });
  };
  const arrow = "hidden size-10 cursor-pointer place-items-center rounded-full border border-hairline bg-background text-fg-secondary transition-colors duration-150 hover:text-fg md:grid";
  return (
    <div className="relative">
      <div className="absolute -top-14 end-0 flex items-center gap-2">
        {seeAll && (
          <Link href={seeAll.href} className="me-2 text-caption text-brand hover:underline">
            <T en={seeAll.en} ur={seeAll.ur} />
          </Link>
        )}
        <button type="button" aria-label={`Previous ${label}`} onClick={() => scroll(-1)} className={arrow}>
          <ChevronLeft size={20} strokeWidth={1.5} className="rtl:rotate-180" aria-hidden />
        </button>
        <button type="button" aria-label={`Next ${label}`} onClick={() => scroll(1)} className={arrow}>
          <ChevronRight size={20} strokeWidth={1.5} className="rtl:rotate-180" aria-hidden />
        </button>
      </div>
      <div ref={ref} role="region" aria-label={label} tabIndex={0} className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-px-5 px-5 pb-2 md:mx-0 md:scroll-px-0 md:px-0">
        {children}
      </div>
    </div>
  );
}

/** Two tabs over two server-rendered lists. */
export function Tabs({ tabs }: { tabs: { key: string; en: string; ur: string; panel: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0].key);
  return (
    <div>
      <div role="tablist" className="flex gap-6 border-b border-hairline">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={active === t.key}
            aria-controls={`panel-${t.key}`}
            onClick={() => setActive(t.key)}
            className={`-mb-px cursor-pointer border-b-2 py-3 text-body font-medium transition-colors duration-150 ${
              active === t.key ? "border-brand text-fg" : "border-transparent text-fg-secondary hover:text-fg"
            }`}
          >
            <T en={t.en} ur={t.ur} />
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" id={`panel-${t.key}`} aria-labelledby={`tab-${t.key}`} hidden={active !== t.key}>
          {t.panel}
        </div>
      ))}
    </div>
  );
}

export type AgendaDay = { date: string; en: string; ur: string; count: number; panel: ReactNode };

/** Mon–Fri strip with event counts; the chosen day's events below. */
export function WeekAgenda({ days, initial }: { days: AgendaDay[]; initial: string }) {
  const [day, setDay] = useState(initial);
  const current = days.find((d) => d.date === day) ?? days[0];
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Day" className="grid grid-cols-5 gap-2">
        {days.map((d) => {
          const on = d.date === current.date;
          return (
            <button
              key={d.date}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setDay(d.date)}
              className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-[var(--radius-control)] border py-2.5 transition-colors duration-150 ${
                on ? "border-fg bg-fg text-background" : "border-hairline text-fg hover:bg-surface"
              }`}
            >
              <span className="text-caption">
                <T en={d.en} ur={d.ur} />
              </span>
              <span className="tabular text-title">{d.count}</span>
            </button>
          );
        })}
      </div>
      <div role="tabpanel">{current.panel}</div>
    </div>
  );
}
