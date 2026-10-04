// Dates are shown in Pakistan time, whatever the server's time zone.
const TZ = "Asia/Karachi";

const dateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

export function formatDate(iso: string | null | undefined): string {
  return iso ? dateFmt.format(new Date(iso)) : "";
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${dateFmt.format(d)}, ${timeFmt.format(d)} PKT`;
}

/** YYYY-MM-DD of an instant in Pakistan time. */
export function pktDay(d: Date | string = new Date()): string {
  return dayKeyFmt.format(typeof d === "string" ? new Date(d) : d);
}

/** "2026-10-21" (a calendar date, no time zone) -> "21 Oct 2026". */
export function formatPlainDate(ymd: string | null | undefined): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  return dateFmt.format(new Date(Date.UTC(y, m - 1, d, 12)));
}

const MONTHS_UR = ["جنوری", "فروری", "مارچ", "اپریل", "مئی", "جون", "جولائی", "اگست", "ستمبر", "اکتوبر", "نومبر", "دسمبر"];

export function formatPlainDateUr(ymd: string | null | undefined): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  return `${d} ${MONTHS_UR[m - 1]} ${y}`;
}

export function formatNumber(value: number, maxDecimals = 2): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: maxDecimals });
}

/** YYYY-MM-DD in Pakistan time, `offsetDays` from now (e.g. -1 = yesterday). */
export function pktDayOffset(offsetDays: number): string {
  return pktDay(new Date(Date.now() + offsetDays * 864e5));
}

/** "DGKC: AGM on 27 Oct" -> "AGM on 27 Oct" when the symbol is already shown beside it. */
export function stripSymbol(headline: string | null | undefined, symbol: string | null | undefined): string {
  if (!headline) return "";
  if (!symbol) return headline;
  return headline.startsWith(`${symbol}: `) ? headline.slice(symbol.length + 2) : headline;
}
