import { getCompanies } from "@/lib/data";

// Symbol list for the "My stocks" picker.
export async function GET() {
  const companies = await getCompanies();
  return Response.json(companies, { headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=86400" } });
}
