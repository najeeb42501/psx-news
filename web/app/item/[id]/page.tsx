// Item page: an article in the 680px reading column. Eyebrow, headline, date and source, the
// subheading, cover, key figures, what happened, what's next, the original filing, share, related.
import { CircleCheck, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CoverImage } from "@/components/ui/cover";
import { MetaLine, StatTile, T } from "@/components/ui/primitives";
import { ShareBar } from "@/components/ui/share";
import { ThumbRow, dek, headlineEn } from "@/components/ui/stories";
import { UrduText } from "@/components/urdu-text";
import { BRAND, SITE_URL } from "@/lib/brand";
import { categoryLabel, isNews, sourceLabel } from "@/lib/categories";
import { DISCLAIMER_EN, DISCLAIMER_UR } from "@/lib/compliance";
import { type WebItem, getCompanyItems, getItem, getRelated } from "@/lib/data";
import { keyChips } from "@/lib/facts";
import { currentTime, formatClock, formatLongDateTime, formatPlainDate, formatPlainDateUr, formatRowTime, pktDay, stripSymbol } from "@/lib/format";
import { TOPIC_LABEL, topicOf } from "@/lib/topics";

export const revalidate = 300;

async function load(id: string) {
  return Number.isInteger(Number(id)) ? getItem(Number(id)) : null;
}

export async function generateMetadata({ params }: PageProps<"/item/[id]">): Promise<Metadata> {
  const item = await load((await params).id);
  if (!item) return {};
  const title = item.headline_en ?? item.source_title;
  const image = `/api/og/item/${item.id}`;
  return {
    title,
    description: item.body_en ?? undefined,
    openGraph: { title, description: item.body_en ?? undefined, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, images: [image] },
  };
}

type Facts = Record<string, { value: string } | unknown> & {
  meeting_kind?: string;
  meeting_date?: { value: string };
  meeting_time?: string;
  book_closure_from?: { value: string };
  book_closure_to?: { value: string };
  profit_change_pct?: { value: number };
  period_end?: { value: string };
  profit_after_tax?: { value: number };
};

/** The rest of the summary after the subheading, one fact per bullet. */
function bullets(text: string | null, urdu = false): string[] {
  if (!text) return [];
  return text.split(urdu ? /(?<=۔)\s+/ : /(?<=[.!?])\s+(?=[A-Z0-9])/).slice(1).filter(Boolean);
}

/** Dated events from the filing that are still ahead. */
function whatsNext(item: WebItem, today: string) {
  const f = item.facts as Facts;
  const out: { date: string; en: string; ur: string; detail?: string }[] = [];
  const meeting = { board: ["Board meeting", "بورڈ میٹنگ"], agm: ["AGM", "AGM"], eogm: ["EOGM", "EOGM"], briefing: ["Corporate briefing", "کارپوریٹ بریفنگ"] }[f.meeting_kind ?? "board"] ?? ["Meeting", "میٹنگ"];
  if (f.meeting_date && f.meeting_date.value >= today) out.push({ date: f.meeting_date.value, en: meeting[0], ur: meeting[1], detail: formatClock(f.meeting_time) });
  if (f.book_closure_from && (f.book_closure_to?.value ?? f.book_closure_from.value) >= today) {
    const to = f.book_closure_to && f.book_closure_to.value !== f.book_closure_from.value ? f.book_closure_to.value : null;
    out.push({ date: f.book_closure_from.value, en: to ? `Book closure until ${formatPlainDate(to)}` : "Book closure", ur: to ? `بک کلوژر ${formatPlainDateUr(to)} تک` : "بک کلوژر" });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Profit after tax of the company's reported periods, oldest first (for the cover's mini chart). */
async function profitHistory(item: WebItem): Promise<number[] | undefined> {
  if (!item.symbol || item.category !== "results") return undefined;
  const results = (await getCompanyItems(item.symbol, 40)).filter((i) => i.category === "results");
  const points = results
    .map((i) => i.facts as Facts)
    .filter((f) => f.profit_after_tax && f.period_end)
    .sort((a, b) => a.period_end!.value.localeCompare(b.period_end!.value))
    .map((f) => f.profit_after_tax!.value);
  return points.length >= 2 ? points : undefined;
}

export default async function ItemPage({ params }: PageProps<"/item/[id]">) {
  const item = await load((await params).id);
  if (!item) notFound();
  const now = currentTime();
  const [related, history] = await Promise.all([item.symbol ? getRelated(item.symbol, item.id, 5) : Promise.resolve([]), profitHistory(item)]);
  const news = isNews(item.source_id);
  const figures = keyChips(item.facts).slice(0, 4);
  const change = (item.facts as Facts).profit_change_pct?.value;
  const next = whatsNext(item, pktDay(now));
  const alsoReported = (item.facts.also_reported as { source_id: string; url: string }[] | undefined) ?? [];
  const url = `${SITE_URL}/item/${item.id}`;
  const sourceName = news ? sourceLabel(item.source_id) : item.source_id === "secp_notices" ? "SECP" : "PSX";
  const enBullets = bullets(item.body_en);
  const urBullets = bullets(item.body_ur, true);
  const urHeadline = stripSymbol(item.headline_ur, item.symbol);

  return (
    <article className="mx-auto max-w-[680px] space-y-8 pt-8 md:pt-12">
      <header className="space-y-4">
        <MetaLine
          symbol={news ? null : item.symbol}
          symbolHref={item.symbol ? `/company/${encodeURIComponent(item.symbol)}` : undefined}
          category={news ? TOPIC_LABEL[topicOf(item)] : categoryLabel(item.category)}
          time={formatRowTime(item.sort_time, now)}
        />
        <h1 className="en-only text-display-sm text-balance md:text-display">{headlineEn(item)}</h1>
        {urHeadline && (
          <h1 className="ur-only ur text-[30px] leading-[56px] font-semibold" lang="ur">
            <UrduText text={urHeadline} />
          </h1>
        )}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-tertiary">
          <time dateTime={item.published_at ?? item.sort_time}>{formatLongDateTime(item.published_at ?? item.sort_time)}</time>
          <span aria-hidden>·</span>
          <span>{news ? sourceName : `${sourceName} filing`}</span>
          {item.company_name && item.symbol && (
            <>
              <span aria-hidden>·</span>
              <Link href={`/company/${encodeURIComponent(item.symbol)}`} className="text-brand hover:underline">
                {item.company_name}
              </Link>
            </>
          )}
        </p>
        {item.body_en && <p className="en-only text-[19px] leading-[30px] text-fg-secondary">{dek(item.body_en)}</p>}
        {item.body_ur && (
          <p className="ur-only ur text-[20px] leading-[40px] text-fg-secondary" lang="ur">
            <UrduText text={dek(item.body_ur, true)} />
          </p>
        )}
      </header>

      <div className="overflow-hidden rounded-[var(--radius-card)] border border-hairline">
        <CoverImage item={item} ratio="16:9" history={history} />
      </div>

      {figures.length > 0 && (
        <section aria-labelledby="figures" className="space-y-3">
          <h2 id="figures" className="text-title">
            <T en="Key figures" ur="اہم اعداد و شمار" />
          </h2>
          <div className={`grid gap-3 ${figures.length >= 3 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2"}`}>
            {figures.map((f, i) => (
              <StatTile
                key={f.en}
                figure={{ ...f, value: f.value.replace(/ million$/, "m").replace(/ billion$/, "bn") }}
                change={i === 0 && change !== undefined && /Profit|Loss/.test(f.en) ? { text: `${Math.abs(change)}% vs last year`, up: change >= 0 } : undefined}
              />
            ))}
          </div>
          <p className="flex items-center gap-1.5 text-caption text-fg-tertiary">
            <CircleCheck size={16} strokeWidth={1.5} aria-hidden className="text-positive" />
            <T en="Every number was checked against the original document." ur="ہر نمبر اصل دستاویز سے چیک کیا گیا۔" />
          </p>
        </section>
      )}

      {(enBullets.length > 0 || urBullets.length > 0) && (
        <section aria-labelledby="happened" className="space-y-3">
          <h2 id="happened" className="text-title">
            <T en="What happened" ur="کیا ہوا" />
          </h2>
          {enBullets.length > 0 && (
            <ul className="en-only list-disc space-y-2 ps-5 text-[17px] leading-[27px] marker:text-fg-tertiary">
              {enBullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          {urBullets.length > 0 && (
            <ul className="ur-only ur list-disc space-y-1 ps-6 text-[18px] leading-[36px] marker:text-fg-tertiary" lang="ur">
              {urBullets.map((b) => (
                <li key={b}>
                  <UrduText text={b} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {next.length > 0 && (
        <section aria-labelledby="next" className="space-y-3">
          <h2 id="next" className="text-title">
            <T en="What's next" ur="آگے کیا ہے" />
          </h2>
          <ol className="relative space-y-4 border-s border-hairline ps-6">
            {next.map((n) => (
              <li key={n.en} className="relative">
                <span aria-hidden className="absolute -start-[31px] top-1 grid size-[13px] place-items-center rounded-full border-2 border-background bg-fg" />
                <p className="tabular text-caption text-fg-tertiary">
                  <span className="ui-en">{formatPlainDate(n.date)}</span>
                  <span className="ui-ur ur ur-tight !leading-normal">{formatPlainDateUr(n.date)}</span>
                  {n.detail && <span> · {n.detail}</span>}
                </p>
                <p className="text-body font-medium">
                  <T en={n.en} ur={n.ur} />
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="space-y-4 border-y border-hairline py-6">
        <a
          href={item.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] bg-fg px-5 text-body font-medium text-background transition-opacity duration-150 hover:opacity-85"
        >
          <ExternalLink size={18} strokeWidth={1.5} aria-hidden />
          <T en={news ? `Read the full story on ${sourceName}` : `Read the original ${sourceName} filing`} ur="اصل دستاویز پڑھیں" />
        </a>
        {alsoReported.length > 0 && (
          <p className="text-caption text-fg-secondary">
            <T en="Also covered by" ur="یہ خبر یہاں بھی" />{" "}
            {alsoReported.map((a, i) => (
              <span key={a.url}>
                {i > 0 && ", "}
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                  {sourceLabel(a.source_id)}
                </a>
              </span>
            ))}
          </p>
        )}
        <ShareBar url={url} text={headlineEn(item)} imageUrl={`/api/og/item/${item.id}`} fileName={`${BRAND.name}-${item.symbol ?? "news"}-${item.id}.png`} />
      </section>

      <aside className="space-y-1 text-caption text-fg-tertiary">
        <p dir="ltr" className="rtl:text-right">
          {DISCLAIMER_EN}
        </p>
        <p className="ur disclaimer-ur" lang="ur">
          {DISCLAIMER_UR}
        </p>
      </aside>

      {related.length > 0 && item.symbol && (
        <section aria-labelledby="related" className="space-y-2 pt-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="related" className="text-title">
              <T en={`More from ${item.symbol}`} ur={`${item.symbol} کی مزید خبریں`} />
            </h2>
            <Link href={`/company/${encodeURIComponent(item.symbol)}`} className="text-caption text-brand hover:underline">
              <T en="Company page" ur="کمپنی پیج" />
            </Link>
          </div>
          <div className="border-t border-hairline">
            {related.map((r) => (
              <ThumbRow key={r.id} item={r} now={now} />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
