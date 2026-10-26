import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: sends signed-out hosts to /login before rendering.
// Real authorization happens server-side on every page, action and API call.
const SESSION_COOKIES = ["__Host-gatherly_session", "gatherly_session"];

export function proxy(request: NextRequest) {
  if (SESSION_COOKIES.some((c) => request.cookies.has(c))) return NextResponse.next();
  const url = new URL("/login", request.url);
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard", "/events/:path*"],
};
