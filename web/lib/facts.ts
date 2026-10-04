// Turn an item's verified facts (pipeline/core/facts.py) into the key numbers table and
// the one "key number" shown on share images. Only facts that passed verification reach
// the website, so this only formats them.
import { formatNumber, formatPlainDate, formatPlainDateUr } from "@/lib/format";

type Figure = { value: number; unit?: string | null; computed?: boolean };
type DateFact = { value: string };
type Facts = Record<string, unknown> & {
  period?: string;
  period_kind?: "year" | "half_year" | "quarter" | "nine_months";
  period_end?: DateFact;
  revenue?: Figure;
  profit_after_tax?: Figure;
  profit_change_pct?: Figure;
  eps?: Figure;
  dividend_kind?: "interim" | "final" | "special";
  cash_dividend_pct?: Figure;
  cash_dividend_rs?: Figure;
  bonus_pct?: Figure;
  right_pct?: Figure;
  right_price_rs?: Figure;
  meeting_kind?: "board" | "agm" | "eogm" | "briefing";
  meeting_date?: DateFact;
  meeting_time?: string;
  book_closure_from?: DateFact;
  book_closure_to?: DateFact;
  other_figures?: (Figure & { label: string })[];
};

export type FactRow = { en: string; ur: string; value: string; valueUr: string };

/** Money in a readable unit: Rs '000 and plain rupees become million/billion. */
export function money(fig: Figure): string {
  const unit = (fig.unit ?? "").toLowerCase().replace(/[‘’]/g, "'");
  let millions: number | null = null;
  if (unit.includes("'000") || unit.includes("thousand")) millions = Math.abs(fig.value) / 1_000;
  else if (unit.includes("billion")) millions = Math.abs(fig.value) * 1_000;
  else if (unit.includes("million")) millions = Math.abs(fig.value);
  else if (Math.abs(fig.value) >= 1_000_000) millions = Math.abs(fig.value) / 1_000_000;
  if (millions === null) return `Rs ${formatNumber(Math.abs(fig.value))}`;
  return millions >= 1_000 ? `Rs ${formatNumber(millions / 1_000, 1)} billion` : `Rs ${formatNumber(millions, 1)} million`;
}

/** The same amount for Urdu text: "164.8 ملین روپے", "1.8 ارب روپے", "4.25 روپے". */
export function moneyUr(fig: Figure): string {
  const en = money(fig);
  const m = en.match(/^Rs ([\d.,]+)(?: (million|billion))?$/);
  if (!m) return en;
  return `${m[1]}${m[2] === "million" ? " ملین" : m[2] === "billion" ? " ارب" : ""} روپے`;
}

const rsUr = (value: number, decimals = 4) => `${formatNumber(Math.abs(value), decimals)} روپے`;

const PERIOD_UR = { year: "سال", half_year: "ہاف ایئر", quarter: "کوارٹر", nine_months: "نو ماہ" };

const isMoneyUnit = (u?: string | null) => /rs|rupee|pkr|'000|‘000|thousand|million|billion/i.test(u ?? "");

const PERIOD_EN = { year: "Year", half_year: "Half year", quarter: "Quarter", nine_months: "Nine months" };
const MEETING = {
  board: { en: "Board meeting", ur: "بورڈ میٹنگ" },
  agm: { en: "AGM", ur: "AGM" },
  eogm: { en: "EOGM", ur: "EOGM" },
  briefing: { en: "Corporate briefing", ur: "کارپوریٹ بریفنگ" },
};

export function factRows(raw: Record<string, unknown>): FactRow[] {
  const f = raw as Facts;
  const rows: FactRow[] = [];
  if (f.period_kind && f.period_end) {
    rows.push({
      en: "Period", ur: "مدت", value: `${PERIOD_EN[f.period_kind]} ended ${formatPlainDate(f.period_end.value)}`,
      valueUr: `${formatPlainDateUr(f.period_end.value)} کو ختم ہونے والا ${PERIOD_UR[f.period_kind]}`,
    });
  } else if (f.period) {
    rows.push({ en: "Period", ur: "مدت", value: f.period, valueUr: f.period });
  }
  if (f.revenue) rows.push({ en: "Revenue", ur: "ریونیو", value: money(f.revenue), valueUr: moneyUr(f.revenue) });
  if (f.profit_after_tax) {
    const loss = f.profit_after_tax.value < 0;
    rows.push({
      en: loss ? "Loss after tax" : "Profit after tax",
      ur: loss ? "آفٹر ٹیکس نقصان" : "آفٹر ٹیکس پرافٹ",
      value: money(f.profit_after_tax),
      valueUr: moneyUr(f.profit_after_tax),
    });
  }
  if (f.profit_change_pct) {
    const pct = `${formatNumber(f.profit_change_pct.value)}%`;
    rows.push({ en: "Profit change", ur: "پرافٹ میں تبدیلی", value: pct, valueUr: pct });
  }
  if (f.eps) {
    const loss = f.eps.value < 0;
    rows.push({
      en: loss ? "Loss per share" : "Earnings per share (EPS)",
      ur: loss ? "فی شیئر نقصان" : "فی شیئر آمدن (EPS)",
      value: `Rs ${formatNumber(Math.abs(f.eps.value), 4)}`,
      valueUr: rsUr(f.eps.value),
    });
  }
  if (f.cash_dividend_rs || f.cash_dividend_pct) {
    const parts = [];
    const partsUr = [];
    if (f.cash_dividend_rs) {
      parts.push(`Rs ${formatNumber(f.cash_dividend_rs.value, 4)} per share`);
      partsUr.push(`${rsUr(f.cash_dividend_rs.value)} فی شیئر`);
    }
    if (f.cash_dividend_pct) {
      parts.push(`${formatNumber(f.cash_dividend_pct.value)}%`);
      partsUr.push(`${formatNumber(f.cash_dividend_pct.value)}%`);
    }
    const kind = f.dividend_kind ? `${f.dividend_kind[0].toUpperCase()}${f.dividend_kind.slice(1)} cash dividend` : "Cash dividend";
    const join = (p: string[]) => (p.length === 2 ? `${p[0]} (${p[1]})` : p[0]);
    rows.push({ en: kind, ur: "کیش ڈیویڈنڈ", value: join(parts), valueUr: join(partsUr) });
  }
  if (f.bonus_pct) {
    const pct = `${formatNumber(f.bonus_pct.value)}%`;
    rows.push({ en: "Bonus shares", ur: "بونس شیئرز", value: pct, valueUr: pct });
  }
  if (f.right_pct) {
    const price = f.right_price_rs ? ` at Rs ${formatNumber(f.right_price_rs.value, 4)}` : "";
    const priceUr = f.right_price_rs ? `، ${rsUr(f.right_price_rs.value)} فی شیئر` : "";
    rows.push({
      en: "Right shares", ur: "رائٹ شیئرز",
      value: `${formatNumber(f.right_pct.value)}%${price}`, valueUr: `${formatNumber(f.right_pct.value)}%${priceUr}`,
    });
  }
  if (f.meeting_date) {
    const m = MEETING[f.meeting_kind ?? "board"];
    const time = f.meeting_time ? `, ${f.meeting_time}` : "";
    const timeUr = f.meeting_time ? `، ${f.meeting_time}` : "";
    rows.push({
      en: m.en, ur: m.ur,
      value: `${formatPlainDate(f.meeting_date.value)}${time}`, valueUr: `${formatPlainDateUr(f.meeting_date.value)}${timeUr}`,
    });
  }
  if (f.book_closure_from && f.book_closure_to) {
    const same = f.book_closure_from.value === f.book_closure_to.value;
    rows.push({
      en: "Book closure",
      ur: "بک کلوژر",
      value: same
        ? formatPlainDate(f.book_closure_from.value)
        : `${formatPlainDate(f.book_closure_from.value)} to ${formatPlainDate(f.book_closure_to.value)}`,
      valueUr: same
        ? formatPlainDateUr(f.book_closure_from.value)
        : `${formatPlainDateUr(f.book_closure_from.value)} سے ${formatPlainDateUr(f.book_closure_to.value)} تک`,
    });
  }
  for (const o of f.other_figures ?? []) {
    const value = isMoneyUnit(o.unit)
      ? money(o)
      : `${formatNumber(o.value)}${o.unit && o.unit !== "%" ? ` ${o.unit}` : o.unit === "%" ? "%" : ""}`;
    rows.push({ en: o.label, ur: "", value, valueUr: isMoneyUnit(o.unit) ? moneyUr(o) : value });
  }
  return rows;
}

/** The single most useful number for a share image, or null. */
export function keyNumber(raw: Record<string, unknown>): string | null {
  const f = raw as Facts;
  const parts: string[] = [];
  if (f.eps) parts.push(`${f.eps.value < 0 ? "Loss per share" : "EPS"} Rs ${formatNumber(Math.abs(f.eps.value), 4)}`);
  else if (f.profit_after_tax) parts.push(`${f.profit_after_tax.value < 0 ? "Loss" : "Profit"} ${money(f.profit_after_tax)}`);
  if (f.cash_dividend_rs) parts.push(`Dividend Rs ${formatNumber(f.cash_dividend_rs.value, 4)}/share`);
  else if (f.cash_dividend_pct) parts.push(`Dividend ${formatNumber(f.cash_dividend_pct.value)}%`);
  if (f.bonus_pct) parts.push(`Bonus ${formatNumber(f.bonus_pct.value)}%`);
  if (parts.length) return parts.slice(0, 2).join(" · ");
  if (f.meeting_date) return `${MEETING[f.meeting_kind ?? "board"].en}: ${formatPlainDate(f.meeting_date.value)}`;
  if (f.book_closure_from) return `Book closure from ${formatPlainDate(f.book_closure_from.value)}`;
  return null;
}


export type Chip = { en: string; ur: string; value: string; valueUr: string; tone: "pos" | "neg" | "neutral" };

/** Up to 3 headline numbers for cards, from verified facts only. */
export function keyChips(raw: Record<string, unknown>): Chip[] {
  const f = raw as Facts;
  const chips: Chip[] = [];
  if (f.profit_after_tax) {
    const loss = f.profit_after_tax.value < 0;
    chips.push({
      en: loss ? "Loss" : "Profit", ur: loss ? "نقصان" : "پرافٹ",
      value: money(f.profit_after_tax), valueUr: moneyUr(f.profit_after_tax), tone: loss ? "neg" : "pos",
    });
  }
  if (f.eps) {
    const loss = f.eps.value < 0;
    chips.push({
      en: loss ? "LPS" : "EPS", ur: loss ? "فی شیئر نقصان" : "EPS",
      value: `Rs ${formatNumber(Math.abs(f.eps.value), 4)}`, valueUr: rsUr(f.eps.value), tone: loss ? "neg" : "pos",
    });
  }
  if (f.cash_dividend_rs || f.cash_dividend_pct) {
    const value = f.cash_dividend_rs
      ? `Rs ${formatNumber(f.cash_dividend_rs.value, 4)}/share`
      : `${formatNumber(f.cash_dividend_pct!.value)}%`;
    const valueUr = f.cash_dividend_rs ? `${rsUr(f.cash_dividend_rs.value)} فی شیئر` : value;
    chips.push({ en: "Dividend", ur: "ڈیویڈنڈ", value, valueUr, tone: "pos" });
  }
  if (f.bonus_pct) {
    const pct = `${formatNumber(f.bonus_pct.value)}%`;
    chips.push({ en: "Bonus", ur: "بونس", value: pct, valueUr: pct, tone: "pos" });
  }
  if (f.right_pct) {
    const pct = `${formatNumber(f.right_pct.value)}%`;
    chips.push({ en: "Right", ur: "رائٹ", value: pct, valueUr: pct, tone: "neutral" });
  }
  if (!chips.length && f.revenue) {
    chips.push({ en: "Revenue", ur: "ریونیو", value: money(f.revenue), valueUr: moneyUr(f.revenue), tone: "neutral" });
  }
  if (!chips.length && f.meeting_date) {
    const m = MEETING[f.meeting_kind ?? "board"];
    chips.push({ en: m.en, ur: m.ur, value: formatPlainDate(f.meeting_date.value), valueUr: formatPlainDateUr(f.meeting_date.value), tone: "neutral" });
  }
  return chips.slice(0, 3);
}
