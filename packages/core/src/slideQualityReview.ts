import type { DeckSpec, ShapeElement, Slide, SlideElement, TextElement } from "./schema.js";
import { DECK_STORY_AXES, SLIDE_ANTI_PATTERNS, SLIDE_PURPOSE_PROFILES, SLIDE_QUALITY_DIMENSIONS, type DeckStoryAxisId, type SlideAntiPatternId, type SlidePurposeProfileId, type SlideQualityDimensionId } from "./slideQualityStandard.js";
import { reviewVisualQuality } from "./visualQuality.js";

export type SlideQualityDimensionReview = {
  score: 0 | 1 | 2 | 3 | 4;
  evidence: string;
  fix: string;
};

export type SlideQualityAntiPatternFinding = {
  code: SlideAntiPatternId;
  severity: "low" | "medium" | "high";
  why: string;
  fix: string;
  slideIndexes: number[];
};

export type DeckStoryAxisReview = {
  score: 0 | 1 | 2 | 3 | 4;
  evidence: string;
  fix: string;
};

export type SlideQualityReviewReport = {
  purpose: SlidePurposeProfileId;
  matrix: {
    information: string;
    decoration: string;
    passLine: number;
    fitsTarget: boolean;
    comment: string;
  };
  dimensions: Record<SlideQualityDimensionId, SlideQualityDimensionReview>;
  antiPatterns: SlideQualityAntiPatternFinding[];
  storyFlow: Record<DeckStoryAxisId, DeckStoryAxisReview> | null;
  weightedScore: number;
  deckStoryScore: number | null;
  slideAvg: number;
  overallScore: number;
  verdict: "A" | "B" | "C" | "D" | "E";
  capApplied: boolean;
  topFixes: Array<{ priority: number; action: string; dimension: SlideQualityDimensionId | DeckStoryAxisId | SlideAntiPatternId }>;
};

type ScoreInput = {
  contentSlides: Slide[];
  titleTexts: string[];
  textElements: TextElement[];
  visualObjectCount: number;
  colorCount: number;
  repeatedLayoutRuns: number;
  truncatedTextCount: number;
  tinyTextCount: number;
  missingAltCount: number;
  antiPatternCounts: Partial<Record<SlideAntiPatternId, number>>;
  hasAgenda: boolean;
  hasSummary: boolean;
  hasSectionSlide: boolean;
  hasClosingAction: boolean;
  hasMessageMap: boolean;
};

function textElements(slide: Slide): TextElement[] {
  return slide.elements.filter((element): element is TextElement => element.type === "text" && !element.decorative);
}

function titleText(slide: Slide): string {
  return slide.title || textElements(slide).find((element) => element.role === "title")?.text || "";
}

function isContentSlide(slide: Slide): boolean {
  return !["cover", "title", "title-slide", "section", "divider", "closing", "closing-slide", "references"].includes(slide.layout ?? "");
}

function visualObjects(slide: Slide): SlideElement[] {
  return slide.elements.filter(
    (element) =>
      element.type === "diagram" ||
      element.type === "smartart" ||
      element.type === "pptxSlide" ||
      element.type === "image" ||
      element.type === "svg" ||
      (element.type === "shape" && !element.decorative && element.shape !== "line" && element.w >= 0.5 && element.h >= 0.3)
  );
}

function nonNeutralFills(slides: Slide[]): Set<string> {
  const colors = new Set<string>();
  slides.forEach((slide) => {
    slide.elements.forEach((element) => {
      if (element.type !== "shape" || !element.fill || element.fill === "none") return;
      const fill = element.fill.toLowerCase();
      if (!/^#[0-9a-f]{6}$/u.test(fill)) return;
      const red = Number.parseInt(fill.slice(1, 3), 16);
      const green = Number.parseInt(fill.slice(3, 5), 16);
      const blue = Number.parseInt(fill.slice(5, 7), 16);
      if (Math.max(red, green, blue) - Math.min(red, green, blue) > 18) colors.add(fill);
    });
  });
  return colors;
}

function score(value: number): 0 | 1 | 2 | 3 | 4 {
  return Math.max(0, Math.min(4, Math.round(value))) as 0 | 1 | 2 | 3 | 4;
}

function scoreTo100(scoreValue: number): number {
  return Math.round(scoreValue * 25);
}

function verdictForScore(value: number): "A" | "B" | "C" | "D" | "E" {
  if (value >= 85) return "A";
  if (value >= 70) return "B";
  if (value >= 55) return "C";
  if (value >= 40) return "D";
  return "E";
}

function capVerdict(verdict: "A" | "B" | "C" | "D" | "E", max: "B" | "C"): "A" | "B" | "C" | "D" | "E" {
  const order = ["E", "D", "C", "B", "A"] as const;
  return order[Math.min(order.indexOf(verdict), order.indexOf(max))];
}

function defaultPurposeForDeck(deck: DeckSpec): SlidePurposeProfileId {
  switch (deck.metadata.contentMode) {
    case "presentation":
      return "P3";
    case "handout":
      return "P4";
    case "decision":
      return "P5";
    default:
      return "P1";
  }
}

function buildScoreInput(deck: DeckSpec): ScoreInput {
  const contentSlides = deck.slides.filter(isContentSlide);
  const allTexts = deck.slides.flatMap(textElements);
  const visualReport = reviewVisualQuality(deck);
  const antiPatternCounts: Partial<Record<SlideAntiPatternId, number>> = {};
  visualReport.issues.forEach((issue) => {
    const match = /^quality\.(a[1-6])$/u.exec(issue.code);
    if (!match) return;
    const code = match[1].toUpperCase() as SlideAntiPatternId;
    antiPatternCounts[code] = (antiPatternCounts[code] ?? 0) + 1;
  });

  return {
    contentSlides,
    titleTexts: deck.slides.map(titleText),
    textElements: allTexts,
    visualObjectCount: contentSlides.reduce((sum, slide) => sum + visualObjects(slide).length, 0),
    colorCount: nonNeutralFills(deck.slides).size,
    repeatedLayoutRuns: visualReport.issues.filter((issue) => issue.code === "visual.repeated-layout-run").length,
    truncatedTextCount: visualReport.issues.filter((issue) => issue.code === "visual.truncated-text").length,
    tinyTextCount: allTexts.filter((element) => (element.fontSize ?? 0) > 0 && (element.fontSize ?? 0) < 12).length,
    missingAltCount: deck.slides.flatMap((slide) => slide.elements).filter((element) => (element.type === "image" || element.type === "svg" || element.type === "diagram") && !element.decorative && !element.altText).length,
    antiPatternCounts,
    hasAgenda: deck.slides.some((slide) => /agenda|アジェンダ|目次|全体像|本日の流れ/i.test(titleText(slide))),
    hasSummary: deck.slides.some((slide) => /executive summary|summary|まとめ|要約|要旨|結論/i.test(titleText(slide))),
    hasSectionSlide: deck.slides.some((slide) => slide.layout === "section" || /section|章|第[一二三四五六七八九十0-9]+部/i.test(titleText(slide))),
    hasClosingAction: deck.slides.slice(-2).some((slide) => /next|action|次|判断|承認|結論|まとめ/i.test(titleText(slide) + " " + textElements(slide).map((text) => text.text).join(" "))),
    hasMessageMap: Boolean(deck.metadata.messageMap?.intents.length)
  };
}

function dimensionReviews(input: ScoreInput): Record<SlideQualityDimensionId, SlideQualityDimensionReview> {
  const contentCount = Math.max(1, input.contentSlides.length);
  const genericTitleCount = input.titleTexts.filter((title) => /^(概要|詳細|まとめ|スライド|agenda|overview|summary|details)$/i.test(title.trim())).length;
  const visualRatio = input.visualObjectCount / contentCount;
  const avgTextLength = input.textElements.reduce((sum, element) => sum + element.text.length, 0) / Math.max(1, input.textElements.length);
  const scores: Record<SlideQualityDimensionId, SlideQualityDimensionReview> = {
    D1: {
      score: score(4 - Math.min(2, genericTitleCount) - (input.hasMessageMap ? 0 : 0.5)),
      evidence: input.hasMessageMap ? "Message Map is present and slides carry explicit intent." : `Generic/topic-like title count: ${genericTitleCount}.`,
      fix: "State each slide takeaway as the title or visible message; avoid topic-only headings."
    },
    D2: {
      score: score(2 + (input.hasAgenda ? 0.7 : 0) + (input.hasSummary ? 0.7 : 0) + (input.hasSectionSlide || contentCount <= 6 ? 0.6 : 0)),
      evidence: `Agenda=${input.hasAgenda}, summary=${input.hasSummary}, section markers=${input.hasSectionSlide}.`,
      fix: "Add agenda/section/summary signposts and make sequence, contrast, or causality visible in the layout."
    },
    D3: {
      score: score(4 - Math.min(2, input.repeatedLayoutRuns) - Math.min(1, input.antiPatternCounts.A5 ?? 0)),
      evidence: `Repeated layout runs: ${input.repeatedLayoutRuns}; over-dense slides: ${input.antiPatternCounts.A5 ?? 0}.`,
      fix: "Use grid, grouping, and whitespace; split or compartmentalize dense slides."
    },
    D4: {
      score: score(4 - Math.min(2, input.tinyTextCount) - Math.min(1, input.truncatedTextCount)),
      evidence: `Tiny text elements: ${input.tinyTextCount}; truncated text findings: ${input.truncatedTextCount}; average text length ${Math.round(avgTextLength)} chars.`,
      fix: "Keep readable size, avoid ellipses, shorten long labels, and preserve clean line breaks."
    },
    D5: {
      score: score(2 + Math.min(1.2, visualRatio * 0.7) - Math.min(1, input.antiPatternCounts.A4 ?? 0)),
      evidence: `Visual objects per content slide: ${visualRatio.toFixed(2)}; too-plain slides: ${input.antiPatternCounts.A4 ?? 0}.`,
      fix: "Create one focal entry point and make evidence/caveats visually secondary."
    },
    D6: {
      score: score(input.colorCount <= 3 ? 4 : input.colorCount === 4 ? 3 : input.colorCount === 5 ? 2 : 1),
      evidence: `Non-neutral fill colors detected: ${input.colorCount}.`,
      fix: "Limit to base/main/accent colors and keep color meanings consistent across the deck."
    },
    D7: {
      score: score(2 + Math.min(2, visualRatio)),
      evidence: `Visual/table/diagram objects across content slides: ${input.visualObjectCount}.`,
      fix: "Use the fitting chart/table/diagram pattern and direct labels; avoid unsupported text-only explanation."
    },
    D8: {
      score: score(4 - Math.min(2, (input.antiPatternCounts.A3 ?? 0) + (input.antiPatternCounts.A6 ?? 0)) - Math.min(1, input.repeatedLayoutRuns)),
      evidence: `Photo-reliant=${input.antiPatternCounts.A3 ?? 0}, over-decorated=${input.antiPatternCounts.A6 ?? 0}, repeated layout=${input.repeatedLayoutRuns}.`,
      fix: "Remove decorative noise, unify asset style, and pair images with message/evidence."
    },
    D9: {
      score: score(4 - Math.min(2, input.missingAltCount) - Math.min(1, input.tinyTextCount)),
      evidence: `Missing alt text on non-decorative visuals: ${input.missingAltCount}; tiny text elements: ${input.tinyTextCount}.`,
      fix: "Add alt text, keep reading order, and avoid color-only or tiny-text distinctions."
    }
  };
  return scores;
}

function antiPatternFindings(input: ScoreInput): SlideQualityAntiPatternFinding[] {
  return Object.entries(input.antiPatternCounts).flatMap(([code, count]) => {
    if (!count) return [];
    const pattern = SLIDE_ANTI_PATTERNS.find((item) => item.id === code);
    if (!pattern) return [];
    return [
      {
        code: pattern.id,
        severity: pattern.id === "A5" ? "high" : count >= 2 ? "medium" : "low",
        why: `${pattern.labelJa}/${pattern.labelEn} detected ${count} time(s) by DeckSpec heuristics.`,
        fix: `${pattern.fixJa} / ${pattern.fixEn}`,
        slideIndexes: []
      } satisfies SlideQualityAntiPatternFinding
    ];
  });
}

function storyReviews(input: ScoreInput, slideCount: number): Record<DeckStoryAxisId, DeckStoryAxisReview> | null {
  if (slideCount < 2) return null;
  return {
    S1: {
      score: score(2 + (input.hasMessageMap ? 1 : 0) + (input.hasSummary ? 1 : 0)),
      evidence: `Message Map=${input.hasMessageMap}, summary/conclusion slide=${input.hasSummary}.`,
      fix: "Define the deck's single backbone claim and make the conclusion explicit."
    },
    S2: {
      score: score(slideCount <= 6 ? 3 : 1.5 + (input.hasAgenda ? 1 : 0) + (input.hasSectionSlide ? 1 : 0)),
      evidence: `Slides=${slideCount}, agenda=${input.hasAgenda}, section markers=${input.hasSectionSlide}.`,
      fix: "For longer decks, add agenda and section divider/navigation slides."
    },
    S3: {
      score: score(3 - Math.min(1, input.repeatedLayoutRuns) + (input.hasMessageMap ? 0.5 : 0)),
      evidence: `Repeated layout runs=${input.repeatedLayoutRuns}; message map=${input.hasMessageMap}.`,
      fix: "Check adjacent-slide logic and vary slide roles so the argument advances."
    },
    S4: {
      score: score(1.5 + (input.hasSummary ? 1.2 : 0) + (input.hasClosingAction ? 1.2 : 0)),
      evidence: `Opening/summary=${input.hasSummary}, closing action=${input.hasClosingAction}.`,
      fix: "Open with purpose/summary and close with conclusion or next action."
    },
    S5: {
      score: score(input.colorCount <= 3 ? 3.5 : 2.5),
      evidence: `Deck-level non-neutral color count=${input.colorCount}.`,
      fix: "Keep template, type, color meanings, and diagram tone consistent across the deck."
    },
    S6: {
      score: score(3.5 - Math.min(2, input.repeatedLayoutRuns) - Math.min(1, input.antiPatternCounts.A5 ?? 0)),
      evidence: `Repeated layout runs=${input.repeatedLayoutRuns}; over-dense slides=${input.antiPatternCounts.A5 ?? 0}.`,
      fix: "Add rhythm with section breaks, summary slides, and varied visual grammars."
    },
    S7: {
      score: score(3 + (slideCount <= 40 ? 0.5 : -1)),
      evidence: `Slide count=${slideCount}; content slides=${input.contentSlides.length}.`,
      fix: "Match information volume, decoration, and slide count to the selected purpose profile."
    }
  };
}

function weightedScore(dimensions: Record<SlideQualityDimensionId, SlideQualityDimensionReview>, purpose: SlidePurposeProfileId): number {
  const profile = SLIDE_PURPOSE_PROFILES[purpose];
  const total = SLIDE_QUALITY_DIMENSIONS.reduce((sum, dimension) => sum + (dimensions[dimension.id].score / 4) * profile.weights[dimension.id], 0);
  return Math.round(total);
}

function storyScore(storyFlow: Record<DeckStoryAxisId, DeckStoryAxisReview> | null): number | null {
  if (!storyFlow) return null;
  const total = DECK_STORY_AXES.reduce((sum, axis) => sum + storyFlow[axis.id].score, 0);
  return Math.round((total / 28) * 100);
}

function topFixes(dimensions: Record<SlideQualityDimensionId, SlideQualityDimensionReview>, storyFlow: Record<DeckStoryAxisId, DeckStoryAxisReview> | null, antiPatterns: SlideQualityAntiPatternFinding[]): SlideQualityReviewReport["topFixes"] {
  const dimensionFixes = Object.entries(dimensions)
    .map(([dimension, review]) => ({ priority: 0, action: review.fix, dimension: dimension as SlideQualityDimensionId, score: review.score }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 2);
  const storyFixes = storyFlow
    ? Object.entries(storyFlow)
        .map(([axis, review]) => ({ priority: 0, action: review.fix, dimension: axis as DeckStoryAxisId, score: review.score }))
        .sort((a, b) => a.score - b.score)
        .slice(0, 1)
    : [];
  const antiPatternFixes = antiPatterns
    .filter((pattern) => pattern.severity === "high")
    .slice(0, 1)
    .map((pattern) => ({ priority: 0, action: pattern.fix, dimension: pattern.code, score: 0 }));
  return [...antiPatternFixes, ...dimensionFixes, ...storyFixes]
    .slice(0, 3)
    .map((item, index) => ({ priority: index + 1, action: item.action, dimension: item.dimension }));
}

export function reviewSlideQuality(deck: DeckSpec, purposeProfile?: SlidePurposeProfileId): SlideQualityReviewReport {
  const purpose = purposeProfile ?? defaultPurposeForDeck(deck);
  const profile = SLIDE_PURPOSE_PROFILES[purpose];
  const input = buildScoreInput(deck);
  const dimensions = dimensionReviews(input);
  const antiPatterns = antiPatternFindings(input);
  const storyFlow = storyReviews(input, deck.slides.length);
  const slideAvg = weightedScore(dimensions, purpose);
  const deckStoryScore = storyScore(storyFlow);
  const overallScore = deckStoryScore === null ? slideAvg : Math.round(slideAvg * 0.7 + deckStoryScore * 0.3);
  const severeAntiPattern = antiPatterns.some((pattern) => pattern.severity === "high");
  const storyCap = storyFlow ? [storyFlow.S1.score, storyFlow.S2.score, storyFlow.S3.score, storyFlow.S4.score].some((value) => value <= 1) : false;
  const baseVerdict = verdictForScore(overallScore);
  const cappedForAntiPattern = severeAntiPattern ? capVerdict(baseVerdict, "C") : baseVerdict;
  const verdict = storyCap ? capVerdict(cappedForAntiPattern, "B") : cappedForAntiPattern;

  return {
    purpose,
    matrix: {
      information: profile.informationTarget,
      decoration: profile.decorationTarget,
      passLine: profile.passLine,
      fitsTarget: overallScore >= profile.passLine,
      comment: `Target profile ${profile.id}: information=${profile.informationTarget}, decoration=${profile.decorationTarget}, passLine=${profile.passLine}.`
    },
    dimensions,
    antiPatterns,
    storyFlow,
    weightedScore: slideAvg,
    deckStoryScore,
    slideAvg,
    overallScore,
    verdict,
    capApplied: verdict !== baseVerdict,
    topFixes: topFixes(dimensions, storyFlow, antiPatterns)
  };
}

export function formatSlideQualityReview(report: SlideQualityReviewReport): string {
  const dimensionLines = SLIDE_QUALITY_DIMENSIONS.map((dimension) => {
    const item = report.dimensions[dimension.id];
    return `- ${dimension.id} ${dimension.labelEn}: ${item.score}/4 — ${item.evidence}`;
  });
  const storyLines = report.storyFlow
    ? DECK_STORY_AXES.map((axis) => {
        const item = report.storyFlow?.[axis.id];
        return item ? `- ${axis.id} ${axis.labelEn}: ${item.score}/4 — ${item.evidence}` : "";
      }).filter(Boolean)
    : ["- N/A for single-slide review"];
  const antiPatternLines = report.antiPatterns.length
    ? report.antiPatterns.map((pattern) => `- ${pattern.code} ${pattern.severity}: ${pattern.why}`)
    : ["- None detected by DeckSpec heuristics"];
  const fixLines = report.topFixes.map((fix) => `- P${fix.priority} [${fix.dimension}] ${fix.action}`);

  return [
    `Slide quality review (${report.purpose})`,
    `Scores: weighted=${report.weightedScore}, story=${report.deckStoryScore ?? "N/A"}, overall=${report.overallScore}, verdict=${report.verdict}, capApplied=${report.capApplied}`,
    `Matrix target: information=${report.matrix.information}, decoration=${report.matrix.decoration}, passLine=${report.matrix.passLine}, fits=${report.matrix.fitsTarget}`,
    "",
    "Dimensions",
    ...dimensionLines,
    "",
    "Anti-patterns",
    ...antiPatternLines,
    "",
    "Story Flow",
    ...storyLines,
    "",
    "Top Fixes",
    ...fixLines
  ].join("\n");
}