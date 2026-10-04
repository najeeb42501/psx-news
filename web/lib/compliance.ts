// Compliance rules shared by the website and admin (Part 2.7).
// Disclaimer shown on every page, post and image.
export const DISCLAIMER_EN =
  "Information only, not investment advice. We do not recommend buying or selling any security.";
export const DISCLAIMER_UR = "یہ صرف معلومات ہیں، سرمایہ کاری کا مشورہ نہیں۔";

// Advice / prediction wording, mirrored from pipeline/core/quality.py. Applied to admin edits too.
const BANNED_EN = [
  /\b(buy|sell|accumulate)\b(?!-?\s?back|-off|ing)/i,
  /\bhold\b(?!\s+(its|the|an|a|their|annual|extraordinary|board|meeting|meetings|agm|eogm))/i,
  /\btarget price\b|\bprice target\b|\btarget of rs\b/i,
  /\b(shares?|stocks?|share price|stock price|price)\s+(will|may|could|should|is expected to|are expected to)\s+(rise|fall|go up|go down|increase|decrease|rally|crash|jump|surge|drop)/i,
  /\bshould (buy|sell|invest|consider)\b|\bgood time to (buy|sell|invest)\b/i,
  /\b(undervalued|overvalued|multibagger|guaranteed return|sure profit|must buy)\b/i,
  /\btop stocks?\b|\bbest stocks?\b/i,
];
const BANNED_UR = [
  "خریدیں", "بیچیں", "خرید لیں", "بیچ دیں", "فروخت کریں", "سرمایہ کاری کریں",
  "ٹارگٹ پرائس", "ہدف قیمت", "بڑھ جائے گا", "گر جائے گا", "بڑھے گی", "گرے گی", "یقینی منافع", "بہترین شیئر",
];

export function complianceProblems(text: string): string[] {
  const problems: string[] = [];
  for (const re of BANNED_EN) {
    const m = text.match(re);
    if (m) problems.push(`advice/prediction wording not allowed: "${m[0]}"`);
  }
  for (const phrase of BANNED_UR) if (text.includes(phrase)) problems.push(`advice/prediction wording not allowed: "${phrase}"`);
  if (/[٠-٩۰-۹]/.test(text)) problems.push("use Western digits 0-9, not Urdu digits");
  return problems;
}
