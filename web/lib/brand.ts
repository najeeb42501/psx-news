// Brand settings: change the name here and it updates across the site.
export const BRAND = {
  name: "ShareKhabar",
  nameUr: "شیئر خبر",
  tagline: "PSX announcements in plain English and Urdu. Free, fast, facts only.",
  taglineUr: "اسٹاک ایکسچینج کی خبریں، آسان اردو اور انگریزی میں۔",
  contactEmail: "najeeb08089@gmail.com",
  // Filled in during Phase 5, when the WhatsApp Channel and Facebook Page exist.
  whatsappChannelUrl: process.env.NEXT_PUBLIC_WHATSAPP_CHANNEL_URL || "",
  facebookPageUrl: process.env.NEXT_PUBLIC_FACEBOOK_PAGE_URL || "",
} as const;

export const SITE_URL = (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");
