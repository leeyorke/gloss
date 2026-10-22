import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { LOCALE_COOKIE, LOCALE_HEADER, isLocale } from "@/lib/i18n/config";
import { matchLocale } from "@/lib/i18n/negotiate";
import { splitLocale } from "@/lib/i18n/paths";

const YEAR = 60 * 60 * 24 * 365;

/**
 * The language of a request, and where it is written down.
 *
 * Every page lives under a language: /en/library, /zh/library. A request that
 * arrives without one is sent to the language the reader asked for, and that
 * choice is remembered in a cookie, so the next visit opens in it.
 */
export default clerkMiddleware((_auth, request) => {
  const { pathname } = request.nextUrl;

  // The API and the MCP server speak in paths of their own, without a language.
  if (pathname === "/api" || pathname.startsWith("/api/") || pathname === "/mcp" || pathname.startsWith("/mcp/")) {
    return NextResponse.next();
  }

  const { locale } = splitLocale(pathname);

  // No language in the path: choose one and send the reader there.
  if (!locale) {
    const saved = request.cookies.get(LOCALE_COOKIE)?.value;
    const chosen = isLocale(saved) ? saved : matchLocale(request.headers.get("accept-language"));
    const url = request.nextUrl.clone();
    url.pathname = `/${chosen}${pathname === "/" ? "" : pathname}`;
    const response = NextResponse.redirect(url);
    response.cookies.set(LOCALE_COOKIE, chosen, { path: "/", maxAge: YEAR, sameSite: "lax" });
    return response;
  }

  // A language in the path: it is the one being read, and it is remembered.
  const headers = new Headers(request.headers);
  headers.set(LOCALE_HEADER, locale);
  const response = NextResponse.next({ request: { headers } });
  if (request.cookies.get(LOCALE_COOKIE)?.value !== locale) {
    response.cookies.set(LOCALE_COOKIE, locale, { path: "/", maxAge: YEAR, sameSite: "lax" });
  }
  return response;
});

export const config = {
  matcher: [
    // Skip Next internals, the metadata files and static assets, unless found in search params.
    "/((?!_next|robots\\.txt|sitemap\\.xml|[^?]*\\.(?:html?|css|js(?!on)|mjs|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
