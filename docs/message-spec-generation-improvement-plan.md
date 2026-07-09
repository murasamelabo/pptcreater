# MessageSpec / DocSpec Generation Improvement Plan

## Purpose

PPTCreater has been optimizing too early for visual form. The recent auth-web comparison showed that a rough direct deck can be more useful than a visually structured PPTCreater deck when the direct deck preserves source information, chapter flow, and explanatory context.

This plan shifts the first half of the pipeline away from slide appearance and toward source-faithful information architecture.

The goal is not to make prettier slides first. The goal is to produce a sufficiently complete `DocSpec` and `MessageSpec` so that later visual layout has enough meaning to work with.

## Observed Failure

In the auth-web benchmark:

| Deck | Slides | Visible chars | Avg chars/slide | Important term hits |
| --- | ---: | ---: | ---: | ---: |
| Direct non-PPTCreater deck | 16 | 4108 | 257 | 29 |
| GPT-created deck | 16 | 4320 | 270 | 29 |
| PPTCreater dense deck | 17 | 3073 | 181 | 22 |

PPTCreater produced more visual structure, but lost visible information and source-specific vocabulary.

Important terms missing from the PPTCreater dense deck included:

- `Active Directory`
- `memberOf`
- `GroupName`
- `Expiration`
- `PCIDSS`
- `OAuth`
- `PKCE`
- `Managed Identity`
- `Graph API`

This is a planning failure before it is a layout failure.

## Root Causes

### 1. No Explicit Source Document Model

The current `DeckMessageMap` preserves slide intent, but not enough of the source document structure. It lacks a durable model for:

- original headings
- source section hierarchy
- tables and rows
- code/config terms
- domain vocabulary
- examples
- caveats
- repeated themes
- required terminology
- discarded material

Because there is no first-class `DocSpec`, the pipeline has no reliable way to know what must survive condensation.

### 2. MessageSpec Is Created Too Close To Slide Layout

`SlideIntent` is already slide-shaped. It contains `title`, `message`, `evidence`, `details`, `visualType`, and `slideRole`. That is useful after planning, but too late for source analysis.

The system needs an intermediate message-planning layer before it decides slide count and visual grammar.

### 3. Visual Grammar Eats Information

When a slide becomes a table, card grid, flow, or diagram too early, the visible text is shortened to fit the shape. This causes source terms to move to notes or disappear.

For technical handouts, the visible text budget should be defined before visual layout.

### 4. Titles Are Not Treated As Narrative Assets

PPTCreater currently allows visual badges such as `KEY`, `STEP`, and `API` to dominate extracted reading order. The meaningful title exists, but is often secondary.

The title should preserve the information architecture: `External Interface`, `Response Format`, `Result Codes`, `Responsibility Boundary`, `Implementation`, `Cache`, `Risks`, and so on.

### 5. No Important-Term Coverage Gate

The pipeline does not yet fail or warn when source-critical terms vanish from visible slide text.

For technical documents, loss of terms like `memberOf`, `GroupName`, or `PKCE` is not a cosmetic issue. It changes whether the deck can be used as a specification explanation.

## Proposed Pipeline

### Stage 1: Source DocSpec

Introduce `DocSpec` as the first durable artifact.

```ts
type DocSpec = {
  sourceId: string;
  title: string;
  sections: DocSection[];
  tables: DocTable[];
  diagrams: DocDiagram[];
  glossary: DocTerm[];
  keyFacts: DocFact[];
  risks: DocRisk[];
  openQuestions: DocQuestion[];
  requiredTerms: RequiredTerm[];
};
```

`DocSpec` should be source-faithful. It should not try to be beautiful. Its job is to preserve what the source said.

### Stage 2: Information Ledger

Build a cross-document ledger before slide planning.

```ts
type InformationLedger = {
  thesisCandidates: LedgerItem[];
  chapters: LedgerChapter[];
  facts: LedgerFact[];
  terms: RequiredTerm[];
  tables: LedgerTable[];
  processes: LedgerProcess[];
  boundaries: LedgerBoundary[];
  risks: LedgerRisk[];
  decisions: LedgerDecision[];
  actionItems: LedgerAction[];
};
```

The ledger should classify information, not design slides.

For the auth-web source, the ledger should preserve at least:

- system purpose
- architecture
- capabilities
- auth flow
- input parameters
- response formats
- returned attributes
- result codes
- required AD attributes
- app responsibility boundary
- implementation/config files
- cache behavior
- operational notes
- security risks
- Entra migration questions
- next deliverables

### Stage 3: Narrative Outline

Create the story from the ledger.

```ts
type NarrativeOutline = {
  thesis: string;
  audience: string;
  desiredAction: string;
  chapters: NarrativeChapter[];
  targetSlideCount: { min: number; max: number; rationale: string };
};
```

For technical handouts, target slide count should not be purely user-configured. It should be derived from source density.

Suggested defaults:

| Content type | Slide count target | Avg visible chars target |
| --- | ---: | ---: |
| live presentation | 8-14 | 80-160 |
| executive handout | 12-20 | 200-280 |
| technical handout | 16-28 | 220-320 |
| detailed report | as needed | 280-450 |

### Stage 4: MessageSpec

Introduce `MessageSpec` as a deck-level plan, separate from rendered `DeckSpec`.

```ts
type MessageSpec = {
  title: string;
  thesis: string;
  audience: string;
  desiredAction: string;
  sourceCoverage: SourceCoverage;
  requiredTerms: RequiredTerm[];
  slides: MessageSlideSpec[];
};

type MessageSlideSpec = {
  id: string;
  semanticTitle: string;
  headline: string;
  slideRole: SlideRole;
  chapterId: string;
  visibleBudget: VisibleTextBudget;
  sourceSections: string[];
  requiredTerms: string[];
  primaryClaim: string;
  supportingBlocks: MessageBlock[];
  figureNeed: FigureNeed;
  notesBlocks: MessageBlock[];
};
```

`MessageSpec` should decide what is visible before any layout renderer shortens it.

### Stage 5: SlideIntent Derivation

`SlideIntent` should become a derived artifact from `MessageSpec`, not the first planning artifact.

```ts
type SlideIntentDerivation = {
  slideIntent: SlideIntent;
  fromMessageSlideSpecId: string;
  preservedTerms: string[];
  movedToNotes: string[];
  visibleCharCount: number;
  sourceTrace: string[];
};
```

If a derived `SlideIntent` drops too many required terms or visible characters, generation should stop before rendering.

## Required Gates

### 1. Source Coverage Gate

Before DeckSpec generation, verify that major source sections are either visible or intentionally omitted.

```ts
type SourceCoverageReport = {
  sectionCoverage: Array<{
    sectionId: string;
    status: "visible" | "notes" | "omitted";
    reason?: string;
  }>;
  missingRequiredSections: string[];
};
```

### 2. Required Term Gate

Technical terms must be visible unless explicitly waived.

```ts
type RequiredTerm = {
  term: string;
  sourceSectionIds: string[];
  category: "config" | "protocol" | "identity" | "field" | "risk" | "product" | "standard";
  visibility: "must-visible" | "may-notes";
};
```

Example auth-web required terms:

- `userName`
- `username`
- `userPassword`
- `appName`
- `sAMAccountName`
- `memberOf`
- `GroupName`
- `Web.config`
- `Application.config`
- `NLog.config`
- `MemoryCache`
- `Expiration`
- `ROPC`
- `MFA`
- `PCIDSS`
- `Entra ID`
- `OIDC`
- `OAuth 2.0`
- `PKCE`
- `Managed Identity`
- `Graph API`

### 3. Visible Information Budget Gate

For handouts, visible text should not drop below the target range.

For auth-web style technical handouts:

- target slides: 16-20
- target visible chars per slide: 220-300
- minimum total visible chars: 3800
- warning below: 3500
- block below: 3000 unless user requests very concise output

### 4. Semantic Title Gate

The extracted first meaningful title for each content slide must be a semantic title, not a visual role badge.

Bad primary extracted titles:

- `KEY`
- `STEP`
- `API`
- `比較`
- `注目`

Good primary titles:

- `System Purpose`
- `Architecture`
- `Capabilities`
- `External Interface`
- `Response Format`
- `Result Codes`
- `Responsibility Boundary`
- `Implementation`
- `Cache`
- `Risks`
- `Migration Questions`

### 5. Figure Plus Text Gate

For technical handouts, diagrams should not replace explanation.

Any architecture/concept/process diagram slide should include:

- diagram itself
- semantic title
- one-sentence claim
- 4-8 visible supporting rows, rail items, or footnotes
- source trace in notes

## Recommended Auth-Web Target Outline

The direct and GPT-created decks suggest a good baseline outline:

1. Cover
2. Overview / What this deck explains
3. System purpose
4. Architecture
5. Capabilities
6. Authentication flow
7. External interface
8. Response formats and returned fields
9. Result codes
10. Responsibility boundary
11. Implementation and config files
12. Cache behavior
13. Operational and security risks
14. Entra migration kickoff questions
15. Entra migration delivery questions
16. Summary / next actions

This outline should be used as a regression fixture.

## Implementation Phases

### Phase 1: Add Analysis Artifacts

- Add `DocSpec` types.
- Add `extractDocSpecFromMarkdown()` for Markdown headings, tables, lists, Mermaid blocks, and code terms.
- Add `createInformationLedger(docSpec)`.
- Add tests using `認証Web仕様まとめ.md` fixture.

### Phase 2: Add MessageSpec

- Add `MessageSpec` and `MessageSlideSpec` types.
- Add `createMessageSpecFromDocSpec()`.
- Make MessageSpec choose semantic slide titles and target slide count before visual selection.
- Preserve required terms and visible budgets.

### Phase 3: Derive SlideIntent From MessageSpec

- Convert MessageSpec to existing `DeckMessageMap` / `SlideIntent` for compatibility.
- Add derivation metadata: visible terms, notes terms, dropped terms.
- Add gate: fail if required visible terms are dropped.

### Phase 4: Update Rendering Defaults

- Update narrative-v1 handout/report to consume MessageSpec-derived intents.
- Keep diagrams, but always add text rail/footnote rows for technical handouts.
- Make badges secondary in reading order.

### Phase 5: Add Benchmark Tests

Use the auth-web Markdown as a fixture and assert:

- 16-20 slides
- total visible chars >= 3800
- avg visible chars >= 220
- important term coverage >= 90%
- semantic title extraction does not return `KEY` / `STEP` / `API`
- no stale template terms
- review/finalize blocking 0

## Strategic Decision

The next major improvement should not be another visual template. It should be a source-faithful planning layer.

The generation pipeline should become:

```text
Source files
  -> DocSpec
  -> InformationLedger
  -> NarrativeOutline
  -> MessageSpec
  -> SlideIntent derivation
  -> DeckSpec layout/render
  -> Review gates
```

Visual design should only start after the source information, required terms, semantic titles, and visible text budgets are already protected.