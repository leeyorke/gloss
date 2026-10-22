import { describe, expect, it } from "vitest";
import { hasLocale, languageAlternates, localeOf, localePath, splitLocale, switchLocale } from "@/lib/i18n/paths";

describe("splitLocale", () => {
  it("takes the language off the front of a path", () => {
    expect(splitLocale("/zh/library")).toEqual({ locale: "zh", rest: "/library" });
    expect(splitLocale("/en/read/walden")).toEqual({ locale: "en", rest: "/read/walden" });
  });

  it("leaves a path that has no language alone", () => {
    expect(splitLocale("/library")).toEqual({ locale: null, rest: "/library" });
    expect(splitLocale("/")).toEqual({ locale: null, rest: "/" });
  });

  it("takes only a whole first segment as a language", () => {
    expect(splitLocale("/english/notes").locale).toBeNull();
    expect(splitLocale("/zh-Hans/notes").locale).toBeNull();
  });

  it("copes with a path that does not begin with a slash", () => {
    expect(splitLocale("zh/library")).toEqual({ locale: "zh", rest: "/library" });
  });

  it("keeps the query string with the rest of the path", () => {
    expect(splitLocale("/zh/read/x?hl=7")).toEqual({ locale: "zh", rest: "/read/x?hl=7" });
  });
});

describe("hasLocale", () => {
  it("knows a path in a language from one that is not", () => {
    expect(hasLocale("/zh/library")).toBe(true);
    expect(hasLocale("/library")).toBe(false);
  });
});

describe("localePath", () => {
  it("writes the language in front of a path", () => {
    expect(localePath("zh", "/library")).toBe("/zh/library");
    expect(localePath("en", "/read/walden")).toBe("/en/read/walden");
  });

  it("writes only the language for the front page", () => {
    expect(localePath("zh", "/")).toBe("/zh");
    expect(localePath("zh")).toBe("/zh");
  });

  it("does not write the language twice", () => {
    expect(localePath("zh", "/zh/library")).toBe("/zh/library");
  });

  it("keeps the query string", () => {
    expect(localePath("zh", "/read/x?hl=7")).toBe("/zh/read/x?hl=7");
  });
});

describe("switchLocale", () => {
  it("moves a page into another language", () => {
    expect(switchLocale("/zh/library", "en")).toBe("/en/library");
    expect(switchLocale("/en/library", "zh")).toBe("/zh/library");
  });

  it("moves the front page too", () => {
    expect(switchLocale("/zh", "en")).toBe("/en");
    expect(switchLocale("/", "zh")).toBe("/zh");
  });

  it("keeps the query string and the anchor", () => {
    expect(switchLocale("/zh/read/x?hl=7#top", "en")).toBe("/en/read/x?hl=7#top");
  });
});

describe("localeOf", () => {
  it("names the language of a path, or the default when it has none", () => {
    expect(localeOf("/zh/library")).toBe("zh");
    expect(localeOf("/library")).toBe("en");
  });
});

describe("languageAlternates", () => {
  it("links each language's own address for the page", () => {
    expect(languageAlternates("/library")).toMatchObject({ en: "/en/library", "zh-Hans": "/zh/library" });
  });

  it("offers the default to those with no preference", () => {
    expect(languageAlternates("/library")["x-default"]).toBe("/en/library");
  });

  it("links the front page too", () => {
    expect(languageAlternates()).toMatchObject({ en: "/en", "zh-Hans": "/zh" });
  });
});
