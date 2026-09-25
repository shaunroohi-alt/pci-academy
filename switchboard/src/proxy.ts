import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional HTTP Basic auth for the whole app. Enabled when APP_PASSWORD is
 * set — do this whenever the app is reachable by anyone but you, because the
 * server spends your provider credits. /api/health stays public for probes.
 */
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function proxy(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password || req.nextUrl.pathname === "/api/health") return NextResponse.next();
  const user = process.env.APP_USERNAME || "admin";
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const [u, ...rest] = atob(header.slice(6)).split(":");
      if (safeEqual(u, user) && safeEqual(rest.join(":"), password)) return NextResponse.next();
    } catch {
      /* fall through */
    }
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Switchboard", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
