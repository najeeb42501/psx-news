// <CoverImage>: a picture for every story, drawn as inline SVG from our own data, so it appears with
// the page (no extra download, no layout shift), follows dark mode, and is fully our own artwork.
//   a) Data card for company filings: symbol, the main figure very large, a supporting line, and a
//      mini bar chart of profit after tax when we have 2+ periods for the company.
//   b) Topic artwork for news: an abstract pattern and topic symbol (no photos, no logos, no people).
//   c) Monogram fallback: the symbol's letters.
// Never a publisher photo, a company logo or an AI image of real people, places or events.
import {
  ArrowLeftRight, Calculator, Car, ChartColumn, Construction, Cpu, Factory, Flame, Fuel, Gem, Globe, Landmark,
  type LucideIcon, Newspaper, Percent, Pill, RadioTower, Shirt, ShoppingCart, Sprout, Wheat, Zap,
} from "lucide-react";
import { categoryLabel, isNews } from "@/lib/categories";
import type { WebItem } from "@/lib/data";
import { keyChips } from "@/lib/facts";
import { formatPlainDate, formatShortDate } from "@/lib/format";
import { type CoverTone, TOPIC_LABEL, type Topic, coverTone, topicOf } from "@/lib/topics";

export type Ratio = "16:9" | "4:3" | "1:1";
const BOX: Record<Ratio, [number, number]> = { "16:9": [640, 360], "4:3": [480, 360], "1:1": [360, 360] };

const TOPIC_ICON: Record<Topic, LucideIcon> = {
  "sbp-policy-rate": Percent, imf: Globe, "petrol-fuel": Fuel, "rupee-dollar": ArrowLeftRight, gold: Gem,
  inflation: ShoppingCart, "budget-tax": Calculator, "psx-market": ChartColumn, cement: Construction, banks: Landmark,
  "oil-gas": Flame, textiles: Shirt, autos: Car, fertilizer: Sprout, power: Zap, steel: Factory,
  telecom: RadioTower, tech: Cpu, pharma: Pill, food: Wheat, "general-economy": Newspaper,
};

type Facts = Record<string, { value: number } & Record<string, unknown>> & {
  meeting_kind?: string;
  meeting_date?: { value: string };
  book_closure_from?: { value: string };
  book_closure_to?: { value: string };
};

/** The headline number of a filing as text for the card ("Rs 164.8m", "27 Oct"), with its label. */
function mainFigure(item: WebItem): { big: string; label: string; tone: "pos" | "neg" | "neutral" } | null {
  const chip = keyChips(item.facts)[0];
  if (chip) {
    const big = chip.value.replace(/ million$/, "m").replace(/ billion$/, "bn").replace("/share", "");
    const label = { Profit: "profit after tax", Loss: "loss after tax", EPS: "earnings per share", LPS: "loss per share",
      Dividend: "dividend per share", Bonus: "bonus shares", Right: "right shares", Revenue: "revenue" }[chip.en] ?? chip.en.toLowerCase();
    return { big, label, tone: chip.tone };
  }
  const f = item.facts as Facts;
  if (f.book_closure_from && f.book_closure_to && item.category === "book_closure") {
    return { big: formatPlainDate(f.book_closure_from.value).replace(/ 20\d\d$/, ""), label: `book closure to ${formatPlainDate(f.book_closure_to.value).replace(/ 20\d\d$/, "")}`, tone: "neutral" };
  }
  if (f.meeting_date) {
    return { big: formatPlainDate(f.meeting_date.value).replace(/ 20\d\d$/, ""), label: categoryLabel(item.category).en.toLowerCase(), tone: "neutral" };
  }
  return null;
}

/** Small deterministic number from the item id: picks pattern variants so neighbours differ. */
const seed = (id: number, n: number) => ((id * 2654435761) >>> 0) % n;

function Pattern({ id, w, h, kind }: { id: string; w: number; h: number; kind: number }) {
  const ink = "var(--cover-ink)";
  if (kind === 0) {
    // dots
    return (
      <>
        <defs>
          <pattern id={id} width="18" height="18" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.4" fill={ink} />
          </pattern>
        </defs>
        <rect width={w} height={h} fill={`url(#${id})`} opacity="0.35" />
      </>
    );
  }
  if (kind === 1) {
    // diagonal lines
    return (
      <>
        <defs>
          <pattern id={id} width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <line x1="0" y1="0" x2="0" y2="14" stroke={ink} strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={w} height={h} fill={`url(#${id})`} opacity="0.22" />
      </>
    );
  }
  // concentric arcs from the far corner
  return (
    <g opacity="0.3" fill="none" stroke={ink} strokeWidth="1">
      {Array.from({ length: 9 }, (_, i) => (
        <circle key={i} cx={w} cy={h} r={60 + i * 42} />
      ))}
    </g>
  );
}

function MiniBars({ values, x, y, w, h }: { values: number[]; x: number; y: number; w: number; h: number }) {
  const max = Math.max(...values.map(Math.abs), 1);
  const gap = 6;
  const bw = Math.min(28, (w - gap * (values.length - 1)) / values.length);
  const mid = values.some((v) => v < 0) ? y + h / 2 : y + h;
  const half = values.some((v) => v < 0) ? h / 2 : h;
  return (
    <g>
      <line x1={x} x2={x + values.length * (bw + gap) - gap} y1={mid} y2={mid} stroke="var(--cover-ink)" strokeOpacity="0.35" />
      {values.map((v, i) => {
        const bh = Math.max(2, (Math.abs(v) / max) * half);
        return (
          <rect
            key={i}
            x={x + i * (bw + gap)}
            y={v >= 0 ? mid - bh : mid}
            width={bw}
            height={bh}
            rx="2"
            fill={v < 0 ? "var(--negative)" : "var(--cover-fg)"}
            fillOpacity={i === values.length - 1 ? 1 : 0.55}
          />
        );
      })}
    </g>
  );
}

const TONE_CLASS: Record<CoverTone, string> = {
  results: "cover-results", dividends: "cover-dividends", corporate: "cover-corporate",
  meetings: "cover-meetings", economy: "cover-economy", regulatory: "cover-regulatory",
};

export function CoverImage({ item, ratio = "16:9", history, className = "" }: {
  item: WebItem;
  ratio?: Ratio;
  history?: number[]; // profit after tax, oldest first (company filings), for the mini chart
  className?: string;
}) {
  const [w, h] = BOX[ratio];
  const news = isNews(item.source_id) || !item.symbol;
  const topic = topicOf(item);
  const tone: CoverTone = news ? "economy" : coverTone(item.category);
  const figure = news ? null : mainFigure(item);
  const pid = `p${item.id}-${ratio.replace(":", "")}`;
  const small = ratio === "1:1";
  const Icon = TOPIC_ICON[topic];
  const eyebrow = news ? TOPIC_LABEL[topic].en : categoryLabel(item.category).en;
  const alt = news
    ? `${TOPIC_LABEL[topic].en} illustration`
    : `${item.symbol} ${eyebrow}${figure ? `: ${figure.big} ${figure.label}` : ""}`;
  const pad = small ? 28 : 32;
  const chart = !small && !news && history && history.length >= 2 ? history.slice(-8) : null;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={alt}
      preserveAspectRatio="xMidYMid slice"
      className={`block h-auto w-full ${TONE_CLASS[tone]} ${className}`}
      style={{ aspectRatio: `${w} / ${h}`, direction: "ltr" }}
    >
      <rect width={w} height={h} fill="var(--cover-bg)" />
      <Pattern id={pid} w={w} h={h} kind={seed(item.id, 3)} />

      {news ? (
        // Topic artwork: large outline symbol, offset so it reads as art, not as a button.
        <g transform={`translate(${w - h * 0.78} ${h * 0.12})`} opacity="0.9">
          <Icon width={h * 0.66} height={h * 0.66} strokeWidth={0.9} color="var(--cover-fg)" />
        </g>
      ) : (
        <>
          {/* symbol badge (a small monogram cover already shows the symbol) */}
          <g transform={`translate(${pad} ${pad})`} display={small && !figure ? "none" : undefined}>
            <rect width={Math.max(64, (item.symbol?.length ?? 4) * (small ? 22 : 14) + 24)} height={small ? 48 : 34} rx={small ? 24 : 17} fill="var(--cover-fg)" />
            <text x={12} y={small ? 32 : 23} fill="var(--cover-bg)" fontSize={small ? 26 : 17} fontWeight="700" fontFamily="ui-monospace, Consolas, monospace" letterSpacing="0.04em">
              {item.symbol}
            </text>
          </g>
          {!small && (
            <text x={pad} y={pad + 64} fill="var(--cover-ink)" fontSize="15" fontWeight="600" letterSpacing="0.08em">
              {eyebrow.toUpperCase()}
            </text>
          )}
          {figure ? (
            <>
              <text
                x={pad}
                y={small ? h - 76 : chart ? h - 104 : h - 92}
                fill={figure.tone === "neg" ? "var(--negative)" : "var(--cover-fg)"}
                fontSize={small ? 58 : ratio === "4:3" ? 64 : 76}
                fontWeight="650"
                letterSpacing="-0.03em"
              >
                {figure.big}
              </text>
              {!small && (
                <text x={pad} y={chart ? h - 74 : h - 58} fill="var(--cover-ink)" fontSize="19">
                  {figure.label}
                </text>
              )}
            </>
          ) : (
            // Monogram fallback
            <text
              x={pad}
              y={h - (small ? 64 : 72)}
              fill="var(--cover-fg)"
              fontSize={Math.min(small ? 110 : 120, (w - pad * 2) / (Math.max(3, (item.symbol ?? "SK").length) * 0.76))}
              fontWeight="700"
              opacity="0.2"
              letterSpacing="-0.03em"
            >
              {item.symbol ?? "SK"}
            </text>
          )}
          {chart && <MiniBars values={chart} x={pad} y={h - 56} w={Math.min(260, w / 2)} h={30} />}
        </>
      )}

      {!small && (
        <g fill="var(--cover-ink)" fontSize="14" fontWeight="600">
          <text x={w - pad} y={h - pad + 4} textAnchor="end">
            ShareKhabar · {formatShortDate(item.sort_time)}
          </text>
          {news && (
            <text x={pad} y={pad + 18} fontSize="15" letterSpacing="0.08em">
              {eyebrow.toUpperCase()}
            </text>
          )}
        </g>
      )}
    </svg>
  );
}

/** Topic artwork on its own (sector tiles): same pattern and symbol as news covers. */
export function TopicArt({ topic, seedId, ratio = "4:3", className = "" }: { topic: Topic; seedId: number; ratio?: Ratio; className?: string }) {
  const [w, h] = BOX[ratio];
  const Icon = TOPIC_ICON[topic];
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
      preserveAspectRatio="xMidYMid slice"
      className={`block h-auto w-full cover-economy ${className}`}
      style={{ aspectRatio: `${w} / ${h}`, direction: "ltr" }}
    >
      <rect width={w} height={h} fill="var(--cover-bg)" />
      <Pattern id={`t-${topic}-${ratio.replace(":", "")}`} w={w} h={h} kind={seed(seedId, 3)} />
      <g transform={`translate(${w - h * 0.78} ${h * 0.12})`} opacity="0.9">
        <Icon width={h * 0.66} height={h * 0.66} strokeWidth={0.9} color="var(--cover-fg)" />
      </g>
    </svg>
  );
}
