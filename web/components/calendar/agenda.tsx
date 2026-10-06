"use client";

// Calendar agenda: type tabs with counts, All / My stocks, events grouped by day, and a month
// mini-calendar (desktop) whose days jump to the agenda.
import { CalendarX2, ChevronLeft, ChevronRight, Star } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { SymbolBadge, T } from "@/components/ui/primitives";
import { useMyStocks } from "@/lib/client-store";
import type { WebEvent } from "@/lib/data";
import { clockMinutes, formatClock, formatPlainDate, formatPlainDateUr } from "@/lib/format";

export const KINDS = [
  { key: "all", en: "All", ur: "سب", kinds: null },
  { key: "board", en: "Board meetings", ur: "بورڈ میٹنگز", kinds: ["board"] },
  { key: "agm", en: "AGMs", ur: "AGM", kinds: ["agm", "eogm"] },
  { key: "closure", en: "Book closures", ur: "بک کلوژر", kinds: ["book_closure"] },
  { key: "briefing", en: "Briefings", ur: "بریفنگ", kinds: ["briefing"] },
] as const;

const LABEL: Record<WebEvent["kind"], [string, string]> = {
  board: ["Board meeting", "بورڈ میٹنگ"],
  agm: ["Annual general meeting", "AGM"],
  eogm: ["Extraordinary general meeting", "EOGM"],
  briefing: ["Corporate briefing", "کارپوریٹ بریفنگ"],
  book_closure: ["Book closure", "بک کلوژر"],
};
const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const URDU_DAYS = ["اتوار", "پیر", "منگل", "بدھ", "جمعرات", "جمعہ", "ہفتہ"];
const utc = (ymd: string) => new Date(`${ymd}T12:00:00Z`);
const addDays = (ymd: string, n: number) => {
  const d = utc(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const short = (ymd: string) => formatPlainDate(ymd).replace(/ 20\d\d$/, "");

function dayHeading(day: string, today: string): { en: string; ur: string } {
  const base = WEEKDAY.format(utc(day)).replace(",", "");
  const ur = `${URDU_DAYS[utc(day).getUTCDay()]}، ${formatPlainDateUr(day)}`;
  if (day === today) return { en: `Today · ${base}`, ur: `آج · ${ur}` };
  if (day === addDays(today, 1)) return { en: `Tomorrow · ${base}`, ur: `کل · ${ur}` };
  return { en: base, ur };
}

function MiniMonth({ month, setMonth, days, today }: { month: string; setMonth: (m: string) => void; days: Set<string>; today: string }) {
  const first = utc(`${month}-01`);
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const inMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: inMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const shift = (n: number) => {
    const d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + n, 1));
    setMonth(d.toISOString().slice(0, 7));
  };
  const btn = "grid size-9 cursor-pointer place-items-center rounded-full text-fg-secondary transition-colors duration-150 hover:bg-surface hover:text-fg";
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-title">{MONTH.format(first)}</p>
        <div className="flex">
          <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className={btn}>
            <ChevronLeft size={18} strokeWidth={1.5} className="rtl:rotate-180" aria-hidden />
          </button>
          <button type="button" aria-label="Next month" onClick={() => shift(1)} className={btn}>
            <ChevronRight size={18} strokeWidth={1.5} className="rtl:rotate-180" aria-hidden />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-caption text-fg-tertiary" dir="ltr">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="py-1">
            {d}
          </span>
        ))}
        {cells.map((d, i) =>
          d === null ? (
            <span key={`x${i}`} />
          ) : days.has(d) ? (
            <a key={d} href={`#d-${d}`} className={`relative mx-auto grid size-9 cursor-pointer place-items-center rounded-full font-semibold text-fg transition-colors duration-150 hover:bg-surface ${d === today ? "ring-1 ring-fg" : ""}`}>
              {Number(d.slice(8))}
              <span aria-hidden className="absolute bottom-1 size-1 rounded-full bg-brand" />
            </a>
          ) : (
            <span key={d} className={`mx-auto grid size-9 place-items-center rounded-full ${d === today ? "ring-1 ring-hairline" : ""}`}>
              {Number(d.slice(8))}
            </span>
          ),
        )}
      </div>
      <p className="text-caption text-fg-tertiary">
        <T en="Days with a dot have events. Tap to jump to them." ur="نقطے والے دنوں میں ایونٹس ہیں۔" />
      </p>
    </div>
  );
}

export function CalendarAgenda({ events, today, initialKind }: { events: WebEvent[]; today: string; initialKind: string }) {
  const [kind, setKind] = useState(KINDS.some((k) => k.key === initialKind) ? initialKind : "all");
  const [mine, setMine] = useState(false);
  const [month, setMonth] = useState(today.slice(0, 7));
  const myStocks = useMyStocks();

  const scoped = useMemo(() => (mine ? events.filter((e) => e.symbol && myStocks?.includes(e.symbol)) : events), [events, mine, myStocks]);
  const counts = Object.fromEntries(KINDS.map((k) => [k.key, k.kinds ? scoped.filter((e) => (k.kinds as readonly string[]).includes(e.kind)).length : scoped.length]));
  const shown = useMemo(() => {
    const k = KINDS.find((x) => x.key === kind)!;
    return k.kinds ? scoped.filter((e) => (k.kinds as readonly string[]).includes(e.kind)) : scoped;
  }, [scoped, kind]);
  const groups = useMemo(() => {
    const m = new Map<string, WebEvent[]>();
    for (const e of shown) m.set(e.event_date, [...(m.get(e.event_date) ?? []), e]);
    // Within a day: all-day items (book closures) first, then by meeting time, then by symbol.
    const at = (e: WebEvent) => clockMinutes(e.event_time) ?? -1;
    for (const list of m.values()) list.sort((a, b) => at(a) - at(b) || (a.symbol ?? "").localeCompare(b.symbol ?? ""));
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [shown]);

  const select = (key: string) => {
    setKind(key);
    const url = new URL(window.location.href);
    if (key === "all") url.searchParams.delete("kind");
    else url.searchParams.set("kind", key);
    history.replaceState(null, "", url);
  };

  return (
    <div className="grid gap-12 lg:grid-cols-12">
      <div className="lg:col-span-8">
        <div className="flex flex-col gap-4 border-b border-hairline">
          <div role="radiogroup" aria-label="Companies" className="flex shrink-0 self-start rounded-full bg-surface p-0.5 sm:self-end">
            {[
              { v: false, en: "All companies", ur: "تمام کمپنیاں" },
              { v: true, en: "My stocks", ur: "میرے شیئرز" },
            ].map((o) => (
              <button
                key={String(o.v)}
                type="button"
                role="radio"
                aria-checked={mine === o.v}
                onClick={() => setMine(o.v)}
                className={`h-9 cursor-pointer rounded-full px-3.5 text-caption transition-colors duration-150 ${
                  mine === o.v ? "bg-background text-fg shadow-[0_1px_2px_rgb(0_0_0/0.08)] ring-1 ring-hairline" : "text-fg-secondary hover:text-fg"
                }`}
              >
                <T en={o.en} ur={o.ur} />
              </button>
            ))}
          </div>
          <div role="tablist" aria-label="Event type" className="no-scrollbar -mb-px flex gap-6 overflow-x-auto">
            {KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                role="tab"
                aria-selected={kind === k.key}
                onClick={() => select(k.key)}
                className={`shrink-0 cursor-pointer border-b-2 py-3 text-body font-medium transition-colors duration-150 ${
                  kind === k.key ? "border-brand text-fg" : "border-transparent text-fg-secondary hover:text-fg"
                }`}
              >
                <T en={k.en} ur={k.ur} /> <span className="tabular text-fg-tertiary">{counts[k.key]}</span>
              </button>
            ))}
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="flex flex-col items-start gap-3 py-10">
            <span className="grid size-10 place-items-center rounded-full bg-surface text-fg-secondary">
              {mine ? <Star size={20} strokeWidth={1.5} aria-hidden /> : <CalendarX2 size={20} strokeWidth={1.5} aria-hidden />}
            </span>
            <p className="text-body text-fg-secondary">
              {mine && !myStocks?.length ? (
                <T en="You're not following any companies yet. Add a few to see their meetings and book closures here." ur="آپ ابھی کسی کمپنی کو فالو نہیں کر رہے۔" />
              ) : (
                <T en="Nothing scheduled for this selection in the next 60 days." ur="اگلے 60 دنوں میں اس انتخاب کے لیے کچھ نہیں۔" />
              )}
            </p>
            {mine && !myStocks?.length && (
              <Link href="/my-stocks" className="inline-flex h-11 items-center rounded-[var(--radius-control)] bg-surface px-4 text-body font-medium hover:bg-hairline">
                <T en="Add your stocks" ur="اپنے شیئرز شامل کریں" />
              </Link>
            )}
          </div>
        ) : (
          groups.map(([day, list]) => {
            const h = dayHeading(day, today);
            return (
              <section key={day} id={`d-${day}`} aria-label={h.en} className="scroll-mt-24">
                <h2 className="sticky top-16 z-10 flex items-baseline justify-between border-b border-hairline bg-background/95 pb-2 pt-6 backdrop-blur">
                  <span className="text-title">
                    <T en={h.en} ur={h.ur} />
                  </span>
                  <span className="tabular text-caption text-fg-tertiary">
                    <T en={`${list.length} event${list.length === 1 ? "" : "s"}`} ur={`${list.length} ایونٹس`} />
                  </span>
                </h2>
                <ul>
                  {list.map((e) => (
                    <li key={`${e.item_id}-${e.kind}`}>
                      <Link
                        href={`/item/${e.item_id}`}
                        className="grid cursor-pointer grid-cols-[4.5rem_1fr_auto] items-center gap-x-4 gap-y-1 border-b border-hairline py-4 transition-colors duration-150 hover:bg-surface md:-mx-4 md:grid-cols-[5.5rem_8rem_1fr_auto] md:px-4"
                      >
                        <span className="tabular text-caption text-fg-tertiary">
                          {e.event_time ? <bdi dir="ltr">{formatClock(e.event_time)}</bdi> : e.kind === "book_closure" ? <T en="All day" ur="پورا دن" /> : "—"}
                        </span>
                        <span className="flex min-w-0 items-center gap-3 md:contents">
                          <span className="flex max-w-[8rem] shrink-0 overflow-hidden">{e.symbol && <SymbolBadge symbol={e.symbol} />}</span>
                          <span className="min-w-0">
                            <span className="block truncate text-body font-medium">
                              <T en={LABEL[e.kind][0]} ur={LABEL[e.kind][1]} />
                              {e.kind === "book_closure" && e.end_date && e.end_date !== e.event_date && (
                                <span className="tabular font-normal text-fg-secondary"> · {short(e.event_date)} – {short(e.end_date)}</span>
                              )}
                            </span>
                            <span dir="ltr" className="block truncate text-caption text-fg-tertiary rtl:text-right">{e.company_name}</span>
                          </span>
                        </span>
                        <ChevronRight size={18} strokeWidth={1.5} aria-hidden className="text-fg-tertiary rtl:rotate-180" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>

      <aside className="hidden lg:col-span-4 lg:block">
        <div className="sticky top-24 space-y-6 rounded-[var(--radius-card)] border border-hairline p-6">
          <MiniMonth month={month} setMonth={setMonth} days={new Set(groups.map(([d]) => d))} today={today} />
        </div>
      </aside>
    </div>
  );
}
