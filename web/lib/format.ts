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

// --- v1.1 redesign: one date style everywhere -------------------------------------------
// Lists: "2 Oct". Item pages: "Friday 2 October 2026, 3:45 pm". Day headers: "Today", "Yesterday", "Sat 3 Oct".
const shortFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" });
const longFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });
const dayHeaderFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });

const lowerAmPm = (s: string) => s.replace(" AM", " am").replace(" PM", " pm");

export function formatShortDate(iso: string | null | undefined): string {
  return iso ? shortFmt.format(new Date(iso)) : "";
}

export function formatTime(iso: string | null | undefined): string {
  return iso ? lowerAmPm(timeFmt.format(new Date(iso))) : "";
}

export function formatLongDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${longFmt.format(d).replace(",", "")}, ${formatTime(iso)}`;
}

/** "Today", "Yesterday" or "Sat 3 Oct", in Pakistan time. `now` is passed in so pages stay pure. */
export function dayLabel(iso: string, now: Date): { en: string; ur: string } {
  const day = pktDay(iso);
  if (day === pktDay(now)) return { en: "Today", ur: "آج" };
  if (day === pktDay(new Date(now.getTime() - 864e5))) return { en: "Yesterday", ur: "کل" };
  const [y, m, d] = day.split("-").map(Number);
  return { en: dayHeaderFmt.format(new Date(iso)).replace(",", ""), ur: `${d} ${MONTHS_UR[m - 1]} ${y}` };
}

/** A time for list rows: "3:45 pm" today, otherwise "2 Oct". */
export function formatRowTime(iso: string | null | undefined, now: Date): string {
  if (!iso) return "";
  return pktDay(iso) === pktDay(now) ? formatTime(iso) : formatShortDate(iso);
}

/** The current time, for pages that show "Today" / relative dates (kept out of render bodies). */
export function currentTime(): Date {
  // SK_NOW (server env, previews only) pretends it is another moment, e.g. a weekend for screenshots.
  const fake = process.env.SK_NOW;
  return fake ? new Date(fake) : new Date();
}

/** Meeting times as filings write them ("3:00 P.M", "11.30 a.m.", "1100 hours") -> "3:00 pm". */
export function formatClock(raw: string | null | undefined): string {
  if (!raw) return "";
  const m = raw.match(/(\d{1,2})[:.]?(\d{2})?\s*(a\.?\s?m\.?|p\.?\s?m\.?|hours|hrs)?/i);
  if (!m) return raw;
  let h = Number(m[1]);
  const min = m[2] ?? "00";
  const suffix = (m[3] ?? "").toLowerCase().replace(/[.\s]/g, "");
  if (suffix === "hours" || suffix === "hrs" || (!suffix && h > 12)) {
    const pm = h >= 12;
    h = h % 12 || 12;
    return `${h}:${min} ${pm ? "pm" : "am"}`;
  }
  if (suffix) return `${h}:${min} ${suffix}`;
  // No am/pm and a 12-hour value: company meetings run in office hours, so 8–11 is morning.
  if (h === 0) return `12:${min} am`;
  return `${h}:${min} ${h >= 8 && h <= 11 ? "am" : "pm"}`;
}

/** Minutes after midnight of a meeting time, for ordering a day's events; null when there is none. */
export function clockMinutes(raw: string | null | undefined): number | null {
  const m = formatClock(raw).match(/^(\d{1,2}):(\d{2}) (am|pm)$/);
  if (!m) return null;
  return ((Number(m[1]) % 12) + (m[3] === "pm" ? 12 : 0)) * 60 + Number(m[2]);
}
