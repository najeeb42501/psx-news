import type { Metadata } from "next";
import { DISCLAIMER_EN, DISCLAIMER_UR } from "@/lib/compliance";
import "./globals.css";

export const metadata: Metadata = {
  title: "PSX Alerts",
  description: "PSX company announcements and market news, summarised in English and Urdu.",
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
