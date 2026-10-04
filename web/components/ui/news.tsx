// How a story appears: a hairline-separated row in lists, or a featured card for top stories.
import Link from "next/link";
import { KeyFigurePill, MetaLine } from "@/components/ui/primitives";
import { UrduText } from "@/components/urdu-text";
import { categoryLabel, isNews, sourceLabel } from "@/lib/categories";
import type { WebItem } from "@/lib/data";
import { keyChips, keyFigure } from "@/lib/facts";
import { formatRowTime, stripSymbol } from "@/lib/format";

function sourceName(item: WebItem): { en: string; ur: string } {
  if (isNews(item.source_id)) return { en: sourceLabel(item.source_id), ur: sourceLabel(item.source_id) };
  return item.source_id === "secp_notices" ? { en: "SECP notice", ur: "SECP نوٹس" } : { en: "PSX filing", ur: "PSX فائلنگ" };
}

/** "DGKC: annual general meeting…" shown beside a DGKC badge becomes "Annual general meeting…". */
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Headline({ item, className, urClass }: { item: WebItem; className: string; urClass: string }) {
  const en = capitalise(stripSymbol(item.headline_en, item.symbol));
  const ur = stripSymbol(item.headline_ur, item.symbol);
  return (
    <Link href={`/item/${item.id}`} className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-[var(--radius-card)] focus-visible:after:outline-2 focus-visible:after:outline-brand">
      {en && <span className={`en-only block ${className}`}>{en}</span>}
      {ur && (
        <span className={`ur-only ur block ${urClass}`} lang="ur">
          <UrduText text={ur} />
        </span>
      )}
    </Link>
  );
}

function Summary({ item, lines = 2 }: { item: WebItem; lines?: 2 | 3 }) {
  const clamp = lines === 2 ? "line-clamp-2" : "line-clamp-3";
  return (
    <>
      {item.body_en && <p className={`en-only text-body text-fg-secondary ${clamp}`}>{item.body_en}</p>}
      {item.body_ur && (
        <p className={`ur-only ur text-[17px] leading-[34px] text-fg-secondary ${clamp}`} lang="ur">
          <UrduText text={item.body_ur} />
        </p>
      )}
    </>
  );
}

function Source({ item }: { item: WebItem }) {
  const s = sourceName(item);
  return (
    <p className="text-caption text-fg-tertiary">
      <span className="ui-en">{s.en}</span>
      <span className="ui-ur ur ur-tight !leading-normal">{s.ur}</span>
    </p>
  );
}

/** A story in a list: meta line, title, two-line summary, source once; key figure on the right (desktop). */
export function NewsRow({ item, now }: { item: WebItem; now: Date }) {
  const figure = keyFigure(item.facts);
  return (
    <article className="group relative -mx-3 border-b border-hairline px-3 py-5 transition-colors duration-150 hover:bg-surface md:-mx-4 md:px-4">
      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1 space-y-1.5">
          <MetaLine
            symbol={item.symbol}
            symbolHref={item.symbol ? `/company/${item.symbol}` : undefined}
            category={categoryLabel(item.category)}
            time={formatRowTime(item.sort_time, now)}
          />
          <h3>
            <Headline item={item} className="text-title text-fg" urClass="text-[19px] leading-[38px] font-semibold" />
          </h3>
          <Summary item={item} />
          <Source item={item} />
        </div>
        {figure && (
          <div className="hidden shrink-0 self-center md:block">
            <KeyFigurePill figure={figure} />
          </div>
        )}
      </div>
    </article>
  );
}

/** A top story: raised card, bigger title. `lead` is the single most important story of the page. */
export function FeaturedCard({ item, now, lead = false, plain = false }: { item: WebItem; now: Date; lead?: boolean; plain?: boolean }) {
  const figure = keyFigure(item.facts);
  // The lead story shows all its key numbers (up to 3); secondary cards show one.
  const leadFigures = lead
    ? keyChips(item.facts).map((c) => ({ ...c, value: c.value.replace(/ million$/, "m").replace(/ billion$/, "bn") }))
    : [];
  return (
    <article
      className={
        plain // secondary top stories beside the lead: no card, just hairlines between them
          ? "relative flex flex-col gap-2 py-5 transition-colors duration-150 hover:bg-surface md:-mx-4 md:px-4"
          : `relative flex flex-col gap-3 rounded-[var(--radius-card)] border border-hairline bg-surface-raised transition-colors duration-150 hover:border-fg-tertiary/50 ${
              lead ? "p-6 md:p-8" : "h-full p-5"
            }`
      }
    >
      <MetaLine
        symbol={item.symbol}
        symbolHref={item.symbol ? `/company/${item.symbol}` : undefined}
        category={categoryLabel(item.category)}
        time={formatRowTime(item.sort_time, now)}
      />
      <h3>
        <Headline
          item={item}
          className={lead ? "text-display-sm md:text-headline lg:text-display-sm" : "text-title"}
          urClass={lead ? "text-[26px] leading-[52px] font-semibold" : "text-[19px] leading-[38px] font-semibold"}
        />
      </h3>
      {lead && <Summary item={item} lines={3} />}
      {lead && leadFigures.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {leadFigures.map((f) => (
            <KeyFigurePill key={f.en} figure={f} />
          ))}
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-1">
        <Source item={item} />
        {!lead && figure && <KeyFigurePill figure={figure} />}
      </div>
    </article>
  );
}
