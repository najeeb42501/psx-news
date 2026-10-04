import type { Metadata } from "next";
import { CompleteSignIn } from "@/components/admin/complete-sign-in";

export const metadata: Metadata = { title: "Signing in", robots: { index: false } };

// The emailed link lands here. Supabase puts the one-time access token in the URL fragment
// (#access_token=...), which only the browser can read, so a small client component hands it over.
export default function AuthCallbackPage() {
  return (
    <div className="mx-auto max-w-sm space-y-3 py-8">
      <h1 className="text-xl font-bold">Signing in</h1>
      <CompleteSignIn />
    </div>
  );
}
