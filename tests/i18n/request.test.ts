import { describe, expect, it } from "vitest";
import { localeOfRequest } from "@/lib/i18n/request";

/** A request, from a reader whose browser carries a cookie. */
const ask = (cookie?: string) => new Request("http://localhost/api/ask", { headers: cookie ? { cookie } : {} });

describe("the language of a request", () => {
  it("is what the browser says", () => {
    expect(localeOfRequest(ask(), "zh")).toBe("zh");
    expect(localeOfRequest(ask(), "en")).toBe("en");
  });

  it("is what the reader chose, when the browser says nothing", () => {
    expect(localeOfRequest(ask("gloss_locale=zh"))).toBe("zh");
    expect(localeOfRequest(ask("other=1; gloss_locale=zh; more=2"))).toBe("zh");
  });

  it("is what the browser says, when both say something", () => {
    expect(localeOfRequest(ask("gloss_locale=zh"), "en")).toBe("en");
  });

  it("ignores a language that is not one of ours", () => {
    expect(localeOfRequest(ask("gloss_locale=zh"), "fr")).toBe("zh");
    expect(localeOfRequest(ask(), "fr")).toBe("en");
    expect(localeOfRequest(ask("gloss_locale=fr"))).toBe("en");
  });

  it("is English when nothing says otherwise", () => {
    expect(localeOfRequest(ask())).toBe("en");
  });
});
