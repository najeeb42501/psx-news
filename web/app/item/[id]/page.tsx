import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryBadge } from "@/components/item-card";
import { ShareButtons } from "@/components/share-buttons";
import { BRAND, SITE_URL } from "@/lib/brand";
import { isNews, sourceLabel } from "@/lib/categories";
import { DISCLAIMER_EN, DISCLAIMER_UR } from "@/lib/compliance";
import { getItem } from "@/lib/data";
import { factRows } from "@/lib/facts";
import { formatDateTime } from "@/lib/format";

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

export default async function ItemPage({ params }: PageProps<"/item/[id]">) {
  const item = await load((await params).id);
  if (!item) notFound();
  const rows = factRows(item.facts);
  const url = `${SITE_URL}/item/${item.id}`;

  return (
    <article className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        {item.symbol ? (
          <Link href={`/company/${encodeURIComponent(item.symbol)}`} className="font-bold text-brand">
            {item.symbol}
          </Link>
        ) : (
          <span className="font-semibold">{sourceLabel(item.source_id)}</span>
        )}
        {item.company_name && item.company_name !== item.symbol && <span>{item.company_name}</span>}
        <CategoryBadge category={item.category} />
      </div>

      <section className="space-y-2 rounded-xl border border-border bg-card p-4">
        {item.headline_en && <h1 className="en-only text-xl font-bold leading-snug">{item.headline_en}</h1>}
        {item.body_en && <p className="en-only">{item.body_en}</p>}
        {item.headline_ur && (
          <h1 className="ur-only ur text-xl font-bold" lang="ur">
            {item.headline_ur}
          </h1>
        )}
        {item.body_ur && (
          <p className="ur-only ur" lang="ur">
            {item.body_ur}
          </p>
        )}
      </section>

      {rows.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 font-bold">
            <span className="ui-en">Key numbers</span>
            <span className="ui-ur ur ur-tight"> اہم اعداد و شمار</span>
          </h2>
          <table className="w-full text-sm">
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border first:border-0">
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal text-muted">
                    <span className="ui-en">{r.en}</span>
                    <span className="ui-ur ur ur-tight">{r.ur || r.en}</span>
                  </th>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">Each number was checked against the original document before publishing.</p>
        </section>
      )}

      <section className="space-y-1 text-sm">
        <p>
          <span className="text-muted">Published: </span>
          {formatDateTime(item.published_at ?? item.sort_time)}
        </p>
        <p>
          <span className="text-muted">Source: </span>
          <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="text-brand underline">
            {isNews(item.source_id) ? `${sourceLabel(item.source_id)}: ${item.source_title}` : `Original ${sourceLabel(item.source_id)}`}
          </a>
        </p>
      </section>

      <ShareButtons
        url={url}
        text={item.headline_en ?? item.source_title}
        imageUrl={`/api/og/item/${item.id}`}
        fileName={`${BRAND.name}-${item.symbol ?? "news"}-${item.id}.png`}
      />

      <aside className="rounded-lg bg-brand-soft/50 p-3 text-xs text-foreground/80">
        <p>{DISCLAIMER_EN}</p>
        <p className="ur" lang="ur">
          {DISCLAIMER_UR}
        </p>
      </aside>
    </article>
  );
}
