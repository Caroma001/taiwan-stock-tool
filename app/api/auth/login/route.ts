import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/cloud/security";
import { COOKIE_NAME, createSessionToken } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const expected = process.env.APP_ACCESS_PASSWORD;
  const sessionSecret = process.env.AUTH_SESSION_SECRET;

  if (!expected || !sessionSecret) {
    return NextResponse.json({ ok: false, error: "登入服務尚未完成雲端設定" }, { status: 503 });
  }
  if (!safeEqual(String(body.password ?? ""), expected)) {
    return NextResponse.json({ ok: false, error: "密碼錯誤" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, await createSessionToken(expected, sessionSecret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return response;
}
