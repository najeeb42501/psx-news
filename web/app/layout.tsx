import type { Metadata, Viewport } from "next";
import { Noto_Nastaliq_Urdu, Noto_Sans } from "next/font/google";
import Link from "next/link";
import { FollowButtons } from "@/components/follow-buttons";
import { LangToggle } from "@/components/lang-toggle";
import { BRAND, SITE_URL } from "@/lib/brand";
import { DISCLAIMER_EN, DISCLAIMER_UR } from "@/lib/compliance";
import "./globals.css";

const sans = Noto_Sans({ subsets: ["latin"], variable: "--font-noto-sans", display: "swap" });
// Urdu font is only needed when Urdu is shown, so it is not preloaded.
const nastaliq = Noto_Nastaliq_Urdu({
  subsets: ["arabic"],
  weight: ["400", "700"],
  variable: "--font-nastaliq",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${BRAND.name} – PSX news in English and Urdu`, template: `%s · ${BRAND.name}` },
  description: BRAND.tagline,
  openGraph: { siteName: BRAND.name, type: "website" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f766e" };

// Runs before first paint: applies the saved language so there is no flash.
const LANG_SCRIPT = `try{var l=localStorage.getItem("lang");if(l==="en"||l==="ur"||l==="both")document.documentElement.dataset.lang=l}catch(e){}`;

const NAV = [
  { href: "/", en: "Feed", ur: "خبریں" },
  { href: "/today", en: "Today", ur: "آج" },
  { href: "/upcoming", en: "Upcoming", ur: "آنے والے" },
  { href: "/my-stocks", en: "My stocks", ur: "میرے شیئرز" },
  { href: "/search", en: "Search", ur: "تلاش" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-lang="en" className={`${sans.variable} ${nastaliq.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: LANG_SCRIPT }} />
      </head>
      <body className="min-h-dvh flex flex-col antialiased">
        <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2">
            <Link href="/" className="flex items-baseline gap-2 font-bold text-brand">
              <span className="text-lg">{BRAND.name}</span>
              <span className="ur ur-tight text-base">{BRAND.nameUr}</span>
            </Link>
            <LangToggle />
          </div>
          <nav className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-2 pb-2 text-sm">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="whitespace-nowrap rounded-full px-3 py-1 text-foreground/80 hover:bg-brand-soft hover:text-foreground"
              >
                <span className="ui-en">{n.en}</span>
                <span className="ui-ur ur ur-tight"> {n.ur}</span>
              </Link>
            ))}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">{children}</main>

        <footer className="border-t border-border bg-card px-4 py-6 text-sm text-muted">
          <div className="mx-auto max-w-3xl space-y-3">
            <FollowButtons />
            <p>{DISCLAIMER_EN}</p>
            <p className="ur" lang="ur">
              {DISCLAIMER_UR}
            </p>
            <p>
              <Link href="/about" className="underline">
                About {BRAND.name}
              </Link>{" "}
              · Sources: PSX, SECP and business news sites. Every item links to its original source.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
