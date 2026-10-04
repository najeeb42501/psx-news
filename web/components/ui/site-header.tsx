"use client";

// One-row sticky header (64px): wordmark, text navigation, search, language, theme.
// White at 80% with blur; a hairline appears once the page scrolls. Mobile: wordmark, search,
// language; the bottom tab bar (tab-bar.tsx) carries navigation.
import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CommandPalette } from "@/components/ui/command-palette";
import { LanguageSwitch, ThemeToggle } from "@/components/ui/controls";
import { T } from "@/components/ui/primitives";

export const NAV = [
  { href: "/", en: "Home", ur: "ہوم" },
  { href: "/today", en: "Today", ur: "آج" },
  { href: "/results", en: "Results", ur: "رزلٹس" },
  { href: "/upcoming", en: "Calendar", ur: "کیلنڈر" },
  { href: "/my-stocks", en: "My stocks", ur: "میرے شیئرز" },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function Wordmark() {
  return (
    <Link href="/" className="flex shrink-0 items-baseline gap-2" aria-label="ShareKhabar home">
      <span className="text-[19px] font-semibold tracking-[-0.02em] text-fg">ShareKhabar</span>
      <span className="ur ur-tight hidden !text-[15px] !leading-none text-fg-tertiary sm:inline" aria-hidden>
        شیئر خبر
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 border-b bg-background/80 backdrop-blur-xl backdrop-saturate-150 transition-colors duration-200 ${
        scrolled ? "border-hairline" : "border-transparent"
      }`}
    >
      <div className="page-container flex h-16 items-center gap-6">
        <Wordmark />
        <nav aria-label="Main" className="hidden h-full flex-1 justify-center md:flex">
          <ul className="flex h-full items-stretch gap-7">
            {NAV.map((n) => {
              const on = isActive(pathname, n.href);
              return (
                <li key={n.href} className="flex">
                  <Link
                    href={n.href}
                    aria-current={on ? "page" : undefined}
                    className={`flex items-center border-b-2 pt-0.5 text-body font-medium transition-colors duration-150 ${
                      on ? "border-brand text-fg" : "border-transparent text-fg-secondary hover:text-fg"
                    }`}
                  >
                    <T en={n.en} ur={n.ur} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="ms-auto flex items-center gap-1.5 md:ms-0">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search (Ctrl+K)"
            className="inline-flex h-10 items-center gap-2 rounded-full text-fg-secondary transition-colors duration-150 hover:bg-surface hover:text-fg max-lg:w-10 max-lg:justify-center lg:px-3"
          >
            <Search size={20} strokeWidth={1.5} aria-hidden />
            <kbd className="hidden rounded-md border border-hairline px-1.5 text-[11px] font-medium text-fg-tertiary lg:inline">Ctrl K</kbd>
          </button>
          <LanguageSwitch compact />
          <span className="hidden md:inline-flex">
            <ThemeToggle />
          </span>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </header>
  );
}
