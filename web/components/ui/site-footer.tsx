// Footer: About · Sources · Follow on desktop, stacked on phones. The disclaimer sits in one column,
// English and Urdu aligned to the same edge. Social links appear only once the channels exist.
import Link from "next/link";
import { ThemeToggle } from "@/components/ui/controls";
import { T } from "@/components/ui/primitives";
import { BRAND } from "@/lib/brand";
import { DISCLAIMER_EN, DISCLAIMER_UR } from "@/lib/compliance";

export function SiteFooter() {
  const social = [
    BRAND.whatsappChannelUrl && { href: BRAND.whatsappChannelUrl, label: "WhatsApp Channel" },
    BRAND.facebookPageUrl && { href: BRAND.facebookPageUrl, label: "Facebook" },
  ].filter(Boolean) as { href: string; label: string }[];
  const heading = "eyebrow mb-3 text-fg-tertiary";
  const link = "text-caption text-fg-secondary hover:text-fg";

  return (
    <footer className="mt-24 border-t border-hairline pb-[calc(6rem+env(safe-area-inset-bottom))] pt-12 md:pb-12">
      <div className="page-container grid gap-10 md:grid-cols-12">
        <div className="space-y-3 md:col-span-5">
          <p className="text-title">
            ShareKhabar <span className="ur ur-tight !text-[15px] text-fg-tertiary">شیئر خبر</span>
          </p>
          <p className="text-caption text-fg-secondary">
            <span className="ui-en">{BRAND.tagline}</span>
            <span className="ui-ur ur">{BRAND.taglineUr}</span>
          </p>
          <div className="space-y-1 pt-2 text-caption text-fg-tertiary">
            <p>{DISCLAIMER_EN}</p>
            <p className="ur disclaimer-ur" lang="ur">
              {DISCLAIMER_UR}
            </p>
          </div>
        </div>
        <nav aria-label="About" className="md:col-span-2 md:col-start-7">
          <h2 className={heading}>
            <T en="About" ur="ہمارے بارے میں" />
          </h2>
          <ul className="space-y-2">
            <li>
              <Link href="/about" className={link}>
                <T en="How it works" ur="یہ کیسے کام کرتا ہے" />
              </Link>
            </li>
            <li>
              <Link href="/search" className={link}>
                <T en="Search" ur="تلاش" />
              </Link>
            </li>
          </ul>
        </nav>
        <div className="md:col-span-3">
          <h2 className={heading}>
            <T en="Sources" ur="ذرائع" />
          </h2>
          <p className="text-caption text-fg-secondary">
            <T
              en="PSX and SECP announcements, Dawn, Business Recorder, Express Tribune and ProPakistani. Every item links to its original."
              ur="PSX اور SECP کے اعلانات اور کاروباری خبریں۔ ہر خبر اصل ذریعے سے منسلک ہے۔"
            />
          </p>
        </div>
        {social.length > 0 && (
          <nav aria-label="Follow" className="md:col-span-2">
            <h2 className={heading}>
              <T en="Follow" ur="فالو کریں" />
            </h2>
            <ul className="space-y-2">
              {social.map((s) => (
                <li key={s.href}>
                  <a href={s.href} target="_blank" rel="noopener noreferrer" className={link}>
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
      <div className="page-container mt-10 flex items-center justify-between border-t border-hairline pt-6 text-caption text-fg-tertiary">
        <span>© 2026 ShareKhabar</span>
        <ThemeToggle withLabel />
      </div>
    </footer>
  );
}
