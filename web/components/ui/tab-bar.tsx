"use client";

// Phone navigation: five tabs with icon + label, fixed to the bottom, clear of the home indicator.
import { CalendarDays, ChartColumn, Clock, House, Star } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { T } from "@/components/ui/primitives";
import { NAV, isActive } from "@/components/ui/site-header";

const ICONS = [House, Clock, ChartColumn, CalendarDays, Star];

export function TabBar({ preview = false }: { preview?: boolean }) {
  const pathname = usePathname();
  const place = preview
    ? "relative" // static copy on the /design page
    : "fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)] md:hidden";
  return (
    <nav
      aria-label={preview ? "Tab bar preview" : "Main"}
      className={`${place} border-t border-hairline bg-background/85 backdrop-blur-xl backdrop-saturate-150`}
    >
      <ul className="grid min-h-16 grid-cols-5">
        {NAV.map((n, i) => {
          const on = isActive(preview ? "/" : pathname, n.href); // the preview shows Home as active
          const I = ICONS[i];
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                aria-current={on ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium [&_.ur]:!leading-[1.6] ${on ? "text-brand" : "text-fg-secondary"}`}
              >
                <I size={22} strokeWidth={on ? 1.8 : 1.5} aria-hidden />
                <T en={n.en} ur={n.ur} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
