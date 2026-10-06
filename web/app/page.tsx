// Home: a news front page. Hero (or a one-line greeting for returning visitors), today at a glance,
// your stocks, top stories, results, latest updates, the week, sectors, what you can do, how it works,
// stay updated. Weekends say "Weekend recap" / "Week ahead"; a section with no data is not shown.
import {
  ArrowRight, BookOpen, CalendarDays, ChartColumn, Coins, Languages, ScanSearch, Search, ShieldCheck, Star, Table2,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Carousel, type AgendaDay, Tabs, VisitMarker, WeekAgenda, YourStocks } from "@/components/home/interactive";
import { TopicArt } from "@/components/ui/cover";
import { ButtonLink, Ico, SectionHeader, SymbolBadge, T } from "@/components/ui/primitives";
import { DataCard, StoryCard, ThumbRow } from "@/components/ui/stories";
import { BRAND } from "@/lib/brand";
import { groupCategories, isNews } from "@/lib/categories";
import { type WebEvent, type WebItem, getFeed, getHighlights, getRecentLite, getResults, getUpcoming } from "@/lib/data";
import { keyFigure } from "@/lib/facts";
import { currentTime, dayLabel, formatClock, formatLongDateTime, pktDay } from "@/lib/format";
import { ago, greeting, isWeekend, marketOpen, tradingWeek } from "@/lib/market";
import { SECTORS, topicOfText } from "@/lib/topics";

export const revalidate = 60;
export const metadata: Metadata = {
  title: { absolute: `${BRAND.name}: Pakistan's stock market news, explained simply` },
  description: BRAND.tagline,
};

const EVENT_LABEL: Record<WebEvent["kind"], { en: string; ur: string }> = {
  board: { en: "Board meeting", ur: "بورڈ میٹنگ" },
  agm: { en: "AGM", ur: "AGM" },
  eogm: { en: "EOGM", ur: "EOGM" },
  briefing: { en: "Corporate briefing", ur: "کارپوریٹ بریفنگ" },
  book_closure: { en: "Book closure", ur: "بک کلوژر" },
};

/** Lead story: the most important company filing with a headline number, else the newest highlight. */
function pickStories(highlights: WebItem[], filings: WebItem[]) {
  const filingFirst = [...highlights].sort((a, b) => Number(isNews(a.source_id)) - Number(isNews(b.source_id)));
  const lead = filingFirst.find((i) => !isNews(i.source_id) && keyFigure(i.facts)) ?? filingFirst[0] ?? filings[0];
  const pool = [...filingFirst, ...filings.filter((f) => f.importance >= 2)];
  const seen = new Set([lead?.id]);
  const top: WebItem[] = [];
  for (const it of pool) {
    if (top.length === 4) break;
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    top.push(it);
  }
  return { lead, top };
}

function StatusPill({ open }: { open: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-hairline bg-background px-3 py-1 text-caption text-fg-secondary">
      <span aria-hidden className={`size-2 rounded-full ${open ? "bg-positive" : "bg-fg-tertiary"}`} />
      <T en={open ? "PSX open" : "PSX closed"} ur={open ? "PSX کھلی ہے" : "PSX بند ہے"} />
    </span>
  );
}

function StatCard({ icon, value, label, href }: { icon: typeof Star; value: number; label: { en: string; ur: string }; href: string }) {
  return (
    <Link href={href} className="group flex cursor-pointer flex-col gap-3 rounded-[var(--radius-card)] bg-surface p-5 transition-colors duration-150 hover:bg-hairline/60">
      <Ico icon={icon} className="text-fg-secondary" />
      <span className="tabular text-display-sm">{value}</span>
      <span className="text-caption text-fg-secondary">
        <T en={label.en} ur={label.ur} />
      </span>
    </Link>
  );
}

function EventRow({ e }: { e: WebEvent }) {
  const label = EVENT_LABEL[e.kind];
  return (
    <li>
      <Link href={`/item/${e.item_id}`} className="flex cursor-pointer items-center gap-3 border-b border-hairline py-3 hover:bg-surface md:-mx-3 md:px-3">
        <span className="tabular w-20 shrink-0 text-caption text-fg-tertiary">{e.event_time ? <bdi dir="ltr">{formatClock(e.event_time)}</bdi> : "—"}</span>
        {e.symbol && <SymbolBadge symbol={e.symbol} />}
        <span className="text-body">
          <T en={label.en} ur={label.ur} />
        </span>
        <span className="ms-auto truncate text-caption text-fg-tertiary">{e.company_name}</span>
      </Link>
    </li>
  );
}

export default async function Home() {
  const now = currentTime();
  const weekend = isWeekend(now);
  const open = marketOpen(now);
  const [highlights, filings, news, results, events, recent] = await Promise.all([
    getHighlights(24),
    getFeed({ source: "filings", limit: 15 }),
    getFeed({ source: "news", importantOnly: true, limit: 15 }),
    getResults(30),
    getUpcoming(undefined, 21),
    getRecentLite(7),
  ]);
  const { lead, top } = pickStories(highlights, filings);

  // The last day with filings: today on a busy weekday, otherwise the last trading day.
  const latestDay = pktDay(filings[0]?.sort_time ?? highlights[0]?.sort_time ?? now.toISOString());
  const latestIsToday = latestDay === pktDay(now);
  const onDay = (i: { sort_time: string }) => pktDay(i.sort_time) === latestDay;
  const dayName = latestIsToday ? null : dayLabel(`${latestDay}T12:00:00+05:00`, now);
  const resultsDay = results.filter(onDay);
  const dividendCats = groupCategories("dividends") ?? [];
  const dividends = recent.filter((i) => onDay(i) && (dividendCats.includes(i.category) || "cash_dividend_rs" in i.facts));
  const week = tradingWeek(now);
  const inWeek = (e: WebEvent) => e.event_date >= week[0] && e.event_date <= week[4];
  const boardWeek = events.filter((e) => e.kind === "board" && inWeek(e));
  const closuresWeek = events.filter((e) => e.kind === "book_closure" && (inWeek(e) || (e.end_date ?? "") >= week[0] && e.event_date <= week[4]));
  const weekWord = weekend ? { en: "next week", ur: "اگلے ہفتے" } : { en: "this week", ur: "اس ہفتے" };
  const dayWord = dayName ? { en: `on ${dayName.en}`, ur: dayName.ur } : { en: "today", ur: "آج" };
  const stats = [
    { icon: ChartColumn, value: resultsDay.length, label: { en: `Results ${dayWord.en}`, ur: `رزلٹس ${dayWord.ur}` }, href: "/results" },
    { icon: Coins, value: dividends.length, label: { en: `Dividends announced ${dayWord.en}`, ur: `ڈیویڈنڈ ${dayWord.ur}` }, href: "/latest?type=dividends" },
    { icon: Users, value: boardWeek.length, label: { en: `Board meetings ${weekWord.en}`, ur: `بورڈ میٹنگز ${weekWord.ur}` }, href: "/calendar?kind=board" },
    { icon: CalendarDays, value: closuresWeek.length, label: { en: `Book closures ${weekWord.en}`, ur: `بک کلوژر ${weekWord.ur}` }, href: "/calendar?kind=closure" },
  ];

  const agenda: AgendaDay[] = week.map((d) => {
    const dayEvents = events.filter((e) => e.event_date === d);
    const label = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
    const ur = ["پیر", "منگل", "بدھ", "جمعرات", "جمعہ"][week.indexOf(d)];
    return {
      date: d,
      en: `${label} ${Number(d.slice(8))}`,
      ur: `${ur} ${Number(d.slice(8))}`,
      count: dayEvents.length,
      panel: dayEvents.length ? (
        <ul className="border-t border-hairline">
          {dayEvents.slice(0, 8).map((e) => (
            <EventRow key={`${e.item_id}-${e.kind}`} e={e} />
          ))}
        </ul>
      ) : (
        <p className="py-4 text-body text-fg-secondary">
          <T en="No board meetings, AGMs or book closures on this day." ur="اس دن کوئی میٹنگ یا بک کلوژر نہیں۔" />
        </p>
      ),
    };
  });
  const today = pktDay(now);
  const initialDay = week.includes(today) ? today : (agenda.find((d) => d.count) ?? agenda[0]).date;

  const sectorCounts = SECTORS.map((s) => ({
    ...s,
    count: recent.filter((i) => (i.sector && s.psx.includes(i.sector)) || (isNews(i.source_id) && topicOfText(`${i.headline_en ?? i.source_title} ${i.body_en ?? ""}`) === s.topic)).length,
  }));
  const updatedAt = [...filings, ...news].map((i) => i.created_at).sort().at(-1);
  const g = greeting(now);
  const longDate = formatLongDateTime(now.toISOString()).split(",")[0].replace(/ 20\d\d$/, "");


  return (
    <div className="space-y-12 md:space-y-16">
      <VisitMarker />

      {/* 1. Hero: full for new visitors, one line for returning ones (switched before paint, no layout shift). */}
      <section aria-label="Welcome" className="hero-full full-bleed bg-[linear-gradient(180deg,color-mix(in_srgb,var(--brand)_7%,var(--background)),var(--background))]">
        <div className="page-container grid items-center gap-10 pb-10 pt-12 md:pb-14 md:pt-20 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            <div className="flex flex-wrap items-center gap-3 text-caption text-fg-secondary">
              <time>{longDate}</time>
              <StatusPill open={open} />
            </div>
            <h1 className="text-display-sm text-balance md:text-display">
              <T en="Pakistan's stock market news, explained simply" ur="پاکستان اسٹاک مارکیٹ کی خبریں، آسان زبان میں" />
            </h1>
            <p className="ui-en ur text-[22px] leading-[44px] text-fg-secondary" lang="ur">
              پاکستان اسٹاک مارکیٹ کی خبریں، آسان زبان میں
            </p>
            <p className="max-w-[560px] text-[17px] leading-[26px] text-fg-secondary">
              <T
                en="Every PSX company announcement, results and dividend, summarised in plain English and Urdu within minutes, with every number checked against the filing."
                ur="ہر PSX اعلان، رزلٹس اور ڈیویڈنڈ، آسان اردو اور انگریزی میں، ہر نمبر اصل فائلنگ سے چیک شدہ۔"
              />
            </p>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="#top-stories" variant="primary">
                {weekend ? <T en="See the latest news" ur="تازہ خبریں" /> : <T en="See today's news" ur="آج کی خبریں" />}
              </ButtonLink>
              <ButtonLink href="/my-stocks">
                <Ico icon={Star} size={18} />
                <T en="Add your stocks" ur="اپنے شیئرز شامل کریں" />
              </ButtonLink>
            </div>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-fg-tertiary">
              <span className="inline-flex items-center gap-1.5">
                <Ico icon={ShieldCheck} size={16} /> <T en="Every story linked to its PSX filing" ur="ہر خبر اصل فائلنگ سے منسلک" />
              </span>
              <span aria-hidden>·</span>
              <T en="Free" ur="مفت" />
              <span aria-hidden>·</span>
              <T en="English & Urdu" ur="اردو اور انگریزی" />
            </p>
          </div>
          {lead && (
            <div className="lg:col-span-5">
              <StoryCard item={lead} now={now} size="lead" />
            </div>
          )}
        </div>
      </section>
      <section aria-label="Today" className="hero-compact flex flex-wrap items-center gap-3 pt-8">
        <p className="text-title">
          <T en={g.en} ur={g.ur} />
        </p>
        <span className="text-caption text-fg-tertiary">{longDate}</span>
        <StatusPill open={open} />
      </section>

      {/* 2. Today at a glance */}
      {stats.some((s) => s.value > 0) && (
        <section aria-labelledby="glance" className="space-y-5">
          <SectionHeader id="glance" size="headline" title={weekend ? { en: "Weekend recap", ur: "ہفتے کا خلاصہ" } : { en: "Today at a glance", ur: "آج ایک نظر میں" }} />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            {stats.map((s) => (
              <StatCard key={s.href} {...s} />
            ))}
          </div>
        </section>
      )}

      {/* 3. Your stocks (only if this browser follows some) */}
      <YourStocks now={now.toISOString()} />

      {/* 4. Top stories */}
      {lead && (
        <section id="top-stories" aria-labelledby="top" className="scroll-mt-24 space-y-5">
          <SectionHeader id="top" size="headline" title={{ en: "Top stories", ur: "اہم خبریں" }} href="/latest" />
          <div className="grid gap-x-6 gap-y-10 lg:grid-cols-12">
            <div className="top-lead lg:col-span-6">
              <StoryCard item={lead} now={now} size="lead" />
            </div>
            <div className="top-grid no-scrollbar -mx-5 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-px-5 px-5 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-6 sm:overflow-visible sm:px-0 lg:col-span-12 lg:grid-cols-4 [&>*]:w-[78%] [&>*]:shrink-0 [&>*]:snap-start sm:[&>*]:w-auto">
              {top.map((it) => (
                <StoryCard key={it.id} item={it} now={now} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 5. Results */}
      {resultsDay.length > 0 && (
        <section aria-labelledby="results-today" className="space-y-5">
          <SectionHeader
            id="results-today"
            size="headline"
            title={dayName ? { en: `Results · ${dayName.en}`, ur: `رزلٹس · ${dayName.ur}` } : { en: "Results today", ur: "آج کے رزلٹس" }}
          />
          <Carousel label="results" seeAll={{ href: "/results", en: "All results", ur: "تمام رزلٹس" }}>
            {resultsDay.slice(0, 12).map((it) => (
              <DataCard key={it.id} item={it} />
            ))}
          </Carousel>
        </section>
      )}

      {/* 6. Latest updates */}
      <section aria-labelledby="latest" className="max-w-[820px] space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="latest" className="text-headline">
            <T en="Latest updates" ur="تازہ ترین" />
          </h2>
          {updatedAt && <span className="text-caption text-fg-tertiary">Updated {ago(updatedAt, now)}</span>}
        </div>
        <Tabs
          tabs={[
            {
              key: "filings", en: "Company filings", ur: "کمپنی فائلنگز",
              panel: (
                <div>
                  {filings.map((it) => <ThumbRow key={it.id} item={it} now={now} />)}
                  <ButtonLink href="/latest?type=filings" className="mt-4">
                    <T en="Load more filings" ur="مزید فائلنگز" />
                  </ButtonLink>
                </div>
              ),
            },
            {
              key: "economy", en: "Economy & markets", ur: "معیشت اور مارکیٹ",
              panel: (
                <div>
                  {news.map((it) => <ThumbRow key={it.id} item={it} now={now} />)}
                  <ButtonLink href="/latest?type=economy" className="mt-4">
                    <T en="Load more news" ur="مزید خبریں" />
                  </ButtonLink>
                </div>
              ),
            },
          ]}
        />
      </section>

      {/* 7. This week */}
      {agenda.some((d) => d.count > 0) && (
        <section aria-labelledby="week" className="space-y-5">
          <SectionHeader id="week" size="headline" title={weekend ? { en: "Week ahead", ur: "اگلا ہفتہ" } : { en: "This week", ur: "اس ہفتے" }} href="/calendar" linkLabel={{ en: "Full calendar", ur: "مکمل کیلنڈر" }} />
          <WeekAgenda days={agenda} initial={initialDay} />
        </section>
      )}

      {/* 8. Sectors */}
      <section aria-labelledby="sectors" className="space-y-5">
        <SectionHeader id="sectors" size="headline" title={{ en: "Sectors", ur: "سیکٹرز" }} />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {sectorCounts.map((s, i) => (
            <Link key={s.slug} href={`/sector/${s.slug}`} className="lift group cursor-pointer space-y-2">
              <div className="overflow-hidden rounded-[var(--radius-card)] border border-hairline">
                <TopicArt topic={s.topic} seedId={i + 1} ratio="4:3" />
              </div>
              <p className="text-title">
                <T en={s.en} ur={s.ur} />
              </p>
              <p className="-mt-1.5 text-caption text-fg-tertiary">
                {s.count ? <T en={`${s.count} update${s.count === 1 ? "" : "s"} this week`} ur={`اس ہفتے ${s.count} اپ ڈیٹس`} /> : <T en="No updates this week" ur="اس ہفتے کوئی اپ ڈیٹ نہیں" />}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* 9. What you can do here */}
      <section aria-labelledby="features" className="space-y-5">
        <SectionHeader id="features" size="headline" title={{ en: "What you can do here", ur: "یہاں آپ کیا کر سکتے ہیں" }} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Languages, href: "/latest", en: "Read in Urdu or English", ur: "اردو یا انگریزی میں پڑھیں", d: "Switch any story between English and Urdu with one tap at the top of the page." },
            { icon: Table2, href: "/results", en: "Track results", ur: "رزلٹس ٹریکر", d: "Every company's latest revenue, profit, EPS and dividend in one sortable table." },
            { icon: CalendarDays, href: "/calendar", en: "Dividend & AGM calendar", ur: "ڈیویڈنڈ اور AGM کیلنڈر", d: "Board meetings, AGMs and book closures, day by day." },
            { icon: Star, href: "/my-stocks", en: "Follow your stocks", ur: "اپنے شیئرز فالو کریں", d: "Pick your companies and see their news first. No account needed." },
          ].map((f) => (
            <Link key={f.href} href={f.href} className="group flex cursor-pointer flex-col gap-4 rounded-[var(--radius-card)] border border-hairline p-6 transition-colors duration-150 hover:bg-surface">
              <span className="grid size-11 place-items-center rounded-full bg-surface text-fg group-hover:bg-background">
                <Ico icon={f.icon} />
              </span>
              <span className="text-title">
                <T en={f.en} ur={f.ur} />
              </span>
              <span className="text-body text-fg-secondary">{f.d}</span>
              <span className="mt-auto inline-flex items-center gap-1 text-caption text-brand">
                <T en="Open" ur="کھولیں" /> <Ico icon={ArrowRight} size={16} className="rtl:rotate-180" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* 10. How it works */}
      <section aria-labelledby="how" className="space-y-6 rounded-[var(--radius-card)] bg-surface p-6 md:p-10">
        <SectionHeader id="how" size="headline" title={{ en: "How it works", ur: "یہ کیسے کام کرتا ہے" }} href="/about" linkLabel={{ en: "About our sources", ur: "ہمارے ذرائع" }} />
        <ol className="grid gap-8 md:grid-cols-3">
          {[
            { icon: ScanSearch, en: "We read every PSX filing", ur: "ہم ہر PSX فائلنگ پڑھتے ہیں", d: "Company announcements, PSX and SECP notices, and business news, as soon as they are published." },
            { icon: ShieldCheck, en: "We check every number", ur: "ہم ہر نمبر چیک کرتے ہیں", d: "A number appears only if it is found in the original document. Anything doubtful waits for a person." },
            { icon: BookOpen, en: "We explain it simply", ur: "ہم آسان زبان میں بتاتے ہیں", d: "Short, plain summaries in English and Urdu, always linked to the original. Facts only, never advice." },
          ].map((s, i) => (
            <li key={s.en} className="space-y-3">
              <span className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-background">
                  <Ico icon={s.icon} />
                </span>
                <span className="tabular text-caption text-fg-tertiary">Step {i + 1}</span>
              </span>
              <p className="text-title">
                <T en={s.en} ur={s.ur} />
              </p>
              <p className="text-body text-fg-secondary">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* 12. Stay updated (11, "Learn the basics", appears once the Learn articles exist) */}
      <section aria-labelledby="stay" className="full-bleed border-y border-hairline">
        <div className="page-container flex flex-col items-start gap-6 py-12 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <h2 id="stay" className="text-headline">
              <T en="Stay on top of your companies" ur="اپنی کمپنیوں سے باخبر رہیں" />
            </h2>
            <p className="text-body text-fg-secondary">
              <T en="Add the stocks you own or watch, and their filings appear first on every visit." ur="اپنے شیئرز شامل کریں، ان کی خبریں سب سے پہلے دیکھیں۔" />
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {BRAND.whatsappChannelUrl && (
              <ButtonLink href={BRAND.whatsappChannelUrl} variant="primary">WhatsApp Channel</ButtonLink>
            )}
            {BRAND.facebookPageUrl && <ButtonLink href={BRAND.facebookPageUrl}>Facebook</ButtonLink>}
            <ButtonLink href="/my-stocks" variant={BRAND.whatsappChannelUrl ? "secondary" : "primary"}>
              <Ico icon={Star} size={18} />
              <T en="Add your stocks" ur="اپنے شیئرز شامل کریں" />
            </ButtonLink>
            <ButtonLink href="/search">
              <Ico icon={Search} size={18} />
              <T en="Find a company" ur="کمپنی تلاش کریں" />
            </ButtonLink>
          </div>
        </div>
      </section>

    </div>
  );
}
