// Results: every company's latest results in one sortable table, from their PSX filings.
import type { Metadata } from "next";
import { type ResultMeta, ResultsExplorer } from "@/components/results/explorer";
import type { Row } from "@/components/ui/data-table";
import { T } from "@/components/ui/primitives";
import { getResults } from "@/lib/data";
import { money } from "@/lib/facts";
import { formatNumber, formatPlainDate, formatShortDate } from "@/lib/format";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Results tracker",
  description: "Latest revenue, profit after tax, EPS and dividends of PSX-listed companies, from their filings.",
};

type Fig = { value: number; unit?: string | null };
type Facts = Record<string, Fig | undefined> & { period_kind?: string; period_end?: { value: string } };

const PERIOD_LABEL: Record<string, string> = { year: "Year", half_year: "Half year", quarter: "Quarter", nine_months: "Nine months" };
const compact = (s: string) => s.replace(/ million$/, "m").replace(/ billion$/, "bn");

/** Amount in Rs million for sorting, whatever unit the filing used. */
function millions(f?: Fig): number | null {
  if (!f) return null;
  const unit = (f.unit ?? "").toLowerCase().replace(/[‘’]/g, "'");
  if (unit.includes("'000") || unit.includes("thousand")) return f.value / 1_000;
  if (unit.includes("billion")) return f.value * 1_000;
  if (unit.includes("million")) return f.value;
  return f.value / 1_000_000;
}

export default async function ResultsPage() {
  const items = await getResults();
  const rows: Row[] = [];
  const meta: Record<string, ResultMeta> = {};
  const seen = new Set<string>();
  for (const it of items) {
    const key = it.symbol ?? String(it.id);
    if (seen.has(key)) continue; // one row per company: its latest results
    seen.add(key);
    const f = it.facts as Facts;
    const pat = f.profit_after_tax;
    const change = f.profit_change_pct;
    const kind = f.period_kind ? PERIOD_LABEL[f.period_kind] : null;
    rows.push({
      key,
      href: `/item/${it.id}`,
      cells: {
        company: { text: it.symbol ?? "", sub: it.company_name ?? undefined, sort: it.symbol ?? "" },
        period: { text: kind && f.period_end ? `${kind} to ${formatPlainDate(f.period_end.value)}` : null, sort: f.period_end?.value ?? null },
        revenue: { text: f.revenue ? compact(money(f.revenue)) : null, sort: millions(f.revenue) },
        pat: { text: pat ? `${pat.value < 0 ? "−" : ""}${compact(money(pat))}` : null, sort: millions(pat), color: pat && pat.value < 0 ? "neg" : undefined },
        change: change ? { text: `${formatNumber(Math.abs(change.value))}%`, sort: change.value, tone: change.value >= 0 ? "pos" : "neg" } : { text: null },
        eps: { text: f.eps ? `${f.eps.value < 0 ? "−" : ""}Rs ${formatNumber(Math.abs(f.eps.value), 4)}` : null, sort: f.eps?.value ?? null, color: f.eps && f.eps.value < 0 ? "neg" : undefined },
        dividend: f.cash_dividend_rs
          ? { text: `Rs ${formatNumber(f.cash_dividend_rs.value, 4)}`, sort: f.cash_dividend_rs.value }
          : f.cash_dividend_pct
            ? { text: `${formatNumber(f.cash_dividend_pct.value)}%`, sort: f.cash_dividend_pct.value }
            : { text: null },
        announced: { text: formatShortDate(it.sort_time), sort: it.sort_time },
      },
    });
    meta[key] = {
      sector: it.sector ?? "",
      period: f.period_kind ?? "",
      search: `${it.symbol ?? ""} ${it.company_name ?? ""}`.toLowerCase(),
      profit: pat?.value ?? null,
      dividend: !!(f.cash_dividend_rs || f.cash_dividend_pct),
    };
  }
  const dates = items.map((i) => i.sort_time).sort();
  const range = dates.length ? (formatShortDate(dates[0]) === formatShortDate(dates.at(-1)) ? formatShortDate(dates[0]) : `${formatShortDate(dates[0])} – ${formatShortDate(dates.at(-1))}`) : "";

  return (
    <div className="space-y-10 pt-8 md:pt-12">
      <header className="space-y-3">
        <p className="eyebrow text-fg-tertiary">
          <T en="Results tracker" ur="رزلٹس ٹریکر" />
        </p>
        <h1 className="text-display-sm md:text-display">
          <T en="Company results" ur="کمپنیوں کے رزلٹس" />
        </h1>
        <p className="max-w-[680px] text-body text-fg-secondary">
          <T
            en={`The latest results of ${rows.length} companies, announced ${range}. Every figure is taken from the company's PSX filing and checked against it. Select a column to sort.`}
            ur={`${rows.length} کمپنیوں کے تازہ رزلٹس۔ ہر نمبر کمپنی کی PSX فائلنگ سے لیا اور چیک کیا گیا ہے۔`}
          />
        </p>
      </header>
      <ResultsExplorer rows={rows} meta={meta} />
      <p className="max-w-[680px] text-caption text-fg-tertiary">
        <T
          en="“—” means the filing does not state that figure, or it could not be verified. “vs last year” appears when a filing states both years. Information only, not investment advice."
          ur="“—” کا مطلب ہے کہ یہ نمبر فائلنگ میں نہیں یا تصدیق نہیں ہو سکی۔ یہ صرف معلومات ہیں، سرمایہ کاری کا مشورہ نہیں۔"
        />
      </p>
    </div>
  );
}
