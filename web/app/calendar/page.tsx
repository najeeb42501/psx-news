// Calendar: board meetings, AGMs, book closures and briefings for the next 60 days, as an agenda.
import type { Metadata } from "next";
import { CalendarAgenda } from "@/components/calendar/agenda";
import { T } from "@/components/ui/primitives";
import { getUpcoming } from "@/lib/data";
import { currentTime, pktDay } from "@/lib/format";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Calendar: board meetings, AGMs and book closures",
  description: "Upcoming PSX board meetings, AGMs, book closures and corporate briefings, day by day.",
};

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const kind = String((await searchParams).kind ?? "all");
  const events = await getUpcoming(undefined, 60);
  const now = currentTime();
  const companies = new Set(events.map((e) => e.symbol)).size;
  return (
    <div className="space-y-10 pt-8 md:pt-12">
      <header className="space-y-3">
        <p className="eyebrow text-fg-tertiary">
          <T en="Calendar" ur="کیلنڈر" />
        </p>
        <h1 className="text-display-sm md:text-display">
          <T en="What's coming up" ur="آنے والے ایونٹس" />
        </h1>
        <p className="max-w-[680px] text-body text-fg-secondary">
          <T
            en={`${events.length} board meetings, AGMs, book closures and briefings from ${companies} companies in the next 60 days, as announced on PSX. Times are Pakistan time.`}
            ur={`اگلے 60 دنوں میں ${companies} کمپنیوں کی ${events.length} میٹنگز اور بک کلوژر، جیسا کہ PSX پر اعلان کیا گیا۔`}
          />
        </p>
      </header>
      <CalendarAgenda events={events} today={pktDay(now)} initialKind={kind} />
    </div>
  );
}
