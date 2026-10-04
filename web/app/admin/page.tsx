import Link from "next/link";
import { approve, hide, unhide } from "@/app/admin/actions";
import { EditSummaryForm } from "@/components/admin/edit-summary-form";
import { type AdminItem, hiddenItems, latestSummary, recentPublished, requireAdmin, reviewQueue } from "@/lib/admin";
import { categoryLabel } from "@/lib/categories";
import { formatDateTime } from "@/lib/format";

function ItemHeader({ item }: { item: AdminItem }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
      <b className="text-brand">{item.symbol ?? item.documents.source_id}</b>
      <span>{categoryLabel(item.category).en}</span>
      <span>{formatDateTime(item.documents.published_at ?? item.created_at)}</span>
      <a href={item.documents.url} target="_blank" rel="noopener noreferrer" className="underline">
        Original document
      </a>
      <Link href={`/item/${item.id}`} className="underline">
        Public page
      </Link>
    </div>
  );
}

function Editor({ item }: { item: AdminItem }) {
  const en = latestSummary(item, "en");
  const ur = latestSummary(item, "ur");
  return (
    <EditSummaryForm
      id={item.id}
      en={{ headline: en?.headline ?? "", body: en?.body ?? "" }}
      ur={{ headline: ur?.headline ?? "", body: ur?.body ?? "" }}
    />
  );
}

function IdButton({ action, id, label, danger }: { action: (f: FormData) => Promise<void>; id: number; label: string; danger?: boolean }) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button className={`rounded-md border border-border px-3 py-1 text-sm ${danger ? "text-red-600" : ""}`}>{label}</button>
    </form>
  );
}

export default async function ReviewPage({ searchParams }: PageProps<"/admin">) {
  await requireAdmin();
  const symbol = String((await searchParams).symbol ?? "").trim() || undefined;
  const [queue, published, hidden] = await Promise.all([reviewQueue(), recentPublished(symbol), hiddenItems()]);
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h1 className="text-lg font-bold">Needs review ({queue.length})</h1>
        <p className="text-sm text-muted">
          These failed an automatic check, so they are not shown or posted. Fix the text and save, approve as is, or hide.
        </p>
        {queue.length === 0 && <p className="text-sm">Nothing waiting.</p>}
        {queue.map((item) => (
          <article key={item.id} className="space-y-2 rounded-xl border border-amber-400 bg-card p-3">
            <ItemHeader item={item} />
            <p className="text-sm font-medium">{item.documents.title}</p>
            {item.facts.review_notes && (
              <ul className="list-disc pl-5 text-xs text-amber-700 dark:text-amber-400">
                {item.facts.review_notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            )}
            <Editor item={item} />
            <div className="flex gap-2">
              <IdButton action={approve} id={item.id} label="Approve as is" />
              <IdButton action={hide} id={item.id} label="Hide" danger />
            </div>
          </article>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">
          {symbol ? `Published items for ${symbol.toUpperCase()}` : "Recently published (important items)"}
        </h2>
        <p className="text-sm text-muted">Spot something wrong? Hide it, or open it to fix the text.</p>
        <form method="get" className="flex gap-2 text-sm">
          <input
            name="symbol"
            defaultValue={symbol}
            placeholder="Find by symbol, e.g. REDCO"
            aria-label="Find by symbol"
            className="rounded-md border border-border bg-card px-2 py-1 uppercase"
          />
          <button className="rounded-md border border-border px-3 py-1">Find</button>
        </form>
        {published.map((item) => (
          <details key={item.id} className="rounded-xl border border-border bg-card p-3">
            <summary className="cursor-pointer text-sm">
              <b className="text-brand">{item.symbol ?? item.documents.source_id}</b> {latestSummary(item, "en")?.headline}
            </summary>
            <div className="mt-2 space-y-2">
              <ItemHeader item={item} />
              <Editor item={item} />
              <IdButton action={hide} id={item.id} label="Hide from site" danger />
            </div>
          </details>
        ))}
      </section>

      {hidden.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">Hidden</h2>
          {hidden.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 text-sm">
              <span>
                <b>{item.symbol ?? item.documents.source_id}</b> {latestSummary(item, "en")?.headline ?? item.documents.title}
              </span>
              <IdButton action={unhide} id={item.id} label="Show again" />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
