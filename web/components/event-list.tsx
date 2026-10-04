import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { L } from "@/components/l";
import type { WebEvent } from "@/lib/data";
import { formatPlainDate, formatPlainDateUr, pktDay, pktDayOffset } from "@/lib/format";

export const EVENT_KIND: Record<WebEvent["kind"], { en: string; ur: string; icon: IconName; tone: string }> = {
  board: { en: "Board meeting", ur: "بورڈ میٹنگ", icon: "users", tone: "text-violet-600 dark:text-violet-400" },
  agm: { en: "AGM", ur: "AGM", icon: "building", tone: "text-sky-600 dark:text-sky-400" },
  eogm: { en: "EOGM", ur: "EOGM", icon: "building", tone: "text-sky-600 dark:text-sky-400" },
  briefing: { en: "Corporate briefing", ur: "کارپوریٹ بریفنگ", icon: "megaphone", tone: "text-amber-600 dark:text-amber-400" },
  book_closure: { en: "Book closure", ur: "بک کلوژر", icon: "coins", tone: "text-emerald-600 dark:text-emerald-400" },
};

const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" });
const DAYS_UR = ["اتوار", "پیر", "منگل", "بدھ", "جمعرات", "جمعہ", "ہفتہ"];

function dayLabel(ymd: string): { en: string; ur: string } {
  const today = pktDay();
  const tomorrow = pktDayOffset(1);
  const d = new Date(`${ymd}T12:00:00Z`);
  if (ymd === today) return { en: "Today", ur: "آج" };
  if (ymd === tomorrow) return { en: "Tomorrow", ur: "کل" };
  return { en: `${weekday.format(d)}, ${formatPlainDate(ymd)}`, ur: `${DAYS_UR[d.getUTCDay()]}، ${formatPlainDateUr(ymd)}` };
}

function EventRow({ e, compact }: { e: WebEvent; compact?: boolean }) {
  const kind = EVENT_KIND[e.kind] ?? EVENT_KIND.board;
  const range = e.end_date && e.end_date !== e.event_date;
  return (
    <li className={`flex items-start gap-3 ${compact ? "py-2" : "p-3"}`}>
      <span className={`mt-0.5 rounded-lg bg-background p-1.5 ${kind.tone}`}>
        <Icon name={kind.icon} className="size-4" />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <div className="flex flex-wrap items-baseline gap-x-2">
          {e.symbol && (
            <Link href={`/company/${encodeURIComponent(e.symbol)}`} className="font-bold text-brand hover:underline">
              {e.symbol}
            </Link>
          )}
          <span className="font-medium">
            <L en={kind.en} ur={kind.ur} />
          </span>
          {compact && <span className="text-xs text-muted">{formatPlainDate(e.event_date)}</span>}
        </div>
        {!compact && e.company_name && e.company_name !== e.symbol && <div className="truncate text-xs text-muted">{e.company_name}</div>}
        <div className="flex flex-wrap gap-x-3 text-xs text-muted">
          {range && (
            <span>
              <L
                en={`${formatPlainDate(e.event_date)} to ${formatPlainDate(e.end_date)}`}
                ur={`${formatPlainDateUr(e.event_date)} سے ${formatPlainDateUr(e.end_date)} تک`}
              />
            </span>
          )}
          {e.event_time && <span>{e.event_time}</span>}
          <Link href={`/item/${e.item_id}`} className="text-brand hover:underline">
            <L en="Notice" ur="نوٹس" />
          </Link>
        </div>
      </div>
    </li>
  );
}

/** Upcoming events. compact: one flat list (sidebars); otherwise grouped by date. */
export function EventList({ events, compact = false }: { events: WebEvent[]; compact?: boolean }) {
  if (!events.length) {
    return (
      <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">
        <L en="No upcoming events found." ur="کوئی آنے والا ایونٹ نہیں ملا۔" />
      </p>
    );
  }
  if (compact) {
    return (
      <ul className="divide-y divide-border rounded-2xl border border-border bg-card px-3">
        {events.map((e) => (
          <EventRow key={`${e.item_id}-${e.kind}`} e={e} compact />
        ))}
      </ul>
    );
  }
  const days: { day: string; events: WebEvent[] }[] = [];
  for (const e of events) {
    const day = e.event_date < pktDay() && e.end_date ? pktDay() : e.event_date; // closures already running show under today
    let bucket = days.find((d) => d.day === day);
    if (!bucket) days.push((bucket = { day, events: [] }));
    bucket.events.push(e);
  }
  days.sort((a, b) => a.day.localeCompare(b.day));
  return (
    <div className="space-y-4">
      {days.map((d) => {
        const label = dayLabel(d.day);
        return (
          <section key={d.day}>
            <h3 className="mb-1 text-sm font-bold text-muted">
              <L en={label.en} ur={label.ur} />
            </h3>
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
              {d.events.map((e) => (
                <EventRow key={`${e.item_id}-${e.kind}`} e={e} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
