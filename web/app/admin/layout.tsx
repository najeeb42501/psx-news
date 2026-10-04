import type { Metadata } from "next";
import Link from "next/link";
import { logout } from "@/app/admin/actions";
import { isAdmin } from "@/lib/admin";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const signedIn = await isAdmin();
  return (
    <div className="space-y-4">
      {signedIn && (
        <nav className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 text-sm">
          <b>Admin</b>
          <Link href="/admin" className="underline">
            Review queue
          </Link>
          <Link href="/admin/jobs" className="underline">
            Jobs &amp; health
          </Link>
          <Link href="/admin/whatsapp" className="underline">
            WhatsApp queue
          </Link>
          <form action={logout} className="ml-auto">
            <button className="text-muted underline">Sign out</button>
          </form>
        </nav>
      )}
      {children}
    </div>
  );
}
