import type { Metadata } from "next";
import { EventList } from "@/components/event-list";
import { getUpcoming } from "@/lib/data";

export const revalidate = 300;
export const metadata: Metadata = { title: "Upcoming events" };

export default async function UpcomingPage() {
  const events = await getUpcoming();
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">
        <span className="ui-en">Upcoming board meetings, AGMs and book closures</span>
        <span className="ui-ur ur ur-tight"> آنے والی بورڈ میٹنگز، AGM اور بک کلوژر</span>
      </h1>
      <p className="text-sm text-muted">Next 45 days, from company notices on PSX. Dates are as announced by the companies.</p>
      <EventList events={events} />
    </div>
  );
}
