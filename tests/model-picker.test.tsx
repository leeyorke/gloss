import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { getDictionary } from "@/lib/i18n/dictionary";
import { ModelPicker } from "@/components/ui/ModelPicker";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { useStore } from "@/lib/store";
import type { ModelInfo } from "@/lib/models";

const MODELS: ModelInfo[] = [
  { id: "a/one:free", name: "Model One", context: 1000, tools: true, vision: false, reasoning: false, mandatoryReasoning: false, defaultReasoning: false, efforts: [], json: true, inPerM: 0, outPerM: 0 },
  { id: "b/two:free", name: "Model Two", context: 2000, tools: true, vision: false, reasoning: false, mandatoryReasoning: false, defaultReasoning: false, efforts: [], json: true, inPerM: 0, outPerM: 0 },
];

function draw() {
  return render(
    <I18nProvider locale="en" dict={getDictionary("en")}>
      <ModelPicker />
    </I18nProvider>
  );
}

/** The chain the reader has ticked. */
const chain = () => useStore.getState().settings.models;

describe("the models answers come from", () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.setState({ settings: { ...DEFAULT_SETTINGS, models: [] } });
    vi.stubGlobal("fetch", async () => Response.json({ models: MODELS }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists every free model, and ticks none of them", async () => {
    draw();
    await waitFor(() => expect(screen.getAllByText("Model One").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Model Two").length).toBeGreaterThan(0);
    expect(chain()).toEqual([]);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.every((b) => b.getAttribute("aria-checked") === "false")).toBe(true);
  });

  it("ticks the model that is chosen", async () => {
    draw();
    await waitFor(() => expect(screen.getAllByText("Model One").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("checkbox", { name: "Choose Model One" }));
    expect(chain()).toEqual(["a/one:free"]);
  });

  it("unticks a model that is chosen", async () => {
    useStore.setState({ settings: { ...DEFAULT_SETTINGS, models: ["a/one:free"] } });
    draw();
    await waitFor(() => expect(screen.getAllByText("Model One").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("checkbox", { name: "Unchoose Model One" }));
    expect(chain()).toEqual([]);
  });

  it("says which model answers and which ones stand behind it", async () => {
    useStore.setState({ settings: { ...DEFAULT_SETTINGS, models: ["a/one:free", "b/two:free"] } });
    draw();
    await waitFor(() => expect(screen.getAllByText("Model One").length).toBeGreaterThan(0));
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Model One");
    expect(rows[0]).toHaveTextContent("Default");
    expect(rows[1]).toHaveTextContent("Model Two");
    expect(rows[1]).toHaveTextContent("Fallback");
  });

  it("puts a model that is moved up in front of the one before it", async () => {
    useStore.setState({ settings: { ...DEFAULT_SETTINGS, models: ["a/one:free", "b/two:free"] } });
    draw();
    await waitFor(() => expect(screen.getAllByText("Model Two").length).toBeGreaterThan(0));
    const handles = screen.getAllByRole("button", { name: /Move Model Two/ });
    fireEvent.keyDown(handles[0], { key: "ArrowUp" });
    expect(chain()).toEqual(["b/two:free", "a/one:free"]);
  });

  it("puts a model that is moved down behind the one after it", async () => {
    useStore.setState({ settings: { ...DEFAULT_SETTINGS, models: ["a/one:free", "b/two:free"] } });
    draw();
    await waitFor(() => expect(screen.getAllByText("Model One").length).toBeGreaterThan(0));
    const handles = screen.getAllByRole("button", { name: /Move Model One/ });
    fireEvent.keyDown(handles[0], { key: "ArrowDown" });
    expect(chain()).toEqual(["b/two:free", "a/one:free"]);
  });

  it("clears every model that was ticked", async () => {
    useStore.setState({ settings: { ...DEFAULT_SETTINGS, models: ["a/one:free", "b/two:free"] } });
    draw();
    await waitFor(() => expect(screen.getAllByText("Model One").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(chain()).toEqual([]);
  });
});
