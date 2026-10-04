import { NextResponse, type NextRequest } from "next/server";

// Quick gate for /admin pages: no valid admin cookie -> login page. Every admin action also
// checks the cookie on the server (lib/admin.ts), so this is not the only protection.
const COOKIE = "sk_admin";

async function expected(): Promise<string> {
  const data = new TextEncoder().encode(`sharekhabar-admin:${process.env.ADMIN_TOKEN ?? ""}`);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/admin/login")) return NextResponse.next();
  const cookie = request.cookies.get(COOKIE)?.value;
  if (process.env.ADMIN_TOKEN && cookie && cookie === (await expected())) return NextResponse.next();
  return NextResponse.redirect(new URL("/admin/login", request.url));
}

export const config = { matcher: ["/admin/:path*"] };
