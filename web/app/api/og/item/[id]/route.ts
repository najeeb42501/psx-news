import { renderCard } from "@/lib/card";
import { sourceLabel } from "@/lib/categories";
import { getItem } from "@/lib/data";
import { keyNumber } from "@/lib/facts";
import { formatDateTime } from "@/lib/format";

// PNG share card for an item (used as the link preview image and for "Share image card").
export async function GET(_request: Request, { params }: RouteContext<"/api/og/item/[id]">) {
  const { id } = await params;
  const item = Number.isInteger(Number(id)) ? await getItem(Number(id)) : null;
  if (!item) return new Response("Not found", { status: 404 });
  const png = renderCard({
    symbol: item.symbol,
    headlineEn: item.headline_en ?? item.source_title,
    headlineUr: item.headline_ur,
    keyNumber: keyNumber(item.facts),
    sourceLabel: sourceLabel(item.source_id),
    dateLabel: formatDateTime(item.sort_time),
  });
  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
