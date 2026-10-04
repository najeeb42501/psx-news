import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSession } from "@/lib/session";

// 1. /admin pages and the /design preview: no valid signed session -> sign-in page. Every admin action also checks the
//    session and the admin list on the server (lib/admin.ts), so this is not the only protection.
// 2. /api/*: a simple per-address rate limit, so one client can't hammer the database.
//    It lives in this server's memory: on a host with several instances each counts separately,
//    which still stops a single runaway client.

const OPEN_ADMIN_PATHS = ["/admin/login", "/admin/auth/callback"];
const API_LIMIT = 60; // requests per address per window
const API_WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; reset: number }>();

function rateLimited(ip: string, now = Date.now()): { limited: boolean; retryAfter: number } {
  if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  const entry = hits.get(ip);
  if (!entry || entry.reset < now) {
    hits.set(ip, { count: 1, reset: now + API_WINDOW_MS });
    return { limited: false, retryAfter: 0 };
  }
  entry.count += 1;
  return { limited: entry.count > API_LIMIT, retryAfter: Math.ceil((entry.reset - now) / 1000) };
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/")) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const { limited, retryAfter } = rateLimited(ip);
    if (limited) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }
    return NextResponse.next();
  }
  if (OPEN_ADMIN_PATHS.some((p) => path.startsWith(p))) return NextResponse.next();
  if (await readSession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  return NextResponse.redirect(new URL("/admin/login", request.url));
}

export const config = { matcher: ["/admin/:path*", "/api/:path*", "/design"] };
