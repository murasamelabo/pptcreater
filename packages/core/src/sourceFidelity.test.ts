import { describe, expect, it } from "vitest";
import type { DeckMessageMap, DeckSpec } from "./schema.js";
import type { MessageSpec } from "./messageSpec.js";
import { createSourceFidelityReport } from "./sourceFidelity.js";

describe("source fidelity report", () => {
  it("reports four-stage retention and renderer overflow accounting", () => {
    const messageSpec = {
      strategy: "generic-technical-report",
      title: "Technical report",
      thesis: "Explain the controls",
      audience: "Architects",
      desiredAction: "Review",
      requiredTerms: [],
      sourceCoverage: {
        sectionCoverage: [{ sectionId: "s1", title: "Controls", status: "visible" }],
        requiredTermCoverage: [{ term: "RFC 8693", visibility: "must-visible", status: "visible" }]
      },
      slides: [{
        id: "controls",
        semanticTitle: "Controls",
        headline: "Review controls",
        slideRole: "data",
        chapterId: "s1",
        visibleBudget: { minChars: 100, targetChars: 200, maxChars: 300 },
        sourceSections: ["s1"],
        requiredTerms: ["RFC 8693"],
        primaryClaim: "RFC 8693 defines token exchange.",
        supportingBlocks: [{ id: "b1", label: "Protocol", text: "RFC 8693", sourceSectionIds: ["s1"], requiredTerms: ["RFC 8693"] }],
        figureNeed: { kind: "table", rationale: "Structured controls" },
        notesBlocks: []
      }]
    } satisfies MessageSpec;
    const messageMap = {
      objective: messageSpec.thesis,
      audience: messageSpec.audience,
      desiredAction: messageSpec.desiredAction,
      intents: [{ slideId: "controls", title: "Controls", message: "RFC 8693 defines token exchange.", evidence: ["Protocol: RFC 8693"], quietInfo: [], visualType: "table", emphasis: "RFC 8693" }]
    } satisfies DeckMessageMap;
    const deck = {
      slides: [{
        id: "controls",
        title: "Controls",
        layout: "message-grammar-table-text-system",
        speakerNotes: "Selection: visible=6 / notes=3 / omitted=0 / requiresSplit=true",
        elements: [{ id: "t1", type: "text", role: "body", text: "RFC 8693 defines token exchange.", x: 1, y: 1, w: 5, h: 1, readingOrder: 1, decorative: false, fontSize: 18, color: "#000000" }]
      }]
    } as DeckSpec;

    const report = createSourceFidelityReport("# Controls\nRFC 8693 defines token exchange and delegated access.", messageSpec, messageMap, deck);

    expect(report.ok).toBe(true);
    expect(report.source.meaningfulChars).toBeGreaterThan(report.deckSpec.meaningfulChars);
    expect(report.sectionCoverageRatio).toBe(1);
    expect(report.requiredTermCoverageRatio).toBe(1);
    expect(report.rendererSelection).toEqual({ visibleItems: 6, notesItems: 3, omittedItems: 0, requiresSplitSlides: 1 });
  });

  it("fails generic reports whose DeckSpec character volume falls below the fidelity floor", () => {
    const source = `# Source\n${"Detailed source evidence. ".repeat(40)}`;
    const messageSpec = {
      strategy: "generic-technical-report",
      title: "Source",
      thesis: "Detailed source evidence",
      audience: "Architects",
      desiredAction: "Review",
      requiredTerms: [],
      sourceCoverage: { sectionCoverage: [{ sectionId: "s", title: "Source", status: "visible" }], requiredTermCoverage: [] },
      slides: []
    } satisfies MessageSpec;
    const messageMap = { objective: "Review", audience: "Architects", desiredAction: "Review", intents: [] } satisfies DeckMessageMap;
    const deck = { slides: [{ id: "s", title: "Source", elements: [{ id: "t", type: "text", role: "body", text: "Tiny", x: 1, y: 1, w: 1, h: 1, readingOrder: 1, decorative: false, fontSize: 12, color: "#000000" }] }] } as DeckSpec;

    const report = createSourceFidelityReport(source, messageSpec, messageMap, deck);

    expect(report.ok).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toContain("source-fidelity.deck-character-ratio-low");
  });
});