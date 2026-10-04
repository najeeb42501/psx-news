import { getUpcoming } from "@/lib/data";

// Upcoming events for a list of symbols (used by "My stocks").
export async function GET(request: Request) {
  const symbols = (new URL(request.url).searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase().replace(/[^A-Z0-9-]/g, ""))
    .filter(Boolean)
    .slice(0, 50);
  const events = symbols.length ? await getUpcoming(undefined, 60, undefined, symbols) : [];
  return Response.json(events, { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
