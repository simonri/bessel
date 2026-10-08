import { describe, expect, it } from "vitest";
import { modelFamily, modelLabel } from "./agent-usage-models";

describe("modelLabel", () => {
  it.each([
    ["claude-opus-5-5", "Opus 5.5"],
    ["claude-haiku-4-5-20251001", "Haiku 4.5"],
    ["claude-fable-5-1", "Fable 5.1"],
    ["claude-opus-5", "Opus 5"],
    ["claude-opus-4-8", "Opus 4.8"],
  ])("names %s %s", (id, label) => {
    expect(modelLabel(id)).toBe(label);
  });

  it("leaves ids it doesn't know alone", () => {
    expect(modelLabel("gpt-5")).toBe("gpt-5");
  });
});

describe("modelFamily", () => {
  it("groups versions into their family", () => {
    expect(modelFamily("claude-opus-4-8")).toBe("opus");
    expect(modelFamily("claude-haiku-4-5-20251001")).toBe("haiku");
    expect(modelFamily("<synthetic>")).toBe("other");
  });
});
