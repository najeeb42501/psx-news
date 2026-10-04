import type { Metadata } from "next";
import { LoginForm } from "@/components/admin/login-form";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false } };

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm space-y-3 py-8">
      <h1 className="text-xl font-bold">Admin sign in</h1>
      <p className="text-sm text-muted">Enter the admin password (ADMIN_TOKEN).</p>
      <LoginForm />
    </div>
  );
}
