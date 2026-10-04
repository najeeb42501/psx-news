import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { CategoryBadge, Chips, CompactRow } from "@/components/item-card";
import { L } from "@/components/l";
import { ShareButtons } from "@/components/share-buttons";
import { BRAND, SITE_URL } from "@/lib/brand";
import { isNews, sourceLabel } from "@/lib/categories";
import { DISCLAIMER_EN, DISCLAIMER_UR } from "@/lib/compliance";
import { getItem, getRelated } from "@/lib/data";
import { factRows, keyChips } from "@/lib/facts";
import { formatDateTime } from "@/lib/format";
import { UrduText } from "@/components/urdu-text";

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
  const alsoReported = (item.facts.also_reported as { source_id: string; url: string }[] | undefined) ?? [];
  const related = item.symbol ? await getRelated(item.symbol, item.id) : [];
  const url = `${SITE_URL}/item/${item.id}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <article className="min-w-0 space-y-4">
        <nav className="text-sm text-muted">
          <Link href="/" className="hover:text-foreground">
            <L en="Feed" ur="خبریں" />
          </Link>
          {item.symbol && (
            <>
              {" / "}
              <Link href={`/company/${encodeURIComponent(item.symbol)}`} className="hover:text-foreground">
                {item.symbol}
              </Link>
            </>
          )}
        </nav>

        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {item.symbol ? (
              <Link href={`/company/${encodeURIComponent(item.symbol)}`} className="font-bold text-brand">
                {item.symbol}
              </Link>
            ) : (
              <span className="font-semibold">{sourceLabel(item.source_id)}</span>
            )}
            {item.company_name && item.company_name !== item.symbol && <span className="text-muted">{item.company_name}</span>}
            <CategoryBadge category={item.category} />
          </div>
          {item.headline_en && <h1 className="en-only text-2xl font-bold leading-tight">{item.headline_en}</h1>}
          {item.headline_ur && (
            <h1 className="ur-only ur text-2xl font-bold" lang="ur">
              <UrduText text={item.headline_ur} />
            </h1>
          )}
          <Chips chips={keyChips(item.facts)} size="lg" />
        </header>

        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          {item.body_en && <p className="en-only leading-relaxed">{item.body_en}</p>}
          {item.body_ur && (
            <p className="ur-only ur text-lg" lang="ur">
              <UrduText text={item.body_ur} />
            </p>
          )}
        </section>

        {rows.length > 0 && (
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-2 flex items-center gap-2 font-bold">
              <Icon name="table" className="size-4 text-brand" />
              <L en="Key numbers" ur="اہم اعداد و شمار" />
            </h2>
            <table className="w-full text-sm">
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-border first:border-0">
                    <th scope="row" className="py-2 pe-3 text-start font-normal text-muted">
                      <span className="ui-en">{r.en}</span>
                      <span className="ui-ur ur ur-tight">{r.ur || r.en}</span>
                    </th>
                    <td className="py-2 text-end font-semibold tabular-nums">
                      <span className="ui-en">{r.value}</span>
                      <span className="ui-ur ur ur-tight">
                        <UrduText text={r.valueUr} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
              <Icon name="check" className="size-3.5 text-emerald-600" />
              <L
                en="Each number was checked against the original document before publishing."
                ur="ہر نمبر شائع کرنے سے پہلے اصل دستاویز سے چیک کیا گیا۔"
              />
            </p>
          </section>
        )}

        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-sm">
          <div className="space-y-0.5">
            <div>
              <span className="text-muted">
                <L en="Published" ur="شائع" />:
              </span>{" "}
              {formatDateTime(item.published_at ?? item.sort_time)}
            </div>
            <div className="text-muted">{isNews(item.source_id) ? item.source_title : sourceLabel(item.source_id)}</div>
          </div>
          <a
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-brand px-4 py-2 font-semibold text-brand"
          >
            <Icon name="external" className="size-4" />
            <L en={isNews(item.source_id) ? `Read on ${sourceLabel(item.source_id)}` : "Open original filing"} ur="اصل دستاویز" />
          </a>
          {alsoReported.length > 0 && (
            <p className="w-full text-muted">
              <L en="Also reported by" ur="یہ خبر یہاں بھی" />:{" "}
              {alsoReported.map((a, i) => (
                <span key={a.url}>
                  {i > 0 && ", "}
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-brand underline">
                    {sourceLabel(a.source_id)}
                  </a>
                </span>
              ))}
            </p>
          )}
        </section>

        <ShareButtons
          url={url}
          text={item.headline_en ?? item.source_title}
          imageUrl={`/api/og/item/${item.id}`}
          fileName={`${BRAND.name}-${item.symbol ?? "news"}-${item.id}.png`}
        />

        <aside className="rounded-xl bg-brand-soft/50 p-3 text-xs text-foreground/80">
          <p>{DISCLAIMER_EN}</p>
          <p className="ur" lang="ur">
            {DISCLAIMER_UR}
          </p>
        </aside>
      </article>

      {related.length > 0 && (
        <aside className="space-y-2">
          <h2 className="flex items-center justify-between text-sm font-bold">
            <L en={`More from ${item.symbol}`} ur={`${item.symbol} کی مزید خبریں`} />
            <Link href={`/company/${encodeURIComponent(item.symbol!)}`} className="text-xs font-normal text-brand underline">
              <L en="Company page" ur="کمپنی پیج" />
            </Link>
          </h2>
          <div className="rounded-2xl border border-border bg-card p-1">
            {related.map((r) => (
              <CompactRow key={r.id} item={r} />
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}
