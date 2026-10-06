// Visual story components: cards with covers (lead, medium), thumbnail rows, results data cards.
import Link from "next/link";
import { CoverImage, type Ratio } from "@/components/ui/cover";
import { MetaLine } from "@/components/ui/primitives";
import { UrduText } from "@/components/urdu-text";
import { categoryLabel, isNews, sourceLabel } from "@/lib/categories";
import type { WebItem } from "@/lib/data";
import { formatRowTime, stripSymbol } from "@/lib/format";
import { TOPIC_LABEL, topicOf } from "@/lib/topics";

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One-line subheading: the first sentence of the summary. */
export function dek(text: string | null, urdu = false): string {
  if (!text) return "";
  const first = text.split(urdu ? /(?<=۔)\s+/ : /(?<=[.!?])\s+(?=[A-Z0-9])/)[0];
  return first.length > 160 ? `${first.slice(0, 157).trimEnd()}…` : first;
}

export function headlineEn(item: WebItem) {
  return capitalise(stripSymbol(item.headline_en, item.symbol) || item.source_title);
}

/** Eyebrow for a story: the company badge and category for filings, the topic for news. */
function Meta({ item, now }: { item: WebItem; now: Date }) {
  const news = isNews(item.source_id);
  return (
    <MetaLine
      symbol={news ? null : item.symbol}
      category={news ? TOPIC_LABEL[topicOf(item)] : categoryLabel(item.category)}
      time={formatRowTime(item.sort_time, now)}
    />
  );
}

function Title({ item, className, urClass }: { item: WebItem; className: string; urClass: string }) {
  const ur = stripSymbol(item.headline_ur, item.symbol);
  return (
    <Link href={`/item/${item.id}`} className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-[var(--radius-card)] focus-visible:after:outline-2 focus-visible:after:outline-brand">
      <span className={`en-only block ${className}`}>{headlineEn(item)}</span>
      {ur && (
        <span className={`ur-only ur block ${urClass}`} lang="ur">
          <UrduText text={ur} />
        </span>
      )}
    </Link>
  );
}

function Dek({ item, lines = 2 }: { item: WebItem; lines?: 2 | 3 }) {
  const clamp = lines === 3 ? "line-clamp-3" : "line-clamp-2";
  const en = dek(item.body_en);
  const ur = dek(item.body_ur, true);
  return (
    <>
      {en && <p className={`en-only text-body text-fg-secondary ${clamp}`}>{en}</p>}
      {ur && (
        <p className={`ur-only ur text-[17px] leading-[34px] text-fg-secondary ${clamp}`} lang="ur">
          <UrduText text={ur} />
        </p>
      )}
    </>
  );
}

function Source({ item }: { item: WebItem }) {
  const label = isNews(item.source_id) ? sourceLabel(item.source_id) : item.source_id === "secp_notices" ? "SECP notice" : "PSX filing";
  return <p className="text-caption text-fg-tertiary">{label}</p>;
}

/** Cover + text. "lead" is the largest story on the page; "medium" for grids and carousels. */
export function StoryCard({ item, now, size = "medium", ratio, history }: {
  item: WebItem;
  now: Date;
  size?: "lead" | "medium";
  ratio?: Ratio;
  history?: number[];
}) {
  const lead = size === "lead";
  return (
    <article className="lift group relative flex h-full cursor-pointer flex-col gap-3">
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-hairline">
        <CoverImage item={item} ratio={ratio ?? (lead ? "16:9" : "4:3")} history={history} />
      </div>
      <div className="space-y-1.5">
        <Meta item={item} now={now} />
        <h3>
          <Title
            item={item}
            className={lead ? "text-headline group-hover:text-fg-secondary" : "text-title group-hover:text-fg-secondary"}
            urClass={lead ? "text-[24px] leading-[48px] font-semibold" : "text-[19px] leading-[38px] font-semibold"}
          />
        </h3>
        <Dek item={item} lines={lead ? 3 : 2} />
        <Source item={item} />
      </div>
    </article>
  );
}

/** A row with a square thumbnail on the end side: for long lists of updates. */
export function ThumbRow({ item, now }: { item: WebItem; now: Date }) {
  return (
    <article className="lift group relative -mx-3 flex cursor-pointer items-start gap-4 border-b border-hairline px-3 py-4 transition-colors duration-150 hover:bg-surface md:-mx-4 md:px-4">
      <div className="min-w-0 flex-1 space-y-1">
        <Meta item={item} now={now} />
        <h3>
          <Title item={item} className="text-title" urClass="text-[18px] leading-[36px] font-semibold" />
        </h3>
        <Dek item={item} />
      </div>
      <div className="w-[72px] shrink-0 overflow-hidden rounded-[10px] border border-hairline md:w-[88px]">
        <CoverImage item={item} ratio="1:1" />
      </div>
    </article>
  );
}

/** A results data card for the "Results" carousel: the cover is the data card itself. */
export function DataCard({ item }: { item: WebItem }) {
  return (
    <article className="lift group relative w-[260px] shrink-0 cursor-pointer snap-start space-y-2.5 md:w-[300px]">
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-hairline">
        <CoverImage item={item} ratio="4:3" />
      </div>
      <p className="text-caption text-fg-secondary">{item.company_name ?? item.symbol}</p>
      <h3 className="-mt-1.5">
        <Title item={item} className="line-clamp-2 text-body font-semibold" urClass="text-[17px] leading-[34px] font-semibold line-clamp-2" />
      </h3>
    </article>
  );
}
