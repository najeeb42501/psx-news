import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { DISCLAIMER_EN, DISCLAIMER_UR } from "@/lib/compliance";
import "./globals.css";

export const metadata: Metadata = {
  title: BRAND.name,
  description: BRAND.tagline,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <main className="flex-1">{children}</main>
        <footer className="border-t border-zinc-200 px-4 py-4 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          <p>{DISCLAIMER_EN}</p>
          <p dir="rtl" lang="ur">
            {DISCLAIMER_UR}
          </p>
        </footer>
      </body>
    </html>
  );
}
