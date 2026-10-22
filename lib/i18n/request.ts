import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config";

/**
 * The language of a request that arrives at the API.
 *
 * The pages know their own language, and say so in the body of the request.
 * The cookie is the fallback: it is what the proxy writes down when a reader
 * opens a page in a language, so an older tab, or another caller, still gets
 * an answer in the language the reader is reading in.
 */

/** One cookie's value, out of the request's cookie header. */
function cookieValue(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key !== name) continue;
    try {
      return decodeURIComponent(value.join("="));
    } catch {
      return value.join("=");
    }
  }
  return undefined;
}

/**
 * The language a request is in: what the caller says, else what the reader
 * chose, else the language Gloss reads in when nothing else says otherwise.
 */
export function localeOfRequest(req: Request, given?: unknown): Locale {
  if (isLocale(given)) return given;
  const cookie = cookieValue(req, LOCALE_COOKIE);
  return isLocale(cookie) ? cookie : DEFAULT_LOCALE;
}
