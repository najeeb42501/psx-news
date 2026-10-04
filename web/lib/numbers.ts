// Number check for admin edits, mirrored from pipeline/core/numbers.py and quality.py:
// every number an editor writes must appear in the original filing (or its title/facts),
// as written, rounded, or converted between thousand / million / billion.

const NUM = /(\()?\s*((?<![\w.])-)?(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(\))?/g;
// Digits that are part of a name, not an amount: KSE-100, KMI-30, G7, Q1, FY26.
const NAME_WITH_DIGITS = /\b(?!Rs|PKR|USD|US)[A-Z][A-Za-z]{0,3}-?\d{1,3}\b/g;
const SCALED = /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(k|thousand|m|mn|million|b|bn|billion|tr|trillion|crore|lakh)\b/gi;
const SCALE: Record<string, number> = {
  k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9,
  tr: 1e12, trillion: 1e12, crore: 1e7, lakh: 1e5,
};

export function parseNumbers(text: string): number[] {
  return [...text.matchAll(NUM)].map((m) => Math.abs(Number(m[3].replace(/,/g, ""))));
}

function variants(v: number): number[] {
  const r = (d: number) => Math.round(v * 10 ** d) / 10 ** d;
  return [v, r(0), r(1), r(2)];
}

const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** Every number an edit may use, given the source texts (filing text, title, company name, facts JSON). */
export function allowedNumbers(sources: string[]): number[] {
  const out: number[] = [];
  for (const text of sources) {
    const values = parseNumbers(text);
    for (const m of text.matchAll(SCALED)) values.push(Number(m[1].replace(/,/g, "")) * SCALE[m[2].toLowerCase()]);
    for (const x of values) for (const div of [1, 1e3, 1e6, 1e9]) out.push(...variants(x / div));
  }
  return out;
}

export type UnknownNumber = { value: number; sentence: string };

/** Numbers in an edited text that appear nowhere in the sources, with the sentence they are in. */
export function unknownNumbers(text: string, allowed: number[]): UnknownNumber[] {
  const found: UnknownNumber[] = [];
  for (const sentence of text.split(/(?<=[.!?۔])\s+|\n/)) {
    for (const n of parseNumbers(sentence.replace(NAME_WITH_DIGITS, " "))) {
      if (!allowed.some((a) => same(n, a)) && !found.some((f) => f.value === n)) found.push({ value: n, sentence: sentence.trim() });
    }
  }
  return found;
}

/** Numbers added and removed by an edit, for the "what changed" note. */
export function numberChanges(before: string, after: string): { added: number[]; removed: number[] } {
  const a = parseNumbers(before.replace(NAME_WITH_DIGITS, " "));
  const b = parseNumbers(after.replace(NAME_WITH_DIGITS, " "));
  return {
    added: [...new Set(b.filter((n) => !a.some((m) => same(m, n))))],
    removed: [...new Set(a.filter((n) => !b.some((m) => same(m, n))))],
  };
}

export const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });
