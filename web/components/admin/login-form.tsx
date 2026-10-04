"use client";

import { useActionState } from "react";
import { login, type ActionState } from "@/app/admin/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(login, {});
  return (
    <form action={action} className="space-y-2">
      <input
        name="token"
        type="password"
        autoComplete="current-password"
        required
        aria-label="Admin password"
        className="w-full rounded-md border border-border bg-card px-3 py-2"
      />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className="w-full rounded-md bg-brand px-3 py-2 font-semibold text-white">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
