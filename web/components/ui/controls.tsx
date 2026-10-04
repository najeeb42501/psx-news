"use client";

// Interactive controls: language segmented control, theme toggle.
import { Monitor, Moon, Sun } from "lucide-react";
import { type Lang, type Theme, setLang, setTheme, useLang, useTheme } from "@/lib/client-store";

const LANGS: { value: Lang; label: string; aria: string }[] = [
  { value: "en", label: "EN", aria: "English" },
  { value: "ur", label: "اردو", aria: "Urdu" },
  { value: "both", label: "Both", aria: "English and Urdu" },
];

/** EN · اردو · Both. Pill-shaped track; the chosen option sits on a raised knob. */
export function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const lang = useLang();
  return (
    <div role="radiogroup" aria-label="Language" className="flex rounded-full bg-surface p-0.5">
      {LANGS.map((o) => {
        const on = lang === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.aria}
            onClick={() => setLang(o.value)}
            className={`rounded-full ${compact ? "h-8 px-2.5" : "h-8 px-3"} text-caption transition-colors duration-150 ${
              on ? "bg-background text-fg shadow-[0_1px_2px_rgb(0_0_0/0.08)] ring-1 ring-hairline" : "text-fg-secondary hover:text-fg"
            } ${o.value === "ur" ? "ur !text-[15px] !leading-none" : ""}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const THEME_LABEL: Record<Theme, string> = { system: "System", light: "Light", dark: "Dark" };

/** Cycles System → Light → Dark. */
export function ThemeToggle({ withLabel = false }: { withLabel?: boolean }) {
  const theme = useTheme();
  const I = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <button
      type="button"
      onClick={() => setTheme(NEXT[theme])}
      aria-label={`Theme: ${THEME_LABEL[theme]}. Switch to ${THEME_LABEL[NEXT[theme]]}`}
      className={`inline-flex h-10 items-center gap-2 rounded-full text-fg-secondary transition-colors duration-150 hover:bg-surface hover:text-fg ${
        withLabel ? "px-3 text-caption" : "w-10 justify-center"
      }`}
    >
      <I size={20} strokeWidth={1.5} aria-hidden />
      {withLabel && <span>{THEME_LABEL[theme]}</span>}
    </button>
  );
}
