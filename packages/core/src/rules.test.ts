import { describe, expect, it } from "vitest";
import { formatSlideCreationRules, getSlideCreationRules } from "./rules.js";

describe("first-pass slide creation rules", () => {
  it("returns Japanese technical guardrails before DeckSpec creation", () => {
    const rules = getSlideCreationRules("ja-JP", "technical");

    expect(rules.agentPrompt).toContain("PPTX 初回生成ルール");
    expect(rules.workflow.join("\n")).toContain("get_slide_creation_rules");
    expect(rules.workflow.join("\n")).toContain("Message Map");
    expect(rules.visualRules.join("\n")).toContain("generate_native_diagram");
    expect(rules.visualRules.join("\n")).toContain("色付きライン付きカード");
    expect(rules.hardRules.join("\n")).toContain("1スライド1メッセージ");
  });

  it("formats English guardrails as a reusable prompt", () => {
    const rules = getSlideCreationRules("en-US", "decision");
    const prompt = formatSlideCreationRules(rules);

    expect(prompt).toContain("PPTX first-pass generation rules");
    expect(prompt).toContain("Pre-generation workflow");
    expect(prompt).toContain("Message Map");
    expect(prompt).toContain("Do not force render-blocking lint errors");
    expect(prompt).toContain("colored accent-bar cards");
  });
});
