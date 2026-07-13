# Deck Manuscript Format

## Purpose

A Deck Manuscript is the human-readable authoring source for the direct-authoring pipeline. It is reviewed before layout or figure selection. It contains the complete narrative, visible prose, notes, source references, and explicit editorial decisions.

It is not DeckSpec, MessageSpec, or a layout DSL.

## Required frontmatter

```yaml
---
version: "1.0"
title: "Deck title"
audience: "Who reads or hears this"
purpose: "Why this deck exists"
desiredAction: "What the audience should do"
thesis: "The deck-level claim"
sourceNotebookHash: "0123456789abcdef"
---
```

## Chapter and slide structure

```markdown
# Chapter title

> Why this chapter exists in the reader journey.

## Slide title

**Takeaway:** A complete claim that the reader should retain.

Complete visible prose belongs here. Paragraphs remain paragraphs. Lists remain lists. Tables remain tables.

**Figure brief:** Explain the relationship only if a figure improves understanding.
- Data shape: relationship
- Required: no
- Catalog hints: relationship-map
- Avoid: decorative cards

**Source refs:**
- src_0123456789abcdef

**Editorial decisions:**
- keep: The source paragraph is needed as visible explanation. [src_0123456789abcdef]

**Speaker notes:**
- Additional delivery context.
```

## Editorial rules

- Every source block must be referenced by at least one slide or listed in `sourceOmissions` with a reason.
- Merge and split decisions record all affected source IDs and an editorial reason.
- Omission is never inferred from slide count or layout capacity.
- Do not choose card counts, table row limits, visual grammar IDs, or coordinates in the manuscript.
- A figure brief describes the semantic need and may explicitly say that no figure is required.
- The manuscript should read naturally without PowerPoint.

## Lossless draft

`createLosslessManuscriptDraft()` creates an intentionally verbose starting point with every source block preserved. It is not a finished outline. A manuscript author then merges related source units, writes real takeaways and transitions, and records each decision without losing coverage.

```powershell
npm run source:notebook -- source.md generated/source-notebook.json
npm run manuscript:lossless -- generated/source-notebook.json generated/deck-manuscript.md
```

Run `assertCompleteManuscriptCoverage()` before Slide Program generation. Unknown source references, notebook hash drift, and unexplained source blocks are blocking failures.
