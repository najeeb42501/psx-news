import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { DISCLAIMER_EN, DISCLAIMER_UR } from "@/lib/compliance";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <div className="prose-sm space-y-4">
      <h1 className="text-xl font-bold">About {BRAND.name}</h1>
      <p>
        {BRAND.name} turns Pakistan Stock Exchange company announcements and market-moving business news into short, plain
        summaries in English and Urdu, so every investor can quickly see what is happening to the companies they care about.
      </p>
      <p className="ur" lang="ur">
        {BRAND.nameUr} پاکستان اسٹاک ایکسچینج پر کمپنیوں کے اعلانات اور اہم کاروباری خبروں کو آسان انگریزی اور اردو میں مختصر
        خلاصوں کی صورت میں پیش کرتا ہے۔
      </p>
      <h2 className="font-bold">Where the information comes from</h2>
      <ul className="list-disc pl-5">
        <li>Company announcements, PSX notices and SECP notices published on the PSX data portal.</li>
        <li>Business news from Dawn, Business Recorder, The Express Tribune and ProPakistani (headline, link and our own short summary only).</li>
      </ul>
      <h2 className="font-bold">How summaries are made</h2>
      <p>
        Summaries are written automatically. Every number in a summary is checked against the original document before it is
        published, and anything that cannot be checked is held back for a human to review. Every item links to its original
        source: always check it before making a decision.
      </p>
      <h2 className="font-bold">What we never do</h2>
      <p>No buy/sell advice, no ratings, no target prices, no predictions and no live share prices.</p>
      <div className="rounded-lg bg-brand-soft/50 p-3">
        <p>{DISCLAIMER_EN}</p>
        <p className="ur" lang="ur">
          {DISCLAIMER_UR}
        </p>
      </div>
      <p>
        Contact: <a href={`mailto:${BRAND.contactEmail}`} className="text-brand underline">{BRAND.contactEmail}</a>
      </p>
    </div>
  );
}
