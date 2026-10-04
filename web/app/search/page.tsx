import type { Metadata } from "next";
import { ItemList } from "@/components/item-card";
import { search } from "@/lib/data";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const q = String((await searchParams).q ?? "").trim();
  const results = q ? await search(q) : [];
  return (
    <div className="space-y-4">
      <form method="get" action="/search" className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Company, symbol or topic, e.g. dividend, circular debt"
          aria-label="Search"
          className="flex-1 rounded-md border border-border bg-card px-3 py-2"
        />
        <button className="rounded-md bg-brand px-4 py-2 font-semibold text-white">Search</button>
      </form>
      {q && (
        <p className="text-sm text-muted">
          {results.length} result{results.length === 1 ? "" : "s"} for “{q}”
        </p>
      )}
      {q && <ItemList items={results} empty="Nothing found. Try a company symbol or a simpler word." />}
    </div>
  );
}
