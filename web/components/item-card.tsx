import Link from "next/link";
import { Icon } from "@/components/icons";
import { L } from "@/components/l";
import { categoryLabel, groupOf, isNews, sourceLabel } from "@/lib/categories";
import type { WebItem } from "@/lib/data";
import { type Chip, keyChips } from "@/lib/facts";
import { pktDay, pktDayOffset, stripSymbol } from "@/lib/format";
import { UrduText } from "@/components/urdu-text";

const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", hour: "numeric", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", weekday: "long", day: "numeric", month: "long" });
const DAYS_UR = ["اتوار", "پیر", "منگل", "بدھ", "جمعرات", "جمعہ", "ہفتہ"];
const MONTHS_UR = ["جنوری", "فروری", "مارچ", "اپریل", "مئی", "جون", "جولائی", "اگست", "ستمبر", "اکتوبر", "نومبر", "دسمبر"];

export function CategoryBadge({ category }: { category: string }) {
  const g = groupOf(category);
  const label = categoryLabel(category);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${g.badge}`}>
      <Icon name={g.icon} className="size-3" />
      <L en={label.en} ur={label.ur} />
    </span>
  );
}

function Who({ item }: { item: WebItem }) {
  return item.symbol ? (
    <Link href={`/company/${encodeURIComponent(item.symbol)}`} className="font-bold text-brand hover:underline">
      {item.symbol}
    </Link>
  ) : (
    <span className="font-semibold text-foreground/80">{sourceLabel(item.source_id)}</span>
  );
}

export function Chips({ chips, size = "sm" }: { chips: Chip[]; size?: "sm" | "lg" }) {
  if (!chips.length) return null;
  const tone = { pos: "text-emerald-700 dark:text-emerald-400", neg: "text-rose-700 dark:text-rose-400", neutral: "" };
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span
          key={c.en}
          className={`rounded-lg border border-border bg-background ${size === "lg" ? "px-3 py-1.5" : "px-2 py-1"} text-xs`}
        >
          <span className="text-muted">
            <L en={c.en} ur={c.ur} />
          </span>{" "}
          <b className={`tabular-nums ${size === "lg" ? "text-base" : ""} ${tone[c.tone]}`}>
            <span className="ui-en">{c.value}</span>
            <span className="ui-ur ur ur-tight !leading-normal">
              <UrduText text={c.valueUr} />
            </span>
          </b>
        </span>
      ))}
    </div>
  );
}

function Headline({ item, className = "" }: { item: WebItem; className?: string }) {
  return (
    <Link href={`/item/${item.id}`} className={`block hover:text-brand ${className}`}>
      {item.headline_en && <span className="en-only block">{item.headline_en}</span>}
      {item.headline_ur && (
        <span className="ur-only ur block" lang="ur">
          <UrduText text={item.headline_ur} />
        </span>
      )}
    </Link>
  );
}

function Body({ item }: { item: WebItem }) {
  return (
    <>
      {item.body_en && <p className="en-only text-sm leading-relaxed text-foreground/80">{item.body_en}</p>}
      {item.body_ur && (
        <p className="ur-only ur text-sm text-foreground/80" lang="ur">
          <UrduText text={item.body_ur} />
        </p>
      )}
    </>
  );
}

function SourceLink({ item }: { item: WebItem }) {
  return (
    <a
      href={item.source_url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
    >
      <Icon name="external" className="size-3" />
      {isNews(item.source_id) ? sourceLabel(item.source_id) : <L en="Original filing" ur="اصل فائلنگ" />}
    </a>
  );
}

/** Importance 3: results, dividends, policy news. Big card with key numbers. */
export function HighlightCard({ item }: { item: WebItem }) {
  const g = groupOf(item.category);
  return (
    <article className={`space-y-2 rounded-2xl border border-l-4 border-border ${g.accent} bg-card p-4 shadow-sm`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <Who item={item} />
        {item.company_name && item.company_name !== item.symbol && <span className="truncate">{item.company_name}</span>}
        <CategoryBadge category={item.category} />
        <time dateTime={item.sort_time} className="ms-auto">
          {timeFmt.format(new Date(item.sort_time))}
        </time>
      </div>
      <Headline item={item} className="text-lg font-bold leading-snug" />
      <Chips chips={keyChips(item.facts)} />
      <Body item={item} />
      <div className="flex items-center gap-4 pt-1">
        <Link href={`/item/${item.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
          <L en="Details" ur="تفصیل" /> <Icon name="arrow-right" className="size-3.5" />
        </Link>
        <SourceLink item={item} />
      </div>
    </article>
  );
}

/** Importance 2: notable items (meetings, notices, news). */
export function ItemCard({ item }: { item: WebItem }) {
  const g = groupOf(item.category);
  return (
    <article className={`space-y-1.5 rounded-xl border border-l-4 border-border ${g.accent} bg-card p-3`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <Who item={item} />
        <CategoryBadge category={item.category} />
        <time dateTime={item.sort_time} className="ms-auto">
          {timeFmt.format(new Date(item.sort_time))}
        </time>
      </div>
      <Headline item={item} className="font-semibold leading-snug" />
      <Body item={item} />
      <SourceLink item={item} />
    </article>
  );
}

/** Importance 1: routine filings, one line. */
export function CompactRow({ item }: { item: WebItem }) {
  const g = groupOf(item.category);
  return (
    <Link
      href={`/item/${item.id}`}
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-card"
    >
      <Icon name={g.icon} className="size-4 shrink-0 text-muted" />
      <span className="w-20 shrink-0 truncate font-semibold text-brand">{item.symbol ?? sourceLabel(item.source_id)}</span>
      <span className="min-w-0 flex-1 truncate">
        <span className="en-only">{stripSymbol(item.headline_en, item.symbol)}</span>
        <span className="ur-only ur ur-tight">{stripSymbol(item.headline_ur, item.symbol)}</span>
      </span>
      <time dateTime={item.sort_time} className="shrink-0 text-xs text-muted">
        {timeFmt.format(new Date(item.sort_time))}
      </time>
    </Link>
  );
}

function DayHeader({ day }: { day: string }) {
  const d = new Date(`${day}T12:00:00+05:00`);
  const today = pktDay();
  const yesterday = pktDayOffset(-1);
  const en = day === today ? "Today" : day === yesterday ? "Yesterday" : dayFmt.format(d);
  const ur = day === today ? "آج" : day === yesterday ? "کل" : `${DAYS_UR[d.getUTCDay()]}، ${d.getUTCDate()} ${MONTHS_UR[d.getUTCMonth()]}`;
  return (
    <h2 className="sticky top-[var(--header-h)] z-10 -mx-1 bg-background/95 px-1 py-2 text-sm font-bold text-muted backdrop-blur">
      <L en={en} ur={ur} />
    </h2>
  );
}

/** A feed grouped by Pakistan-time day; card size follows importance. */
export function Feed({ items, empty }: { items: WebItem[]; empty?: { en: string; ur: string } }) {
  if (!items.length) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-muted">
        <L en={empty?.en ?? "Nothing here yet."} ur={empty?.ur ?? "ابھی یہاں کچھ نہیں۔"} />
      </p>
    );
  }
  const days: { day: string; items: WebItem[] }[] = [];
  for (const it of items) {
    const day = pktDay(it.sort_time);
    if (days.at(-1)?.day !== day) days.push({ day, items: [] });
    days.at(-1)!.items.push(it);
  }
  return (
    <div className="space-y-2">
      {days.map((d) => (
        <section key={d.day} className="space-y-2">
          <DayHeader day={d.day} />
          {d.items.map((it) =>
            it.importance >= 3 ? (
              <HighlightCard key={it.id} item={it} />
            ) : it.importance === 2 ? (
              <ItemCard key={it.id} item={it} />
            ) : (
              <CompactRow key={it.id} item={it} />
            ),
          )}
        </section>
      ))}
    </div>
  );
}

/** Simple list (search results, company page): uniform cards, newest first. */
export function ItemList({ items, empty }: { items: WebItem[]; empty?: string }) {
  if (!items.length) return <p className="text-muted">{empty ?? "Nothing here yet."}</p>;
  return (
    <div className="space-y-2">
      {items.map((it) => (it.importance >= 3 ? <HighlightCard key={it.id} item={it} /> : <ItemCard key={it.id} item={it} />))}
    </div>
  );
}

