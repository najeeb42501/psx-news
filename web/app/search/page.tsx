import type { Metadata } from "next";
import Link from "next/link";
import { HeaderSearch } from "@/components/header-search";
import { ItemList } from "@/components/item-card";
import { L } from "@/components/l";
import { search } from "@/lib/data";

export const metadata: Metadata = { title: "Search" };

const SUGGESTIONS = ["dividend", "bonus", "board meeting", "policy rate", "IMF", "circular debt", "results"];

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const q = String((await searchParams).q ?? "").trim();
  const results = q ? await search(q) : [];
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">
        <L en="Search" ur="تلاش" />
      </h1>
      <HeaderSearch autoFocus={!q} />
      {!q && (
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="text-muted">
            <L en="Try:" ur="مثال:" />
          </span>
          {SUGGESTIONS.map((s) => (
            <Link key={s} href={`/search?q=${encodeURIComponent(s)}`} className="rounded-full border border-border bg-card px-3 py-1 hover:border-brand">
              {s}
            </Link>
          ))}
        </div>
      )}
      {q && (
        <>
          <p className="text-sm text-muted">
            {results.length} <L en={`result${results.length === 1 ? "" : "s"} for “${q}”`} ur={`“${q}” کے نتائج`} />
          </p>
          <ItemList items={results} empty="Nothing found. Try a company symbol or a simpler word." />
        </>
      )}
    </div>
  );
}
