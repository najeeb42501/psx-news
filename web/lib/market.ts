// PSX trading hours (Pakistan time) and week helpers for the Home page. Public holidays are not
// known here, so on a holiday the status says "closed" only outside normal hours.
import { pktDay } from "@/lib/format";

const TZ = "Asia/Karachi";
const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function pktClock(now: Date): { weekday: string; minutes: number } {
  const p = Object.fromEntries(parts.formatToParts(now).map((x) => [x.type, x.value]));
  return { weekday: p.weekday, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/** Regular session 9:30–15:30 Mon–Thu, Friday 9:15–12:00 and 14:30–16:30. */
export function marketOpen(now: Date): boolean {
  const { weekday, minutes } = pktClock(now);
  if (weekday === "Sat" || weekday === "Sun") return false;
  if (weekday === "Fri") return (minutes >= 555 && minutes < 720) || (minutes >= 870 && minutes < 990);
  return minutes >= 570 && minutes < 930;
}

export function isWeekend(now: Date): boolean {
  const { weekday } = pktClock(now);
  return weekday === "Sat" || weekday === "Sun";
}

export function greeting(now: Date): { en: string; ur: string } {
  const h = pktClock(now).minutes / 60;
  if (h < 12) return { en: "Good morning", ur: "صبح بخیر" };
  if (h < 17) return { en: "Good afternoon", ur: "سہ پہر بخیر" };
  return { en: "Good evening", ur: "شام بخیر" };
}

/** Monday–Friday (YYYY-MM-DD) of this trading week; on a weekend, of the coming week. */
export function tradingWeek(now: Date): string[] {
  const today = pktDay(now);
  const d = new Date(`${today}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0 Sun … 6 Sat
  const toMonday = dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + toMonday);
  return Array.from({ length: 5 }, (_, i) => {
    const x = new Date(d);
    x.setUTCDate(d.getUTCDate() + i);
    return x.toISOString().slice(0, 10);
  });
}

/** "3 min ago", "2 h ago", "1 day ago". */
export function ago(iso: string, now: Date): string {
  const min = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `${min} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} days ago`;
}
