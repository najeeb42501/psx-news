import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { CategoryBadge, Chips } from "@/components/item-card";
import { L } from "@/components/l";
import { getToday } from "@/lib/data";
import { keyChips } from "@/lib/facts";
import { formatPlainDate, formatPlainDateUr, pktDay } from "@/lib/format";
import { UrduText } from "@/components/urdu-text";

export const revalidate = 60;
export const metadata: Metadata = { title: "Today's 10 things" };

export default async function TodayPage() {
  const { day, items } = await getToday();
  const isToday = day === pktDay();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Icon name="today" className="size-6 text-brand" />
          <L en={isToday ? "Today's 10 things" : "10 things from the last market day"} ur="آج کی 10 اہم باتیں" />
        </h1>
        {day && (
          <p className="text-sm text-muted">
            <L en={formatPlainDate(day)} ur={formatPlainDateUr(day)} />
            {!isToday && (
              <>
                {" · "}
                <L en="No announcements yet today, so this shows the latest market day." ur="آج ابھی کوئی اعلان نہیں، اس لیے پچھلے دن کی خبریں۔" />
              </>
            )}
          </p>
        )}
      </header>
      {items.length === 0 && <p className="text-muted">No announcements yet.</p>}
      <ol className="space-y-3">
        {items.map((it, i) => (
          <li key={it.id} className="flex gap-4 rounded-2xl border border-border bg-card p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-bold text-white">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {it.symbol && (
                  <Link href={`/company/${encodeURIComponent(it.symbol)}`} className="font-bold text-brand">
                    {it.symbol}
                  </Link>
                )}
                <CategoryBadge category={it.category} />
              </div>
              <Link href={`/item/${it.id}`} className="block font-semibold leading-snug hover:text-brand">
                <span className="en-only">{it.headline_en}</span>
                <span className="ur-only ur block">{it.headline_ur && <UrduText text={it.headline_ur} />}</span>
              </Link>
              <Chips chips={keyChips(it.facts)} />
              {it.body_en && <p className="en-only text-sm text-foreground/80">{it.body_en}</p>}
              {it.body_ur && <p className="ur-only ur text-sm text-foreground/80"><UrduText text={it.body_ur} /></p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
