"use client";

import { useActionState } from "react";
import { saveEdit, type ActionState } from "@/app/admin/actions";

type Text = { headline: string; body: string };

export function EditSummaryForm({ id, en, ur }: { id: number; en: Text; ur: Text }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveEdit, {});
  const field = "w-full rounded-md border border-border bg-background px-2 py-1 text-sm";
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <input name="headline_en" defaultValue={en.headline} maxLength={90} aria-label="English headline" className={field} />
      <textarea name="body_en" defaultValue={en.body} rows={3} aria-label="English summary" className={field} />
      <input
        name="headline_ur"
        defaultValue={ur.headline}
        maxLength={90}
        dir="rtl"
        aria-label="Urdu headline"
        className={`${field} ur ur-tight`}
      />
      <textarea name="body_ur" defaultValue={ur.body} rows={3} dir="rtl" aria-label="Urdu summary" className={`${field} ur`} />
      {state.needsConfirm && (
        <label className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
          <input type="checkbox" name="confirm_numbers" className="size-4" />
          I checked these numbers against the original filing
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={pending} className="rounded-md bg-brand px-3 py-1 text-sm font-semibold text-white">
          {pending ? "Saving…" : "Save & publish"}
        </button>
        {state.error && (
          <span role="alert" className="text-xs text-red-600">
            {state.error}
          </span>
        )}
        {state.ok && <span className="text-xs text-green-700 dark:text-green-400">{state.ok}</span>}
      </div>
    </form>
  );
}
