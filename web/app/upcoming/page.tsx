import type { Metadata } from "next";
import Link from "next/link";
import { EVENT_KIND, EventList } from "@/components/event-list";
import { Icon } from "@/components/icons";
import { L } from "@/components/l";
import { getUpcoming } from "@/lib/data";

export const metadata: Metadata = { title: "Calendar: board meetings, AGMs and book closures" };
export const revalidate = 300;

const FILTERS = [
  { key: "", en: "All", ur: "سب", kinds: undefined },
  { key: "board", en: "Board meetings", ur: "بورڈ میٹنگز", kinds: ["board"] },
  { key: "agm", en: "AGMs", ur: "AGM", kinds: ["agm", "eogm"] },
  { key: "closure", en: "Book closures", ur: "بک کلوژر", kinds: ["book_closure"] },
  { key: "briefing", en: "Briefings", ur: "بریفنگ", kinds: ["briefing"] },
];

export default async function UpcomingPage({ searchParams }: PageProps<"/upcoming">) {
  const key = String((await searchParams).kind ?? "");
  const filter = FILTERS.find((f) => f.key === key) ?? FILTERS[0];
  const events = await getUpcoming(undefined, 45, filter.kinds);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Icon name="calendar" className="size-6 text-brand" />
          <L en="Calendar" ur="کیلنڈر" />
        </h1>
        <p className="text-sm text-muted">
          <L
            en="Board meetings, AGMs and book closures in the next 45 days, as announced by companies on PSX."
            ur="اگلے 45 دنوں کی بورڈ میٹنگز، AGM اور بک کلوژر، جیسا کہ کمپنیوں نے PSX پر اعلان کیا۔"
          />
        </p>
      </header>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key ? `/upcoming?kind=${f.key}` : "/upcoming"}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
              f.key === filter.key ? "border-brand bg-brand text-white" : "border-border bg-card"
            }`}
          >
            {f.kinds && <Icon name={EVENT_KIND[f.kinds[0] as keyof typeof EVENT_KIND].icon} className="size-3.5" />}
            <L en={f.en} ur={f.ur} />
          </Link>
        ))}
      </div>
      <p className="text-sm text-muted">
        {events.length} <L en={events.length === 1 ? "event" : "events"} ur="ایونٹس" />
      </p>
      <EventList events={events} />
    </div>
  );
}
