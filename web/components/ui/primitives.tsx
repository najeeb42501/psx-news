// Small building blocks of the design system. Everything here uses the tokens in app/globals.css.
import type { LucideIcon, LucideProps } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { UrduText } from "@/components/urdu-text";

/** One icon style everywhere: Lucide outline, 20px, 1.5px stroke. */
export function Ico({ icon: I, size = 20, ...rest }: { icon: LucideIcon } & LucideProps) {
  return <I size={size} strokeWidth={1.5} aria-hidden {...rest} />;
}

/** The single page container (max 1200px, 20/32px sides): every page uses it, so edges never jump. */
export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`page-container ${className}`}>{children}</div>;
}

/** Bilingual interface label: English normally, Urdu in Urdu mode . */
export function T({ en, ur }: { en: string; ur: string }) {
  return (
    <>
      <span className="ui-en">{en}</span>
      <span className="ui-ur ur ur-tight !leading-normal">{ur}</span>
    </>
  );
}

type Variant = "primary" | "secondary" | "ghost";
const VARIANTS: Record<Variant, string> = {
  // Primary is near-black (inverted in dark mode): the brand colour stays reserved for links and focus.
  primary: "bg-fg text-background hover:opacity-85",
  secondary: "bg-surface text-fg hover:bg-hairline",
  ghost: "text-brand hover:bg-surface",
};
const BUTTON =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 text-body font-medium " +
  "transition-[background-color,opacity] duration-150 disabled:pointer-events-none disabled:opacity-40";

export function Button({ variant = "secondary", className = "", ...rest }: { variant?: Variant } & ComponentProps<"button">) {
  return <button type="button" className={`${BUTTON} ${VARIANTS[variant]} ${className}`} {...rest} />;
}

export function ButtonLink({ variant = "secondary", className = "", ...rest }: { variant?: Variant } & ComponentProps<typeof Link>) {
  return <Link className={`${BUTTON} ${VARIANTS[variant]} ${className}`} {...rest} />;
}

/** A company symbol: caption-size monospace text on a soft pill. */
export function SymbolBadge({ symbol, href }: { symbol: string; href?: string }) {
  const cls = "relative z-10 inline-flex h-6 items-center rounded-full bg-surface px-2.5 font-mono text-[12px] font-semibold tracking-wide text-fg";
  return href ? (
    <Link href={href} className={`${cls} hover:bg-hairline`}>
      {symbol}
    </Link>
  ) : (
    <span className={cls}>{symbol}</span>
  );
}

/** The quiet line above a headline: SYMBOL · CATEGORY · time. */
export function MetaLine({ symbol, symbolHref, category, time }: {
  symbol?: string | null;
  symbolHref?: string;
  category?: { en: string; ur: string };
  time?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-tertiary">
      {symbol && <SymbolBadge symbol={symbol} href={symbolHref} />}
      {category && (
        <span className="eyebrow text-fg-secondary">
          <T en={category.en} ur={category.ur} />
        </span>
      )}
      {category && time && <span aria-hidden>·</span>}
      {time && (
        <time dir="ltr" className="[unicode-bidi:isolate]">
          {time}
        </time>
      )}
    </div>
  );
}

export type Figure = { en: string; ur: string; value: string; valueUr: string; tone: "pos" | "neg" | "neutral" };
const TONE = { pos: "text-positive", neg: "text-negative", neutral: "text-fg" };

/** One key number beside a news row: "Profit Rs 34.3m". */
export function KeyFigurePill({ figure }: { figure: Figure }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-full border border-hairline px-3 py-1 text-caption">
      <span className="text-fg-tertiary">
        <T en={figure.en} ur={figure.ur} />
      </span>
      <span className={`tabular font-semibold ${TONE[figure.tone]}`}>
        <span className="ui-en">{figure.value}</span>
        <span className="ui-ur ur ur-tight !leading-normal">
          <UrduText text={figure.valueUr} />
        </span>
      </span>
    </span>
  );
}

/** A stat tile in a "Key figures" grid: label, value, and the change vs last year when stated. */
export function StatTile({ figure, change }: { figure: Figure; change?: { text: string; up: boolean } }) {
  return (
    <div className="space-y-1 rounded-[var(--radius-card)] bg-surface p-4">
      <div className="text-caption text-fg-secondary">
        <T en={figure.en} ur={figure.ur} />
      </div>
      <div className={`tabular text-headline ${TONE[figure.tone]}`}>
        <span className="ui-en">{figure.value}</span>
        <span className="ui-ur ur ur-tight block whitespace-nowrap !text-[20px] !leading-[40px]">
          <UrduText text={figure.valueUr} />
        </span>
      </div>
      {change && (
        <div className={`text-caption ${change.up ? "text-positive" : "text-negative"}`}>
          <span aria-hidden>{change.up ? "▲" : "▼"}</span> {change.text}
        </div>
      )}
    </div>
  );
}

/** Section title with an optional "See all" link on the same baseline. */
export function SectionHeader({ title, href, linkLabel = { en: "See all", ur: "سب دیکھیں" }, size = "title", id }: {
  title: { en: string; ur: string };
  href?: string;
  linkLabel?: { en: string; ur: string };
  size?: "title" | "headline";
  id?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 id={id} className={size === "headline" ? "text-headline" : "text-title"}>
        <T en={title.en} ur={title.ur} />
      </h2>
      {href && (
        <Link href={href} className="shrink-0 text-caption text-brand hover:underline">
          <T en={linkLabel.en} ur={linkLabel.ur} /> <span aria-hidden className="rtl:hidden">→</span>
          <span aria-hidden className="ltr:hidden">←</span>
        </Link>
      )}
    </div>
  );
}
