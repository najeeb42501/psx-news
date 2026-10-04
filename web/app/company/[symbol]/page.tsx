import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventList } from "@/components/event-list";
import { ItemList } from "@/components/item-card";
import { FollowStockButton } from "@/components/follow-stock-button";
import { getCompany, getCompanyItems, getUpcoming } from "@/lib/data";
import { factRows } from "@/lib/facts";
import { formatDate } from "@/lib/format";

export const revalidate = 300;

export async function generateMetadata({ params }: PageProps<"/company/[symbol]">): Promise<Metadata> {
  const symbol = decodeURIComponent((await params).symbol).toUpperCase();
  const company = await getCompany(symbol);
  return company ? { title: `${company.symbol} – ${company.name}`, description: `PSX announcements for ${company.name}` } : {};
}

export default async function CompanyPage({ params }: PageProps<"/company/[symbol]">) {
  const symbol = decodeURIComponent((await params).symbol).toUpperCase();
  const [company, items, events] = await Promise.all([getCompany(symbol), getCompanyItems(symbol), getUpcoming(symbol, 120)]);
  if (!company && !items.length) notFound();

  const latestResults = items.find((i) => i.category === "results");
  const dividends = items.filter((i) => i.facts && ("cash_dividend_rs" in i.facts || "cash_dividend_pct" in i.facts || "bonus_pct" in i.facts));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{symbol}</h1>
          <p className="text-muted">{company?.name ?? symbol}</p>
          {company?.sector && (
            <Link href={`/?sector=${encodeURIComponent(company.sector)}`} className="text-sm text-brand underline">
              {company.sector}
            </Link>
          )}
        </div>
        <FollowStockButton symbol={symbol} />
      </header>

      {events.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">Upcoming: board meetings, AGMs, book closures</h2>
          <EventList events={events} showCompany={false} />
        </section>
      )}

      {latestResults && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-1 font-bold">Latest results</h2>
          <p className="mb-2 text-sm text-muted">
            <Link href={`/item/${latestResults.id}`} className="underline">
              {latestResults.headline_en}
            </Link>
          </p>
          <table className="w-full text-sm">
            <tbody>
              {factRows(latestResults.facts)
                .filter((r) => !["Board meeting", "AGM", "EOGM", "Book closure"].includes(r.en))
                .slice(0, 6)
                .map((r, i) => (
                  <tr key={i} className="border-t border-border first:border-0">
                    <th scope="row" className="py-1 pr-3 text-left font-normal text-muted">{r.en}</th>
                    <td className="py-1 text-right font-semibold tabular-nums">{r.value}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}

      {dividends.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 font-bold">Dividend history</h2>
          <ul className="space-y-1 text-sm">
            {dividends.map((d) => {
              const row = factRows(d.facts).find((r) => /dividend|bonus/i.test(r.en));
              return (
                <li key={d.id} className="flex justify-between gap-2 border-t border-border pt-1 first:border-0">
                  <Link href={`/item/${d.id}`} className="underline">
                    {formatDate(d.sort_time)}
                  </Link>
                  <span className="text-right">
                    {row?.en}: <b>{row?.value}</b>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-bold">Announcements</h2>
        <ItemList items={items} empty="No announcements stored for this company yet." />
      </section>
    </div>
  );
}
