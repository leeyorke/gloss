import { describe, expect, it } from "vitest";
import { briefMessages, buildMessages, type DocPayload, type ThreadPayload } from "@/lib/prompts";
import type { ChatMessage } from "@/lib/models";

const doc: DocPayload = {
  title: "On a Piece of Chalk",
  author: "Mark Twain",
  paras: [{ n: 1, text: "This is a very old and very interesting subject." }],
};

const thread: ThreadPayload = { action: "explain", quote: "a very old subject" };

/** The one message that says which language to write in. */
const noteOf = (messages: ChatMessage[]) => messages.find((m) => m.role === "system" && /Write the (answer|gist)/.test(m.content));

describe("the language an answer is written in", () => {
  it("is the language the reader is reading in", () => {
    const zh = noteOf(buildMessages(doc, thread, [], "normal", "zh"))?.content ?? "";
    expect(zh).toMatch(/Simplified Chinese/);
    expect(zh).toMatch(/简体中文/);

    const en = noteOf(buildMessages(doc, thread, [], "normal", "en"))?.content ?? "";
    expect(en).toMatch(/Write the answer in English/);
  });

  it("keeps the shape of the answer whatever language it is in", () => {
    const note = noteOf(buildMessages(doc, thread, [], "normal", "zh"))?.content ?? "";
    expect(note).toMatch(/==double equals==/);
    expect(note).toMatch(/\[¶n\]/);
    expect(note).toMatch(/\[1\]/);
  });

  it("does not touch the text at the front of the messages", () => {
    // The document is what the provider's prefix cache serves: it has to be
    // the same for every reader, in every language.
    const zh = buildMessages(doc, thread, [], "normal", "zh");
    const en = buildMessages(doc, thread, [], "normal", "en");
    expect(zh[0]).toEqual(en[0]);
  });

  it("comes after the text and before the question", () => {
    const messages = buildMessages(doc, thread, [], "normal", "zh");
    const note = messages.findIndex((m) => noteOf([m]) !== undefined);
    const question = messages.findIndex((m) => m.role === "user");
    expect(note).toBeGreaterThan(0);
    expect(note).toBeLessThan(question);
  });

  it("is the only thing the language adds", () => {
    // Everything else is what it was before: the document, the length, the
    // question. The note is one message among them.
    const messages = buildMessages(doc, thread, [], "normal", "zh");
    expect(messages.map((m) => m.role)).toEqual(["system", "system", "system", "user"]);
    expect(messages.filter((m) => noteOf([m]) !== undefined)).toHaveLength(1);
  });

  it("is there whatever the length and the web are", () => {
    const plain = buildMessages(doc, thread, [], "normal", "zh");
    const long = buildMessages(doc, thread, [], "long", "zh", "WEB RESULTS", true);
    expect(noteOf(plain)).toBeDefined();
    expect(noteOf(long)).toBeDefined();
    expect(noteOf(long)?.content).toBe(noteOf(plain)?.content);
  });
});

describe("the brief", () => {
  it("is written in the language the reader is reading in", () => {
    const messages = briefMessages(doc, "zh");
    expect(noteOf(messages)?.content).toMatch(/Simplified Chinese/);
    expect(messages[0]).toEqual(buildMessages(doc, thread, [], "normal", "zh")[0]);
  });

  it("keeps the shape of the answer", () => {
    const last = briefMessages(doc, "zh").at(-1)?.content ?? "";
    expect(last).toContain('"gist"');
    expect(last).toContain('"sections"');
  });
});
