import Link from "next/link";
import { categoryLabel, isNews, sourceLabel } from "@/lib/categories";
import type { WebItem } from "@/lib/data";
import { formatDateTime } from "@/lib/format";

export function CategoryBadge({ category }: { category: string }) {
  const label = categoryLabel(category);
  return (
    <span className="rounded bg-brand-soft px-1.5 py-0.5 text-xs font-medium text-foreground">
      <span className="ui-en">{label.en}</span>
      <span className="ui-ur ur ur-tight !leading-normal"> {label.ur}</span>
    </span>
  );
}

export function ItemCard({ item, showBody = true }: { item: WebItem; showBody?: boolean }) {
  const href = `/item/${item.id}`;
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
        {item.symbol ? (
          <Link href={`/company/${encodeURIComponent(item.symbol)}`} className="font-bold text-brand">
            {item.symbol}
          </Link>
        ) : (
          <span className="font-semibold">{sourceLabel(item.source_id)}</span>
        )}
        <CategoryBadge category={item.category} />
        <time dateTime={item.sort_time}>{formatDateTime(item.sort_time)}</time>
      </div>

      <Link href={href} className="block">
        {item.headline_en && <h2 className="en-only font-semibold leading-snug">{item.headline_en}</h2>}
        {item.headline_ur && (
          <h2 className="ur-only ur font-semibold" lang="ur">
            {item.headline_ur}
          </h2>
        )}
      </Link>

      {showBody && (
        <>
          {item.body_en && <p className="en-only mt-1 text-sm text-foreground/80">{item.body_en}</p>}
          {item.body_ur && (
            <p className="ur-only ur mt-1 text-sm text-foreground/80" lang="ur">
              {item.body_ur}
            </p>
          )}
        </>
      )}

      <div className="mt-2 flex gap-3 text-xs">
        <Link href={href} className="text-brand underline">
          Details
        </Link>
        <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="text-muted underline">
          {isNews(item.source_id) ? `Read on ${sourceLabel(item.source_id)}` : "Original filing"}
        </a>
      </div>
    </article>
  );
}

export function ItemList({ items, empty }: { items: WebItem[]; empty?: string }) {
  if (!items.length) return <p className="text-muted">{empty ?? "Nothing here yet."}</p>;
  return (
    <div className="space-y-3">
      {items.map((it) => (
        <ItemCard key={it.id} item={it} />
      ))}
    </div>
  );
}
