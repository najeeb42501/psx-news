"use client";

import { useActionState } from "react";
import { passwordLogin, requestLink, type ActionState } from "@/app/admin/actions";

const field = "w-full rounded-md border border-border bg-card px-3 py-2";

export function LoginForm({ allowPassword }: { allowPassword: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(requestLink, {});
  return (
    <div className="space-y-6">
      <form action={action} className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium">
          Admin email
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className={field} />
        {state.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
        {state.ok && <p className="text-sm text-green-700 dark:text-green-400">{state.ok}</p>}
        <button disabled={pending} className="w-full rounded-md bg-brand px-3 py-2 font-semibold text-white">
          {pending ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>
      {allowPassword && <PasswordForm />}
    </div>
  );
}

function PasswordForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(passwordLogin, {});
  return (
    <details className="rounded-md border border-border p-3 text-sm">
      <summary className="cursor-pointer">Emergency sign-in with the admin password</summary>
      <form action={action} className="mt-3 space-y-2">
        <input name="email" type="email" autoComplete="email" required aria-label="Admin email" placeholder="Admin email" className={field} />
        <input name="token" type="password" autoComplete="current-password" required aria-label="Admin password" placeholder="Admin password" className={field} />
        {state.error && (
          <p role="alert" className="text-red-600">
            {state.error}
          </p>
        )}
        <button disabled={pending} className="w-full rounded-md border border-border px-3 py-2 font-semibold">
          {pending ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-xs text-muted">Turned on by ADMIN_ALLOW_PASSWORD=1. Remove that line once email sign-in works.</p>
      </form>
    </details>
  );
}
