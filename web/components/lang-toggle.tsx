"use client";

import { type Lang, setLang, useLang } from "@/lib/client-store";

const OPTIONS: { value: Lang; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "ur", label: "اردو" },
];

export function LangToggle() {
  const lang = useLang();
  return (
    <div role="group" aria-label="Language" className="flex rounded-full border border-border p-0.5 text-sm">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setLang(o.value)}
          aria-pressed={lang === o.value}
          className={`rounded-full px-3 py-0.5 ${lang === o.value ? "bg-brand text-white" : "text-foreground/70"} ${
            o.value === "ur" ? "ur ur-tight !leading-normal" : ""
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
