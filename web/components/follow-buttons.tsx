import { BRAND } from "@/lib/brand";

export function FollowButtons() {
  const links = [
    { href: BRAND.whatsappChannelUrl, en: "Follow on WhatsApp", ur: "واٹس ایپ چینل", color: "bg-[#25D366]" },
    { href: BRAND.facebookPageUrl, en: "Follow on Facebook", ur: "فیس بک پیج", color: "bg-[#1877F2]" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((l) =>
        l.href ? (
          <a
            key={l.en}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className={`${l.color} rounded-full px-4 py-1.5 text-sm font-semibold text-white`}
          >
            <span className="ui-en">{l.en}</span>
            <span className="ui-ur ur ur-tight"> {l.ur}</span>
          </a>
        ) : (
          <span key={l.en} className="rounded-full border border-border px-4 py-1.5 text-sm">
            {l.en} – coming soon
          </span>
        ),
      )}
    </div>
  );
}
