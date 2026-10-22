import { describe, expect, it } from "vitest";
import { matchLocale, parseAcceptLanguage } from "@/lib/i18n/negotiate";

describe("parseAcceptLanguage", () => {
  it("reads the ranges out of a header, best first", () => {
    expect(parseAcceptLanguage("zh-CN,zh;q=0.9,en;q=0.8")).toEqual([
      { tag: "zh-cn", quality: 1 },
      { tag: "zh", quality: 0.9 },
      { tag: "en", quality: 0.8 },
    ]);
  });

  it("gives a range with no quality the whole of it", () => {
    expect(parseAcceptLanguage("en")).toEqual([{ tag: "en", quality: 1 }]);
  });

  it("keeps ranges of the same quality in the order they were written", () => {
    expect(parseAcceptLanguage("zh,en").map((r) => r.tag)).toEqual(["zh", "en"]);
  });

  it("drops a range that says it does not want it", () => {
    expect(parseAcceptLanguage("fr;q=0,en")).toEqual([{ tag: "en", quality: 1 }]);
  });

  it("copes with a header that is not there", () => {
    expect(parseAcceptLanguage(null)).toEqual([]);
    expect(parseAcceptLanguage(undefined)).toEqual([]);
    expect(parseAcceptLanguage("")).toEqual([]);
  });

  it("ignores the empty pieces of a header", () => {
    expect(parseAcceptLanguage("en,,zh")).toEqual([
      { tag: "en", quality: 1 },
      { tag: "zh", quality: 1 },
    ]);
  });

  it("holds a quality to the range between zero and one", () => {
    expect(parseAcceptLanguage("en;q=2")[0].quality).toBe(1);
    expect(parseAcceptLanguage("en;q=0.5")[0].quality).toBe(0.5);
  });

  it("turns a quality below zero into a refusal", () => {
    expect(parseAcceptLanguage("en;q=-1")).toEqual([]);
  });
});

describe("matchLocale", () => {
  it("serves the language the reader asked for", () => {
    expect(matchLocale("zh-CN,zh;q=0.9,en;q=0.8")).toBe("zh");
    expect(matchLocale("en-US,en;q=0.9")).toBe("en");
  });

  it("serves a language from its own tag", () => {
    expect(matchLocale("zh-Hans")).toBe("zh");
  });

  it("skips a language we do not have, and goes on to the next one", () => {
    expect(matchLocale("fr;q=1.0,zh;q=0.9")).toBe("zh");
  });

  it("falls back to the default when the header names nothing we have", () => {
    expect(matchLocale("fr,de")).toBe("en");
    expect(matchLocale(null)).toBe("en");
    expect(matchLocale("")).toBe("en");
  });

  it("falls back to the default for the wildcard", () => {
    expect(matchLocale("*")).toBe("en");
  });

  it("reads a language that says it does not want it as a refusal", () => {
    expect(matchLocale("zh;q=0,en")).toBe("en");
  });

  it("takes the better of two requests for the same language", () => {
    expect(matchLocale("en;q=0.2,zh;q=0.9")).toBe("zh");
  });

  it("can be told which languages there are and what to fall back to", () => {
    expect(matchLocale("fr", ["en", "zh"], "zh")).toBe("zh");
  });
});
