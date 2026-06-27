import type { DeckSpec, Locale, ContentMode } from "./schema.js";
import { lintDeckSpec, classifyLintReport, type LintIssue } from "./lint.js";
import { reviewDeckContent, type ContentReviewIssue } from "./content.js";
import { reviewVisualQuality, type VisualQualityIssue } from "./visualQuality.js";
import {
  reviewBusinessDeck,
  type BusinessDeckBrief,
  type BusinessDeckReviewIssue,
  type BusinessStyleMode
} from "./business.js";

/**
 * Multi-agent orchestration contracts and a deterministic review aggregator (the "Director").
 *
 * The slide-authoring workflow is split across specialised roles (see AGENT_ROLES). Each role
 * owns a slice of quality, but only the Director holds the shared DeckSpec and decides when the
 * deck is done. This module provides:
 *   - The role definitions and the hand-off contracts between them (documentation + types).
 *   - `reviewDeck`: a single aggregated quality gate that runs the existing lint / content /
 *     business reviewers, classifies every finding by blocking-ness, and routes it to the role
 *     responsible for fixing it. This makes the otherwise-LLM "Reviewer" step deterministic and
 *     testable, so the iteration loop terminates on objective criteria instead of vibes.
 */

export const AGENT_ROLE_IDS = [
  "director",
  "story-architect",
  "content-strategist",
  "designer",
  "copywriter",
  "reviewer"
] as const;

export type AgentRoleId = (typeof AGENT_ROLE_IDS)[number];

export type AgentRole = {
  id: AgentRoleId;
  title: string;
  responsibility: string;
  /** Contract consumed by this role (produced by the upstream role). */
  consumes: string;
  /** Contract produced by this role (consumed downstream). */
  produces: string;
  /** pptcreater MCP tools / core functions this role should rely on. */
  tools: string[];
};

export const AGENT_ROLES: Record<AgentRoleId, AgentRole> = {
  director: {
    id: "director",
    title: "Director (Orchestrator)",
    responsibility:
      "Owns the shared DeckSpec and the run state. Clarifies the brief, selects the skill pack and budget, sequences the other agents, runs the aggregated review gate, and decides when to finalize and render.",
    consumes: "DeckBrief (user request, audience, constraints)",
    produces: "Final rendered .pptx (via finalize_deck + render_pptx)",
    tools: ["get_slide_creation_rules", "list_skills", "recommend_template", "finalize_deck", "render_pptx", "reviewDeck"]
  },
  "story-architect": {
    id: "story-architect",
    title: "Story Architect",
    responsibility:
      "Turns the brief into a narrative and chapter structure: the deck objective, the storyline (PREP/SCQ/etc.), and per-section claims with supporting logic.",
    consumes: "DeckBrief",
    produces: "DeckOutline (narrative + sections[])",
    tools: ["plan_business_deck", "interview_slide_brief"]
  },
  "content-strategist": {
    id: "content-strategist",
    title: "Content Strategist",
    responsibility:
      "Decides, per slide, the single message, the information to include, the recommended figure kind, and the data — the bridge from chapter-level structure to slide-level intent.",
    consumes: "DeckOutline",
    produces: "SlidePlan[] (one message + evidence + figureKind + data per slide)",
    tools: ["recommend_figure", "recommend_template", "list_design_components", "list_schematic_presets"]
  },
  designer: {
    id: "designer",
    title: "Designer",
    responsibility:
      "Owns the visual layer: layout, template, figure/diagram selection, colour, icons, and placement. Produces the slide elements that realise each SlidePlan.",
    consumes: "SlidePlan",
    produces: "DeckSpec slide elements (shapes/diagrams/scaffolds)",
    tools: [
      "recommend_figure",
      "render_design_component",
      "generate_schematic",
      "generate_native_diagram",
      "generate_intent_diagram",
      "generate_visual_scaffold",
      "generate_section_divider",
      "suggest_icon",
      "recommend_template",
      "polish_deck_layout"
    ]
  },
  copywriter: {
    id: "copywriter",
    title: "Copywriter",
    responsibility:
      "Writes concise, clear copy: slide titles, lead sentences, figure labels, captions, and alt text. Enforces one-message titles and trims prose to slide-grade phrasing.",
    consumes: "DeckSpec slide elements",
    produces: "Finalised copy (titles, labels, captions, alt text)",
    tools: ["review_content", "render_design_component (textReplacements)"]
  },
  reviewer: {
    id: "reviewer",
    title: "Reviewer",
    responsibility:
      "Scores the draft on accessibility, structure, copy, and layout, then routes each issue back to the owning role with a blocking / fixable / advisory classification.",
    consumes: "DeckSpec (draft)",
    produces: "DeckReviewReport (scores + routed issues)",
    tools: ["lint_deck", "review_content", "review_business_deck", "reviewDeck"]
  }
};

export type ReviewSource = "lint" | "content" | "business" | "visual";

export type ReviewDisposition = "blocking" | "polish-fixable" | "advisory";

export type RoutedReviewIssue = {
  source: ReviewSource;
  code: string;
  message: string;
  path: string;
  severity: string;
  disposition: ReviewDisposition;
  /** The agent role responsible for resolving this issue. */
  owner: AgentRoleId;
  details?: Record<string, number | string | boolean>;
};

export type ReviewScores = {
  /** 0-100; 100 = no findings of that category. */
  accessibility: number;
  content: number;
  structure: number;
  overall: number;
};

export type DeckReviewReport = {
  /** True when there are no blocking issues (polish-fixable + advisory are allowed). */
  ok: boolean;
  scores: ReviewScores;
  blocking: RoutedReviewIssue[];
  polishFixable: RoutedReviewIssue[];
  advisory: RoutedReviewIssue[];
  /** Issue counts grouped by the role that must act on them (blocking only). */
  ownerQueues: Record<AgentRoleId, number>;
  /** Human-readable next-step summary for the Director. */
  summary: string;
};

export type ReviewDeckOptions = {
  locale?: Locale;
  contentMode?: ContentMode;
  brief?: BusinessDeckBrief;
  styleMode?: BusinessStyleMode;
  /** When false, skip the business-deck (narrative pacing) review. Default true. */
  includeBusinessReview?: boolean;
};

/**
 * Maps a review finding (by code) to the agent role that owns the fix. Codes that share a prefix
 * fall back to a prefix rule, so new codes are routed sensibly without code changes here.
 */
function ownerForCode(source: ReviewSource, code: string): AgentRoleId {
  // Exact overrides first.
  const EXACT: Record<string, AgentRoleId> = {
    // Layout / visual — Designer.
    "layout.out-of-bounds": "designer",
    "layout.shape-over-text": "designer",
    "layout.text-overlap": "designer",
    "layout.text-overflow-risk": "designer",
    "layout.card-accent-bar-unshaped": "designer",
    "layout.text-too-small-to-read": "designer",
    "layout.enumeration-hierarchy": "designer",
    "visual.richness-deck": "designer",
    "visual.richness-missing": "designer",
    "diagram.image-svg-not-editable": "designer",
    "diagram.native-connectors": "designer",
    "source.recreate-not-editable": "designer",
    // Copy / accessibility text — Copywriter.
    "layout.bad-line-break": "copywriter",
    "text.long-copy": "copywriter",
    "text.low-contrast": "copywriter",
    "text.small-font": "copywriter",
    "visual.alt-text-missing": "copywriter",
    "visual.svg-text-small": "copywriter",
    "visual.svg-text-too-small": "copywriter",
    "diagram.long-description-short": "copywriter",
    "diagram.visible-labels-missing": "copywriter",
    "source.recreate-shape-accessibility-missing": "copywriter",
    // Structure / narrative — Story Architect.
    "slide.title-duplicate": "story-architect",
    "slide.text-density": "content-strategist",
    // Source traceability — Content Strategist (owns evidence/data).
    "source.attribution-missing": "content-strategist",
    "source.citation-missing": "content-strategist",
    "source.unresolved": "content-strategist",
    "source.duplicate-id": "content-strategist",
    "source.reference-slide-missing": "content-strategist",
    "source.visual-reference-missing": "content-strategist",
    // Element identity issues are structural plumbing — Designer owns element ids/order.
    "element.duplicate-id": "designer",
    "element.reading-order-duplicate": "designer",
    "element.reading-order-missing": "designer"
  };
  if (EXACT[code]) return EXACT[code];

  // Content reviewer codes are all Copywriter territory.
  if (source === "content" || code.startsWith("content.")) return "copywriter";

  // Business reviewer codes are narrative/structure — Story Architect, except equal-emphasis
  // (a visual hierarchy problem) which is the Designer's.
  if (source === "business" || code.startsWith("business.")) {
    if (code === "business.equal-emphasis") return "designer";
    if (code === "business.source-traceability") return "content-strategist";
    return "story-architect";
  }

  // Prefix fallbacks for lint codes.
  if (code.startsWith("layout.")) return "designer";
  if (code.startsWith("visual.")) return "designer";
  if (code.startsWith("diagram.")) return "designer";
  if (code.startsWith("text.")) return "copywriter";
  if (code.startsWith("source.")) return "content-strategist";
  if (code.startsWith("slide.")) return "story-architect";
  if (code.startsWith("element.")) return "designer";

  return "reviewer";
}

function dispositionForLint(issue: LintIssue, polishFixableSet: Set<LintIssue>): ReviewDisposition {
  if (polishFixableSet.has(issue)) return "polish-fixable";
  if (issue.severity === "error") return "blocking";
  return "advisory";
}

function scoreFrom(blocking: number, advisory: number): number {
  // Blocking findings cost more than advisory ones; clamp to [0, 100].
  const raw = 100 - blocking * 12 - advisory * 4;
  return Math.max(0, Math.min(100, raw));
}

/**
 * Runs the aggregated quality gate across lint, content, and (optionally) business reviewers,
 * routing every finding to the owning agent role. This is the deterministic core of the
 * "Reviewer" agent and the Director's stop condition.
 */
export function reviewDeck(deck: DeckSpec, options: ReviewDeckOptions = {}): DeckReviewReport {
  const locale = options.locale ?? deck.locale;
  const contentMode = options.contentMode ?? deck.metadata.contentMode ?? "presentation";

  const lintReport = lintDeckSpec(deck);
  const classified = classifyLintReport(lintReport);
  const polishFixableSet = new Set<LintIssue>(classified.polishFixable);

  const routed: RoutedReviewIssue[] = [];

  for (const issue of lintReport.issues) {
    routed.push({
      source: "lint",
      code: issue.code,
      message: issue.message,
      path: issue.path,
      severity: issue.severity,
      disposition: dispositionForLint(issue, polishFixableSet),
      owner: ownerForCode("lint", issue.code),
      details: issue.details
    });
  }

  const contentReport = reviewDeckContent(deck, locale, contentMode);
  for (const issue of contentReport.issues as ContentReviewIssue[]) {
    routed.push({
      source: "content",
      code: issue.code,
      message: issue.message,
      path: issue.path,
      severity: issue.severity,
      // Content findings are never auto-fixable by layout polish; warnings block, suggestions advise.
      disposition: issue.severity === "warning" ? "blocking" : "advisory",
      owner: ownerForCode("content", issue.code),
      details: issue.details
    });
  }

  const visualReport = reviewVisualQuality(deck);
  for (const issue of visualReport.issues as VisualQualityIssue[]) {
    routed.push({
      source: "visual",
      code: issue.code,
      message: issue.message,
      path: issue.path,
      severity: issue.severity,
      disposition: issue.severity === "error" ? "blocking" : "advisory",
      owner: ownerForCode("visual", issue.code),
      details: issue.details
    });
  }

  if (options.includeBusinessReview !== false) {
    const businessReport = reviewBusinessDeck(deck, {
      ...options.brief,
      locale,
      styleMode: options.styleMode ?? options.brief?.styleMode
    });
    for (const issue of businessReport.issues as BusinessDeckReviewIssue[]) {
      routed.push({
        source: "business",
        code: issue.code,
        message: issue.message,
        path: issue.path,
        severity: issue.severity,
        disposition: issue.severity === "warning" ? "blocking" : "advisory",
        owner: ownerForCode("business", issue.code),
        details: issue.details
      });
    }
  }

  const blocking = routed.filter((r) => r.disposition === "blocking");
  const polishFixable = routed.filter((r) => r.disposition === "polish-fixable");
  const advisory = routed.filter((r) => r.disposition === "advisory");

  // Per-category scores.
  const accessibilityCodes = (r: RoutedReviewIssue) =>
    /contrast|alt-text|small|too-small|reading-order|accessibility/.test(r.code);
  const structureCodes = (r: RoutedReviewIssue) => r.source === "business" || r.code.startsWith("slide.");
  const contentCodes = (r: RoutedReviewIssue) => r.source === "content";

  const a11yBlocking = blocking.filter(accessibilityCodes).length;
  const a11yAdvisory = advisory.filter(accessibilityCodes).length;
  const structBlocking = blocking.filter(structureCodes).length;
  const structAdvisory = advisory.filter(structureCodes).length;
  const contentBlocking = blocking.filter(contentCodes).length;
  const contentAdvisory = advisory.filter(contentCodes).length;

  const scores: ReviewScores = {
    accessibility: scoreFrom(a11yBlocking, a11yAdvisory),
    content: scoreFrom(contentBlocking, contentAdvisory),
    structure: scoreFrom(structBlocking, structAdvisory),
    overall: scoreFrom(blocking.length, advisory.length)
  };

  const ownerQueues = AGENT_ROLE_IDS.reduce(
    (acc, role) => {
      acc[role] = blocking.filter((r) => r.owner === role).length;
      return acc;
    },
    {} as Record<AgentRoleId, number>
  );

  const ok = blocking.length === 0;
  const summary = ok
    ? polishFixable.length > 0
      ? `Ready to finalize: ${polishFixable.length} polish-fixable item(s) will be resolved automatically; ${advisory.length} advisory note(s).`
      : `Ready to finalize: no blocking issues; ${advisory.length} advisory note(s).`
    : `${blocking.length} blocking issue(s) to route: ` +
      AGENT_ROLE_IDS.filter((role) => ownerQueues[role] > 0)
        .map((role) => `${AGENT_ROLES[role].title} (${ownerQueues[role]})`)
        .join(", ");

  return { ok, scores, blocking, polishFixable, advisory, ownerQueues, summary };
}

/** Returns the ordered agent pipeline with hand-off contracts, for documentation / planning. */
export function describeAgentPipeline(): AgentRole[] {
  return [
    AGENT_ROLES["director"],
    AGENT_ROLES["story-architect"],
    AGENT_ROLES["content-strategist"],
    AGENT_ROLES["designer"],
    AGENT_ROLES["copywriter"],
    AGENT_ROLES["reviewer"]
  ];
}
