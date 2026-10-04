import type { Metadata } from "next";
import { Icon } from "@/components/icons";
import { L } from "@/components/l";
import { type ResultRow, ResultsTable } from "@/components/results-table";
import { getResults } from "@/lib/data";
import { pktDay } from "@/lib/format";

export const metadata: Metadata = { title: "Results tracker" };
export const revalidate = 300;

type Fig = { value: number; unit?: string | null };

/** Amount in Rs million, whatever unit the filing used. */
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
  const seen = new Set<string>();
  const rows: ResultRow[] = [];
  for (const it of items) {
    // One row per company: its latest results announcement.
    const key = it.symbol ?? String(it.id);
    if (seen.has(key)) continue;
    seen.add(key);
    const f = it.facts as Record<string, Fig & { value: number }> & { period_kind?: string; period_end?: { value: string } };
    rows.push({
      id: it.id,
      symbol: it.symbol ?? "",
      company: it.company_name ?? "",
      sector: it.sector ?? "",
      period: f.period_end?.value ?? null,
      periodKind: f.period_kind ?? null,
      revenue: millions(f.revenue),
      profit: millions(f.profit_after_tax),
      eps: f.eps?.value ?? null,
      dividendRs: f.cash_dividend_rs?.value ?? null,
      dividendPct: f.cash_dividend_pct?.value ?? null,
      date: pktDay(it.sort_time),
    });
  }
  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Icon name="table" className="size-6 text-brand" />
          <L en="Results tracker" ur="رزلٹس ٹریکر" />
        </h1>
        <p className="text-sm text-muted">
          <L
            en="The latest financial results of each company, from their PSX filings. Every number was checked against the filing. Tap a column to sort."
            ur="ہر کمپنی کے تازہ ترین فنانشل رزلٹس، PSX فائلنگز سے۔ ہر نمبر فائلنگ سے چیک کیا گیا ہے۔"
          />
        </p>
      </header>
      <ResultsTable rows={rows} />
      <p className="text-xs text-muted">
        <L
          en="Blank cells: the figure was not stated in the filing or could not be verified. Amounts in Rs million. Information only, not investment advice."
          ur="خالی خانہ: یہ نمبر فائلنگ میں نہیں تھا یا تصدیق نہیں ہو سکی۔ یہ صرف معلومات ہیں، سرمایہ کاری کا مشورہ نہیں۔"
        />
      </p>
    </div>
  );
}
