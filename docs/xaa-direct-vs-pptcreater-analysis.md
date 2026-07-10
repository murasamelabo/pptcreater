# XAA / ID-JAG: Direct PptxGenJS vs PPTCreater Analysis

## Purpose

This document compares two 24-slide technical reports generated from the same Markdown source:

- Source: `C:\Users\myrasame\Downloads\cross-app-access-xaa-id-jag-deep-dive-2026-06.md`
- SHA-256: `08A25526A1A652A71B37B980B89DE3CBE45516EEE711A80616DACE22DBBD6E0B`
- PPTCreater output: `xaa-id-jag-technical-report-new-pipeline-20260710.pptx`
- Direct output: `xaa-id-jag-direct-pptxgenjs-20260710.pptx`
- Machine-readable comparison: `xaa-id-jag-pptcreater-vs-direct-20260710.json`

The comparison uses PPTX OpenXML text extraction for both decks. It does not compare the source scripts or count speaker notes as visible slide content.

## Executive Finding

The direct deck reads more naturally because it preserves the source's explanatory units before choosing layouts. PPTCreater converts the source into short slide-shaped records early, then shortens the same information again for grammar-specific layouts.

The dominant information loss occurs before rendering:

- Source: 15,461 non-whitespace characters
- PPTCreater Message Map: 5,168 characters
- PPTCreater PPTX: 4,289 visible characters
- Direct PPTX: 6,345 visible characters

PPTCreater discards 10,293 characters before layout, versus 879 characters after planning. About 92% of its total source-to-PPTX loss therefore occurs in source/message planning, not rendering.

## Quantitative Comparison

| Metric | PPTCreater | Direct PptxGenJS |
| --- | ---: | ---: |
| Slides | 24 | 24 |
| Visible characters | 4,289 | 6,345 |
| Average characters per slide | 178.7 | 264.4 |
| Median characters per slide | 162 | 271.5 |
| Text runs | 446 | 406 |
| Average characters per text run | 9.6 | 15.6 |
| Source-to-PPTX retention | 27.7% | 41.0% |

The direct deck has 2,056 more visible characters, or 1.479 times the visible information, while using fewer text runs. PPTCreater therefore produces more fragmented text objects containing less information.

## Surface Symptoms

| Marker | PPTCreater | Direct |
| --- | ---: | ---: |
| `matters.` filler | 2 | 0 |
| Generic `要点/観点 n` | 1 | 0 |
| Generic `注目` | 8 | 0 |
| Generic `項目 / 内容` | 5 | 0 |
| Truncated `endpoin` | 1 | 0 |
| Truncated `Arche` | 1 | 0 |
| Truncated `Su` | 1 | 0 |

These defects explain why the PPTCreater deck can pass deterministic checks while still feeling less coherent to a reader.

## Narrative And Chapter Comparison

The source has a clear report hierarchy: background/problem, architecture/operation, protocol specification, security/use cases/ecosystem, alternatives, benefits, and implementation notes.

The direct deck groups this into four explicit visual chapters:

1. Background and problems
2. Architecture
3. Protocol specification
4. Adoption evaluation

The PPTCreater deck has an agenda that mentions parts, but its DeckSpec has no actual `section` layout. `reviewSlideQuality()` nevertheless reports `section markers=true` because its heuristic finds text such as `第1部` inside the agenda. This gives D2/S2 full credit without proving that readers receive real chapter transitions.

The direct deck also assigns protocol specification its own chapter. PPTCreater primarily infers chapter roles such as setup/context/proof/options/action from slide text, so source chapters can be absorbed into generic narrative roles rather than remaining visible as source-authored report structure.

## Expression Concentration

PPTCreater layout distribution:

- evidence board: 7 slides
- table text system: 5 slides
- spatial model: 4 slides
- sequential path: 3 slides
- decision surface: 1 slide
- layered model: 2 slides

Evidence boards and tables account for 12 of 22 content slides, or 54.5%. The deck is technically varied by layout id, but much of the report still resolves into claim-plus-cards or header-plus-rows.

The direct deck uses section dividers, side-by-side concept contrast, role diagrams, a four-stage protocol flow, code response with annotations, claim tables, security cards, use-case cards, implementation checklists, and a source page. Its expression changes when the information relationship changes because layout was chosen after the explanation was written.

## Text Fragmentation

PPTCreater has more text runs but fewer visible characters:

- PPTCreater: 446 runs, 4,289 characters, 9.6 characters per run
- Direct: 406 runs, 6,345 characters, 15.6 characters per run

This supports the reader observation that PPTCreater copy feels fragmented. Information is split into badges, kickers, short card labels, and compact captions. The issue is not simply "less text"; it is more containers carrying shorter fragments.

## Root Causes

### 1. The Markdown-to-MessageSpec path is not domain-generic

`createMessageSpecFromDocSpec()` in `packages/core/src/messageSpec.ts` searches for auth-web-specific sections such as `システムの目的`, `認証処理の流れ`, `認証結果コード`, `AD上の必須属性`, and `キャッシュ仕様`. It then emits a fixed auth-web slide sequence and even fixed conclusions such as CRANE AD, ROPC, and Entra migration.

This is not a general Markdown planner. Passing an unrelated technical report to this function can produce a structurally valid deck with the wrong narrative model.

The corrected XAA deck used a previously curated XAA Message Map rather than the current generic `from-markdown` MessageSpec path. This distinction is important: the successful XAA result does not prove that arbitrary Markdown planning is generic.

### 2. Slide-shaped planning compresses before narrative planning

The source has 38 H2/H3 headings. The curated Message Map has 22 intents and 5,168 visible-plan characters. Source sections are merged before a durable source-derived Narrative Outline decides which explanatory units must remain visible.

`SlideIntent` is already constrained to title, message, evidence, details, and a visual type. That representation encourages early condensation instead of preserving paragraphs, examples, protocol caveats, and transitions.

### 3. MessageSpec-to-MessageMap silently limits evidence

`deckMessageMapFromMessageSpec()` builds visible evidence and then applies `evidence.slice(0, 7)`. Remaining supporting blocks often move to `details` or notes.

There is no explicit omission record for each dropped block. The reader cannot tell whether information was intentionally summarized or silently removed.

### 4. Grammar renderers shorten and cap the information again

Examples in `packages/core/src/messageDeck.ts`:

- `narrativeItems()` returns only the first `max` items.
- Evidence boards display 3-5 items.
- Comparison fields use four items.
- Table systems render at most six rows.
- `topicLabel()`, `compactLabel()`, `leadSentence()`, and `visibleSentence()` transform complete source text into short labels.
- English fallback appends `matters.` to fragments.
- `splitTableEvidence()` falls back to `観点 NN` when semantic parsing fails.

These operations are useful for live presentation slides, but unsafe as the default behavior for technical handouts.

### 5. Dense handout mode optimizes slide count instead of information contracts

For report/handout decks with at least 18 intents, `denseExecutiveHandoutIntents()` targets 14 or 16 intents. It merges up to three intents and keeps only two or three evidence items per source intent, capped at six visible lines.

This policy can improve compactness, but it treats slide count as the invariant. A technical report should instead preserve source contracts and let slide count grow when necessary.

### 6. Current quality scoring rewards structure more than semantic completeness

The PPTCreater deck received P4 `99/A`, although OpenXML inspection found truncated words, generic labels, and less visible information than the direct deck.

`reviewSlideQuality()` currently scores many dimensions using proxies such as:

- Message Map presence
- agenda/summary/section-marker presence
- visual object count
- color count
- repeated layout count
- tiny text and truncation findings already known to lint

It does not directly score:

- source-section coverage
- visible source retention
- complete-sentence ratio
- unexplained omission count
- title-to-source semantic alignment
- narrative transition quality
- suspicious generated fragments

As a result, adding diagrams and navigation can raise the score while source meaning remains underrepresented.

For this fixture, the quality report gave P4 `99/A` while OpenXML still contained `matters.`, generic labels, and truncated product/protocol fragments. A quality verdict should be capped when source fidelity or language-integrity gates fail.

### 7. Candidate ranking cannot recover information already lost upstream

Communication Contracts, candidate rendering, PNG snapshots, and pairwise calibration improve expression selection after the Message Map exists. They are valuable, but they cannot restore paragraphs, caveats, or examples that were removed before candidate generation.

Accuracy must include source fidelity, not only relation-to-grammar compatibility.

## Recommended Target Pipeline

```text
Markdown
  -> Source DocSpec
  -> Source Section Graph
  -> Information Ledger
  -> Source-derived Narrative Outline
  -> Slide Communication Contracts
  -> Visible Copy Plan
  -> Expression Candidates
  -> Layout / Render
  -> Source Fidelity + Visual + Human Review
```

### Required ownership boundaries

1. Source parsing preserves every H2/H3 section, table, code block, example, caveat, and source term.
2. Narrative planning decides chapter order and slide grouping without choosing a visual grammar.
3. Copy planning decides visible prose, labels, details, and notes with explicit source trace.
4. Expression planning may split a slide but may not silently drop a visible information unit.
5. Layout may shorten only with a recorded transformation and an executable fidelity check.

## Implementation Priorities

### P0: Replace the fixed auth-web MessageSpec generator

Introduce a strategy boundary:

```ts
type MessageSpecStrategy = "generic-technical-report" | "auth-web-spec" | "explicit";
```

- `generic-technical-report` derives chapters from source H2 sections and slide candidates from H3 sections, tables, processes, and code examples.
- `auth-web-spec` keeps the current specialized behavior but runs only when explicitly selected or confidently detected.
- `explicit` consumes a supplied MessageSpec without heuristic rewriting.

Do not route arbitrary Markdown through auth-web-specific section names.

**Implemented 2026-07-10:** `createMessageSpecFromDocSpec()` now defaults to
`generic-technical-report`; `auth-web-spec` is an explicit strategy. The generic strategy uses H2
sections and their H3 children as source-ordered planning units, preserves all table rows as
MessageBlocks, and uses detail pages when a short source section has insufficient evidence for a
diagram. The exact XAA source now produces 33 content slides rather than a fixed auth-web outline,
with no auth-web-specific terms in the generated DeckSpec.

### P0: Add a Source Fidelity Gate before DeckSpec generation

For technical reports, block or require a waiver when:

- visible required-term coverage is below 100%
- source section coverage is below 90%
- a source section is omitted without a reason
- source-to-visible-plan retention is below 35%
- average visible target is below 220 characters per content slide
- generated text contains known fragments such as `matters.`, partial identifiers, or generic numbered labels

The gate should report source, MessageSpec, MessageMap, and DeckSpec retention separately.

**Implemented 2026-07-10:** generic technical reports now block when visible source-section
coverage is below 90%, must-visible term coverage is below 100%, or an omitted section has no
reason. The XAA fixture passes at 100% section coverage and 100% must-visible term coverage. Its
generated DeckSpec contains 11,365 visible characters, versus 4,289 in the prior PPTCreater deck.
The metrics do not yet report all four retention stages or enforce final rendered-character
thresholds; that remains follow-up work.

### P0: Make omission explicit

Replace silent `slice()` behavior with a result contract:

```ts
type VisibleSelection<T> = {
  visible: T[];
  notes: T[];
  omitted: Array<{ item: T; reason: string }>;
  requiresSplit: boolean;
};
```

If an item does not fit, split the slide or record why it moved. Never discard it only because a grammar supports fewer items.

**Implemented 2026-07-10:** `deckMessageMapFromMessageSpec()` no longer caps evidence at seven
items, and H3 splitting reduces the largest XAA MessageSpec unit from 68 to 21 blocks. Main
narrative evidence-selection paths now use a typed `VisibleSelection` contract.
Every narrative slide records visible, notes, omitted, and requiresSplit counts in speaker notes;
overflow evidence is copied to an explicit `Overflow evidence` note. The XAA fixture reports 150
visible evidence items, 84 overflow items in notes, zero omitted items, and 17 slides that may be
split in a later editorial pass.

The `from-markdown` planning output now includes `source-fidelity-report.json`. It reports
whitespace-normalized, duplicate-unit-filtered character ratios for Source, MessageSpec,
MessageMap, and DeckSpec; source-section and required-term coverage; and aggregate renderer
selection counts. The exact XAA fixture reports MessageSpec/source `0.9369`, DeckSpec/source
`0.5710`, section coverage `1.0`, and required-term coverage `1.0`. Generic technical reports now
fail before output when DeckSpec/source falls below `0.35` or renderer omissions are non-zero.

### P1: Preserve source chapter order

Generate `NarrativeOutline` from source hierarchy first:

- H2 becomes chapter or chapter group.
- H3 becomes a slide candidate or explicitly merged information unit.
- Every merge records source ids and rationale.
- Agenda and section markers use source chapter titles instead of inferred generic roles.

### P1: Separate prose and label transformations

`visibleSentence()` should not be used for labels, and `topicLabel()` should not be used for explanatory prose.

Define explicit copy roles:

- semantic title
- assertion
- complete explanation
- short label
- table header
- code token
- citation

Each role gets separate length and grammar rules. English prose must never receive a generic `matters.` suffix.

### P1: Prefer split over shrink for technical reports

When a grammar cannot show all required units:

1. generate a second slide,
2. choose a higher-density grammar,
3. move optional detail to notes with source trace,
4. only then shorten copy.

The current item cap should be a layout warning, not a deletion instruction.

### P1: Make source fidelity part of candidate Accuracy

Candidate Accuracy should combine:

- communication-relation fit
- required-term preservation
- source-section coverage
- visible information retention
- complete-sentence integrity
- comparison-axis/process-step completeness

A visually beautiful candidate must not pass Accuracy when it omits required source information.

### P2: Recalibrate quality review with human preferences

The pairwise benchmark should include both expression and content questions:

- Which deck explains the source more completely?
- Which has a more natural chapter flow?
- Which slide is understandable without speaker notes?
- Which is visually clearer?
- Which would you use as a technical handout?

Calibration should use multiple documents and reviewers. The current three-comparison smoke benchmark is insufficient for production weights.

## Acceptance Criteria for the XAA Regression Fixture

Use the current Markdown as a permanent regression fixture.

| Criterion | Target |
| --- | ---: |
| Required technical terms visible | 100% |
| H2/H3 sections visible, in notes, or explicitly merged | 100% |
| Sections omitted without reason | 0 |
| Source-to-visible-plan retention | >= 38% |
| Average visible chars per slide | 220-320 |
| Generic `要点/観点 n` labels | 0 |
| `matters.` filler | 0 |
| Partial technical/product words | 0 |
| Human preference vs current direct baseline | >= 60% wins |
| Quality verdict when source gate fails | no higher than C |

## Measurement Caveats

- Visible character counts include titles, navigation labels, and visible reference URLs in both decks.
- The direct deck includes a visible source-link page, which contributes part of its character advantage. Even after allowing for those URLs, the direct body remains materially denser.
- Character count is not a quality target by itself. It is used here with source coverage, fragment markers, and human preference to identify premature compression.
- The direct deck was manually composed in code for this source. It demonstrates the target behavior, not a generic generation algorithm.

## Recommended Delivery Sequence

1. Add the XAA source and direct-output metrics as a regression fixture.
2. Implement generic source-derived Narrative Outline.
3. Add Source Fidelity Gate and explicit omission records.
4. Refactor renderers to request split/overflow decisions instead of slicing.
5. Add semantic-completeness dimensions to quality review.
6. Re-run direct-vs-PPTCreater pairwise evaluation across XAA, auth-web, and at least three unrelated technical documents.

## Conclusion

PPTCreater currently performs well at deterministic layout, editability, and artifact safety, but it treats compact slide structure as the primary optimization target. The direct deck feels more natural because it preserves explanatory context and chapter logic before formatting.

The main correction is not to add more diagram templates. It is to make source fidelity and narrative continuity hard constraints before visual selection. Once those constraints exist, the newer candidate-rendering and human-calibration work can improve appearance without making the content thinner.
