import { describe, expect, it } from "vitest";
import { GTTS_MAX_CHARS, baiduLang, resolveLang, speechLang, splitForSpeech } from "@/lib/voice";

describe("the language a passage is read in", () => {
  it("is English for English", () => {
    expect(speechLang("The quick brown fox jumps over the lazy dog.")).toBe("en-US");
  });

  it("is Chinese for Chinese", () => {
    expect(speechLang("今天天气很好，我们去公园散步吧。")).toBe("zh-CN");
  });

  it("is Japanese for Japanese, even with han in it", () => {
    expect(speechLang("今日はいい天気ですね")).toBe("ja");
  });

  it("is Korean for Korean", () => {
    expect(speechLang("안녕하세요 반갑습니다")).toBe("ko");
  });

  it("is Russian for Russian", () => {
    expect(speechLang("Привет, как дела?")).toBe("ru-RU");
  });

  it("is English when there are no letters at all", () => {
    expect(speechLang("123 456")).toBe("en-US");
  });
});

describe("the language tag Google is given", () => {
  it("turns a three-letter code into a tag", () => {
    expect(resolveLang("eng")).toBe("en-US");
    expect(resolveLang("fre")).toBe("fr-FR");
    expect(resolveLang("jpn")).toBe("ja");
    expect(resolveLang("ger")).toBe("de-DE");
  });

  it("keeps a region with Chinese", () => {
    expect(resolveLang("zho-TW")).toBe("zh-TW");
    expect(resolveLang("zh-HK")).toBe("zh-TW");
    expect(resolveLang("zho")).toBe("zh-CN");
  });

  it("keeps a tag that is already a tag", () => {
    expect(resolveLang("en-US")).toBe("en-US");
    expect(resolveLang("ru-RU")).toBe("ru-RU");
    expect(resolveLang("ja")).toBe("ja");
  });

  it("falls back to English for anything else", () => {
    expect(resolveLang()).toBe("en-US");
    expect(resolveLang("nonsense-code")).toBe("en-US");
  });
});

describe("the language the other voice is asked in", () => {
  it("speaks Chinese, English, Japanese and Korean", () => {
    expect(baiduLang("zh-CN")).toBe("zh");
    expect(baiduLang("en-US")).toBe("en");
    expect(baiduLang("ja")).toBe("jp");
    expect(baiduLang("ko")).toBe("kor");
  });

  it("does not speak the rest of the world", () => {
    expect(baiduLang("fr-FR")).toBeNull();
    expect(baiduLang("es-ES")).toBeNull();
    expect(baiduLang("ru-RU")).toBeNull();
    expect(baiduLang("ar")).toBeNull();
    expect(baiduLang("th")).toBeNull();
  });
});

describe("one request's worth of text", () => {
  it("leaves a sentence whole", () => {
    expect(splitForSpeech("The quick brown fox.")).toEqual(["The quick brown fox."]);
  });

  it("cuts a long passage at sentence ends", () => {
    const parts = splitForSpeech(`${"a".repeat(120)}. ${"b".repeat(120)}.`);
    expect(parts).toEqual([`${"a".repeat(120)}.`, `${"b".repeat(120)}.`]);
  });

  it("cuts a long sentence at word ends, never inside a word", () => {
    const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const parts = splitForSpeech(words);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(GTTS_MAX_CHARS);
    expect(parts.join(" ").split(" ")).toEqual(words.split(" "));
  });

  it("never asks for more than one request's worth", () => {
    const parts = splitForSpeech("word ".repeat(200));
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(GTTS_MAX_CHARS);
  });

  it("keeps every word of the passage", () => {
    const text = "One. Two. Three. Four.";
    expect(splitForSpeech(text).join(" ")).toBe(text);
  });

  it("has nothing to say about empty text", () => {
    expect(splitForSpeech("   ")).toEqual([]);
  });
});
