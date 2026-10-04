import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventList } from "@/components/event-list";
import { FollowStockButton } from "@/components/follow-stock-button";
import { Icon } from "@/components/icons";
import { Chips, Feed } from "@/components/item-card";
import { L } from "@/components/l";
import { getCompany, getCompanyItems, getUpcoming } from "@/lib/data";
import { factRows, keyChips } from "@/lib/facts";
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
  const dividends = items.filter((i) => "cash_dividend_rs" in i.facts || "cash_dividend_pct" in i.facts || "bonus_pct" in i.facts);

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">{symbol}</h1>
            <p className="text-lg text-foreground/80">{company?.name ?? symbol}</p>
            {company?.sector && (
              <Link href={`/?sector=${encodeURIComponent(company.sector)}`} className="inline-block rounded-full bg-brand-soft px-3 py-0.5 text-xs">
                {company.sector}
              </Link>
            )}
          </div>
          <FollowStockButton symbol={symbol} />
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
          <div className="rounded-xl bg-background p-2">
            <dt className="text-xs text-muted">
              <L en="Announcements" ur="اعلانات" />
            </dt>
            <dd className="text-lg font-bold">{items.length}</dd>
          </div>
          <div className="rounded-xl bg-background p-2">
            <dt className="text-xs text-muted">
              <L en="Upcoming" ur="آنے والے" />
            </dt>
            <dd className="text-lg font-bold">{events.length}</dd>
          </div>
          <div className="rounded-xl bg-background p-2">
            <dt className="text-xs text-muted">
              <L en="Latest" ur="تازہ ترین" />
            </dt>
            <dd className="text-sm font-bold">{items[0] ? formatDate(items[0].sort_time) : "–"}</dd>
          </div>
        </dl>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 space-y-2">
          <h2 className="font-bold">
            <L en="Announcements" ur="اعلانات" />
          </h2>
          <Feed items={items} empty={{ en: "No announcements stored for this company yet.", ur: "اس کمپنی کا ابھی کوئی اعلان نہیں۔" }} />
        </section>

        <aside className="space-y-5">
          {events.length > 0 && (
            <section className="space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <Icon name="calendar" className="size-4 text-brand" />
                <L en="Coming up" ur="آنے والے" />
              </h2>
              <EventList events={events} compact />
            </section>
          )}

          {latestResults && (
            <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <Icon name="chart" className="size-4 text-brand" />
                <L en="Latest results" ur="تازہ ترین رزلٹس" />
              </h2>
              <Chips chips={keyChips(latestResults.facts)} />
              <table className="w-full text-sm">
                <tbody>
                  {factRows(latestResults.facts)
                    .filter((r) => !["Board meeting", "AGM", "EOGM", "Book closure", "Corporate briefing"].includes(r.en))
                    .slice(0, 6)
                    .map((r, i) => (
                      <tr key={i} className="border-t border-border first:border-0">
                        <th scope="row" className="py-1 pe-3 text-start font-normal text-muted">
                          <span className="ui-en">{r.en}</span>
                          <span className="ui-ur ur ur-tight">{r.ur || r.en}</span>
                        </th>
                        <td className="py-1 text-end font-semibold tabular-nums">{r.value}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <Link href={`/item/${latestResults.id}`} className="inline-flex items-center gap-1 text-sm text-brand">
                <L en="Full details" ur="مکمل تفصیل" /> <Icon name="arrow-right" className="size-3.5" />
              </Link>
            </section>
          )}

          {dividends.length > 0 && (
            <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <Icon name="coins" className="size-4 text-brand" />
                <L en="Dividend history" ur="ڈیویڈنڈ ہسٹری" />
              </h2>
              <ul className="space-y-1 text-sm">
                {dividends.map((d) => {
                  const row = factRows(d.facts).find((r) => /dividend|bonus/i.test(r.en));
                  return (
                    <li key={d.id} className="flex justify-between gap-2 border-t border-border pt-1 first:border-0">
                      <Link href={`/item/${d.id}`} className="text-muted underline">
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
        </aside>
      </div>
    </div>
  );
}
