// /sector/[slug]: one sector's listed companies and its recent filings and news.
import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TopicArt } from "@/components/ui/cover";
import { EmptyState } from "@/components/ui/feedback";
import { SectionHeader, SymbolBadge, T } from "@/components/ui/primitives";
import { ThumbRow } from "@/components/ui/stories";
import { isNews } from "@/lib/categories";
import { getCompanies, getFeed } from "@/lib/data";
import { currentTime } from "@/lib/format";
import { SECTORS, topicOfText } from "@/lib/topics";

export const revalidate = 300;

export async function generateMetadata({ params }: PageProps<"/sector/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const s = SECTORS.find((x) => x.slug === slug);
  return s ? { title: `${s.en} sector`, description: `PSX filings and business news for ${s.en.toLowerCase()} companies.` } : {};
}

export default async function SectorPage({ params }: PageProps<"/sector/[slug]">) {
  const { slug } = await params;
  const sector = SECTORS.find((x) => x.slug === slug);
  if (!sector) notFound();
  const [companies, filings, news] = await Promise.all([
    getCompanies(),
    getFeed({ sectors: sector.psx, limit: 30 }),
    getFeed({ source: "news", importantOnly: true, limit: 60 }),
  ]);
  const members = companies.filter((c) => c.sector && sector.psx.includes(c.sector));
  const sectorNews = news.filter((n) => isNews(n.source_id) && topicOfText(`${n.headline_en ?? n.source_title} ${n.body_en ?? ""}`) === sector.topic).slice(0, 10);
  const now = currentTime();

  return (
    <div className="space-y-12 pt-8 md:space-y-16 md:pt-12">
      <header className="grid items-center gap-8 md:grid-cols-12">
        <div className="space-y-3 md:col-span-7">
          <p className="eyebrow text-fg-tertiary">
            <T en="Sector" ur="سیکٹر" />
          </p>
          <h1 className="text-display-sm md:text-display">
            <T en={sector.en} ur={sector.ur} />
          </h1>
          <p className="text-body text-fg-secondary">
            <T en={`${members.length} listed companies. Their latest PSX filings and related business news.`} ur={`${members.length} لسٹڈ کمپنیاں، ان کی تازہ فائلنگز اور خبریں۔`} />
          </p>
        </div>
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-hairline md:col-span-5">
          <TopicArt topic={sector.topic} seedId={sector.slug.length} ratio="16:9" />
        </div>
      </header>

      <section aria-labelledby="companies" className="space-y-4">
        <SectionHeader id="companies" title={{ en: "Companies", ur: "کمپنیاں" }} />
        <ul className="flex flex-wrap gap-2">
          {members.map((c) => (
            <li key={c.symbol} title={c.name}>
              <SymbolBadge symbol={c.symbol} href={`/company/${c.symbol}`} />
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-12 lg:grid-cols-12">
        <section aria-labelledby="filings" className="lg:col-span-7">
          <SectionHeader id="filings" title={{ en: "Company filings", ur: "کمپنی فائلنگز" }} />
          <div className="mt-2 border-t border-hairline">
            {filings.length === 0 ? (
              <EmptyState icon={Inbox} text={{ en: "No filings from this sector yet.", ur: "اس سیکٹر کی ابھی کوئی فائلنگ نہیں۔" }} action={{ href: "/latest?type=filings", label: { en: "All filings", ur: "تمام فائلنگز" } }} />
            ) : (
              filings.map((it) => <ThumbRow key={it.id} item={it} now={now} />)
            )}
          </div>
        </section>
        <section aria-labelledby="news" className="lg:col-span-5">
          <SectionHeader id="news" title={{ en: "In the news", ur: "خبروں میں" }} />
          <div className="mt-2 border-t border-hairline">
            {sectorNews.length === 0 ? (
              <EmptyState icon={Inbox} text={{ en: "No recent news about this sector.", ur: "اس سیکٹر کی کوئی تازہ خبر نہیں۔" }} action={{ href: "/latest?type=economy", label: { en: "All economy news", ur: "معیشت کی تمام خبریں" } }} />
            ) : (
              sectorNews.map((it) => <ThumbRow key={it.id} item={it} now={now} />)
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
