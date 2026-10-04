// /design: every component of the new design system and its states, with real items from the
// database. Admin only (proxy.ts), not linked from the site. Approve it before pages are rebuilt.
import { Inbox, Star } from "lucide-react";
import type { Metadata } from "next";
import { PaletteResults } from "@/components/ui/command-palette";
import { LanguageSwitch, ThemeToggle } from "@/components/ui/controls";
import { type Column, DataTable, type Row } from "@/components/ui/data-table";
import { OpenPaletteDemo, SnackbarDemo } from "@/components/ui/design-demos";
import {
  EmptyState,
  FeaturedCardSkeleton,
  NewsRowSkeleton,
  Suggestions,
  TableSkeleton,
} from "@/components/ui/feedback";
import { FilterBar, SheetForm } from "@/components/ui/filter-bar";
import { FeaturedCard, NewsRow } from "@/components/ui/news";
import {
  Button,
  ButtonLink,
  type Figure,
  KeyFigurePill,
  MetaLine,
  SectionHeader,
  StatTile,
  SymbolBadge,
} from "@/components/ui/primitives";
import { SiteFooter } from "@/components/ui/site-footer";
import { SiteHeader } from "@/components/ui/site-header";
import { SnackbarView } from "@/components/ui/snackbar";
import { TabBar } from "@/components/ui/tab-bar";
import { isNews } from "@/lib/categories";
import { type WebItem, getFeed, getResults, getSectors } from "@/lib/data";
import { keyFigure, money } from "@/lib/facts";
import { currentTime, formatNumber, formatPlainDate, formatShortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Design system", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// Until the pages are rebuilt (step 2), the root layout still renders the old header and footer.
const HIDE_OLD = "[data-old-chrome]{display:none!important}[data-old-main]{max-width:none!important;padding:0!important}";

const COLOURS: { token: string; light: string; dark: string; use: string; fg?: boolean }[] = [
  { token: "background", light: "#FFFFFF", dark: "#000000", use: "Page" },
  { token: "surface", light: "#F5F5F7", dark: "#1C1C1E", use: "Sections, inputs, hover" },
  { token: "surface-raised", light: "#FFFFFF", dark: "#2C2C2E", use: "Featured cards, menus" },
  { token: "hairline", light: "#E5E5EA", dark: "#38383A", use: "1px dividers and borders" },
  { token: "fg", light: "#1D1D1F", dark: "#F5F5F7", use: "Text · 16.8:1", fg: true },
  { token: "fg-secondary", light: "#5E5E63", dark: "#A1A1A6", use: "Summaries · 6.4:1", fg: true },
  { token: "fg-tertiary", light: "#6E6E73", dark: "#98989D", use: "Timestamps, captions · 5.1:1", fg: true },
  { token: "brand", light: "#0F766E", dark: "#2DD4BF", use: "Links, active, focus · 5.5:1", fg: true },
  { token: "positive", light: "#1A7F37", dark: "#30D158", use: "Up numbers only · 5.1:1", fg: true },
  { token: "negative", light: "#C62828", dark: "#FF6961", use: "Down numbers only · 5.6:1", fg: true },
];

const TYPE: { cls: string; name: string; spec: string; sample: string }[] = [
  { cls: "text-display-sm md:text-display", name: "Display", spec: "40/48 · 600 · −2% (32/38 on phones)", sample: "Today's market news" },
  { cls: "text-headline", name: "Headline", spec: "28/34 · 600 · −1.5%", sample: "Diamond Industries announces Rs 1 final dividend" },
  { cls: "text-title", name: "Title", spec: "17/24 · 600", sample: "KOHE reports revenue of Rs 6,355.1 million for the year" },
  { cls: "text-body text-fg-secondary", name: "Body", spec: "15/22 · 400", sample: "The board recommended no cash dividend, bonus shares or right shares for the year ended 30 June 2026." },
  { cls: "text-caption text-fg-tertiary", name: "Caption", spec: "13/18 · 500", sample: "PSX filing · 2 Oct · 3:45 pm" },
  { cls: "eyebrow text-fg-secondary", name: "Eyebrow", spec: "12/16 · 600 · uppercase · +6%", sample: "Results" },
];

const SPACING = [4, 8, 12, 16, 24, 32, 48, 64, 96];

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-6 border-t border-hairline pt-10">
      <div className="space-y-1">
        <h2 id={id} dir="ltr" className="text-headline rtl:text-end">
          {title}
        </h2>
        {note && (
          <p dir="ltr" className="max-w-[680px] text-body text-fg-secondary rtl:ms-auto rtl:text-end">
            {note}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p dir="ltr" className="eyebrow mb-3 text-fg-tertiary rtl:text-end">
      {children}
    </p>
  );
}

function resultRows(items: WebItem[]): Row[] {
  type F = { value: number; unit?: string | null };
  return items.slice(0, 12).map((it) => {
    const f = it.facts as Record<string, F & { value: number }> & {
      period_kind?: string;
      period_end?: { value: string };
    };
    const kind = { year: "Year", half_year: "Half year", quarter: "Quarter", nine_months: "9 months" }[f.period_kind ?? ""] ?? null;
    const pat = f.profit_after_tax;
    const change = f.profit_change_pct;
    return {
      key: String(it.id),
      href: `/item/${it.id}`,
      cells: {
        company: { text: it.symbol ?? "", sub: it.company_name ?? undefined },
        period: { text: kind && f.period_end ? `${kind} to ${formatPlainDate(f.period_end.value).replace(/ 20\d\d$/, "")}` : null },
        revenue: { text: f.revenue ? money(f.revenue).replace(" million", "m").replace(" billion", "bn") : null, sort: f.revenue?.value ?? null },
        pat: {
          text: pat ? `${pat.value < 0 ? "−" : ""}${money(pat).replace(" million", "m").replace(" billion", "bn")}` : null,
          sort: pat?.value ?? null,
        },
        change: change ? { text: `${formatNumber(Math.abs(change.value))}%`, sort: change.value, tone: change.value >= 0 ? "pos" : "neg" } : { text: null },
        eps: { text: f.eps ? `${f.eps.value < 0 ? "−" : ""}Rs ${formatNumber(Math.abs(f.eps.value), 4)}` : null, sort: f.eps?.value ?? null },
        dividend: { text: f.cash_dividend_rs ? `Rs ${formatNumber(f.cash_dividend_rs.value, 4)}` : null, sort: f.cash_dividend_rs?.value ?? null },
        announced: { text: formatShortDate(it.sort_time), sort: it.sort_time },
      },
    };
  });
}

const RESULT_COLUMNS: Column[] = [
  { key: "company", label: "Company", mobile: true },
  { key: "period", label: "Period", hideBelow: "lg" },
  { key: "revenue", label: "Revenue", numeric: true, hideBelow: "lg" },
  { key: "pat", label: "Profit after tax", numeric: true, mobile: true },
  { key: "change", label: "vs last year", numeric: true },
  { key: "eps", label: "EPS", numeric: true, mobile: true },
  { key: "dividend", label: "Dividend", numeric: true, mobile: true },
  { key: "announced", label: "Announced", numeric: true },
];

export default async function DesignPage() {
  const now = currentTime();
  const [feed, results, dividends, meetings, sectors] = await Promise.all([
    getFeed({ importantOnly: true }),
    getResults(40),
    getFeed({ type: "dividends" }),
    getFeed({ type: "meetings" }),
    getSectors(),
  ]);
  // Headlines still carrying an outlet prefix/suffix are fixed in step 3 (content); leave them out here.
  const clean = (i: WebItem) => !/^(Dawn|ProPakistani|Express Tribune|Business Recorder):|: (Dawn|ProPakistani|Express Tribune|Business Recorder)$/.test(i.headline_en ?? "");
  const withFigure = results.filter((i) => keyFigure(i.facts));
  const news = feed.filter((i) => isNews(i.source_id) && clean(i));
  const rows = [withFigure[1], dividends.find((i) => keyFigure(i.facts)), meetings[0], news[0]].filter((i): i is WebItem => !!i);
  const lead = withFigure[0] ?? feed[0];
  const secondary = [withFigure[2], withFigure[3], news[1]].filter((i): i is WebItem => !!i);

  const figures: Figure[] = [
    { en: "Profit", ur: "پرافٹ", value: "Rs 34.3m", valueUr: "34.3 ملین روپے", tone: "pos" },
    { en: "Loss", ur: "نقصان", value: "Rs 164.8m", valueUr: "164.8 ملین روپے", tone: "neg" },
    { en: "Dividend", ur: "ڈیویڈنڈ", value: "Rs 1/share", valueUr: "1 روپے فی شیئر", tone: "neutral" },
  ];

  return (
    <>
      <style>{HIDE_OLD}</style>
      <SiteHeader />
      <div className="page-container space-y-16 pb-16 pt-10 md:space-y-20 md:pt-16">
        <header dir="ltr" className="space-y-3 rtl:text-end">
          <p className="eyebrow text-fg-tertiary">ShareKhabar · v1.1 redesign · step 1</p>
          <h1 className="text-display-sm md:text-display">Design system</h1>
          <p className="max-w-[680px] text-body text-fg-secondary rtl:ms-auto">
            Every component and state, built once in <code className="font-mono text-[13px]">components/ui</code> and used
            everywhere. Real items from the database. Switch language and theme in the header to check Urdu and dark mode.
            This page is for review only and is not linked from the site.
          </p>
        </header>

        <Section id="colour" title="Colour" note="Neutral first. Brand teal only for links, the active nav item and focus. Green and red only for factual up/down numbers. Contrast is for each colour on the page background (WCAG AA needs 4.5:1).">
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
            {COLOURS.map((c) => (
              <div key={c.token} className="space-y-2">
                <div className="h-16 rounded-[var(--radius-card)] border border-hairline" style={{ background: `var(--${c.token})` }} />
                <div dir="ltr" className="rtl:text-end">
                  <p className="font-mono text-[13px] font-semibold">{c.token}</p>
                  <p className="text-caption text-fg-tertiary">
                    {c.light} / {c.dark}
                  </p>
                  <p className="text-caption text-fg-secondary">{c.use}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section id="type" title="Typography" note="Inter for English and numbers (tabular figures everywhere). Noto Nastaliq Urdu at 17/34, never below 15px.">
          <div className="divide-y divide-hairline border-y border-hairline">
            {TYPE.map((t) => (
              <div key={t.name} className="grid gap-2 py-5 md:grid-cols-12 md:gap-6">
                <div dir="ltr" className="md:col-span-3 rtl:text-end">
                  <p className="text-body font-semibold">{t.name}</p>
                  <p className="text-caption text-fg-tertiary">{t.spec}</p>
                </div>
                <p className={`md:col-span-9 ${t.cls}`}>{t.sample}</p>
              </div>
            ))}
            <div className="grid gap-2 py-5 md:grid-cols-12 md:gap-6">
              <div className="md:col-span-3">
                <p className="text-body font-semibold">Urdu</p>
                <p className="text-caption text-fg-tertiary">17/34 · Noto Nastaliq Urdu</p>
              </div>
              <p className="ur text-[17px] leading-[34px] md:col-span-9" lang="ur">
                Diamond Industries Limited نے 30 جون 2026 کو ختم ہونے والے سال کے لیے 34.3 ملین روپے آفٹر ٹیکس پرافٹ رپورٹ کیا، جس میں EPS 4.25 روپے رہی۔
              </p>
            </div>
          </div>
        </Section>

        <Section id="space" title="Spacing, radius, elevation" note="Spacing 4–96 only. Section gaps 48 on phones, 64 on desktop. Radius 12 for cards, 10 for inputs and buttons, full for pills. No shadows except menus and dialogs.">
          <div className="grid gap-10 md:grid-cols-2">
            <div className="space-y-2">
              {SPACING.map((s) => (
                <div key={s} className="flex items-center gap-4">
                  <span className="w-8 text-end font-mono text-[12px] text-fg-tertiary">{s}</span>
                  <span className="h-3 rounded-sm bg-fg-tertiary/40" style={{ width: s * 2 }} />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-start gap-4">
              <div className="grid size-24 place-items-center rounded-[var(--radius-card)] border border-hairline text-caption text-fg-secondary">12 card</div>
              <div className="grid h-11 w-28 place-items-center rounded-[var(--radius-control)] bg-surface text-caption text-fg-secondary">10 control</div>
              <div className="grid h-9 w-24 place-items-center rounded-full bg-surface text-caption text-fg-secondary">pill</div>
              <div className="grid size-24 place-items-center rounded-[var(--radius-card)] bg-surface-raised text-caption text-fg-secondary shadow-[var(--shadow-pop)]">menu shadow</div>
            </div>
          </div>
        </Section>

        <Section id="controls" title="Controls">
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <Label>Buttons</Label>
              <div className="flex flex-wrap gap-3">
                <Button variant="primary">Original filing</Button>
                <Button>Share</Button>
                <ButtonLink href="/design" variant="ghost">
                  See all
                </ButtonLink>
                <Button disabled>Disabled</Button>
                <Button className="outline-2 outline-offset-2 outline-brand">Keyboard focus</Button>
              </div>
            </div>
            <div>
              <Label>Language and theme</Label>
              <div className="flex flex-wrap items-center gap-4">
                <LanguageSwitch />
                <ThemeToggle withLabel />
              </div>
            </div>
            <div>
              <Label>Symbol badges and meta line</Label>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <SymbolBadge symbol="OGDC" />
                  <SymbolBadge symbol="DIIL" />
                  <SymbolBadge symbol="MEEZAN-FUNDS" />
                </div>
                <MetaLine symbol="KOHE" category={{ en: "Results", ur: "رزلٹس" }} time="2 Oct" />
                <MetaLine category={{ en: "Economy", ur: "معیشت" }} time="3:45 pm" />
              </div>
            </div>
            <div>
              <Label>Key figures</Label>
              <div className="flex flex-wrap gap-2">
                {figures.map((f) => (
                  <KeyFigurePill key={f.en} figure={f} />
                ))}
              </div>
            </div>
          </div>
          <div>
            <Label>Stat tiles (item page “Key figures”; the change line appears only when a filing states both years)</Label>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile figure={{ en: "Revenue", ur: "ریونیو", value: "Rs 693.9m", valueUr: "693.9 ملین روپے", tone: "neutral" }} />
              <StatTile figure={figures[0]} change={{ text: "Example: up from a loss last year", up: true }} />
              <StatTile figure={{ en: "EPS", ur: "EPS", value: "Rs 4.25", valueUr: "4.25 روپے", tone: "neutral" }} />
              <StatTile figure={figures[2]} />
            </div>
          </div>
        </Section>

        <Section id="navigation" title="Navigation" note="The header above is the real one: sticky, 80% white with blur, hairline after you scroll. Search opens with the button, Ctrl/Cmd+K or “/”. On phones, navigation moves to the bottom tab bar.">
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <Label>Phone tab bar</Label>
              <div className="overflow-hidden rounded-[var(--radius-card)] border border-hairline">
                <div className="h-20 bg-surface" />
                <TabBar preview />
              </div>
            </div>
            <div>
              <Label>Search (command palette)</Label>
              <div className="overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-surface-raised shadow-[var(--shadow-pop)]">
                <div className="flex h-14 items-center border-b border-hairline px-4 text-title font-normal text-fg">dgk</div>
                <PaletteResults
                  active={0}
                  entries={[
                    { key: "c-DGKC", label: "DGKC", hint: "D.G. Khan Cement Company Limited", href: "#", kind: "company" },
                    { key: "p-results", label: "Results", hint: "Every company’s latest results", href: "#", kind: "page" },
                    { key: "search", label: "Search news for “dgk”", hint: "", href: "#", kind: "search" },
                  ]}
                />
              </div>
              <div className="mt-3">
                <OpenPaletteDemo />
              </div>
            </div>
          </div>
          <div>
            <Label>Filter bar: type tabs and one Filters button (opens a sheet)</Label>
            <FilterBar
              active="all"
              tabs={[
                { key: "all", en: "All", ur: "سب", href: "/design" },
                { key: "filings", en: "Company filings", ur: "کمپنی فائلنگز", href: "/design" },
                { key: "results", en: "Results", ur: "رزلٹس", href: "/design" },
                { key: "dividends", en: "Dividends", ur: "ڈیویڈنڈ", href: "/design" },
                { key: "economy", en: "Economy", ur: "معیشت", href: "/design" },
              ]}
              sheet={{ action: "/design", sectors, sector: "CEMENT" }}
            />
            <div className="mt-6 max-w-[440px] overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-surface-raised">
              <SheetForm sheet={{ action: "/design", sectors, sector: "CEMENT" }} />
            </div>
          </div>
        </Section>

        <Section id="stories" title="Stories" note="Lists, not card walls: hairline rows, whole row clickable, source shown once. Featured cards only for top stories.">
          <div className="grid gap-12 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <SectionHeader title={{ en: "Company filings", ur: "کمپنی فائلنگز" }} href="/design" />
              <div className="mt-2 border-t border-hairline">
                {rows.map((it) => (
                  <NewsRow key={it.id} item={it} now={now} />
                ))}
              </div>
            </div>
            <aside className="space-y-4 lg:col-span-4">
              <SectionHeader title={{ en: "Loading", ur: "لوڈ ہو رہا ہے" }} />
              <div className="border-t border-hairline">
                <NewsRowSkeleton />
                <NewsRowSkeleton />
              </div>
            </aside>
          </div>
          {lead && (
            <div>
              <Label>Top stories: one lead, three secondary</Label>
              <div className="grid items-start gap-8 lg:grid-cols-12">
                <div className="lg:col-span-7">
                  <FeaturedCard item={lead} now={now} lead />
                </div>
                <div className="divide-y divide-hairline border-y border-hairline lg:col-span-5 lg:border-t-0">
                  {secondary.map((it) => (
                    <FeaturedCard key={it.id} item={it} now={now} plain />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <FeaturedCardSkeleton lead />
            <FeaturedCardSkeleton />
          </div>
        </Section>

        <Section id="table" title="Data table" note="Sticky header, sortable columns, right-aligned tabular numbers, hairline rows. “—” means the filing doesn't state it (hover for the note). On phones the table becomes a list.">
          <DataTable columns={RESULT_COLUMNS} rows={resultRows(results)} initialSort={{ key: "announced", dir: "desc" }} caption="Latest results" />
          <div>
            <Label>Loading</Label>
            <TableSkeleton rows={3} cols={6} />
          </div>
        </Section>

        <Section id="feedback" title="Empty states and feedback">
          <div className="grid gap-10 md:grid-cols-2">
            <div className="rounded-[var(--radius-card)] border border-hairline px-6">
              <EmptyState
                icon={Star}
                text={{ en: "You're not following any companies yet. Add a few to see their news first.", ur: "آپ ابھی کسی کمپنی کو فالو نہیں کر رہے۔" }}
                suggestions={<Suggestions items={["OGDC", "HUBC", "LUCK", "MEBL", "ENGROH", "SYS"].map((s) => ({ label: s, href: "/design" }))} />}
              />
            </div>
            <div className="rounded-[var(--radius-card)] border border-hairline px-6">
              <EmptyState
                icon={Inbox}
                text={{ en: "No company announcements yet today. The calendar shows what's coming up.", ur: "آج ابھی کوئی اعلان نہیں آیا۔" }}
                action={{ href: "/upcoming", label: { en: "Open the calendar", ur: "کیلنڈر کھولیں" } }}
              />
            </div>
            <div>
              <Label>Snackbar</Label>
              <div className="flex flex-wrap items-center gap-4">
                <SnackbarView message="Added to My stocks" />
                <SnackbarDemo />
              </div>
            </div>
          </div>
        </Section>
      </div>
      <SiteFooter />
      <TabBar />
    </>
  );
}
