import { describe, expect, it } from "vitest";
import { isFree, prettyModel, seedChain, type ModelInfo } from "@/lib/models";

/** A model in the catalogue, free unless it is said to cost money. */
function model(id: string, over: Partial<ModelInfo> = {}): ModelInfo {
  return {
    id,
    name: over.name ?? id,
    context: over.context ?? 1000,
    tools: over.tools ?? false,
    vision: over.vision ?? false,
    reasoning: over.reasoning ?? false,
    mandatoryReasoning: over.mandatoryReasoning ?? false,
    defaultReasoning: over.defaultReasoning ?? false,
    efforts: over.efforts ?? [],
    json: over.json ?? false,
    inPerM: over.inPerM ?? 0,
    outPerM: over.outPerM ?? 0,
  };
}

describe("a model id, as a name", () => {
  it("drops the free tag and the maker's name", () => {
    expect(prettyModel("deepseek/deepseek-chat-v3.1:free")).toBe("Deepseek Chat V3.1");
  });

  it("copes with an id it has never seen", () => {
    expect(prettyModel("gpt-oss-120b")).toBe("Gpt Oss 120b");
  });
});

describe("the chain a reader starts with", () => {
  it("holds only free models", () => {
    const chain = seedChain([model("a:free"), model("b:paid", { inPerM: 1, outPerM: 2 })]);
    expect(chain).toEqual(["a:free"]);
  });

  it("puts the models that can use tools first", () => {
    const chain = seedChain([model("plain:free"), model("toolful:free", { tools: true })]);
    expect(chain[0]).toBe("toolful:free");
  });

  it("is short enough to be a chain and not a list", () => {
    const many = Array.from({ length: 20 }, (_, i) => model(`m${i}:free`));
    expect(seedChain(many).length).toBeLessThanOrEqual(4);
  });

  it("knows which models are free", () => {
    expect(isFree(model("a:free"))).toBe(true);
    expect(isFree(model("b", { inPerM: 0, outPerM: 0.5 }))).toBe(false);
  });
});
