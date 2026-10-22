import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE, LOCALE_DIR, LOCALE_NAMES, LOCALE_TAGS, isLocale, primarySubtag } from "@/lib/i18n/config";

describe("the languages Gloss speaks", () => {
  it("has a default among them", () => {
    expect(LOCALES).toContain(DEFAULT_LOCALE);
  });

  it("gives every language a tag, a name and a direction", () => {
    for (const locale of LOCALES) {
      expect(LOCALE_TAGS[locale]).toBeTruthy();
      expect(LOCALE_NAMES[locale]).toBeTruthy();
      expect(["ltr", "rtl"]).toContain(LOCALE_DIR[locale]);
    }
  });

  it("keeps the tags and the names apart, so a language is never written twice under one name", () => {
    expect(new Set(LOCALES.map((l) => LOCALE_TAGS[l])).size).toBe(LOCALES.length);
    expect(new Set(LOCALES.map((l) => LOCALE_NAMES[l])).size).toBe(LOCALES.length);
  });

  it("remembers the reader's choice in a cookie of its own", () => {
    expect(LOCALE_COOKIE).toBe("gloss_locale");
  });
});

describe("isLocale", () => {
  it("accepts the languages we speak", () => {
    for (const locale of LOCALES) expect(isLocale(locale)).toBe(true);
  });

  it("turns away anything else", () => {
    expect(isLocale("fr")).toBe(false);
    expect(isLocale("")).toBe(false);
    expect(isLocale("EN")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(42)).toBe(false);
  });
});

describe("primarySubtag", () => {
  it("takes the language out of a tag", () => {
    expect(primarySubtag("zh-Hans")).toBe("zh");
    expect(primarySubtag("zh-CN")).toBe("zh");
    expect(primarySubtag("en")).toBe("en");
    expect(primarySubtag("EN-us")).toBe("en");
  });

  it("copes with an empty tag", () => {
    expect(primarySubtag("")).toBe("");
  });
});
