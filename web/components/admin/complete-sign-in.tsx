"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { completeSignIn } from "@/app/admin/actions";

export function CompleteSignIn() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    history.replaceState(null, "", window.location.pathname); // don't leave the token in the address bar
    const token = params.get("access_token");
    if (!token) {
      void Promise.resolve().then(() =>
        setError(params.get("error_description")?.replace(/\+/g, " ") ?? "This link has no sign-in token. Request a new link."),
      );
      return;
    }
    void completeSignIn(token).then((r) => (r.error ? setError(r.error) : router.replace("/admin")));
  }, [router]);

  if (!error) return <p className="text-sm text-muted">Checking your sign-in link…</p>;
  return (
    <div className="space-y-2">
      <p role="alert" className="text-sm text-red-600">
        {error}
      </p>
      <Link href="/admin/login" className="text-sm text-brand underline">
        Back to sign in
      </Link>
    </div>
  );
}
