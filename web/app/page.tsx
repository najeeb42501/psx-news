import Link from "next/link";
import { ItemList } from "@/components/item-card";
import { MyStocksFeed } from "@/components/my-stocks";
import { TYPE_GROUPS } from "@/lib/categories";
import { PAGE_SIZE, getFeed, getSectors } from "@/lib/data";

export const revalidate = 60;

type Search = { symbol?: string; sector?: string; type?: string; date?: string; page?: string };

export default async function FeedPage({ searchParams }: PageProps<"/">) {
  const sp = (await searchParams) as Search;
  const page = Math.max(1, Number(sp.page) || 1);
  const filters = { symbol: sp.symbol?.trim() || undefined, sector: sp.sector || undefined, type: sp.type || undefined, date: sp.date || undefined };
  const filtered = Object.values(filters).some(Boolean);
  const [items, sectors] = await Promise.all([getFeed({ ...filters, page }), getSectors()]);

  const pageLink = (p: number) => {
    const q = new URLSearchParams(Object.entries({ ...filters, page: String(p) }).filter(([, v]) => v) as [string, string][]);
    return `/?${q.toString()}`;
  };

  return (
    <div className="space-y-4">
      {!filtered && page === 1 && <MyStocksFeed />}

      <form method="get" action="/" className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-3 text-sm sm:grid-cols-5">
        <input
          name="symbol"
          defaultValue={filters.symbol}
          placeholder="Company symbol, e.g. HBL"
          aria-label="Company symbol"
          className="col-span-2 rounded-md border border-border bg-background px-2 py-1.5 uppercase sm:col-span-1"
        />
        <select name="type" defaultValue={filters.type ?? ""} aria-label="Type" className="rounded-md border border-border bg-background px-2 py-1.5">
          <option value="">All types</option>
          {TYPE_GROUPS.map((g) => (
            <option key={g.key} value={g.key}>
              {g.en}
            </option>
          ))}
        </select>
        <select name="sector" defaultValue={filters.sector ?? ""} aria-label="Sector" className="rounded-md border border-border bg-background px-2 py-1.5">
          <option value="">All sectors</option>
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input type="date" name="date" defaultValue={filters.date} aria-label="Date" className="rounded-md border border-border bg-background px-2 py-1.5" />
        <div className="flex gap-2">
          <button className="flex-1 rounded-md bg-brand px-3 py-1.5 font-semibold text-white">Filter</button>
          {filtered && (
            <Link href="/" className="rounded-md border border-border px-3 py-1.5">
              Clear
            </Link>
          )}
        </div>
      </form>

      <section>
        <h1 className="mb-2 text-lg font-bold">
          <span className="ui-en">{filtered ? "Filtered announcements" : "Latest announcements and news"}</span>
          <span className="ui-ur ur ur-tight"> تازہ ترین اعلانات اور خبریں</span>
        </h1>
        <ItemList items={items} empty="No announcements match these filters." />
      </section>

      <nav className="flex justify-between text-sm">
        {page > 1 ? <Link href={pageLink(page - 1)} className="underline">← Newer</Link> : <span />}
        {items.length === PAGE_SIZE && (
          <Link href={pageLink(page + 1)} className="underline">
            Older →
          </Link>
        )}
      </nav>
    </div>
  );
}
