// Share-image card (PNG) for an item: headline, key number, Urdu line, source, date, disclaimer.
//
// Rendered with resvg because it shapes Nastaliq Urdu correctly (next/og cannot: its font
// engine lacks the contextual lookups Noto Nastaliq needs). resvg does not reorder mixed
// English/Urdu text, so Urdu lines are split into runs here and placed right-to-left.
import "server-only";
import { Resvg } from "@resvg/resvg-js";
import { join } from "node:path";
import { BRAND } from "@/lib/brand";
import { DISCLAIMER_EN, DISCLAIMER_UR } from "@/lib/compliance";

const FONT_DIR = join(process.cwd(), "assets", "fonts");
const FONT_FILES = ["NotoSans-Regular.ttf", "NotoSans-Bold.ttf", "NotoNastaliqUrdu-Regular.ttf"].map((f) =>
  join(FONT_DIR, f),
);
const FONT_OPTS = { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: "Noto Sans" };

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;
const PAD = 56;
const INNER = CARD_WIDTH - PAD * 2;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Font = { family: string; size: number; weight?: number };

function textEl(x: number, y: number, text: string, f: Font, fill: string, anchor = "start"): string {
  return `<text x="${x}" y="${y}" font-family="${f.family}" font-size="${f.size}" font-weight="${f.weight ?? 400}" fill="${fill}" text-anchor="${anchor}" xml:space="preserve">${esc(text)}</text>`;
}

const widthCache = new Map<string, number>();

function measure(text: string, f: Font): number {
  const key = `${f.family}|${f.size}|${f.weight ?? 400}|${text}`;
  const hit = widthCache.get(key);
  if (hit !== undefined) return hit;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="${f.size * 3}">${textEl(0, f.size * 2, text, f, "#000")}</svg>`;
  const box = new Resvg(svg, { font: FONT_OPTS }).getBBox();
  const w = box ? box.width : 0;
  widthCache.set(key, w);
  return w;
}

function wrap(text: string, f: Font, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate, f) <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/\s+\S*$/, "")} …`;
    return kept;
  }
  return lines;
}

// Urdu letters (not digits or Latin). Digits and Latin letters form left-to-right runs.
const RTL_RUN = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

function bidiRuns(line: string): string[] {
  // Split into maximal runs: Urdu-script words (with the spaces between them) vs LTR runs.
  const tokens = line.split(/(\s+)/);
  const runs: { rtl: boolean; text: string }[] = [];
  for (const tok of tokens) {
    if (!tok) continue;
    const isSpace = /^\s+$/.test(tok);
    const rtl = isSpace ? (runs.at(-1)?.rtl ?? true) : RTL_RUN.test(tok);
    const last = runs.at(-1);
    if (last && last.rtl === rtl) last.text += tok;
    else runs.push({ rtl, text: tok });
  }
  return runs.map((r) => r.text.trim()).filter(Boolean);
}

function urduLine(line: string, rightX: number, y: number, f: Font, fill: string): string {
  // Place runs right-to-left in logical order: first run at the right edge. Urdu runs are
  // wrapped in right-to-left marks so trailing punctuation (، ۔) stays at their left end.
  const space = f.size * 0.3;
  let x = rightX;
  // English words and numbers inside the Urdu line use the sans font, sized to match Nastaliq.
  const latin: Font = { family: "Noto Sans", size: Math.round(f.size * 0.78) };
  return bidiRuns(line)
    .map((run) => {
      const rtl = RTL_RUN.test(run);
      const text = rtl ? `‏${run}‏` : run;
      const font = rtl ? f : latin;
      const el = textEl(x, y, text, font, fill, "end");
      x -= measure(text, font) + space;
      return el;
    })
    .join("");
}

function urduWrap(text: string, f: Font, maxWidth: number, maxLines: number): string[] {
  return wrap(text, f, maxWidth, maxLines);
}

export type CardInput = {
  symbol: string | null;
  headlineEn: string;
  headlineUr: string | null;
  keyNumber: string | null; // e.g. "EPS Rs 4.25"
  sourceLabel: string; // e.g. "PSX filing"
  dateLabel: string; // e.g. "2 Oct 2026, 4:10 PM PKT"
};

export function renderCard(c: CardInput): Buffer {
  const sans: Font = { family: "Noto Sans", size: 26 };
  const bold = (size: number): Font => ({ family: "Noto Sans", size, weight: 700 });
  const ur = (size: number): Font => ({ family: "Noto Nastaliq Urdu", size });
  const parts: string[] = [];

  // Header: brand (EN + UR) and symbol
  parts.push(textEl(PAD, 78, BRAND.name, bold(34), "#0f766e"));
  parts.push(urduLine(BRAND.nameUr, CARD_WIDTH - PAD, 82, ur(30), "#0f766e"));
  let y = 160;
  if (c.symbol) {
    parts.push(textEl(PAD, y, c.symbol, bold(30), "#475569"));
    y += 22;
  }

  // English headline (up to 2 lines)
  const h = bold(44);
  for (const line of wrap(c.headlineEn, h, INNER, 2)) {
    y += 56;
    parts.push(textEl(PAD, y, line, h, "#0f172a"));
  }

  // Key number
  if (c.keyNumber) {
    y += 78;
    parts.push(textEl(PAD, y, c.keyNumber, bold(52), "#0f766e"));
  }

  // Urdu headline: as many lines as fit above the footer (at most 2), right-aligned.
  const footerTop = CARD_HEIGHT - 140;
  const urLineHeight = 66;
  if (c.headlineUr) {
    const fit = Math.min(2, Math.floor((footerTop - (y + 20)) / urLineHeight));
    if (fit > 0) {
      y += 20;
      for (const line of urduWrap(c.headlineUr, ur(32), INNER, fit)) {
        y += urLineHeight;
        parts.push(urduLine(line, CARD_WIDTH - PAD, y - 10, ur(32), "#0f172a"));
      }
    }
  }

  // Footer: source + date, then the disclaimer in both languages
  parts.push(`<line x1="${PAD}" y1="${footerTop + 12}" x2="${CARD_WIDTH - PAD}" y2="${footerTop + 12}" stroke="#cbd5e1" stroke-width="2"/>`);
  parts.push(textEl(PAD, CARD_HEIGHT - 92, `Source: ${c.sourceLabel} · ${c.dateLabel}`, sans, "#334155"));
  parts.push(textEl(PAD, CARD_HEIGHT - 56, wrap(DISCLAIMER_EN, { family: "Noto Sans", size: 20 }, INNER, 1)[0], { family: "Noto Sans", size: 20 }, "#64748b"));
  parts.push(urduLine(DISCLAIMER_UR, CARD_WIDTH - PAD, CARD_HEIGHT - 18, ur(22), "#64748b"));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}">
<rect width="100%" height="100%" fill="#ffffff"/>
<rect width="100%" height="12" fill="#0f766e"/>
${parts.join("\n")}
</svg>`;
  return new Resvg(svg, { font: FONT_OPTS, fitTo: { mode: "width", value: CARD_WIDTH } }).render().asPng();
}
