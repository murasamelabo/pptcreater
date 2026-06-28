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
    expect(rules.workflow.join("\n")).toContain("いきなりPowerPointを立ち上げない");
    expect(rules.hardRules.join("\n")).toContain("主役は作り手ではなく聴き手");
    expect(rules.layoutRules.join("\n")).toContain("余白は余った白ではなく設計要素");
    expect(rules.layoutRules.join("\n")).toContain("視線のストーリー");
    expect(rules.visualRules.join("\n")).toContain("表は罫線ではなく文字が主役");
    expect(rules.visualRules.join("\n")).toContain("矢印は脇役");
    expect(rules.visualRules.join("\n")).toContain("写真や画像頼りにしない");
    expect(rules.visualRules.join("\n")).toContain("Slidelandのcool/minimal/trust系事例");
    expect(rules.visualRules.join("\n")).toContain("黒い塊");
  });

  it("formats English guardrails as a reusable prompt", () => {
    const rules = getSlideCreationRules("en-US", "decision");
    const prompt = formatSlideCreationRules(rules);

    expect(prompt).toContain("PPTX first-pass generation rules");
    expect(prompt).toContain("Pre-generation workflow");
    expect(prompt).toContain("Message Map");
    expect(prompt).toContain("Do not force render-blocking lint errors");
    expect(prompt).toContain("colored accent-bar cards");
    expect(prompt).toContain("do not open PowerPoint first");
    expect(prompt).toContain("Whitespace is a designed element");
    expect(prompt).toContain("learn from predecessors");
    expect(prompt).toContain("Arrows are supporting actors");
    expect(prompt).toContain("In charts, visual information is the hero");
    expect(prompt).toContain("Slideland-style cool/minimal/trust references");
  });
});
