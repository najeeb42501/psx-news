// Topics (for news artwork and tags), sectors (for sector tiles and /sector pages) and the muted
// category colours used only in cover images.
import type { WebItem } from "@/lib/data";

export type Topic =
  | "sbp-policy-rate" | "imf" | "petrol-fuel" | "rupee-dollar" | "gold" | "inflation" | "budget-tax"
  | "psx-market" | "cement" | "banks" | "oil-gas" | "textiles" | "autos" | "fertilizer" | "power"
  | "steel" | "telecom" | "tech" | "pharma" | "food" | "general-economy";

// First match wins: specific policy topics before sectors, sectors before the general market.
const TOPIC_RULES: [Topic, RegExp][] = [
  ["sbp-policy-rate", /policy rate|interest rate|monetary policy|\bsbp\b|state bank/i],
  ["imf", /\bimf\b|international monetary fund|mefp/i],
  ["petrol-fuel", /petrol|diesel|\bhsd\b|fuel|ogra|\blpg\b/i],
  ["rupee-dollar", /rupee|dollar|exchange rate|forex|remittance|reserves/i],
  ["gold", /\bgold\b|silver|bullion|tola/i],
  ["inflation", /inflation|\bcpi\b|\bspi\b|prices? index/i],
  ["budget-tax", /budget|\bfbr\b|\btax|revenue collection|nfc|fiscal/i],
  ["cement", /cement|clinker/i],
  ["banks", /\bbanks?\b|banking|deposits|advances|modaraba|leasing|insurance/i],
  ["oil-gas", /\boil\b|\bgas\b|lng|refiner|petroleum|exploration|ogdc|ppl\b/i],
  ["textiles", /textile|cotton|yarn|spinning|garment|apparel/i],
  ["autos", /\bauto|car |cars\b|vehicle|motorcycle/i],
  ["fertilizer", /fertili[sz]er|urea|\bdap\b/i],
  ["power", /power|electricity|\bipps?\b|disco|nepra|circular debt|solar|tariff/i],
  ["steel", /steel|iron|scrap/i],
  ["telecom", /telecom|mobile|\bpta\b|broadband|spectrum|5g/i],
  ["tech", /\btech|software|\bit\b exports|digital|startup|\bai\b/i],
  ["pharma", /pharma|medicine|drug/i],
  ["food", /\bfood|sugar|wheat|flour|edible oil|ghee|rice\b/i],
  ["psx-market", /\bpsx\b|kse|stock|shares|bourse|equities|index/i],
];

export function topicOfText(text: string): Topic {
  return TOPIC_RULES.find(([, re]) => re.test(text))?.[0] ?? "general-economy";
}

export const TOPIC_LABEL: Record<Topic, { en: string; ur: string }> = {
  "sbp-policy-rate": { en: "SBP & rates", ur: "SBP اور شرحِ سود" },
  imf: { en: "IMF", ur: "IMF" },
  "petrol-fuel": { en: "Petrol & fuel", ur: "پیٹرول" },
  "rupee-dollar": { en: "Rupee & dollar", ur: "روپیہ اور ڈالر" },
  gold: { en: "Gold", ur: "سونا" },
  inflation: { en: "Inflation", ur: "مہنگائی" },
  "budget-tax": { en: "Budget & tax", ur: "بجٹ اور ٹیکس" },
  "psx-market": { en: "PSX", ur: "PSX" },
  cement: { en: "Cement", ur: "سیمنٹ" },
  banks: { en: "Banks", ur: "بینک" },
  "oil-gas": { en: "Oil & gas", ur: "آئل اینڈ گیس" },
  textiles: { en: "Textiles", ur: "ٹیکسٹائل" },
  autos: { en: "Autos", ur: "آٹوز" },
  fertilizer: { en: "Fertilizer", ur: "فرٹیلائزر" },
  power: { en: "Power", ur: "پاور" },
  steel: { en: "Steel", ur: "اسٹیل" },
  telecom: { en: "Telecom", ur: "ٹیلی کام" },
  tech: { en: "Tech", ur: "ٹیک" },
  pharma: { en: "Pharma", ur: "فارما" },
  food: { en: "Food", ur: "فوڈ" },
  "general-economy": { en: "Economy", ur: "معیشت" },
};

// --- sectors ----------------------------------------------------------------------------------
export type Sector = { slug: string; en: string; ur: string; topic: Topic; psx: string[] };

/** The sector tiles on Home, each covering one or more PSX sector names. */
export const SECTORS: Sector[] = [
  { slug: "banks", en: "Banks", ur: "بینک", topic: "banks", psx: ["COMMERCIAL BANKS"] },
  { slug: "cement", en: "Cement", ur: "سیمنٹ", topic: "cement", psx: ["CEMENT"] },
  { slug: "oil-gas", en: "Oil & Gas", ur: "آئل اینڈ گیس", topic: "oil-gas",
    psx: ["OIL & GAS EXPLORATION COMPANIES", "OIL & GAS MARKETING COMPANIES", "REFINERY"] },
  { slug: "fertilizer", en: "Fertilizer", ur: "فرٹیلائزر", topic: "fertilizer", psx: ["FERTILIZER"] },
  { slug: "textiles", en: "Textiles", ur: "ٹیکسٹائل", topic: "textiles",
    psx: ["TEXTILE SPINNING", "TEXTILE COMPOSITE", "TEXTILE WEAVING", "SYNTHETIC & RAYON", "APPAREL", "WOOLLEN"] },
  { slug: "autos", en: "Autos", ur: "آٹوز", topic: "autos", psx: ["AUTOMOBILE ASSEMBLER", "AUTOMOBILE PARTS & ACCESSORIES"] },
  { slug: "power", en: "Power", ur: "پاور", topic: "power", psx: ["POWER GENERATION & DISTRIBUTION"] },
  { slug: "tech", en: "Tech & telecom", ur: "ٹیک اور ٹیلی کام", topic: "tech", psx: ["TECHNOLOGY & COMMUNICATION"] },
  { slug: "pharma", en: "Pharma", ur: "فارما", topic: "pharma", psx: ["PHARMACEUTICALS"] },
  { slug: "food", en: "Food", ur: "فوڈ", topic: "food",
    psx: ["FOOD & PERSONAL CARE PRODUCTS", "SUGAR & ALLIED INDUSTRIES", "VANASPATI & ALLIED INDUSTRIES"] },
];

export function sectorOfPsx(psxSector: string | null): Sector | undefined {
  return psxSector ? SECTORS.find((s) => s.psx.includes(psxSector)) : undefined;
}

/** The topic of an item: its company's sector for filings, its words for news. */
export function topicOf(item: Pick<WebItem, "sector" | "headline_en" | "body_en" | "source_title" | "symbol">): Topic {
  const sector = sectorOfPsx(item.sector);
  if (item.symbol && sector) return sector.topic;
  return topicOfText(`${item.headline_en ?? item.source_title} ${item.body_en ?? ""}`);
}

// --- cover colours (cover images only, never interface chrome) ---------------------------------
export type CoverTone = "results" | "dividends" | "corporate" | "meetings" | "economy" | "regulatory";

const TONE_BY_CATEGORY: Record<string, CoverTone> = {
  results: "results",
  dividend: "dividends", dividend_payment: "dividends", fund_distribution: "dividends",
  bonus: "corporate", right_shares: "corporate", material_info: "corporate", buyback: "corporate",
  director_change: "corporate", disclosure_of_interest: "corporate", other_corporate: "corporate",
  annual_report: "corporate", progress_report: "corporate", resolutions: "corporate", revoked: "corporate",
  clarification: "corporate", shariah: "corporate",
  board_meeting: "meetings", board_meeting_in_progress: "meetings", agm: "meetings", agm_extension: "meetings",
  corporate_briefing: "meetings", book_closure: "meetings",
  psx_unusual_movement: "regulatory", psx_risk_warning: "regulatory", psx_listing_action: "regulatory",
  psx_trading_suspension: "regulatory", psx_notice: "regulatory", secp_notice: "regulatory",
  share_certificate_loss: "regulatory",
};

export function coverTone(category: string): CoverTone {
  return TONE_BY_CATEGORY[category] ?? "economy";
}
