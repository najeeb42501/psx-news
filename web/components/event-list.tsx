import Link from "next/link";
import type { WebEvent } from "@/lib/data";
import { formatPlainDate, formatPlainDateUr } from "@/lib/format";

const KIND = {
  board: { en: "Board meeting", ur: "بورڈ میٹنگ" },
  agm: { en: "AGM", ur: "AGM" },
  eogm: { en: "EOGM", ur: "EOGM" },
  briefing: { en: "Corporate briefing", ur: "کارپوریٹ بریفنگ" },
  book_closure: { en: "Book closure", ur: "بک کلوژر" },
} as const;

export function EventList({ events, showCompany = true }: { events: WebEvent[]; showCompany?: boolean }) {
  if (!events.length) return <p className="text-muted">No upcoming events found.</p>;
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {events.map((e) => {
        const kind = KIND[e.kind] ?? KIND.board;
        const range = e.end_date && e.end_date !== e.event_date;
        const whenEn = range ? `${formatPlainDate(e.event_date)} – ${formatPlainDate(e.end_date)}` : formatPlainDate(e.event_date);
        const whenUr = range
          ? `${formatPlainDateUr(e.event_date)} سے ${formatPlainDateUr(e.end_date)} تک`
          : formatPlainDateUr(e.event_date);
        return (
          <li key={`${e.item_id}-${e.kind}`} className="flex items-start gap-3 p-3 text-sm">
            <div className="w-28 shrink-0 font-semibold tabular-nums">
              <span className="ui-en">{whenEn}</span>
              <span className="ui-ur ur ur-tight">{whenUr}</span>
              {e.event_time && <div className="text-xs font-normal text-muted">{e.event_time}</div>}
            </div>
            <div className="min-w-0">
              <div>
                <span className="font-medium">
                  <span className="ui-en">{kind.en}</span>
                  <span className="ui-ur ur ur-tight">{kind.ur}</span>
                </span>
                {showCompany && e.symbol && (
                  <>
                    {" · "}
                    <Link href={`/company/${encodeURIComponent(e.symbol)}`} className="font-bold text-brand">
                      {e.symbol}
                    </Link>
                  </>
                )}
              </div>
              {showCompany && e.company_name && e.company_name !== e.symbol && (
                <div className="truncate text-xs text-muted">{e.company_name}</div>
              )}
              <Link href={`/item/${e.item_id}`} className="text-xs text-brand underline">
                Notice
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
