// Empty states and loading skeletons. Skeletons match the real layouts exactly, so nothing shifts.
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ButtonLink, Ico, T } from "@/components/ui/primitives";

/** Small icon, one sentence, one useful action or a few suggestions. Never a big blank box. */
export function EmptyState({ icon, text, action, suggestions }: {
  icon: LucideIcon;
  text: { en: string; ur: string };
  action?: { href: string; label: { en: string; ur: string } };
  suggestions?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 py-8">
      <span className="grid size-10 place-items-center rounded-full bg-surface text-fg-secondary">
        <Ico icon={icon} />
      </span>
      <p className="text-body text-fg-secondary">
        <T en={text.en} ur={text.ur} />
      </p>
      {suggestions}
      {action && (
        <ButtonLink href={action.href} variant="secondary">
          <T en={action.label.en} ur={action.label.ur} />
        </ButtonLink>
      )}
    </div>
  );
}

/** One-tap suggestions under an empty state (e.g. popular symbols to follow). */
export function Suggestions({ items }: { items: { label: string; href: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((s) => (
        <li key={s.label}>
          <Link href={s.href} className="inline-flex h-9 items-center rounded-full bg-surface px-3.5 font-mono text-[13px] font-semibold hover:bg-hairline">
            {s.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Bar({ className }: { className: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}

export function NewsRowSkeleton() {
  return (
    <div className="space-y-2.5 border-b border-hairline py-5">
      <Bar className="h-4 w-40" />
      <Bar className="h-5 w-4/5" />
      <Bar className="h-4 w-full" />
      <Bar className="h-4 w-2/3" />
      <Bar className="h-3.5 w-24" />
    </div>
  );
}

export function FeaturedCardSkeleton({ lead = false }: { lead?: boolean }) {
  return (
    <div className={`space-y-3 rounded-[var(--radius-card)] border border-hairline ${lead ? "p-6 md:p-8" : "p-5"}`}>
      <Bar className="h-4 w-36" />
      <Bar className={lead ? "h-9 w-11/12" : "h-5 w-4/5"} />
      {lead && <Bar className="h-9 w-3/5" />}
      {lead && <Bar className="h-4 w-full" />}
      <Bar className="h-3.5 w-24" />
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div aria-hidden className="divide-y divide-hairline border-y border-hairline">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-6 py-3.5">
          {Array.from({ length: cols }, (_, c) => (
            <Bar key={c} className={`h-4 ${c === 0 ? "w-32" : "ms-auto w-16"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Screen-reader text for a loading region. */
export function LoadingLabel() {
  return (
    <span role="status" className="sr-only">
      Loading
    </span>
  );
}
