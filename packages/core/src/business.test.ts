import { describe, expect, it } from "vitest";
import { defaultTokens } from "./color.js";
import { createEditWithCopilotPrompt, getBusinessDeckGuidance, planBusinessDeck, reviewBusinessDeck } from "./business.js";
import type { DeckSpec, Slide } from "./schema.js";

function textSlide(id: string, title: string, subtitle?: string): Slide {
  return {
    id,
    title,
    layout: "title-content",
    elements: [
      {
        id: `${id}-title`,
        type: "text",
        role: "title",
        text: title,
        x: 0.7,
        y: 0.5,
        w: 11.8,
        h: 0.6,
        fontSize: 32,
        bold: true,
        decorative: false,
        readingOrder: 1
      },
      ...(subtitle
        ? [
            {
              id: `${id}-subtitle`,
              type: "text" as const,
              role: "subtitle" as const,
              text: subtitle,
              x: 0.7,
              y: 1.2,
              w: 11,
              h: 0.4,
              fontSize: 18,
              bold: false,
              decorative: false,
              readingOrder: 2
            }
          ]
        : [])
    ]
  };
}

function deckWithTitles(titles: string[]): DeckSpec {
  return {
    version: "0.1",
    title: "Business deck",
    locale: "ja-JP",
    template: "report-formal",
    tokens: defaultTokens("ja-JP"),
    slides: titles.map((title, index) => textSlide(`slide-${index + 1}`, title, index === 0 ? "読者が判断できるように要点を整理します。" : undefined)),
    metadata: { keywords: [], contentMode: "decision", sources: [] }
  };
}

describe("business deck director", () => {
  it("plans executive business decks with summary and agenda sections", () => {
    const plan = planBusinessDeck({
      locale: "ja-JP",
      topic: "生成AI活用",
      purpose: "経営会議で導入判断を得る",
      audience: "経営層",
      desiredAction: "PoC実施を承認する",
      brandDirection: "青基調で役員向けに落ち着いた表現",
      slideCount: 9,
      importantMeeting: true,
      customerFacing: true
    });

    expect(plan.sections.map((section) => section.title)).toContain("Executive Summary");
    expect(plan.sections.map((section) => section.title)).toContain("Agenda");
    expect(plan.slides).toHaveLength(9);
    expect(plan.slides.at(-1)?.section).toBe("まとめと次アクション");
    expect(plan.slides.filter((slide) => slide.section === "Executive Summary")).toHaveLength(1);
    expect(plan.slides.filter((slide) => slide.section === "Agenda")).toHaveLength(1);
    expect(plan.brandDirection).toContain("青基調");
    expect(plan.humanReviewRequired).toBe(true);
    expect(plan.guidance.typography.join("\n")).toMatch(/Biz UDP Gothic/);
  });

  it("expands slide plans to the requested business slide count", () => {
    const plan5 = planBusinessDeck({ locale: "en-US", topic: "AI adoption", slideCount: 5 });
    const plan12 = planBusinessDeck({ locale: "en-US", topic: "AI adoption", slideCount: 12, importantMeeting: true });

    expect(plan5.slides).toHaveLength(5);
    expect(plan5.slides.at(-1)?.section).toBe("Implication and next action");
    expect(plan12.slides).toHaveLength(12);
    expect(plan12.slides.at(-1)?.section).toBe("Implication and next action");
  });

  it("keeps executive structure for important internal-friendly decks", () => {
    const plan = planBusinessDeck({
      locale: "ja-JP",
      topic: "社内AI活用",
      styleMode: "internal-friendly",
      slideCount: 8,
      importantMeeting: true
    });

    expect(plan.sections.map((section) => section.title).slice(0, 2)).toEqual(["Executive Summary", "Agenda"]);
    expect(plan.slides).toHaveLength(8);
  });

  it("keeps sections and slides consistent for short important internal-friendly decks", () => {
    const plan = planBusinessDeck({
      locale: "en-US",
      topic: "AI enablement",
      styleMode: "internal-friendly",
      slideCount: 3,
      importantMeeting: true
    });

    expect(plan.sections.map((section) => section.title)).toEqual(["Executive Summary", "Opening orientation", "Next step"]);
    expect(plan.slides.map((slide) => slide.section)).toEqual(plan.sections.map((section) => section.title));
  });

  it("creates Edit with Copilot prompts without replacing pptcreater rendering", () => {
    const prompt = createEditWithCopilotPrompt({
      locale: "en-US",
      topic: "AI adoption",
      purpose: "Help leaders decide whether to fund a pilot",
      audience: "Executives",
      desiredAction: "Approve a pilot",
      brandDirection: "Use Contoso navy with restrained accent colors",
      slideCount: 8,
      importantMeeting: true
    });

    expect(prompt).toContain("PowerPoint for the web");
    expect(prompt).toContain("Section architecture");
    expect(prompt).toContain("Executive Summary");
    expect(prompt).toContain("Contoso navy");
    expect(prompt).toContain("Do not invent numbers");
  });

  it("reviews business decks for missing executive structure", () => {
    const deck = deckWithTitles(["現状", "課題", "対応方針", "ロードマップ", "リスク", "体制", "まとめ"]);
    const report = reviewBusinessDeck(deck, { importantMeeting: true, customerFacing: true });

    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.code === "business.executive-summary-missing")).toBe(true);
    expect(report.issues.some((issue) => issue.code === "business.agenda-missing")).toBe(true);
    expect(report.issues.some((issue) => issue.code === "business.weak-final-landing")).toBe(true);
  });

  it("accepts business decks with explicit navigation structure", () => {
    const deck = deckWithTitles([
      "Executive Summary",
      "Agenda",
      "現状と論点",
      "提案と構成",
      "根拠とリスク",
      "Next Action",
      "参考URL・出典"
    ]);
    deck.metadata.sources = [{ id: "source-1", title: "Source", url: "https://example.com", usage: "inspiration" }];

    const report = reviewBusinessDeck(deck, { importantMeeting: true, customerFacing: true });

    expect(report.issues.some((issue) => issue.severity === "warning")).toBe(false);
  });

  it("returns mode-specific guidance for internal-friendly decks", () => {
    const guidance = getBusinessDeckGuidance("en-US", "internal-friendly");

    expect(guidance.slideRules.join("\n")).toContain("plain language");
    expect(guidance.emphasisRules).toContain("Create one visual entry point per slide");
  });
});
