import { describe, expect, it } from "vitest";
import { formatDate, formatNumber, formatRelativeTime, intlTag, pluralCategory } from "@/lib/i18n/format";

const DAY = Date.UTC(2024, 4, 17, 12, 0, 0);

describe("intlTag", () => {
  it("gives the tag of a language", () => {
    expect(intlTag("en")).toBe("en");
    expect(intlTag("zh")).toBe("zh-Hans");
  });
});

describe("formatDate", () => {
  it("writes a date the way the language writes dates", () => {
    const en = formatDate("en", DAY, { year: "numeric", month: "long", day: "numeric" });
    const zh = formatDate("zh", DAY, { year: "numeric", month: "long", day: "numeric" });
    expect(en).toContain("2024");
    expect(en).toContain("May");
    expect(zh).toContain("2024");
    expect(zh).toContain("5");
    expect(en).not.toBe(zh);
  });

  it("takes a date as a string or a number too", () => {
    expect(formatDate("en", "2024-05-17T12:00:00.000Z", { timeZone: "UTC", year: "numeric" })).toBe("2024");
  });

  it("says nothing about a date that is not one", () => {
    expect(formatDate("en", "not a date")).toBe("");
  });
});

describe("formatNumber", () => {
  it("writes a number the way the language writes numbers", () => {
    expect(formatNumber("en", 1234)).toBe("1,234");
    expect(formatNumber("zh", 1234)).toBe("1,234");
    expect(formatNumber("en", 1234, { style: "percent" })).toBe("123,400%");
  });

  it("says nothing about a number that is not one", () => {
    expect(formatNumber("en", Number.NaN)).toBe("");
    expect(formatNumber("en", Number.POSITIVE_INFINITY)).toBe("");
  });
});

describe("pluralCategory", () => {
  it("knows which plural form a number takes", () => {
    expect(pluralCategory("en", 1)).toBe("one");
    expect(pluralCategory("en", 2)).toBe("other");
    expect(pluralCategory("zh", 1)).toBe("other");
  });
});

describe("formatRelativeTime", () => {
  const now = Date.UTC(2024, 4, 17, 12, 0, 0);

  it("says how long ago something was", () => {
    expect(formatRelativeTime("en", now - 3 * 86400_000, now)).toBe("3 days ago");
    expect(formatRelativeTime("en", now - 2 * 3600_000, now)).toBe("2 hours ago");
  });

  it("says how far ahead something is", () => {
    expect(formatRelativeTime("en", now + 3 * 86400_000, now)).toBe("in 3 days");
  });

  it("says it in the words of the language", () => {
    expect(formatRelativeTime("zh", now - 3 * 86400_000, now)).toBe("3天前");
  });

  it("says nothing about a time that is not one", () => {
    expect(formatRelativeTime("en", "not a date", now)).toBe("");
  });
});
