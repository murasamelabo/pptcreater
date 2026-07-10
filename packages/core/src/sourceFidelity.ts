import type { DeckMessageMap, DeckSpec } from "./schema.js";
import type { MessageSpec } from "./messageSpec.js";

export type SourceFidelityStage = {
  meaningfulChars: number;
  characterRatioFromSource: number;
  characterRatioFromPrevious: number;
};

export type SourceFidelityReport = {
  ok: boolean;
  issues: Array<{ code: string; message: string }>;
  source: SourceFidelityStage;
  messageSpec: SourceFidelityStage;
  messageMap: SourceFidelityStage;
  deckSpec: SourceFidelityStage;
  sectionCoverageRatio: number;
  requiredTermCoverageRatio: number;
  rendererSelection: {
    visibleItems: number;
    notesItems: number;
    omittedItems: number;
    requiresSplitSlides: number;
  };
};

function meaningfulChars(value: string): number {
  return Array.from(value.replace(/\s+/gu, "")).length;
}

function ratio(value: number, baseline: number): number {
  return baseline > 0 ? Number((value / baseline).toFixed(4)) : 1;
}

function uniqueText(values: string[]): string {
  return [...new Set(values.map((value) => value.replace(/\s+/gu, " ").trim()).filter(Boolean))].join("\n");
}

function messageSpecText(messageSpec: MessageSpec): string {
  return uniqueText(messageSpec.slides.flatMap((slide) => [
    slide.semanticTitle,
    slide.headline,
    slide.primaryClaim,
    ...slide.supportingBlocks.flatMap((block) => [block.label, block.text])
  ]));
}

function messageMapText(messageMap: DeckMessageMap): string {
  return uniqueText(messageMap.intents.flatMap((intent) => [
    intent.title,
    intent.message,
    intent.emphasis ?? "",
    ...intent.evidence
  ]));
}

function deckSpecText(deck: DeckSpec): string {
  return uniqueText(deck.slides.flatMap((slide) => slide.elements.flatMap((element) => element.type === "text" ? [element.text] : [])));
}

function rendererSelection(deck: DeckSpec): SourceFidelityReport["rendererSelection"] {
  const totals = { visibleItems: 0, notesItems: 0, omittedItems: 0, requiresSplitSlides: 0 };
  const pattern = /Selection: visible=(\d+) \/ notes=(\d+) \/ omitted=(\d+) \/ requiresSplit=(true|false)/u;
  for (const slide of deck.slides) {
    const match = pattern.exec(slide.speakerNotes ?? "");
    if (!match) continue;
    totals.visibleItems += Number(match[1]);
    totals.notesItems += Number(match[2]);
    totals.omittedItems += Number(match[3]);
    if (match[4] === "true") totals.requiresSplitSlides += 1;
  }
  return totals;
}

export function createSourceFidelityReport(sourceMarkdown: string, messageSpec: MessageSpec, messageMap: DeckMessageMap, deck: DeckSpec): SourceFidelityReport {
  const sourceChars = meaningfulChars(sourceMarkdown);
  const messageSpecChars = meaningfulChars(messageSpecText(messageSpec));
  const messageMapChars = meaningfulChars(messageMapText(messageMap));
  const deckSpecChars = meaningfulChars(deckSpecText(deck));
  const visibleSections = messageSpec.sourceCoverage.sectionCoverage.filter((section) => section.status === "visible").length;
  const mustVisibleTerms = messageSpec.sourceCoverage.requiredTermCoverage.filter((term) => term.visibility === "must-visible");
  const visibleMustTerms = mustVisibleTerms.filter((term) => term.status === "visible").length;
  const selection = rendererSelection(deck);
  const deckSpecCharacterRatio = ratio(deckSpecChars, sourceChars);
  const issues: SourceFidelityReport["issues"] = [];
  if (messageSpec.strategy === "generic-technical-report" && deckSpecCharacterRatio < 0.35) {
    issues.push({ code: "source-fidelity.deck-character-ratio-low", message: "Generic technical report DeckSpec text must retain at least 35% of source character volume." });
  }
  if (selection.omittedItems > 0) {
    issues.push({ code: "source-fidelity.renderer-omission", message: "Renderer selection must not omit source evidence without an explicit reviewed reason." });
  }

  return {
    ok: issues.length === 0,
    issues,
    source: { meaningfulChars: sourceChars, characterRatioFromSource: 1, characterRatioFromPrevious: 1 },
    messageSpec: { meaningfulChars: messageSpecChars, characterRatioFromSource: ratio(messageSpecChars, sourceChars), characterRatioFromPrevious: ratio(messageSpecChars, sourceChars) },
    messageMap: { meaningfulChars: messageMapChars, characterRatioFromSource: ratio(messageMapChars, sourceChars), characterRatioFromPrevious: ratio(messageMapChars, messageSpecChars) },
    deckSpec: { meaningfulChars: deckSpecChars, characterRatioFromSource: deckSpecCharacterRatio, characterRatioFromPrevious: ratio(deckSpecChars, messageMapChars) },
    sectionCoverageRatio: ratio(visibleSections, messageSpec.sourceCoverage.sectionCoverage.length),
    requiredTermCoverageRatio: ratio(visibleMustTerms, mustVisibleTerms.length),
    rendererSelection: selection
  };
}