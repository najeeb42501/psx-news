import type { Metadata, Viewport } from "next";
import { Inter, Noto_Nastaliq_Urdu } from "next/font/google";
import Link from "next/link";
import { FollowButtons } from "@/components/follow-buttons";
import { HeaderSearch } from "@/components/header-search";
import { Icon } from "@/components/icons";
import { LangToggle } from "@/components/lang-toggle";
import { Snackbar } from "@/components/ui/snackbar";
import { BottomNav, TopNav } from "@/components/nav";
import { BRAND, SITE_URL } from "@/lib/brand";
import { DISCLAIMER_EN, DISCLAIMER_UR } from "@/lib/compliance";
import "./globals.css";

// Inter (variable) for English and numbers.
const sans = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
// Urdu font: not preloaded, so English-only visitors don't download it before first paint.
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
  applicationName: BRAND.name,
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: "default" },
  openGraph: { siteName: BRAND.name, type: "website" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

// Runs before first paint: applies the saved language and theme so there is no flash.
const LANG_SCRIPT = `try{var h=document.documentElement,l=localStorage.getItem("lang"),t=localStorage.getItem("theme");if(l==="en"||l==="ur"||l==="both"){h.dataset.lang=l;if(l==="ur"){h.dir="rtl";h.lang="ur"}}if(t==="light"||t==="dark")h.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-lang="en" className={`${sans.variable} ${nastaliq.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: LANG_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col antialiased">
        <header data-old-chrome className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
            <Link href="/" className="flex shrink-0 items-baseline gap-2 font-bold text-brand">
              <span className="text-xl tracking-tight">{BRAND.name}</span>
              <span className="ur ur-tight hidden text-lg sm:inline">{BRAND.nameUr}</span>
            </Link>
            <div className="hidden max-w-md flex-1 md:block">
              <HeaderSearch />
            </div>
            <div className="ms-auto flex items-center gap-2">
              <Link href="/search" aria-label="Search" className="rounded-full p-2 text-foreground/70 hover:bg-brand-soft md:hidden">
                <Icon name="search" className="size-5" />
              </Link>
              <LangToggle />
            </div>
          </div>
          <div className="mx-auto hidden max-w-6xl px-4 pb-2 md:block">
            <TopNav />
          </div>
        </header>

        <main data-old-main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-4 md:pb-8">{children}</main>

        <footer data-old-chrome className="border-t border-border bg-card px-4 pb-24 pt-6 text-sm text-muted md:pb-6">
          <div className="mx-auto max-w-6xl space-y-3">
            <FollowButtons />
            <p>{DISCLAIMER_EN}</p>
            <p className="ur" lang="ur">
              {DISCLAIMER_UR}
            </p>
            <p className="flex flex-wrap gap-x-4 gap-y-1">
              <Link href="/about" className="underline">
                About {BRAND.name}
              </Link>
              <Link href="/search" className="underline">
                Search
              </Link>
              <span>Sources: PSX, SECP and business news sites. Every item links to its original source.</span>
            </p>
          </div>
        </footer>

        <div data-old-chrome>
          <BottomNav />
        </div>
        <Snackbar />
      </body>
    </html>
  );
}
