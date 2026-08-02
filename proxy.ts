import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, isValidSessionToken } from "@/lib/auth/session";

const PUBLIC = ["/login", "/api/auth/login", "/api/cron/daily", "/api/health", "/api/ready", "/_next", "/favicon.ico", "/manifest.webmanifest", "/sw.js", "/offline", "/icon-", "/apple-touch-icon.png"];

export async function proxy(request: NextRequest) {
  const password = process.env.APP_ACCESS_PASSWORD;
  const sessionSecret = process.env.AUTH_SESSION_SECRET;
  if (!password || !sessionSecret) return NextResponse.next();
  if (PUBLIC.some((path) => request.nextUrl.pathname.startsWith(path))) return NextResponse.next();

  const valid = await isValidSessionToken(request.cookies.get(COOKIE_NAME)?.value, password, sessionSecret);
  if (valid) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "Login required" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
