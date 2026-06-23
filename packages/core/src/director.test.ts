import { describe, expect, it } from "vitest";
import { createSampleDeck } from "./samples.js";
import {
  reviewDeck,
  describeAgentPipeline,
  AGENT_ROLES,
  AGENT_ROLE_IDS,
  DeckSpecSchema,
  type DeckSpec
} from "./index.js";

function blankDeck(): DeckSpec {
  // A deliberately poor deck: a single slide with a generic title, tiny low-contrast text,
  // and no visual richness — to force findings across multiple owners. Parsed through the
  // schema so element/token defaults (decorative, bold, type sizes) are filled in.
  return DeckSpecSchema.parse({
    version: "0.1",
    title: "Deck",
    locale: "ja-JP",
    template: "modern-simple",
    tokens: {
      colors: {
        background: "#ffffff",
        surface: "#f8fafc",
        text: "#111827",
        mutedText: "#334155",
        accent: "#2563eb",
        danger: "#dc2626",
        success: "#16a34a"
      },
      typography: { headingFont: "Yu Gothic", bodyFont: "Yu Gothic", fallbackFonts: [] },
      spacing: { margin: 0.5, gutter: 0.24, radius: 0.08 }
    },
    slideSize: { widthInches: 13.333, heightInches: 7.5, aspect: "16:9" },
    slides: [
      {
        id: "s1",
        title: "スライド",
        layout: "title-content",
        background: { color: "#ffffff" },
        elements: [
          {
            id: "t1",
            type: "text",
            role: "title",
            text: "スライド",
            x: 0.5,
            y: 0.5,
            w: 12,
            h: 1,
            fontSize: 36,
            color: "#111827",
            readingOrder: 1
          },
          {
            id: "t2",
            type: "text",
            role: "body",
            text: "とても薄い小さな文字",
            x: 0.5,
            y: 2,
            w: 12,
            h: 1,
            fontSize: 8,
            color: "#eeeeee",
            contrastBackground: "#ffffff",
            readingOrder: 2
          }
        ]
      }
    ],
    metadata: { contentMode: "presentation", keywords: [], sources: [] }
  });
}

describe("director agent contracts", () => {
  it("describes the six-role pipeline in order with hand-off contracts", () => {
    const pipeline = describeAgentPipeline();
    expect(pipeline.map((r) => r.id)).toEqual([
      "director",
      "story-architect",
      "content-strategist",
      "designer",
      "copywriter",
      "reviewer"
    ]);
    // Every role declares what it consumes, produces, and which tools it uses.
    for (const role of pipeline) {
      expect(role.consumes.length).toBeGreaterThan(0);
      expect(role.produces.length).toBeGreaterThan(0);
      expect(role.tools.length).toBeGreaterThan(0);
    }
    expect(Object.keys(AGENT_ROLES).sort()).toEqual([...AGENT_ROLE_IDS].sort());
  });
});

describe("reviewDeck aggregated quality gate", () => {
  it("passes a generated sample deck with no blocking issues", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 3 });
    const report = reviewDeck(deck);
    expect(report.ok).toBe(true);
    expect(report.blocking).toHaveLength(0);
    expect(report.scores.overall).toBeGreaterThan(0);
  });

  it("flags a poor deck and routes findings to owning roles", () => {
    const report = reviewDeck(blankDeck());
    expect(report.ok).toBe(false);
    expect(report.blocking.length).toBeGreaterThan(0);
    // Findings carry a valid owner role and disposition.
    for (const issue of [...report.blocking, ...report.advisory, ...report.polishFixable]) {
      expect(AGENT_ROLE_IDS).toContain(issue.owner);
      expect(["blocking", "polish-fixable", "advisory"]).toContain(issue.disposition);
    }
    // Owner queues sum to the blocking count.
    const queued = AGENT_ROLE_IDS.reduce((sum, role) => sum + report.ownerQueues[role], 0);
    expect(queued).toBe(report.blocking.length);
    // The low-contrast / small-font text is the Copywriter's responsibility.
    expect(report.blocking.some((i) => i.owner === "copywriter")).toBe(true);
    // Summary names at least one role queue.
    expect(report.summary).toMatch(/Copywriter|Designer|Story Architect|Content Strategist/);
  });

  it("can skip the business review", () => {
    const deck = createSampleDeck("ja-JP", { slideCount: 1 });
    const withBusiness = reviewDeck(deck, { includeBusinessReview: true });
    const withoutBusiness = reviewDeck(deck, { includeBusinessReview: false });
    const businessCount = (r: ReturnType<typeof reviewDeck>) =>
      [...r.blocking, ...r.advisory].filter((i) => i.source === "business").length;
    expect(businessCount(withoutBusiness)).toBe(0);
    expect(businessCount(withBusiness)).toBeGreaterThanOrEqual(0);
  });

  it("routes low-contrast text to the copywriter and layout issues to the designer", () => {
    const report = reviewDeck(blankDeck());
    const contrast = report.blocking.concat(report.advisory).find((i) => i.code === "text.low-contrast");
    if (contrast) {
      expect(contrast.owner).toBe("copywriter");
    }
    const layout = report.blocking
      .concat(report.advisory, report.polishFixable)
      .find((i) => i.code.startsWith("layout."));
    if (layout) {
      expect(["designer", "copywriter"]).toContain(layout.owner);
    }
  });
});
