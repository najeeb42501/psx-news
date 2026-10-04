"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
import { L } from "@/components/l";

export const NAV: { href: string; en: string; ur: string; icon: IconName }[] = [
  { href: "/", en: "Feed", ur: "خبریں", icon: "home" },
  { href: "/today", en: "Today", ur: "آج", icon: "today" },
  { href: "/results", en: "Results", ur: "رزلٹس", icon: "table" },
  { href: "/upcoming", en: "Calendar", ur: "کیلنڈر", icon: "calendar" },
  { href: "/my-stocks", en: "My stocks", ur: "میرے شیئرز", icon: "star" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Desktop: tabs under the header. */
export function TopNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden gap-1 md:flex">
      {NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
            isActive(pathname, n.href) ? "bg-brand text-white" : "text-foreground/75 hover:bg-brand-soft"
          }`}
        >
          <Icon name={n.icon} className="size-4" />
          <L en={n.en} ur={n.ur} />
        </Link>
      ))}
    </nav>
  );
}

/** Phones: app-style bar fixed at the bottom. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="grid grid-cols-5">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${
              isActive(pathname, n.href) ? "text-brand" : "text-foreground/60"
            }`}
          >
            <Icon name={n.icon} className="size-5" />
            <L en={n.en} ur={n.ur} />
          </Link>
        ))}
      </div>
    </nav>
  );
}
