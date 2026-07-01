export type VisualGrammarId =
  | "typographic-emphasis"
  | "evidence-board"
  | "spatial-model"
  | "comparison-field"
  | "sequential-path"
  | "layered-model"
  | "decision-surface"
  | "detail-reading-page"
  | "photo-product-anchor"
  | "table-text-system";

export type VisualGrammarSpec = {
  id: VisualGrammarId;
  label: string;
  expresses: string[];
  dataShape: string[];
  minItems: number;
  maxItems: number;
  densityTolerance: "low" | "medium" | "high";
  audienceFit: string[];
  copyRequirements: string[];
  layoutConstraints: string[];
  variationKnobs: string[];
  antiPatterns: string[];
  reviewChecks: string[];
  rendererPolicy: "native-shapes" | "table" | "text-only" | "image" | "svg" | "legacy-fallback";
};

export const VISUAL_GRAMMAR_REGISTRY: VisualGrammarSpec[] = [
  {
    id: "typographic-emphasis",
    label: "Typographic emphasis",
    expresses: ["single conclusion", "focal number", "strong opening", "one-word contrast"],
    dataShape: ["one claim", "one proof number", "one phrase"],
    minItems: 1,
    maxItems: 2,
    densityTolerance: "low",
    audienceFit: ["executive", "presentation", "opening", "section turn"],
    copyRequirements: ["one short headline", "optional proof caption"],
    layoutConstraints: ["one dominant text object", "large whitespace", "clear focal hierarchy"],
    variationKnobs: ["scale", "crop", "contrast", "vertical rhythm"],
    antiPatterns: ["small headline", "equal card grid", "decorative icon as focal object"],
    reviewChecks: ["focal object is visible", "title hierarchy is stronger than body", "claim is complete"],
    rendererPolicy: "native-shapes"
  },
  {
    id: "evidence-board",
    label: "Evidence board",
    expresses: ["claim with proof", "decision support", "sourced argument"],
    dataShape: ["one claim", "three to five evidence units", "optional source note"],
    minItems: 3,
    maxItems: 5,
    densityTolerance: "medium",
    audienceFit: ["decision", "report", "customer-facing", "technical explanation"],
    copyRequirements: ["claim sentence", "short evidence labels", "source trace when factual"],
    layoutConstraints: ["claim region is visually dominant", "evidence groups are secondary", "source note stays quiet"],
    variationKnobs: ["proof prominence", "board asymmetry", "callout position", "evidence grouping"],
    antiPatterns: ["all evidence cards equal", "evidence without claim", "unsourced facts"],
    reviewChecks: ["claim and evidence are connected", "supporting items are readable", "source trace is present when needed"],
    rendererPolicy: "native-shapes"
  },
  {
    id: "spatial-model",
    label: "Spatial model",
    expresses: ["distance", "direction", "tension", "position", "state change"],
    dataShape: ["two to six concepts", "relationship labels", "optional axis meaning"],
    minItems: 2,
    maxItems: 6,
    densityTolerance: "medium",
    audienceFit: ["concept", "strategy", "change story", "maturity explanation"],
    copyRequirements: ["short node labels", "axis or distance explanation", "one insight sentence"],
    layoutConstraints: ["placement carries meaning", "labels remain near objects", "arrows are secondary"],
    variationKnobs: ["axis direction", "node scale", "distance", "focal zone", "path shape"],
    antiPatterns: ["random placement", "large arrow as hero", "unlabeled axes"],
    reviewChecks: ["spatial relation is obvious", "reader can explain the axes", "visual does not need speaker-only context"],
    rendererPolicy: "native-shapes"
  },
  {
    id: "comparison-field",
    label: "Comparison field",
    expresses: ["similarity", "difference", "trade-off", "option choice"],
    dataShape: ["two to four options", "shared criteria", "recommendation or implication"],
    minItems: 2,
    maxItems: 4,
    densityTolerance: "medium",
    audienceFit: ["decision", "product comparison", "service comparison", "area comparison"],
    copyRequirements: ["option labels", "criteria labels", "decision sentence"],
    layoutConstraints: ["criteria are aligned", "recommended option is visually clear", "comparison is not just decorative columns"],
    variationKnobs: ["axis emphasis", "ranking", "split layout", "winner marker", "detail density"],
    antiPatterns: ["columns without criteria", "color-only winner", "too many criteria on one slide"],
    reviewChecks: ["comparison basis is explicit", "selection logic is visible", "item count fits the canvas"],
    rendererPolicy: "native-shapes"
  },
  {
    id: "sequential-path",
    label: "Sequential path",
    expresses: ["order", "dependency", "gates", "process", "timeline"],
    dataShape: ["three to seven steps", "optional gate conditions", "owner or timing labels"],
    minItems: 3,
    maxItems: 7,
    densityTolerance: "medium",
    audienceFit: ["onboarding", "migration", "operations", "roadmap"],
    copyRequirements: ["step verbs", "short condition labels", "final state"],
    layoutConstraints: ["reading path is obvious", "first and final steps are distinct", "dependencies are not hidden"],
    variationKnobs: ["path shape", "gate emphasis", "vertical or horizontal rhythm", "milestone scale"],
    antiPatterns: ["same-size step boxes with no focal step", "dangling arrows", "too many words per step"],
    reviewChecks: ["step order is visible", "labels are complete", "no step text is clipped"],
    rendererPolicy: "native-shapes"
  },
  {
    id: "layered-model",
    label: "Layered model",
    expresses: ["containment", "stack", "abstraction", "capability layers"],
    dataShape: ["three to six layers", "layer labels", "optional cross-cutting concern"],
    minItems: 3,
    maxItems: 6,
    densityTolerance: "medium",
    audienceFit: ["architecture", "governance", "platform", "operating model"],
    copyRequirements: ["layer names", "one role per layer", "boundary explanation"],
    layoutConstraints: ["layers have stable alignment", "top/bottom meaning is labeled", "cross-cutting items do not obscure layers"],
    variationKnobs: ["stack direction", "depth cues", "highlighted layer", "boundary treatment"],
    antiPatterns: ["unexplained stacked rectangles", "too many category colors", "labels outside the layer they explain"],
    reviewChecks: ["layer meaning is visible", "hierarchy reads without notes", "colors are not doing all the work"],
    rendererPolicy: "native-shapes"
  },
  {
    id: "decision-surface",
    label: "Decision surface",
    expresses: ["trade-off", "priority", "risk-return", "quadrant choice"],
    dataShape: ["two axes", "two to six options", "recommended zone"],
    minItems: 2,
    maxItems: 6,
    densityTolerance: "medium",
    audienceFit: ["executive", "decision", "portfolio", "prioritization"],
    copyRequirements: ["axis labels", "option labels", "decision implication"],
    layoutConstraints: ["axis labels are readable", "recommended zone is clear", "points do not overlap text"],
    variationKnobs: ["axis polarity", "zone shape", "point scale", "recommendation label"],
    antiPatterns: ["generic matrix axes", "unlabeled dots", "four-quadrant template with no decision"],
    reviewChecks: ["reader can state the trade-off", "selected zone is visible", "labels do not collide"],
    rendererPolicy: "native-shapes"
  },
  {
    id: "detail-reading-page",
    label: "Detail reading page",
    expresses: ["structured explanation", "policy detail", "Q&A", "self-contained handout"],
    dataShape: ["one heading", "two to five text sections", "optional callout"],
    minItems: 2,
    maxItems: 5,
    densityTolerance: "high",
    audienceFit: ["handout", "report", "policy", "technical detail"],
    copyRequirements: ["complete prose", "section headings", "short callout"],
    layoutConstraints: ["line length is controlled", "heading hierarchy is clear", "detail is not forced into tiny labels"],
    variationKnobs: ["column count", "callout placement", "heading scale", "indent rhythm"],
    antiPatterns: ["wall of text", "paragraphs without headings", "body text below readable size"],
    reviewChecks: ["body copy remains readable", "sections are scannable", "slide is intentionally text-rich"],
    rendererPolicy: "text-only"
  },
  {
    id: "photo-product-anchor",
    label: "Photo or product anchor",
    expresses: ["real-world proof", "place", "person", "product state", "customer case"],
    dataShape: ["one sourced asset", "message", "caption or annotation", "supporting facts"],
    minItems: 1,
    maxItems: 4,
    densityTolerance: "low",
    audienceFit: ["product", "service", "customer story", "place comparison", "company deck"],
    copyRequirements: ["asset caption", "alt text", "source trace", "message sentence"],
    layoutConstraints: ["image has semantic reason", "text sits on a readable surface", "annotation tells viewer what to see"],
    variationKnobs: ["crop", "annotation position", "scrim strength", "message side"],
    antiPatterns: ["meaningless stock image", "image without caption", "text over busy image"],
    reviewChecks: ["asset adds evidence or context", "caption is visible", "rights/source are tracked"],
    rendererPolicy: "image"
  },
  {
    id: "table-text-system",
    label: "Table as text system",
    expresses: ["dense facts", "responsibility", "specification", "cost breakdown"],
    dataShape: ["two to six columns", "three to eight rows", "headers", "optional highlight"],
    minItems: 3,
    maxItems: 8,
    densityTolerance: "high",
    audienceFit: ["report", "technical", "finance", "operations"],
    copyRequirements: ["short headers", "cell text", "highlight reason"],
    layoutConstraints: ["text is the hero", "grid lines stay quiet", "key row or column is emphasized"],
    variationKnobs: ["row grouping", "highlight band", "header weight", "cell density"],
    antiPatterns: ["heavy grid", "tiny cells", "no highlighted implication"],
    reviewChecks: ["table can be read without zoom", "headers explain the comparison", "highlight supports the message"],
    rendererPolicy: "table"
  }
];

export function listVisualGrammarSpecs(): VisualGrammarSpec[] {
  return VISUAL_GRAMMAR_REGISTRY.map((grammar) => ({ ...grammar, expresses: [...grammar.expresses], dataShape: [...grammar.dataShape] }));
}

export function getVisualGrammarSpec(id: VisualGrammarId): VisualGrammarSpec {
  const grammar = VISUAL_GRAMMAR_REGISTRY.find((item) => item.id === id);
  if (!grammar) {
    throw new Error(`Unknown visual grammar: ${id}`);
  }
  return grammar;
}