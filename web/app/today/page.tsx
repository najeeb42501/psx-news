import type { Metadata } from "next";
import { ItemList } from "@/components/item-card";
import { getToday } from "@/lib/data";
import { formatPlainDate, pktDay } from "@/lib/format";

export const revalidate = 60;
export const metadata: Metadata = { title: "Today's 10 things" };

export default async function TodayPage() {
  const { day, items } = await getToday();
  const isToday = day === pktDay();
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">
        <span className="ui-en">{isToday ? "Today's 10 things" : `10 things from ${formatPlainDate(day)}`}</span>
        <span className="ui-ur ur ur-tight"> آج کی 10 اہم باتیں</span>
      </h1>
      {!isToday && day && (
        <p className="text-sm text-muted">No announcements yet today, so this shows the latest market day.</p>
      )}
      <ItemList items={items} empty="No announcements yet." />
    </div>
  );
}
