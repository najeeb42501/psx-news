// Today: the 10 most important items of the last trading day as an editorial numbered list, with the
// day in numbers and what's coming up beside it.
import { ArrowRight, Newspaper } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/feedback";
import { CoverImage } from "@/components/ui/cover";
import { Ico, KeyFigurePill, MetaLine, SymbolBadge, T } from "@/components/ui/primitives";
import { dek, headlineEn } from "@/components/ui/stories";
import { UrduText } from "@/components/urdu-text";
import { categoryLabel, groupCategories, isNews } from "@/lib/categories";
import { type WebItem, getToday, getUpcoming } from "@/lib/data";
import { keyFigure } from "@/lib/facts";
import { currentTime, formatClock, formatLongDateTime, formatPlainDate, formatPlainDateUr, formatRowTime, pktDay, stripSymbol } from "@/lib/format";
import { TOPIC_LABEL, topicOf } from "@/lib/topics";

export const revalidate = 60;
export const metadata: Metadata = {
  title: "Today's 10 things",
  description: "The ten most important PSX filings and business stories of the last trading day, in English and Urdu.",
};

const EVENT_LABEL = { board: ["Board meeting", "بورڈ میٹنگ"], agm: ["AGM", "AGM"], eogm: ["EOGM", "EOGM"], briefing: ["Corporate briefing", "کارپوریٹ بریفنگ"], book_closure: ["Book closure", "بک کلوژر"] } as const;

function Row({ item, n, now }: { item: WebItem; n: number; now: Date }) {
  const news = isNews(item.source_id);
  const figure = keyFigure(item.facts);
  const lead = n === 1;
  const ur = stripSymbol(item.headline_ur, item.symbol);
  const enDek = dek(item.body_en);
  const urDek = dek(item.body_ur, true);
  return (
    <li className={`lift group relative grid cursor-pointer gap-x-4 border-b border-hairline py-6 transition-colors duration-150 hover:bg-surface md:-mx-4 md:grid-cols-[3.5rem_1fr_auto] md:px-4 ${lead ? "grid-cols-[2.5rem_1fr]" : "grid-cols-[2.5rem_1fr_72px]"}`}>
      <span aria-hidden className="tabular text-[32px] font-light leading-none text-fg-tertiary md:text-[40px]">
        {n}
      </span>
      <div className="min-w-0 space-y-2">
        <MetaLine
          symbol={news ? null : item.symbol}
          category={news ? TOPIC_LABEL[topicOf(item)] : categoryLabel(item.category)}
          time={formatRowTime(item.sort_time, now)}
        />
        <h2>
          <Link href={`/item/${item.id}`} className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-brand">
            <span className={`en-only block ${lead ? "text-headline" : "text-title"}`}>{headlineEn(item)}</span>
            {ur && (
              <span className={`ur-only ur block font-semibold ${lead ? "text-[24px] leading-[48px]" : "text-[19px] leading-[38px]"}`} lang="ur">
                <UrduText text={ur} />
              </span>
            )}
          </Link>
        </h2>
        {enDek && <p className="en-only line-clamp-2 text-body text-fg-secondary">{enDek}</p>}
        {urDek && (
          <p className="ur-only ur line-clamp-2 text-[17px] leading-[34px] text-fg-secondary" lang="ur">
            <UrduText text={urDek} />
          </p>
        )}
        {figure && (
          <div className="pt-1">
            <KeyFigurePill figure={figure} />
          </div>
        )}
      </div>
      <div className={`self-start overflow-hidden rounded-[10px] border border-hairline md:col-start-3 md:row-start-1 md:mt-0 ${lead ? "col-start-2 mt-3 md:w-[240px]" : "col-start-3 row-start-1 mt-1 w-[72px] md:w-[120px]"}`}>
        <CoverImage item={item} ratio={lead ? "4:3" : "1:1"} />
      </div>
    </li>
  );
}

export default async function TodayPage() {
  const now = currentTime();
  const [{ day, items, all }, events] = await Promise.all([getToday(), getUpcoming(undefined, 14)]);
  const isToday = day === pktDay(now);
  const longDay = day ? formatLongDateTime(`${day}T12:00:00+05:00`).split(",")[0] : "";
  const dividendCats = groupCategories("dividends") ?? [];
  const numbers = [
    { en: "Company filings", ur: "کمپنی فائلنگز", n: all.filter((i) => i.source_id === "psx_companies").length, href: "/latest?type=filings" },
    { en: "Results", ur: "رزلٹس", n: all.filter((i) => i.category === "results").length, href: "/results" },
    { en: "Dividend announcements", ur: "ڈیویڈنڈ اعلانات", n: all.filter((i) => dividendCats.includes(i.category) || "cash_dividend_rs" in i.facts).length, href: "/latest?type=dividends" },
    { en: "Business news", ur: "کاروباری خبریں", n: all.filter((i) => isNews(i.source_id)).length, href: "/latest?type=economy" },
  ];
  const upcoming = events.slice(0, 6);

  return (
    <div className="grid gap-12 pt-8 md:pt-12 lg:grid-cols-12">
      <div className="lg:col-span-8">
        <header className="space-y-3 border-b border-hairline pb-8">
          <p className="eyebrow text-fg-tertiary">
            <T en="Today" ur="آج" />
          </p>
          <h1 className="text-display-sm text-balance md:text-display">
            {isToday ? <T en="Today's 10 things" ur="آج کی 10 اہم باتیں" /> : <T en="10 things from the last trading day" ur="پچھلے کاروباری دن کی 10 اہم باتیں" />}
          </h1>
          {day && (
            <p className="text-body text-fg-secondary">
              {isToday ? (
                <T en={`${longDay}. Updated as new filings arrive.`} ur={`${formatPlainDateUr(day)}، نئی فائلنگز کے ساتھ اپ ڈیٹ۔`} />
              ) : (
                <T en={`From the last trading day, ${longDay}. Today's list starts with the first filings of the day.`} ur={`پچھلا کاروباری دن، ${formatPlainDateUr(day)}۔`} />
              )}
            </p>
          )}
        </header>
        {items.length === 0 ? (
          <EmptyState icon={Newspaper} text={{ en: "No announcements yet.", ur: "ابھی کوئی اعلان نہیں۔" }} action={{ href: "/calendar", label: { en: "See what's coming up", ur: "آنے والے ایونٹس" } }} />
        ) : (
          <ol>
            {items.map((it, i) => (
              <Row key={it.id} item={it} n={i + 1} now={now} />
            ))}
          </ol>
        )}
        {all.length > items.length && day && (
          <Link href={`/latest?from=${day}&to=${day}`} className="mt-6 inline-flex items-center gap-1.5 text-body text-brand hover:underline">
            <T en={`All ${all.length} updates from ${formatPlainDate(day)}`} ur={`اس دن کی تمام ${all.length} اپ ڈیٹس`} />
            <Ico icon={ArrowRight} size={18} className="rtl:rotate-180" />
          </Link>
        )}
      </div>

      <aside className="space-y-10 lg:col-span-4 lg:pt-36">
        <div className="lg:sticky lg:top-24 space-y-10">
          <section aria-labelledby="numbers" className="space-y-4">
            <h2 id="numbers" className="text-title">
              <T en="The day in numbers" ur="دن کے اعداد" />
            </h2>
            <dl className="grid grid-cols-2 gap-3">
              {numbers.map((x) => (
                <Link key={x.en} href={x.href} className="cursor-pointer rounded-[var(--radius-card)] bg-surface p-4 transition-colors duration-150 hover:bg-hairline/60">
                  <dd className="tabular text-headline">{x.n}</dd>
                  <dt className="text-caption text-fg-secondary">
                    <T en={x.en} ur={x.ur} />
                  </dt>
                </Link>
              ))}
            </dl>
          </section>
          {upcoming.length > 0 && (
            <section aria-labelledby="coming" className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h2 id="coming" className="text-title">
                  <T en="Coming up" ur="آنے والے" />
                </h2>
                <Link href="/calendar" className="text-caption text-brand hover:underline">
                  <T en="Calendar" ur="کیلنڈر" />
                </Link>
              </div>
              <ul className="border-t border-hairline">
                {upcoming.map((e) => (
                  <li key={`${e.item_id}-${e.kind}-${e.event_date}`}>
                    <Link href={`/item/${e.item_id}`} className="flex cursor-pointer items-center gap-3 border-b border-hairline py-3 hover:bg-surface">
                      <span className="tabular w-14 shrink-0 text-caption text-fg-tertiary">
                        <span className="ui-en">{formatPlainDate(e.event_date).replace(/ 20\d\d$/, "")}</span>
                        <span className="ui-ur ur ur-tight !leading-normal">{formatPlainDateUr(e.event_date).replace(/ 20\d\d$/, "")}</span>
                      </span>
                      {e.symbol && <SymbolBadge symbol={e.symbol} />}
                      <span className="truncate text-body">
                        <T en={EVENT_LABEL[e.kind][0]} ur={EVENT_LABEL[e.kind][1]} />
                      </span>
                      {e.event_time && <span className="ms-auto shrink-0 text-caption text-fg-tertiary"><bdi dir="ltr">{formatClock(e.event_time)}</bdi></span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
