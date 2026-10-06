import type { Metadata, Viewport } from "next";
import { Inter, Noto_Nastaliq_Urdu } from "next/font/google";
import { SiteFooter } from "@/components/ui/site-footer";
import { SiteHeader } from "@/components/ui/site-header";
import { Snackbar } from "@/components/ui/snackbar";
import { TabBar } from "@/components/ui/tab-bar";
import { BRAND, SITE_URL } from "@/lib/brand";
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
const LANG_SCRIPT = `try{var h=document.documentElement,l=localStorage.getItem("lang"),t=localStorage.getItem("theme");if(l==="en"||l==="ur"||l==="both"){h.dataset.lang=l;if(l==="ur"){h.dir="rtl";h.lang="ur"}}if(t==="light"||t==="dark")h.dataset.theme=t;if(localStorage.getItem("visited"))h.dataset.returning="1"}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-lang="en" className={`${sans.variable} ${nastaliq.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: LANG_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-fg focus:px-3 focus:py-2 focus:text-background">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="page-container flex-1 pb-8">
          {children}
        </main>
        <SiteFooter />
        <TabBar />
        <Snackbar />
      </body>
    </html>
  );
}
