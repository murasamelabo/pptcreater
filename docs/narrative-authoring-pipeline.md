# Narrative Authoring Pipeline Proposal

## Purpose

This proposal changes pptcreater's deck-generation approach from selecting fixed diagram patterns early to planning the deck as a communication artifact first, then choosing an expression strategy for each slide.

The user problem is not only layout quality. The current pipeline can make many decks look structurally similar because `MessageMap.visualType` is quickly collapsed into a small set of `message-*` archetypes. That makes the system improve by swapping patterns rather than by reasoning about what the audience needs to understand.

## Current Constraint

The current `createDeckFromMessageMap` path does this:

1. Reads a `DeckMessageMap`.
2. Uses each `SlideIntent.visualType` to select a fixed `MessageDeckArchetype`.
3. Calls a matching renderer such as `flowVisual`, `matrixVisual`, `stepsVisual`, `editorialBoardVisual`, or `hubMapVisual`.
4. Wraps that in a standard slide shell.

This is reliable, but it bakes visual choice too early into the workflow. The result is predictable but too fixed.

## Proposed Direction

Do not start from existing diagram patterns.

Start from narrative, information, visible copy, and communicative relationship. Use visual grammars as metadata describing what a type of expression can communicate, not as prebuilt slide templates. A grammar may later render into text, table, shape composition, spatial model, chart, photo-led slide, or a fully custom native-object composition.

Existing schematic/design-pack patterns may remain as legacy fallback, regression baselines, or optional renderers. They should not be the first selection primitive in the new authoring path.

## Pipeline

### 1. Deck Strategy Planner

Input:

- User request
- Audience
- Purpose / desired action
- Source materials
- Known constraints such as template, slide count, tone, and delivery mode

Output:

- Deck thesis
- Audience assumptions
- Desired action
- Narrative arc
- Required information groups
- Evidence requirements
- Open questions

The whole deck message is decided before any slide layout is considered.

### 2. Chapter And Slide Planner

Input:

- Deck strategy
- Information groups
- Source fragments

Output:

- Chapter plan
- Slide briefs
- Slide split decisions

If one topic contains too much information, it is split across multiple slides. The slide count is allowed to adapt to content; the generator should not cram because a previous plan said one topic equals one slide.

Each slide brief contains:

- Slide role in the story
- Primary message
- Reader takeaway
- Information units
- Evidence units
- Density target
- Expected reader action or interpretation

### 3. Slide Message And Copy Planner

Before visual selection, decide visible text.

Output:

- Title / heading
- Slide message
- Explanation sentence
- Labels
- List items
- Table cells
- Detail text
- Captions
- Notes
- Source references

The copy planner should create complete, visible, human-readable text. It may produce too much text at first, because the next stages can shorten, split, or move detail into notes with traceability.

### 4. Visual Grammar Selector

The selector chooses expression based on the slide's communicative relationship, not a fixed template name.

Examples of visual grammar metadata:

| Grammar | Expresses | Good For | Bad For |
| --- | --- | --- | --- |
| Typographic emphasis | One sentence, one word, one number | strong conclusions, proof, opening slides | multi-factor explanations |
| Evidence board | claim plus 3-5 proofs | sourced arguments, decision support | linear processes |
| Spatial model | distance, direction, tension, positions | relationships, maturity, before/after states | precise tabular comparison |
| Comparison field | similarity/difference across options | product/service/area comparison | long procedural steps |
| Sequential path | order, dependencies, gates | onboarding, migration, process | parallel categories |
| Layered model | containment, stack, abstraction | architecture, governance, capability layers | detailed item lists |
| Decision surface | axes, trade-offs, zones | option choice, prioritization, risk/return | narrative introduction |
| Detail reading page | structured text with hierarchy | handouts, Q&A, policy, explanation | live presentation hero moments |
| Photo/product anchor | real-world proof and context | product, service, place, customer case | abstract concepts without asset proof |
| Table as text system | dense but scannable facts | specs, costs, responsibilities | emotional/brand expression |

A grammar record should contain:

- `id`
- `expresses`
- `dataShape`
- `minItems` / `maxItems`
- `densityTolerance`
- `audienceFit`
- `copyRequirements`
- `layoutConstraints`
- `variationKnobs`
- `antiPatterns`
- `reviewChecks`
- `rendererPolicy`

The selector stores its rationale and rejected alternatives. This makes expression choice reviewable.

### 5. Layout Composer

The composer turns slide copy and selected grammar into editable PowerPoint objects.

It should decide:

- Canvas regions
- Reading path
- Primary focal object
- Text sizes by role
- Spacing and grouping
- Number of items to show
- Which text to shorten
- Which detail to move to notes
- Color and contrast
- Native shape/table/image/SVG usage

The composer may perform light copy edits for fit and beauty, but it must preserve the slide message. Any shortening should keep a trace to the source copy.

### 6. Principle-Based Review

The reviewer checks the order and principles, not just object presence.

It checks:

- Deck thesis is visible in early slides.
- Chapters follow a readable narrative arc.
- Each slide has one primary message.
- Visible text is complete and not over-compressed.
- Expression matches the message relationship.
- Reading order is obvious.
- Main visual has a clear role.
- Typography hierarchy is strong.
- Whitespace separates groups without excessive lines.
- Color supports meaning and contrast.
- Native editable objects are used where practical.
- Images are used only when they add semantic or real-world value.
- Output passes review, visual review, finalize, and PPTX package checks.

## PDF-Derived Principles

The two provided PDFs were verified to exist and representative pages were rendered as images for inspection. Existing project memory also records a prior full-page OCR pass over both books. The new pipeline should reflect these observed and previously extracted principles.

Key principles:

- Do not start by opening PowerPoint. Start by deciding what the audience should understand or do.
- The audience is the protagonist, not the author.
- A slide is a means to communicate a message, not the goal.
- Verbalize the conclusion and structure before drawing.
- One slide should have one main message.
- Keep necessary words; do not reduce text blindly.
- Treat text itself as a design object: size, weight, spacing, and placement matter.
- Weaken supporting elements before strengthening the hero.
- Whitespace is an invisible divider, not leftover space.
- Layout reflects thinking: choose axes, grouping, and eye flow before placing objects.
- Tables should make text readable; grid lines are supporting actors.
- Charts should make the visual information the hero; axes and legends are supporting actors.
- Arrows are supporting actors and should not dominate.
- Use photos/images only when they add context, proof, or reality.
- Use a small number of colors with a strong focal contrast.
- Visuals should be sized intentionally; neither tiny nor oversized without meaning.
- Before/after, contrast, hierarchy, sequence, and causation are thinking structures, not decorative layouts.

The representative page images also show that strong expression can come from restrained pages: large typographic forms, a single strong color, clear whitespace, and very deliberate hierarchy. The new pipeline should not equate expression with more decoration.

## Data Contracts

### `DeckPlanningInput`

```ts
type DeckPlanningInput = {
  request: string;
  audience?: string;
  purpose?: string;
  desiredAction?: string;
  deliveryMode?: ContentMode;
  sourceFragments: SourceFragment[];
  constraints: DeckConstraint[];
};
```

### `DeckBrief`

```ts
type DeckBrief = {
  thesis: string;
  audienceAssumptions: string[];
  desiredAction: string;
  narrativeArc: string[];
  successCriteria: string[];
  openQuestions: string[];
};
```

### `ChapterPlan`

```ts
type ChapterPlan = {
  id: string;
  title: string;
  role: "setup" | "context" | "proof" | "options" | "decision" | "action";
  keyQuestion: string;
  slideIds: string[];
};
```

### `SlideBrief`

```ts
type SlideBrief = {
  id: string;
  chapterId: string;
  role: string;
  primaryMessage: string;
  readerTakeaway: string;
  informationUnits: InformationUnit[];
  evidenceUnits: EvidenceUnit[];
  densityTarget: "sparse" | "balanced" | "dense";
  splitReason?: string;
};
```

### `SlideTextPlan`

```ts
type SlideTextPlan = {
  slideId: string;
  title: TextRolePlan;
  message: TextRolePlan;
  labels: TextRolePlan[];
  bodyItems: TextRolePlan[];
  captions: TextRolePlan[];
  details: TextRolePlan[];
  speakerNotes: string[];
};
```

### `VisualGrammarSpec`

```ts
type VisualGrammarSpec = {
  id: string;
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
```

### `ExpressionPlan`

```ts
type ExpressionPlan = {
  slideId: string;
  selectedGrammarId: string;
  rationale: string;
  rejectedAlternatives: { grammarId: string; reason: string }[];
  visualRoles: VisualRole[];
  variationKnobs: Record<string, string | number | boolean>;
  riskTags: string[];
};
```

### `LayoutPlan`

```ts
type LayoutPlan = {
  slideId: string;
  regions: LayoutRegion[];
  readingPath: string[];
  typography: TypographyPlan;
  color: ColorPlan;
  spacing: SpacingPlan;
  overflowPolicy: "shorten" | "split" | "move-to-notes";
};
```

The final output remains `DeckSpec`, so existing render, finalize, review, Studio, and PPTX tooling remain compatible.

## Migration Plan

### Phase 1: Hybrid Planner Behind Existing Facade

Add a new option to the message-map generator:

```ts
planningMode?: "legacy" | "narrative-v1";
```

`legacy` keeps the current behavior. `narrative-v1` produces intermediate artifacts and then emits a DeckSpec.

### Phase 2: Persist Intermediate Artifacts

For every generated deck, write these files when requested:

- `deck-brief.json`
- `chapter-plan.json`
- `slide-briefs.json`
- `slide-text-plan.json`
- `expression-plan.json`
- `layout-plan.json`

This lets reviewers identify which stage caused a weak slide.

### Phase 3: Visual Grammar Registry

Introduce a built-in registry, starting with metadata only. Do not bind it to existing templates.

The first grammar set should include:

- typographic-emphasis
- evidence-board
- spatial-model
- comparison-field
- sequential-path
- layered-model
- decision-surface
- detail-reading-page
- photo-product-anchor
- table-text-system

### Phase 4: Composer Without Fixed Archetypes

Implement a small native-object composer that places regions and roles from `LayoutPlan` rather than calling `flowVisual`, `matrixVisual`, and similar fixed renderers.

Start with editable native objects:

- text
- shape
- table-like groups
- lines only where they support reading
- optional image blocks when asset provenance is clear

### Phase 5: Review By Stage

Extend review output with stage attribution:

- message issue
- copy issue
- expression issue
- layout issue
- render issue

A repeated critique should tell the developer which stage to improve.

## Acceptance Tests

1. Existing `createDeckFromMessageMap` tests still pass in legacy mode.
2. `narrative-v1` emits all intermediate artifacts.
3. Each slide has one `SlideBrief.primaryMessage` and one `SlideTextPlan.message`.
4. Long information groups are split instead of crammed into one slide.
5. Expression selection records selected grammar and rejected alternatives.
6. Adjacent slides do not share the same visual fingerprint unless deliberate repetition is justified.
7. Copy shortening never produces ellipses, broken Japanese particles, placeholders, or incomplete fragments.
8. Layout composer adapts item count, font size, spacing, and region size from density.
9. Review can attribute a weak slide to message, copy, expression, layout, or render.
10. Rendered output passes `review`, `visual-review`, `finalize`, and PPTX zip integrity.
11. A regression deck generated from `SKILLS.md` must not default to repeated cards/flows when narrative-v1 is enabled.
12. A decision-maker product deck must use at least three different expression grammars across the first eight content slides.
13. A dense handout deck may use detail-reading-page slides without failing visual richness, but must still show hierarchy and whitespace.
14. A visual deck must show a visible focal object on each content slide.

## First Implementation Slice

The smallest useful implementation is not a new renderer. It is a planning layer.

1. Add type definitions for `DeckBrief`, `ChapterPlan`, `SlideBrief`, `SlideTextPlan`, `VisualGrammarSpec`, `ExpressionPlan`, and `LayoutPlan`.
2. Add a `visualGrammarRegistry.ts` metadata file.
3. Add a planner that converts `DeckMessageMap` to staged artifacts without changing the final DeckSpec yet.
4. Add tests proving the artifacts exist, contain rationale, and avoid direct fixed-pattern selection.
5. Add a CLI flag to write these artifacts beside the DeckSpec.

Initial implementation status:

- `packages/core/src/visualGrammarRegistry.ts` defines metadata-only visual grammars.
- `packages/core/src/narrativePlanning.ts` converts an existing `DeckMessageMap` into staged planning artifacts.
- `pptcreater from-message-map --planning-mode narrative-v1 --planning-output-dir <dir>` writes `deck-planning-input.json`, `deck-brief.json`, `chapter-plan.json`, `slide-briefs.json`, `slide-text-plan.json`, `expression-plan.json`, `layout-plan.json`, and `visual-grammar-registry.json` while still emitting the legacy-compatible DeckSpec.

This slice intentionally does not change the visual renderer yet. It gives the dev loop inspectable artifacts so future expression failures can be attributed to message planning, copy planning, expression selection, layout planning, or rendering.

Only after that should the renderer start using `ExpressionPlan` and `LayoutPlan` to compose slides without fixed archetypes.

## Decision

Proceed with a compatibility-preserving redesign:

- Keep `DeckSpec` and the current render/review/finalize stack.
- Stop treating fixed diagram patterns as the first choice.
- Introduce staged narrative planning and visual grammar metadata.
- Use existing patterns only as fallback or renderer implementation detail.
- Make every stage inspectable so expression failures can be fixed at the right layer.
