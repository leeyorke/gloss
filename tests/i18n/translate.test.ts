import { describe, expect, it } from "vitest";
import { getDictionary } from "@/lib/i18n/dictionary";
import { hasTranslation, translate } from "@/lib/i18n/translate";

const en = getDictionary("en");
const zh = getDictionary("zh");

describe("translate", () => {
  it("gives the string at a key", () => {
    expect(translate("en", en, "nav.library")).toBe("Library");
    expect(translate("zh", zh, "nav.library")).toBe("书架");
  });

  it("gives the string in the language it is asked for", () => {
    expect(translate("en", en, "landing.hero.ask")).toBe("Ask it anything.");
    expect(translate("zh", zh, "landing.hero.ask")).toBe("向它提问任何问题。");
  });

  it("puts the words into the string", () => {
    expect(translate("en", en, "meta.glossedTitle", { title: "Walden" })).toBe("Walden, glossed");
    expect(translate("zh", zh, "meta.glossedTitle", { title: "瓦尔登湖" })).toBe("瓦尔登湖，已批注");
  });

  it("writes numbers the way the language writes numbers", () => {
    expect(translate("en", en, "common.texts", { count: 1234 })).toBe("1,234 texts");
  });

  it("picks the plural form that goes with the number", () => {
    expect(translate("en", en, "common.texts", { count: 1 })).toBe("1 text");
    expect(translate("en", en, "common.texts", { count: 3 })).toBe("3 texts");
  });

  it("picks the plural form in the language it is asked for", () => {
    expect(translate("zh", zh, "common.texts", { count: 1 })).toBe("1 篇文本");
  });

  it("gives back the key when there is nothing at it", () => {
    expect(translate("en", en, "nav.nothingHere")).toBe("nav.nothingHere");
  });

  it("leaves a word that was not given as it is, rather than hiding the mistake", () => {
    expect(translate("en", en, "meta.glossedTitle")).toBe("{title}, glossed");
  });

  it("keeps a word of zero", () => {
    expect(translate("en", en, "landing.continue", { title: "0" })).toContain("0");
  });
});

describe("hasTranslation", () => {
  it("knows what is in the dictionary", () => {
    expect(hasTranslation(en, "nav.library")).toBe(true);
    expect(hasTranslation(en, "nav.nothingHere")).toBe(false);
    expect(hasTranslation(en, "nav.library.deeper")).toBe(false);
  });
});
