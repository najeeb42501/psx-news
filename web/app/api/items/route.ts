import { getItemsBySymbols } from "@/lib/data";

// Used by "My stocks" in the browser: latest published items for a list of symbols.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const symbols = (url.searchParams.get("symbols") ?? "").split(",");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 30, 1), 60);
  const items = await getItemsBySymbols(symbols, limit);
  return Response.json(items, { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
