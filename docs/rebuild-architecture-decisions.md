# Direct Authoring Rebuild: Architecture Decisions

## Status

Accepted for additive Phase 0 implementation. The legacy MessageSpec / DeckSpec pipeline remains unchanged until the benchmark release gate passes.

## Objective

Make executable slide code, rather than a slide-shaped intermediate schema, the primary authoring target. Preserve the diagram encyclopedia, mature Japanese rendering behavior, editable PowerPoint output, source traceability, and deterministic package checks.

Target pipeline:

```text
Sources
  -> Source Notebook
  -> Deck Manuscript
  -> executable Slide Program
  -> PPTX / PNG / Studio
  -> Artifact Critic
  -> targeted Slide Program revision
```

DeckSpec and MessageSpec become legacy interchange and debugging formats. New authoring packages must not import them.

## Decision 1: Source IDs

Source IDs are content-addressed anchors with lineage:

```text
source URI + structural path + source kind + normalized content hash + occurrence
```

Whitespace-only changes preserve IDs. Content changes create a new ID and may record `previousId`. Round-trip stability and small-edit lineage are separate contracts.

## Decision 2: Deck Manuscript

The Deck Manuscript is human-readable Markdown with minimal frontmatter. It records chapters, slide boundaries, complete visible prose, notes, source references, editorial merge/split decisions, and optional figure briefs.

It does not prescribe cards, table row counts, evidence limits, or layout names. The manuscript must be reviewable before PowerPoint generation.

## Decision 3: Slide Program

A Slide Program is ordinary TypeScript implementing `buildDeck(context)`. It may create a custom composition, use no figure, or instantiate a catalog figure.

The Slide SDK owns the mature rendering capabilities currently spread across layout, diagram, and render-pptx packages:

- CJK text fitting and kinsoku
- locale-aware font floors
- theme and template context
- image contain/cover
- editable native shapes and connectors
- speaker notes, citations, hyperlinks, and reading order
- OpenXML packaging and integrity checks

The authoring API remains unopinionated about slide archetypes.

## Decision 4: SlideFragment

`SlideFragment` is a command-buffer hybrid, not DeckSpec and not public OpenXML.

It contains:

- `DrawCommand[]` for text, shape, image, connector, group, and component import
- `EditDescriptor[]` for text editing, movement, resize, recolor, add/remove/reorder
- bounds, source references, accessibility metadata, and usage constraints

OpenXML is private to the renderer. A real three-item figure from the diagram encyclopedia must prove add/remove/reorder behavior before this contract is frozen for v1.

## Decision 5: Figure Catalog

The diagram encyclopedia and tree packs become an optional Figure Catalog. Selection is based on semantic need, data shape, item count, tone, and label constraints.

A catalog component is never selected merely because one exists. The author may choose:

1. no figure;
2. a custom native composition;
3. a catalog component.

Manifest v2 adds `avoidWhen`, data shape, editability, tone support, preview, source version, and metadata confidence. The v1 reader remains supported while all components are reviewed.

## Decision 6: Templates And Design Brief

Templates are render-context inputs selected by a structured Design Brief. The Slide Program receives immutable design tokens and template information before drawing. Post-hoc theme replacement must not invalidate geometry assumptions.

The Design Brief captures knowledge derived from slide-design PDFs, web design concepts, Slideland references, and project-specific DESIGN.md files:

- mood and palette roles;
- typography and CJK fallback;
- spacing rhythm and whitespace;
- surface/depth vocabulary;
- density tolerance;
- do/don't constraints;
- reference assets.

## Decision 7: Artifact Critic

The Artifact Critic evaluates both intention and rendered output.

Input:

```ts
{
  manuscriptPath,
  programManifestPath,
  slidePngPaths,
  pptxPath,
  sourceNotebookPath,
  designBrief
}
```

Output contains typed visual defects, scores, slide findings, and revision briefs targeting Slide Program source IDs. It never patches generated objects.

Blocking defect types are:

- source fidelity loss;
- overlap;
- truncation;
- distortion;
- contrast;
- alignment;
- bad line break;
- missing media;
- semantic figure mismatch.

Business deck structure and source fidelity are evaluated before rendering. Visual craft, reading path, figure semantics, and editability are evaluated from PNG/PPTX/OpenXML after rendering.

## Decision 8: Benchmark And Migration Gate

The frozen manifest is [benchmarks/direct-authoring/manifest.json](../benchmarks/direct-authoring/manifest.json).
External/private fixtures are resolved through the environment-variable placeholders recorded in
that manifest; personal absolute paths are never committed.

Before the new pipeline becomes default:

- at least five independent raters compare legacy, direct, and new outputs blindly;
- the new output reaches 66% preference or non-inferiority against direct authoring;
- at least five of six scenarios beat the legacy pipeline;
- source section and required-term coverage are 100%;
- unexplained omissions and blocking visual defects are zero;
- figures remain editable;
- the new authoring dependency graph contains no MessageSpec or DeckSpec import.

If human agreement is below 0.70, the result is inconclusive rather than a pass.

## Ownership

| Stage | Owner |
| --- | --- |
| Source Notebook | researcher |
| Deck Manuscript | manuscript author (story architect + content strategist) |
| Slide Program | program author (designer + copywriter) |
| Artifact Critic | critic/reviewer |
| Deterministic gates and benchmark packaging | QA |

Existing role-routing concepts are retained, but issue ownership targets manuscript or program source rather than generated slide objects.

## Phase 0 Spike

`@pptcreater/authoring-contracts` contains executable contracts and a direct PptxGenJS spike. Run:

```powershell
npm run build
node scripts/run-direct-authoring-spike.mjs <source.md> generated/direct-authoring-spike.pptx
```

The spike is intentionally small. Its purpose is to prove that direct slide code and the new contracts compile and render without importing MessageSpec, SlideIntent, DeckMessageMap, or DeckSpec. It is not the final Slide SDK or an automated manuscript author.

## Phase 1 Source Notebook

`@pptcreater/source-notebook` parses Markdown into ordered, non-slide-shaped source blocks. It
preserves headings, paragraphs, list items, tables, fenced code, quotes, images, citations, and
inline marks. Every block receives a content-addressed SourceAnchor. Whitespace-only changes keep
the ID; content edits at the same structural position create a new ID with `previousId` lineage.

```powershell
npm run source:notebook -- <source.md> generated/source-notebook.json
```

The notebook stores normalized source text for exact normalized round-trip. A one-way adapter can
ingest the information still present in a legacy DocSpec, but the warning on that notebook makes
clear that discarded Markdown syntax cannot be recovered.

## Phase 1 Deck Manuscript

`@pptcreater/manuscript` defines the human-readable authoring source that follows the Source
Notebook. It stores chapters, slide takeaways, complete visible prose, notes, source references,
optional semantic figure briefs, and explicit keep/merge/split/omit decisions. It contains no
layout names or object geometry. See [Deck Manuscript Format](deck-manuscript-format.md).

The initial `createLosslessManuscriptDraft()` is intentionally verbose: every source block appears
on a draft slide. A manuscript author reviews that Markdown, merges or splits source units into a
natural narrative, and records reasons while `assertCompleteManuscriptCoverage()` prevents silent
loss. The lossless draft is an editorial starting point, not an automatic finished deck outline.

## Phase 2 Slide SDK And Figure Catalog

`@pptcreater/slide-sdk` executes DeckSpec-independent `DrawCommand` programs directly with
PptxGenJS. Its initial renderer supports text, shapes, images, connectors, groups, speaker notes,
source references, and structural/CJK text preflight. It deliberately rejects
`importPptxComponent` until the OpenXML transplant code is extracted from the legacy renderer into
a low-level package that does not import `@pptcreater/core`.

`@pptcreater/figure-catalog` reads the existing diagram encyclopedia and tree manifests through a
backward-compatible v1 reader, infers conservative v2 metadata, searches by semantic need/data
shape/item count/tone, and instantiates editable `SlideFragment` component commands. Catalog
metadata inferred by automation remains marked `metadataConfidence=inferred` until reviewed.

The next Phase 2 slice is `@pptcreater/pptx-component-transplant`: a DeckSpec-independent OpenXML
engine used by Slide SDK after base PPTX generation. The new authoring dependency graph must never
route through the legacy `@pptcreater/render-pptx` entry point because that package imports core
DeckSpec types.

## Phase 3/4 Critic And Opt-In Orchestrator

`@pptcreater/design-critic` applies deterministic manuscript coverage, program source-reference,
text preflight, semantic figure-brief, and PPTX package-integrity gates. Its revision briefs target
Slide Program source IDs; generated PowerPoint objects are never patched as the primary fix.

`@pptcreater/direct-authoring` compiles an edited Deck Manuscript into a Slide Program through an
injectable `SlideComposer`, optionally instantiates Figure Catalog fragments, renders with Slide
SDK, and runs Design Critic. The default composer is intentionally modest and prose-preserving; an
LLM or human program author can replace it slide by slide without changing the manuscript or
coverage contract.

```powershell
npm run author:direct -- generated/source-notebook.json edited-manuscript.json output.pptx
```

This path remains opt-in. `from-markdown` cannot switch defaults until the frozen blind human
benchmark reaches the migration gate. The 168-slide XAA lossless draft is an editorial starting
point, not an acceptable automatic final deck; a manuscript author must merge it into a natural
narrative before direct rendering.

## Rollback

All rebuild phases are additive until default routing changes. Legacy CLI/MCP behavior remains available for at least two releases after migration. Failure to match the direct-authoring benchmark does not justify weakening acceptance criteria; the fallback is Manuscript plus a constrained layout DSL, not MessageSpec v2.
