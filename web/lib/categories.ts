// Item categories (set by the pipeline, see pipeline/core/classify.py) grouped into the
// "type" filter users see.
export type TypeGroup = {
  key: string;
  en: string;
  ur: string;
  categories: string[];
};

export const TYPE_GROUPS: TypeGroup[] = [
  { key: "results", en: "Results", ur: "فنانشل رزلٹس", categories: ["results"] },
  {
    key: "dividends",
    en: "Dividends & shares",
    ur: "ڈیویڈنڈ اور شیئرز",
    categories: ["dividend", "dividend_payment", "bonus", "right_shares"],
  },
  {
    key: "meetings",
    en: "Board meetings & AGMs",
    ur: "بورڈ میٹنگ اور AGM",
    categories: ["board_meeting", "board_meeting_in_progress", "agm", "agm_extension", "corporate_briefing", "book_closure"],
  },
  {
    key: "company",
    en: "Company news",
    ur: "کمپنی کی خبریں",
    categories: [
      "material_info", "director_change", "buyback", "clarification", "other_corporate", "disclosure_of_interest",
      "annual_report", "progress_report", "resolutions", "revoked", "shariah",
    ],
  },
  {
    key: "notices",
    en: "PSX & SECP notices",
    ur: "PSX اور SECP نوٹس",
    categories: ["psx_unusual_movement", "psx_risk_warning", "psx_listing_action", "psx_trading_suspension", "psx_notice", "secp_notice"],
  },
  { key: "policy", en: "Policy & economy", ur: "پالیسی اور معیشت", categories: ["macro_key", "macro"] },
  { key: "sector", en: "Market & sector news", ur: "مارکیٹ اور سیکٹر", categories: ["sector"] },
];

const CATEGORY_LABEL: Record<string, { en: string; ur: string }> = {
  results: { en: "Results", ur: "رزلٹس" },
  dividend: { en: "Dividend", ur: "ڈیویڈنڈ" },
  dividend_payment: { en: "Dividend paid", ur: "ڈیویڈنڈ ادائیگی" },
  bonus: { en: "Bonus shares", ur: "بونس شیئرز" },
  right_shares: { en: "Right shares", ur: "رائٹ شیئرز" },
  material_info: { en: "Material info", ur: "اہم معلومات" },
  board_meeting: { en: "Board meeting", ur: "بورڈ میٹنگ" },
  board_meeting_in_progress: { en: "Board meeting", ur: "بورڈ میٹنگ" },
  agm: { en: "AGM", ur: "AGM" },
  agm_extension: { en: "AGM", ur: "AGM" },
  corporate_briefing: { en: "Briefing", ur: "بریفنگ" },
  book_closure: { en: "Book closure", ur: "بک کلوژر" },
  macro_key: { en: "Policy", ur: "پالیسی" },
  macro: { en: "Economy", ur: "معیشت" },
  sector: { en: "Market", ur: "مارکیٹ" },
  fund_distribution: { en: "Fund", ur: "فنڈ" },
};

export function categoryLabel(category: string): { en: string; ur: string } {
  if (CATEGORY_LABEL[category]) return CATEGORY_LABEL[category];
  const group = TYPE_GROUPS.find((g) => g.categories.includes(category));
  return group ? { en: group.en, ur: group.ur } : { en: "Notice", ur: "نوٹس" };
}

export function groupCategories(key: string | undefined): string[] | null {
  return TYPE_GROUPS.find((g) => g.key === key)?.categories ?? null;
}

const SOURCE_LABEL: Record<string, string> = {
  psx_companies: "PSX filing",
  psx_notices: "PSX notice",
  secp_notices: "SECP notice",
  dawn_business: "Dawn",
  brecorder_latest: "Business Recorder",
  tribune_business: "Express Tribune",
  propakistani_business: "ProPakistani",
};

export function sourceLabel(sourceId: string): string {
  return SOURCE_LABEL[sourceId] ?? sourceId;
}

export function isNews(sourceId: string): boolean {
  return !sourceId.startsWith("psx_") && sourceId !== "secp_notices";
}
