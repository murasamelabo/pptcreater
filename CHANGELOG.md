# Changelog

## Unreleased

- Added DeckSpec element hyperlinks so text, shape, SVG/diagram, and image elements can render as external clickable links in generated PPTX files.
- Added a lint gate for overlapping text inside embedded SVG/diagram visuals, preventing unreadable in-chart labels before PPTX delivery.
- Added a reusable `radar` schematic/figure intent for 4-8 axis score profiles, surfaced through `recommend_figure`, `generate_schematic`, MCP guidance, and deck-agent instructions.
- Adjusted deck-agent and MCP guidance so `radar`, `ranking`, `matrix`, and other figure kinds are presented as peer expression options chosen by slide message/data fit, not as individually privileged directives.
- Added `architecture` as a first-class `recommend_figure` intent that routes to `generate_native_diagram`, kept `timeline`/`gantt` as an allowed curated figure path, and updated deck-agent guidance to record role execution so users can tell whether the specialist agents actually ran.
- Added a compact-label lint gate so short chips/buttons do not silently wrap labels into cramped two-line text.
- Fixed Message Map deck generation so long user-request titles, quiet metadata, and evidence strings are not promoted into cramped visible labels; generated cover titles, callouts, contrast headings, and matrix point labels now use short topic labels instead of visible ellipses.
- Clarified that intentional text-rich slides are allowed when they use `detail`, `prose`, or `structured-text` layouts with headings, indentation, emphasis, color, and whitespace to reduce cognitive load.

## v0.5.44 - 2026-06-28

- **Fixed stretched image/illustration visuals.** Message-map side-image SVG assets are now fitted inside their image panel with the source aspect ratio preserved instead of filling the whole panel.
- **Preserved aspect ratio during PPTX rendering.** Non-decorative SVG and `image.dataUri` elements are contained within their requested frame using intrinsic image dimensions; decorative full-slide backgrounds still stretch by design.
- Added RED/GREEN regression coverage for side-image SVG bounds and PPTX picture extents.

## v0.5.43 - 2026-06-28

- **Added OCR-derived slide craft rules.** Local OCR of representative pages from the user's PowerPoint knowledge PDFs confirmed and added explicit guidance for audience-first messaging, deciding the message before opening PowerPoint, whitespace as a designed element, eye-flow/axis planning, and avoiding text that reads as a black block.
- **Expanded OCR coverage to both full PDFs.** All 458 rendered pages were OCRed locally (no external upload) and the first-pass rules now also cover weakening supporting elements, table/grid hierarchy, graph emphasis, arrows as supporting actors, image/photo usage, and learning from existing patterns before freeform layout.
- Added tests ensuring the first-pass slide creation rules include the OCR-derived principles in Japanese and English prompts.

## v0.5.42 - 2026-06-28

- **Added side-image message slides.** `SlideIntent.visualAsset` now supports official images, screenshots, photos, or SVG illustrations with source/citation metadata; `visualType: "image"` renders a left/right image panel beside the message and evidence.
- **Fixed icon/text overlap at the generator and QA level.** Flow-node icon placement no longer collides with step labels, and `review_visual_quality` now reports `visual.icon-text-overlap`.
- **Updated slide creation rules for source visuals.** Rules now guide agents to use official images only when usage rights are clear, otherwise recreate the idea as an editable diagram, and always include `altText`, `sourceId`, and `citation`.
- Added regression coverage for image-message layouts and SVG/text overlap detection.

## v0.5.41 - 2026-06-28

- **Improved Message Map deck visuals.** Message-generated slides now include reusable inline SVG icons so decks are not limited to plain text, boxes, and lines.
- **Fixed hub-map slide composition.** `ponchi-e` / map-like SlideIntent output now uses categorized panels with icons instead of a radial center node with diagonal connectors that can cross through labels.
- **Hardened visual QA for hub maps.** `review_visual_quality` now flags diagonal hub-map connectors and message-generated slides without icons/images/diagrams.
- Added regression tests that verify hub-map slides are categorized panels and all generated message slides include SVG visual elements.

## v0.5.40 - 2026-06-28

- **Added a Message Map deck generator.** `createDeckFromMessageMap` turns a `DeckMessageMap` / `SlideIntent[]` plan into a full editable DeckSpec with cover, closing, and varied message-first visual archetypes.
- **Added CLI and MCP entry points for message-first generation.** Use `pptcreater from-message-map` or MCP `create_deck_from_message_map` to generate a deck from one-message-per-slide intent instead of rerunning ad-hoc scripts.
- **Added visual archetype coverage for statement, flow, contrast, before/after, table, hub-map, and matrix slides.** The generator avoids repeated colored accent-bar cards and keeps matrix axes orthogonal.
- **Hardened Visual QA.** `review_visual_quality` now also catches non-orthogonal matrix axes and repeated layout runs that make decks look template-generated.
- Added real PPTX render regression coverage for the message-map-generated deck path.

## v0.5.39 - 2026-06-27

- **Removed repeated vertical accent bars from generated native schematic cards.** Native schematic cards now use neutral surfaces and badges/labels rather than the AI-looking colored line-card pattern.
- **Honored `style: "straight"` in native ponchi diagrams.** Relationship-map connectors can now render as one clean segment instead of being forced into jagged elbow routes.
- Prevented layout polish from shortening generated native schematic labels with ellipses, and fixed native table schematics duplicating the final row.
- Added Message Map / SlideIntent review APIs plus CLI/MCP tools so each slide can be checked for one clear message, evidence, visual type, and emphasis before rendering.
- Added Visual QA review APIs plus CLI/MCP tools to detect truncated text, inconsistent typography, and repeated AI-looking card patterns as a release gate.
- Added regression tests for schematic accent-bar removal, straight native ponchi connectors, no-ellipsis native schematic labels, and native table row counts.

## v0.5.38 - 2026-06-27

- **Blocked AI-looking repeated accent-bar card grids.** `lintDeckSpec` now raises `visual.accent-bar-card-repetition` when a slide repeats three or more colored vertical accent-bar cards, steering authors away from the common generated-slide look.
- Updated first-pass creation rules and `slide-craft-ja/en` guidance to forbid repeated colored accent-bar cards and convert those cases into table/contrast, matrix, flow, map, or ponchi-e visuals based on the slide message.
- Added TDD coverage for the new lint gate, including a safe case for one focal accent card.

## v0.5.37 - 2026-06-27

- Raised the comprehensive pattern gallery render test timeout to 20 seconds so the real 33-slide PowerPoint render remains part of CI instead of failing on slower GitHub Actions runners.
- Includes the v0.5.36 gallery coverage and native schematic fixes; v0.5.36 was not released because CI caught the timeout before release publication.

## v0.5.36 - 2026-06-27

- **Added a comprehensive pattern gallery render test.** The test builds and renders a real 33-slide DeckSpec that covers section dividers, detail explanation/Q&A/benefits slides, visual scaffold, SVG/image assets, diagram slides, and all 25 schematic pattern categories through the actual native schematic renderer.
- Added `createComprehensivePatternDeck()` and `COMPREHENSIVE_PATTERN_GALLERY_IDS` so future rendering/lint changes can validate broad slide-pattern coverage before release.
- Fixed real native schematic output issues found by the gallery: generated schematic connectors are now identified as generated output, correlation labels reserve space for sublabels, and layer labels reserve space for right-side notes.
- Followed a RED/GREEN test checkpoint: the new render test first failed on the missing gallery generator, then passed after the gallery DeckSpec generator and export were added.

## v0.5.35 - 2026-06-27

- **Blocked post-polish layout regressions during finalize.** `finalize` / `finalize_deck` now classify both the authored DeckSpec and the post-polish DeckSpec, so errors that remain or appear after layout polish (for example title/lead overlap or unresolved hand-routed connector diagrams) stop rendering instead of producing a broken PowerPoint.
- Added a regression test for finalize classification to ensure pre-polish polish-fixable items stay informational while post-polish errors become blocking.
- Verified the previously broken Agent 365 deck now exits with `rendered=false` and returns blocking errors instead of writing a damaged `.pptx`.

## v0.5.34 - 2026-06-26

- **Forced locale-specific slide-craft skill pack application.** `parseDeckSpec` now normalizes every deck to `slide-craft-ja` or `slide-craft-en` based on `locale`, so standard CLI/MCP/library parse paths always carry the PDF-derived slide-craft method even when a DeckSpec omits `skillPack` or specifies an older/custom pack.
- Strengthened the `content.slide-craft-skill-missing` lint from a warning to a blocking error for callers that bypass `parseDeckSpec` and feed raw DeckSpec objects into `lintDeckSpec`. The error reports the required locale-specific skill pack and points callers to `parseDeckSpec` / `ensureSlideCraftSkillPack`.
- Added regression tests covering automatic JA/EN skill-pack normalization and blocking raw decks that skip normalization. Full suite now at 332 tests.

## v0.5.33 - 2026-06-26

- **Made the slide-craft knowledge enforceable at lint/finalize time, not just advisory.** A real pptcreater-generated Defender/Sentinel deck used the renderer but still bypassed the PDF-derived craft rules because the DeckSpec did not declare `slide-craft-ja` and the quality gates did not inspect for those failure modes. New lint gates now block:
  - **Unstructured long detail prose** (`content.long-prose-unstructured`) when a detail/prose slide pastes one large body block instead of splitting it into headed blocks or short paragraphs.
  - **Compacted numbered prose** (`content.compacted-numbered-list`) when numbered items are flattened into one unreadable text run instead of separate lines/cards.
  - **KQL/code mixed into normal prose** (`content.code-block-needed`) so query text must live in a dedicated code/query block while explanation and verification criteria stay separate.
  - **Repeated card/table-only expression** (`visual.expression-variety`) when a deck relies heavily on card-grid slides and lacks enough diagrams, schematics, images, or generated native diagrams.
- Added a `content.slide-craft-skill-missing` warning when DeckSpecs omit `slide-craft-ja/en`, so future sessions can see when the craft pack was not applied during authoring. Built-in sample decks now declare `slide-craft-ja/en` by default instead of the older `slide-briefing-*` packs.
- Added regression tests for the Defender/Sentinel failure modes and a false-positive guard so ordinary prose containing words like "where", "project", "extend", and "by" is not mistaken for KQL. Full suite now at 330 tests.

## v0.5.32 - 2026-06-26

- **Applied the one-accent / no-category-coloring principle to the diagram generators (placement & coloring), not just the guidance.** The v0.5.30/0.5.31 slide-craft knowledge was guidance-only, so the figure generators still color-coded nodes by kind: `generate_native_diagram` and `generate_diagram` assigned a different hue per node kind (actor=indigo, system=blue, process=teal, data=green, note=amber, cloud=violet), turning any mixed-kind diagram into a rainbow — the exact "塗分け禁止 / one accent" anti-pattern the books warn against, and a color-only encoding of role. Changed the node styling so:
  - **Every node now shares a single accent** with a neutral surface; node `kind` selects the role icon/marker, not the fill hue, so mixed-kind diagrams stay calm and on-brand. Roles are differentiated by icon/shape and label, never by arbitrary color.
  - **The one focal node** can still stand out via `node.emphasis` (accent stroke + faint accent fill), and the accent is themeable: a new `accent` option on `generate_native_diagram` / `renderNativePonchiDiagram` recolors the whole diagram to the deck, and `node.accent` overrides a single node.
  - **The native diagram backdrop panel lost its hard border** (it was an empty bordered box around the figure); per "separate with whitespace, not boxes" it is now a soft borderless surface, with grouping still shown by the dashed group lanes.
- Added diagram regression tests (mixed-kind nodes share one accent and it is the brand accent, not the old per-kind violet; the `accent` option and per-node `accent` override are honored) and updated the `generate_native_diagram` tool description and MCP `diagramFlow` guidance. Full suite now at 326 tests.

## v0.5.31 - 2026-06-26

- **Deepened the slide-craft knowledge from the source books' body text and slide examples (not just their tables of contents).** The v0.5.30 packs were distilled from the books' chapter/section headings; this release reads the actual page content — via OCR of the body text and by visually studying the before/after slide examples — and folds the concrete, specific principles into the `slide-craft-ja` / `slide-craft-en` skill packs and the installed "Slide craft method" guidance (no verbatim reproduction of the copyrighted material; principles are re-expressed in our own words):
  - **Message-first process**: explanation before slides (the slide supports the spoken explanation, it is not a thinking tool); the audience is the protagonist (design from "what makes them agree and act"); distill each slide to one sentence; the **text-only-document test** (if it doesn't make sense as plain text, no figure will save it); fix the text first (most of a slide is text); choose the right symbol (text/figure/graph/photo) consciously.
  - **Structure & noise**: extract the bullet relationship (parallel/contrast/containment/sequence/causation) and map it to a figure; convert bullet lists into a labeled box grid (category header cell + item cells) sorted into rows/columns; reduce noise = cut / align / space; **whitespace is an invisible divider** — separate with space, not rules or boxes; gray-everything-first then a single accent.
  - **Figure discipline** (from the slide examples): don't let a figure float — give it a region and a title; differentiate roles by color/shape; keep arrows in a supporting role (not the star) and use direction/type to show what is exchanged; keep shape styles (corner radius, stroke, aspect ratio) consistent.
  - **Two-axis self-diagnosis**: amount of information × amount of decoration, avoiding the six failure types (too sparse / wall-of-text / decorative-photo crutch / flat-no-emphasis / crammed / over-decorated); a too-sparse deck is fixed by reworking content before design.
- Guidance/knowledge only (no runtime behavior change); the existing `skillPacks.test.ts` still validates both packs. Full suite unchanged at 324 tests.

## v0.5.30 - 2026-06-26

- **Added a message-first "slide craft" knowledge layer distilled from established slide-design practice.** Two new built-in skill packs — `slide-craft-ja` and `slide-craft-en` (listed via `list_skills`) — encode a craft loop for slides that land in three seconds: explanation before slides (verbalize the conclusion/big-picture/abstraction first), the audience is the protagonist (distill each slide to one sentence and make it the title/key message), extract the structure (parallel / contrast / containment / sequence / causation) then map it to a figure via `recommend_figure` / `list_schematic_presets`, subtract to clarify (make everything gray first, then one accent only where the eye must go), whitespace is an element (don't cram; step back to check legibility), build boxes then align and repeat with a Z reading path, label directly and make numbers big with bold-only emphasis, and route prose-heavy pages to `generate_detail_slide`. Each pack also lists deck anti-patterns to self-check against (too sparse / wall-of-text / decorative-photo crutch / flat emphasis / crammed / over-decorated).
- Added a **"Slide craft method" section** to the installed skills guidance summarizing the same message-first loop before the detailed visual-richness rules, and noted the new packs in the README. These are guidance/knowledge additions (no runtime behavior change); existing detailed design rules already covered alignment, one-message-per-slide, restrained color, direct labeling, and cognitive load.
- Added `skillPacks.test.ts` (schema validation, both-locale craft packs present, unique ids) and a guidance assertion for the new section. Full suite now at 324 tests.

## v0.5.29 - 2026-06-25

- **Made text-rich detail / Q&A / 得られること(benefits) slides first-class.** The visual-richness gate (`visual.richness-missing` per slide + `visual.richness-deck` 75% rule) is a blocking error that effectively prohibited word-heavy slides, so decks rarely carried a slide that explains something in fuller prose — even though strong reference decks (e.g. Slideland's 得られること and Q&A page types) use them deliberately. Added an explicit, opt-in **prose/detail slide type** so the few slides that genuinely need detailed text are allowed, while the deck stays mostly visual:
  - **New `generate_detail_slide` MCP tool** (and `createDetailSlide` core API) with three variants: `explanation` (concise heading + lead + accent-barred prose blocks), `qa` (Q/A pairs with Q/A badges), and `benefits` (numbered label + description list). It emits an accessible, overflow-safe slide with a `detail`/`qa` layout marker, AA contrast, explicit reading order, and concise headings — fuller copy goes in the body/answer/description. Up to 6 items/blocks per slide (extras are dropped with a warning).
  - **Lint exemption.** Slides whose `layout` is `detail`/`prose`/`qa`/`q-a`/`qanda`/`q-and-a`/`faq` are exempt from `visual.richness-missing` and excluded from the `visual.richness-deck` denominator, so detailed paragraphs no longer need a figure to render. Their body/callout copy may be 14-16pt (the `text.small-font` recommended floor is relaxed to 14pt on these slides); the hard readable floor (`layout.text-too-small-to-read`, 12pt) and AA contrast are unchanged.
  - **Content review relaxed.** `content.body-prose` and `content.too-many-bullets` are no longer raised on detail/Q&A slides (fuller prose is the point there), but the concise-title/message checks still apply — titles and headings stay short.
  - **Abuse guard.** A new advisory `visual.prose-heavy` **warning** (non-blocking) fires when prose/Q&A slides outnumber the visual body slides, keeping detail slides the exception so the deck stays scannable.
- Updated the installed skills (workflow step + visual-richness rule), the MCP server guidance (`proseDetailSlides`, `recommendedWorkflow`), and the README design principles to document when to use detail slides and that titles/headings stay concise while bodies may carry fuller explanation.
- Added `proseDetail.test.ts` (generator variants, item cap, richness-exemption, prose-heavy warning, content body-prose suppression). Full suite now at 321 tests.

## v0.5.28 - 2026-06-25

- **Fixed layout polish shrinking taller multi-column cards to the tightest column's height.** On a user's "全体の仕組みと接続方式" slide the central tile collapsed (its two text lines spilled out of the box), and on the "導入の7ステップ" slide the side columns' cards were squeezed flat. Root cause: `expandCardsToContainContent` unifies cards that share a top-y into one row height, capping the row by the **minimum** available vertical room (`limit`) across its members. When columns have different card counts — e.g. a 3-card middle column whose top card sits beside 2-card side columns, or a tall hub tile sharing a top-y with a small neighbouring sub-card — the tightest column's `limit` was wrongly applied to the roomier columns, shrinking them. Row-unification now runs only when the row's members have comparable vertical room (their `limit`s diverge by ≤ `ROW_LIMIT_DIVERGENCE` = 0.3in); otherwise the cards belong to different column structures and are sized individually (grow-to-fit only, never shrunk to an unrelated neighbour). Genuine uniform grid rows (equal room) are unchanged, so the existing "shrink oversized cards in a row" and "keep card rows uniform" behaviours still hold.
- Added a layout regression test (a 3-card middle column sharing its top-y with 2-card side columns) asserting the side cards keep their taller authored height while the middle cards stay short. Full suite now at 314 tests.

## v0.5.27 - 2026-06-25

- **Fixed layout polish growing a stacked card straight over the card below it.** A user's "導入の7ステップ" phase slide stacked three cards in its middle column with an exact 0.12in gap; after `finalize_deck` / `--polish`, the upper two cards rendered fused into one box with hairline divider lines while the side columns stayed cleanly separated. Root cause: in `expandCardsToContainContent`, the text-fit growth caps a card's height at the next blocking element below it, but the blocker test used `candidate.y > card.y + card.h + 0.12` — a dead zone that **ignored any sibling whose top sat within 0.12in below the card bottom**. With the gap exactly 0.12in, the sibling was skipped, so the card grew to fit its label and overlapped the next card by ~0.03in. Changed the threshold to `card.y + card.h - 0.12` so a tightly-stacked sibling is recognised as a blocker and the card is capped (keeping the `CARD_BLOCK_GAP` spacing) instead of overrunning it. Same-row neighbours (`candidate.y ≈ card.y`) remain excluded, so multi-column card rows are unaffected.
- Added a layout regression test (three cards stacked with a 0.12in gap + fit-triggering labels) asserting no card extends into the card below it. Full suite now at 313 tests.

## v0.5.26 - 2026-06-24

- **Hardened the multi-agent routing and figure-tool guidance so the deck-building agents actually get used.** Analysis of two real Copilot CLI sessions showed the installed deck agents were barely engaged: figures were hand-built, the figure MCP tools (`recommend_figure` / `render_design_component` / `generate_native_diagram` / `generate_schematic`) were bypassed by a hand-written script that imported `@pptcreater/core` directly, and `review_deck` was skipped in favor of a generic code review. This is a guidance/text-only release (no runtime behavior change) that tightens four surfaces so the agents and tools are used as designed:
  - **(A) Imperative delegation.** The installed Copilot/Claude instruction blocks and the skills "Multi-agent orchestration" section now state that you **MUST** delegate multi-slide, important, executive, or customer-facing decks to the Deck Director rather than treating it as optional advice.
  - **(B) Host-independent Director.** The embedded and source `deck-director.agent.md`, plus `docs/AGENTS.md`, now describe the Director as host-independent: when the host can spawn sub-agents it dispatches to the specialists; when it cannot, it plays each role itself and **returns an executable step-by-step plan** — it never skips the plan, the figure tools, or the review gate.
  - **(C) `review_deck` required gate.** The instruction blocks, skills workflow (step 17), the Director agent loop, and a new MCP `reviewGate` guidance entry make `review_deck` the **required** quality gate before a deck is declared done; a generic code review is explicitly **not** a substitute.
  - **(D) No self-authored generation scripts.** The instruction blocks, skills (workflow step 21), the Director principles, `docs/AGENTS.md`, and a new MCP `noSelfAuthoredScripts` guidance entry prohibit building/rendering a deck by writing your own script that imports `@pptcreater/core` (or using PowerPoint COM / ad-hoc PPTX assembly), since that bypasses the figure tools and the review gate and causes clipped node text, dangling connectors, and unused curated zukai figures.
  - Each SlidePlan must now name its figure via `recommend_figure` (design-pack component vs schematic kind) so the Designer realises it with the matching tool instead of hand-placing boxes and connectors.
- No schema/renderer/selector changes; full suite unchanged at 312 tests.

## v0.5.25 - 2026-06-24

- **Added color-tone support to `render_design_component` so curated figures fit any deck (light or dark).** A curated design-pack figure is authored on a light slide background that is NOT carried when the figure is transplanted into another deck, so dropping a zukai figure into a dark-template deck previously lost its backdrop and rendered its dark catalog title dark-on-dark. `render_design_component` / `renderDesignComponentDeck` now accept:
  - `tone` (`light` default | `dark`): emits a full-bleed backdrop (`#F4F7FC` for light, a dark navy for dark) so the figure is self-contained and readable in any deck; the dark tone also lightens the figure's dark catalog title.
  - `background`: overrides the backdrop color, or `"none"` to inherit the deck/template (so a figure integrates into an existing dark master without an extra full-bleed layer).
  - `recolor`: an explicit list of `{ from, to, scope }` remaps (`scope`: `text` | `fill` | `all`) applied to the transplanted figure. An explicit `recolor` **replaces** the tone default — pass `recolor: []` to disable re-coloring entirely. This matters for figures like `comparison` where the catalog title hue is also used for card-body text on white cards (which must stay dark).
- **New `pptxSlide.recolor` DeckSpec field** with scoped (`text`/`fill`/`all`) `srgbClr` remapping in the transplant, so any transplanted PowerPoint figure can be re-toned without editing the source file.
- Added render + core regression tests (scoped recolor rewrites only text/fill colors; dark tone emits a backdrop + title recolor; `background: "none"` inherits without a backdrop). Full suite now at 312 tests.

## v0.5.24 - 2026-06-24

- **Steered figure guidance to the curated zukai design pack first.** `recommend_figure` already recommends a curated `design-pack` component (via `render_design_component`) for most figure kinds and only falls back to a generated `schematic` when no curated component exists — but the prose guidance added in v0.5.22 (`figureAdoption`) over-emphasized the generated tools (`generate_schematic` / `generate_native_diagram`) and barely mentioned `render_design_component`, so an agent would skip the professionally designed zukai figures. Rewrote the `figureAdoption` MCP guidance, the installed skills workflow step + design rule, and the README to make the flow explicit: follow `recommend_figure`'s `renderer` — when it returns `design-pack`, **prefer `render_design_component`** with a component of the recommended `kind` from the zukai pack (the 14 figure kinds flow-horizontal/flow-vertical/cycle/before-after/matrix/venn/formula/comparison/scale/step/gantt/list-vertical/list-horizontal/list-enumeration, plus tree), filling every catalog placeholder with `textReplacements` and matching the node count with `nodeOperations`; only fall back to the generators when `renderer` is `schematic`. Also documented that `○/△/✕` comparison marks are colored icon shapes and must not be changed via text replacement.
- No code/behavior change to the selector or renderers (they already prefer design packs); this is a guidance-only release so agents actually use the curated figures. Full suite unchanged at 310 tests.

## v0.5.23 - 2026-06-24

- **Fixed a false positive where `generate_schematic` output was flagged as a hand-built connector diagram.** While rebuilding a user's broken flow/timeline slides with the generators as a test, the schematic generator's own native output (flow/step/cycle) tripped `diagram.native-connectors`: its connectors use `<prefix>-…-arrow-<i>(-a|-b|-c)` ids and its node cards use `<prefix>-…-card` ids, which the lint exemption did not recognize (it only knew `generate_native_diagram`'s `-connector-<i>-<j>` / `-node-…` conventions). Combined with the v0.5.22 escalation, a schematic with 4+ arrow segments would have wrongly **blocked** rendering. The exemption now also recognizes the schematic id conventions, so legitimate generator output is never flagged. Hand-placed arrow diagrams are still flagged (warning, or error when complex).
- Added a lint regression test that schematic-style output (4 `-card` nodes + 4 `-arrow-<i>-c` arrow-headed connectors) produces no `diagram.native-connectors` finding. Full suite now at 310 tests.

## v0.5.22 - 2026-06-24

- **Push agents to adopt the figure generators instead of hand-building diagrams.** Investigating a user deck showed its flow and timeline diagrams were hand-built from raw shapes + manually placed connector lines (not `generate_native_diagram` / `generate_schematic`), which is why arrows left gaps to their boxes and timeline-card body text clipped. Added an explicit "adopt the figure generators" guideline across the MCP guidance (`figureAdoption`), the installed skills file (a workflow step + design rule), and the README: before hand-placing node boxes + connectors, timeline rails, comparison columns, or step rows, call `recommend_figure` / `list_schematic_presets` and use the recommended generator — `generate_schematic` auto-fits each label so node text never clips, `generate_native_diagram` routes connectors border-to-border so arrows never dangle. Hand-built shape compositions stay appropriate only for simple, short-label layouts.
- **Escalated `diagram.native-connectors` to a blocking error for complex hand-built flows.** It remains a warning for a small flow (which can line up by luck), but once a slide hand-places **4+ connectors** for a connected diagram — the regime where hand-routing reliably dangles/pierces/leaves gaps — it now blocks rendering and forces `generate_native_diagram`. The message is severity-aware and points to `recommend_figure`. Built-in sample decks and simple flows are unaffected (they use 0–1 arrow connectors).
- Added a lint regression test for the 4+-connector escalation (error + `report.ok === false`); the existing small-flow warning test is unchanged. Full suite now at 309 tests.

## v0.5.21 - 2026-06-24

- **Extended template-overdraw detection to content (middle) slides.** v0.5.20 only flagged a generated hero over an embedded template's cover/closing slide. But `create_pptx`/`createSampleDeck` (and authored decks) can also put a full-bleed atmosphere background on **content** slides, which hides the template's content layout/branding the same way. Render now emits `template.content-overdrawn` for any content slide that draws a full-canvas generated `svg`/`shape` background over an embedded template. Detection is precise: it uses a full-canvas predicate (anchored near the origin and spanning ≥92% of the canvas in both axes), so drawing cards/diagrams on the template's content layout — the intended way to fill a template — is **not** flagged, and a centered/inset visual is not mistaken for a background. The fix guidance points to removing the full-bleed background or re-skinning with `apply_template_design`.
- Tightened the cover (`template.cover-overdrawn`) full-bleed check to the same full-canvas predicate so a captured cover image or an inset visual is not mis-flagged; the ≥3-generated-shapes heuristic for cover heroes is unchanged.
- Updated the `templateFlow` MCP guidance, the installed skills "Using a provided PowerPoint template" section, and the README to document `template.content-overdrawn` and clarify that content shapes on the template are expected.
- Added two render regression tests (content full-bleed background warns; content cards without a full-bleed background do not). Full suite now at 308 tests.

## v0.5.20 - 2026-06-24

- **Made imported PowerPoint templates reliably and faithfully used, with explicit warnings when they are not.** Two failure modes were previously silent: (1) a deck that referenced a template id which was not registered (or registered without the embedded `.pptx`/`.potx` package) rendered with the default master plus generated shapes/backgrounds — only *mimicking* the template; (2) a deck that referenced a real embedded template but drew its own generated hero/cover (accent bars, chips, side panels, full-bleed backdrop) over the template's own cover, hiding it. `render_pptx` / `create_pptx` / `finalize` now surface these as render warnings:
  - `template.package-not-embedded` — the referenced template id is not registered, or is registered without the embedded PowerPoint package, so the real slide master/layouts were NOT embedded. Fix: `import_template` with `register=true` (CLI `template import --register`) and reference that id.
  - `template.cover-overdrawn` — the master was embedded, but a cover/closing slide draws ≥3 generated shapes or a full-bleed generated `svg`/`shape` backdrop over the template's own cover. Captured cover images and intentional full-bleed photos are not flagged, so the faithful `scaffold_from_template` cover stays clean. Fix: build that slide from `scaffold_from_template`.
- The CLI `render` and `finalize` commands print these template warnings (`TEMPLATE <code> <path>: <message>`); MCP returns them in the render result `warnings` array.
- Sharpened `import_template`, `scaffold_from_template`, and `apply_template_design` tool descriptions and added a `templateFlow` guidance entry + a "Using a provided PowerPoint template" section in the installed skills file, the README, so agents register the template binary, reference its id, start from the template's own cover, and never overdraw it.
- Added five render regression tests (unregistered id, built-in id, registered-without-package, generated-hero overdraw, and faithful captured-image cover). Full suite now at 306 tests.

## v0.5.19 - 2026-06-24

- **Raised the sample/quick-deck slide-count limit from 4 to 40.** `create_pptx`, `create_powerpoint`, and `create_deck` (and the underlying `createSampleDeck`) previously capped at 4 slides; requesting more silently returned 4. They now generate up to 40 slides: the three intro/content slides are kept, the closing slide stays last, and the requested number of extra content slides are inserted in between as alternating card/step sections with distinct, section-numbered titles (JA/EN) so they stay lint-clean, visually rich, and accessible. The CLI `pptcreater new --slides` parser and the MCP `create_pptx` / `create_powerpoint` / `create_deck` schemas now accept `1..40` (matching `plan_business_deck`).
- Added a regression test that a 12-slide sample deck has unique slide ids and titles, keeps the closing slide last, and lints clean in both locales. Full suite now at 301 tests.

## v0.5.18 - 2026-06-24

- **Wired the entry-point routing that hands deck requests to the agent team.** Installing custom agents alone did not make them get used — nothing told the base assistant when to delegate. The installed instruction block (`.github/copilot-instructions.md` / `CLAUDE.md`) now explicitly routes multi-slide, important, executive, or customer-facing decks to the `deck-director` agent (which sequences the specialists and uses `review_deck` as the stop condition), while still allowing a quick single slide to be handled directly. The `pptcreater-skills.md` file gained a "Multi-agent orchestration" section describing the six agents, the hand-off contracts, and how `review_deck` routes each finding to its owner role.
- Clarified in `docs/AGENTS.md` that routing has two layers: entry routing (host + installed instruction block selecting the Director) and deterministic issue routing (`reviewDeck`/`ownerForCode` → `review_deck`).
- Added regression assertions that the installed instruction block and skills file reference the Deck Director and `.github/agents`. Full suite stays at 300 tests.

## v0.5.17 - 2026-06-24

- **`install-copilot` / `install-claude-code` now install the deck-building custom agents.** Both commands copy the six `*.agent.md` definitions (`deck-director` plus the five specialists) into the target project's `.github/agents/`, so the multi-agent workflow is available immediately after install — not just the skills file and instruction block. The agents are embedded in the CLI so this works from a published npm package. Existing agent files are preserved unless `--overwrite` is passed; use `--no-agents` to skip them. The commands remain idempotent.
- Added `installAgents` to the install API and `agentPaths` to its result. Added regression tests covering agent installation and the `--no-agents` skip. Documented in the README install section. Full suite now includes 299 tests.

## v0.5.16 - 2026-06-24

- **Shipped Copilot CLI / VS Code custom agents for the six-role pipeline (multi-agent Phase 3).** `.github/agents/` now contains ready-to-use `*.agent.md` definitions: `deck-director` (orchestrator), `deck-story-architect`, `deck-content-strategist`, `deck-designer`, `deck-copywriter`, and `deck-reviewer`. Each agent uses the pptcreater MCP server, follows the hand-off contracts (DeckBrief → DeckOutline → SlidePlan[] → DeckSpec → DeckReviewReport), and the Director drives the loop with `review_deck` as the deterministic stop condition.
- Documented the custom agents in `docs/AGENTS.md` (usage + Phase 3 status) and the README multi-agent section. No code changes; tooling and tests are unchanged (297 tests).

## v0.5.15 - 2026-06-24

- **Added deterministic figure selection (multi-agent Phase 2): the Content Strategist → Designer bridge.** `selectFigure` maps a slide's one-sentence message — or an explicit `figureKind` — to a concrete renderer choice: a curated, fully-editable design-pack component (`render_design_component`) when a matching kind exists, otherwise a generated native schematic (`generate_schematic`). It returns the renderer, the concrete kind, the expected item-count range (with an out-of-range warning so slides get split/simplified), a rationale, and ranked alternatives. The matcher is keyword-driven across 21 figure intents with Japanese + English cues and prefers curated components to keep decks editable.
- Exposed figure selection through the CLI (`pptcreater figure --message "…"`, `--kind`, `--items`, `--list`) and MCP (`recommend_figure`). Added `recommend_figure` to the Designer and Content Strategist role tool lists.
- Documented figure selection in `docs/AGENTS.md` and the README multi-agent section. Added figure-selector unit tests (JA/EN intent matching, explicit kind + alias resolution, item-range warnings, full intent catalog). Full suite now includes 297 tests.

## v0.5.14 - 2026-06-24

- **Added a multi-agent slide-authoring framework with a deterministic review gate.** A new `director` core module defines a six-role pipeline — Director (orchestrator), Story Architect, Content Strategist, Designer, Copywriter, and Reviewer — each with an explicit hand-off contract (what it consumes/produces) and the pptcreater tools it uses, surfaced via `describeAgentPipeline` / `AGENT_ROLES`.
- **`reviewDeck` is the deterministic Reviewer / stop condition.** It runs the existing lint, content, and business reviews in one pass, classifies every finding as blocking / polish-fixable / advisory, scores the deck (accessibility / content / structure / overall, 0–100), and routes each issue to the agent role that owns the fix (`ownerForCode` with prefix fallbacks). The deck is "done" when there are no blocking issues; polish-fixable items are resolved automatically by `finalize_deck`.
- Exposed the framework through the CLI (`pptcreater agents`, `pptcreater review <deck> [--no-business] [--json]`) and MCP (`list_agent_roles`, `review_deck`).
- Documented the roles, contracts, pipeline, routing table, and iteration loop in `docs/AGENTS.md`, with a README pointer. Added director unit tests (pipeline shape, aggregated gate pass/fail, owner routing, business-review toggle). Full suite now includes 287 tests.

## v0.5.13 - 2026-06-24

- **Generalized node add/remove (`nodeGroups`/`nodeOperations`) to non-tree figures via a cluster engine.** The `pptxSlide` element now supports four `layout`s in addition to `tree`: `linear-x`, `linear-y`, `staircase-x`, and `radial`. A "cluster" is a node's full visual unit (card/panel/bar frame + its title, number badge, accent bar, etc.), detected by band-partitioning the slide; clusters are repositioned along an axis within the original footprint, "between" connectors (arrows/chevrons) are regenerated per gap, spanning buses (timeline spines) are resized, optional `renumber` rewrites numeric badges, and `radial` rings re-distribute nodes by angle (auto-excluding a centroid hub such as a PDCA badge). New group fields: `layout`, `connectorBetween`, `renumber`.
- **Enabled node add/remove on 33 `zukai` components across 7 figure kinds** — flow (horizontal/vertical), cycle, step, gantt, and lists (vertical/horizontal) — each verified by rendering an add+remove gallery to PNG via PowerPoint. Decorative/special-geometry patterns (diagonal lines, triangles, dotted rings, alternating central-bus) and fixed-geometry/multi-axis figures (matrix, venn, formula, scale, comparison, before-after, list-enumeration) intentionally remain text-edit-only, so every shipped editable group is visually verified not to break.
- Design components can declare `editableGroups` with the new fields; `renderDesignComponentDeck` and the MCP `render_design_component` tool pass them through to `pptxSlide.nodeGroups` and merge caller `nodeOperations`.
- Added cluster-engine unit tests (linear-x add/remove/footprint-fit/renumber/connector regeneration, full-cluster clone) and a design-pack layout-passthrough test. Full suite now includes 281 tests.

## v0.5.12 - 2026-06-24

- **Added the `zukai` design pack: 14 figure types × 83 curated schematic components.** Alongside the `tree` pack, pptcreater now ships a curated "図解デザイン大全" pack covering horizontal/vertical flow, cycle, before/after, matrix, venn, formula (cross), comparison, scale, step, gantt, and three list styles (vertical, horizontal, enumeration). Each figure type is a `kind` with 5-6 human-designed variations, all transplantable as fully editable PowerPoint shapes/text via `pptxSlide` (no flattened images).
- **Generalized design-pack discovery to any number of packs.** `listDesignComponents` now scans every `<root>/<pack>/manifest.json` (previously only `tree`), so packs compose without code changes. `kind` filtering spans all packs; component ids stay unique per pack (`flow-horizontal-p1`, `matrix-p1`, …). The CLI `design list [kind]` / `design render`, and MCP `list_design_components` / `render_design_component`, transparently surface the new components.
- Added `scripts/build-deck-map.mjs` + `scripts/build-zukai-manifest.mjs` (pack-authoring helpers that derive the manifest from a source deck) and `scripts/generate-zukai-gallery.mjs` (`npm run sample:zukai-design`) which renders all 83 components for visual QA. All 83 transplanted slides verified as single-`spTree`, editable, and visually intact via PowerPoint PNG export.
- Added regression coverage for multi-pack discovery and kind filtering. Full suite now includes 278 tests.

## v0.5.11 - 2026-06-23

- **Added structural node add/remove to the `pptxSlide` element via `nodeGroups` + `nodeOperations`.** Curated tree components can now have nodes added or removed, not just relabelled. Each design component declares `editableGroups` (a sibling set with an axis and member texts); `nodeOperations` then issues `{ op: "remove", target }` or `{ op: "add", group, label, cloneFrom? }`. The engine re-lays-out the affected sibling group **within its original footprint**, preserving the curated gap:box ratio so boxes and gaps shrink/grow together — nothing collides with neighboring groups or dangles. Removing down to a single child drops the connector bus and re-centers the box under its parent; removing all children removes the group's connectors too.
- The relayout repositions each sibling's drop connector and resizes the parent bus automatically, and added nodes clone a sibling's box/label (and drop connector) so styling stays consistent. Operations run before shape-id renumbering and relationship rewriting, so media/relationship handling is unaffected; structures containing group shapes are left untouched as a safety guard.
- `design-packs/tree` now declares `editableGroups` for the vertical-org, horizontal, and logic trees (the leaf sibling groups with room to re-fit). `renderDesignComponentDeck(componentId, { nodeOperations })` and the MCP `render_design_component` tool accept `nodeOperations` (and `textReplacements`); `list_design_components` surfaces each component's `editableGroups`.
- Added `scripts/generate-tree-nodes-gallery.mjs` demonstrating add+remove on all three editable trees, and a `pptxSlideNodes` unit test suite covering remove/add/footprint-fit, group-shape safety, and unknown-target no-ops. Full suite now includes 277 tests.

## v0.5.10 - 2026-06-23

- **Added `textReplacements` to the `pptxSlide` element for reusing curated design components with custom data.** A transplanted slide component previously copied the source slide's placeholder text verbatim. You can now substitute the text of individual runs either by 0-based run index (`at`) or by exact original text (`match`); replacements are XML-escaped automatically and applied after shape-id renumbering and relationship rewriting, so existing media/relationship handling is unaffected. `renderDesignComponentDeck` accepts an optional `textReplacements` array to pass the same data through the core/CLI/MCP surfaces.
- Added `scripts/generate-tree-varied-gallery.mjs` (and the `npm run sample:tree-design` script for the as-shipped gallery) that renders the seven curated tree components with substituted, domain-specific data (EC org chart, document taxonomy, MECE cost tree, launch WBS, support-triage decision flow, hiring mind-map, product-strategy pyramid). The visible box count is fixed by each curated component's geometry; `textReplacements` changes the labels inside those boxes.
- Documented `textReplacements` in the README Design Asset Packs section. Added regression coverage for index- and match-based text substitution (including XML escaping); full suite now includes 272 tests.

## v0.5.9 - 2026-06-23

- **Added curated Design Asset Packs and a `pptxSlide` DeckSpec element.** A deck can now transplant a fully human-designed PowerPoint slide component (the `<p:spTree>` shapes and text of a curated source slide) into a generated slide, keeping every object editable in PowerPoint instead of flattening it to an image or approximating it with generated geometry. Source slides are loaded from a local in-workspace `templatePath` or an inline `templateDataUri`; relationships are copied and shape ids are renumbered to avoid collisions.
- **Shipped the first design pack: `design-packs/tree`.** Seven curated tree-diagram components (vertical org, horizontal, logic, indented, decision, radial/mind-map, pyramid) sourced from a human-designed OpenXML deck, each described with `bestFor` hints and authoring constraints in `design-packs/tree/manifest.json`.
- **Exposed design packs through the CLI and MCP server.** New CLI commands `design list [kind]` and `design render <componentId>`, plus MCP tools `list_design_components` and `render_design_component`, let agents discover curated components and emit a ready-to-render DeckSpec that uses them.
- `pptxSlide` now counts toward slide visual richness in the linter, and the renderer adds the component's long description to speaker notes for accessibility.
- **Hardened the relationship and media copy path for `pptxSlide` transplants.** Relationship ids are rewritten in a single pass so distinct source references can no longer collapse onto one id, and embedded media (images, SVGs, etc.) are copied under fresh non-colliding part names — reusing an existing deck part only when the bytes are identical — with their content types registered in `[Content_Types].xml`. This prevents future packs that contain images or charts from corrupting deck media.
- Added regression coverage for design-pack loading/DeckSpec generation, for curated slide transplant (inline `spTree` insertion with no nested shape trees), and for the media relationship rewrite (distinct embeds and media survive a part-name collision with existing deck media); full suite now includes 270 tests.

## v0.5.8 - 2026-06-23

- **Raised the quality bar for the first five high-value native schematics (`cycle`, `tree`, `correlation`, `matrix`, `gantt`).** These kinds now have SmartArt-style, kind-specific native layouts instead of simple card approximations: tree uses a root/bus/child hierarchy, cycle uses a ring with numbered circular nodes and a central loop label, correlation uses a hub-and-spoke layout, matrix uses true 2x2 quadrants with axes, and Gantt uses a header/grid plus timeline bars.
- **Added SmartArt OpenXML transplant support.** DeckSpec can now include `smartart` elements that copy a real SmartArt `graphicFrame` plus its `ppt/diagrams/data|layout|quickStyle|colors|drawing` parts from a template PPTX/POTX into the generated deck. This enables true PowerPoint SmartArt PoCs without relying on flattened images.
- Added layout contract tests for the five core schematics and a SmartArt transplant regression test. Full suite now includes 267 tests.
- Regenerated the GitHub Copilot schematic QA deck as `generated/copilot-diagram-catalog-v058.pptx`.
- Validated the SmartArt transplant path with a local PoC deck containing hierarchy, org chart, horizontal hierarchy, and radial SmartArt examples.

## v0.5.7 - 2026-06-22

- **Restored the semantic shape of all 25 native schematic kinds.** The first native schematic implementation made all presets editable, but several kinds collapsed into generic card lists. Native schematics now preserve their intended visual grammar: tree hierarchy, cyclic loop, map pins and legend, honeycomb/puzzle clusters, hub-and-spoke correlation, set groups, bubble scale comparison, concentric growth rings, Gantt bars, ranking bars, mockup window, equation/cross, stair steps, stacked layers, and other kind-specific structures.
- Native schematic connectors that would otherwise be diagonal are routed as orthogonal horizontal/vertical segments so PowerPoint rendering cannot mirror their direction. Added regression coverage for safe orthogonal schematic connector segments; full suite now includes 265 tests.

## v0.5.6 - 2026-06-22

- **Structured schematic diagrams (`generate_schematic`) now return editable native PowerPoint shape/text elements.** The previous schematic path returned only SVG, so table/tree/flow/list/mockup and the other 25 schematic presets became flattened images in PowerPoint. `generate_schematic` now returns `elements` for direct insertion into DeckSpec slides while keeping the SVG output as a backward-compatible fallback.
- Added `renderNativeSchematicDiagram` covering all 25 schematic kinds (`table` through `mockup`) with native `shape`/`text` elements. The native renderer preserves the original visual grammar where possible — tree hierarchy, process flows, cycles, before/after panels, map pins, honeycomb/puzzle grouping, hub-and-spoke correlation, matrix quadrants, Venn overlap, equation/cross, set groups, bubble scale comparison, concentric growth rings, stacked layers, pyramid, stair steps, Gantt bars, rankings, lists, and UI mockup — instead of collapsing them into plain card lists. The GitHub Copilot diagram catalog was regenerated as `generated/copilot-diagram-catalog-semantic.pptx`, and slides 01-25 now contain no image/SVG/diagram elements.
- Added regression coverage that every schematic kind can render as editable native elements, including optional table cells without invalid empty text; full suite now includes 264 tests.

## v0.5.5 - 2026-06-22

- **Improved native ponchi-e readability and editability.** Auto-laid-out native diagrams now use wider cards, slightly smaller gaps, and a reserved top band so labels do not collide with accent bars or kind markers. Directly aligned adjacent nodes now use a single border-to-border connector segment instead of split half-lines.
- **Rendered line elements are now emitted as PowerPoint connector shapes (`p:cxnSp`).** This keeps native ponchi-e arrows editable as connectors in PowerPoint rather than ordinary line shapes. Regression tests verify connector XML output and that no `prst="line"` ordinary shape remains for generated connector lines.
- Added regression coverage for non-overlapping native node labels, multi-line node text staying inside the node bottom, and single-segment adjacent connectors; full suite now includes 262 tests.

## v0.5.4 - 2026-06-22

- **Fixed contrast repair for `.potx` masters that define dark backgrounds through `p:bgRef`.** Some PowerPoint templates, including Microsoft Security 2602, define the slide background as `<p:bgRef idx="1001"><a:schemeClr val="bg2"/></p:bgRef>` rather than a solid fill shape. Rendering now resolves that background reference through the slide master's referenced theme and treats `bg2` as the dark theme background for master-background contrast repair, so titles and lead text no longer remain black on the dark master.
- Extended the imported `.potx` render regression fixture to use an unused `theme1.xml` plus a master-referenced `theme2.xml` with a `bgRef` dark background, covering the same class of multi-theme/theme-reference bug during render.

## v0.5.3 - 2026-06-22

- **Improved readability when real `.potx` slide masters use dark backgrounds.** Rendering now infers the imported template's master/layout background (using the theme referenced by the slide master, not the first theme by zip order) and repairs free-standing slide text to a readable black/white color before writing PowerPoint XML, while preserving dark text inside explicit light cards/panels. This prevents title, lead, and generated reference text from remaining black on a dark master background.
- **Reference/source slides now include an accessible reading panel.** The automatically generated `参考URL・出典` / `References and sources` slide now places text on a surface panel with contrast-aware colors, so source URLs remain readable even when the imported master uses a dark or image-heavy background.
- Added regression coverage for dark imported `.potx` masters, source-reference slide contrast, and `_rels/*.rels` content-type safety; full suite remains at 259 tests.

## v0.5.2 - 2026-06-22

- **Imported `.potx` / PowerPoint templates now preserve and apply the real PowerPoint slide master.** Previously, pptcreater extracted colors, fonts, backgrounds, and representative content branding, then recreated the look in a fresh `pptxgenjs` presentation. That was still a visual approximation: the output PPTX did not inherit the original `.potx` `slideMaster`, `slideLayout`, or `theme` parts. Imported templates now store the source PowerPoint package in the registered manifest and, during render, transplant its `ppt/slideMasters`, `ppt/slideLayouts`, `ppt/theme`, and related media into the generated deck.
- Rendering a deck whose `template` points to an imported PowerPoint template now rewrites each slide's `slideLayout` relationship to the imported template's title/content/closing layouts and removes generated solid slide backgrounds so the template master/layout background can show through. Image-backed custom slide backgrounds are preserved.
- Added regression coverage proving `.potx` imports store the source package + layout paths and rendered decks reference the imported `.potx` slide layouts (`title-slide`, `title-content`, `closing-slide`); full suite now at 259 tests.

## v0.5.1 - 2026-06-21

- **`template import` now warns when an imported template is not saved.** The importer only persists a template when `--register` (registry) or `-o <path>` (manifest file) is supplied; without one of those the import previously succeeded silently and the result was discarded, so the template never appeared in `template list` and could not be used by `template apply` / `template scaffold`. The CLI now prints the destination on success (`registered in …` / `manifest written to …`) and emits a clear warning to stderr when neither was given. The `import_template` MCP tool returns a `warning` field in the same situation (set `register=true` to persist).
- Added shared, unit-tested persistence helpers (`isImportPersisted`, `importPersistenceSuffix`, `importNotPersistedWarning`) in `@pptcreater/render-pptx` reused by both the CLI and MCP server; full suite now at 258 tests.

## v0.5.0 - 2026-06-22

- **Imported `.pptx` templates now re-skin a deck's *middle* content slides, not just the title/closing slides.** Previously, scaffolding from an imported template only carried the template identity onto the cover and closing slides; the content slides authored afterward kept the deck's generic palette and fonts, so a finished deck only "looked like" the template on its first and last pages.
  - New core helper `applyTemplateContentDesign(deck, template, { retheme })` re-skins every content (middle) slide to the template: it adopts the template's design tokens (colors + heading/body fonts, unioning the deck's font fallbacks so Japanese fallbacks are preserved), remaps baked old-palette colors (accent bars, badges, rules, label text) to the new palette, injects the template's captured content-slide background/branding when present, and repairs any text whose known local background drops below the WCAG contrast floor (snapping it to black/white).
  - New CLI command `pptcreater template apply <templateId> <deck> [-o --json --no-retheme]` and new MCP tool `apply_template_design` expose the helper.
- **Template import now accepts PowerPoint template files (`.potx`, `.potm`, `.pptm`), not only `.pptx`.** Designer templates are most often shipped as `.potx`, so importing them no longer requires re-saving to `.pptx` first.
- **Fixed importer theme selection (root cause for the "middle slides aren't themed" report).** The importer now resolves the theme the slide master actually references via `ppt/slideMasters/_rels/slideMasterN.xml.rels` instead of taking the first `themeN.xml` by zip order, which could be an unused Office-default theme (e.g. accent `#4f81bd` / Calibri). Imported tokens now reflect the template's real accent and fonts.
- **Importer captures a content-slide blueprint.** A representative non-cover/closing content layout (background fill/branding) is captured into the manifest's new `contentSlide` field and noted in the template description, so `applyTemplateContentDesign` can reproduce the content-page look.
- Fixed content-slide classification so common content layouts such as `title-content` / `title-and-content` are correctly treated as middle content slides; only genuine cover/section/closing layouts (`title`, `title-slide`, `section-title`, and `section`/`divider`/`closing`/`cover`/`agenda`/`quote` segments) are excluded from re-skinning.
- Contrast repair during re-theme now treats an image background (element-level *or* a slide-level `background.imageDataUri`) as an unknown local background and never snaps light text to black over it, so a full-bleed photo slide with intentionally light text is preserved.
- Added regression tests for token adoption + fallback union, palette remap, contrast repair, content-background injection, image-background safety, `retheme:false`, and idempotency, plus importer tests for master-rels theme selection, content-layout capture, and `.potx` acceptance/extension rejection; full suite now at 254 tests.

## v0.4.1 - 2026-06-21

- Added template registry cleanup operations:
  - Core now exposes status-aware template listing entries with `source` (`preset` / `registered`) and `deletable` metadata, plus safe deletion for registered custom/imported templates.
  - CLI `pptcreater template list` now shows `source` and `delete` columns, marking built-in presets as `locked` and registered/imported templates as `deletable`; `--registered-only` / `--custom-only` lists only registry-backed templates.
  - CLI `pptcreater template delete <id>` (alias: `template remove`) deletes registered custom/imported templates and clearly rejects locked preset templates.
  - MCP now includes `list_templates` (status-aware listing) and `delete_template` (registered template deletion), while keeping `search_templates` backward-compatible for template manifest discovery.
- Preserved backward compatibility for `pptcreater template list --json` by keeping manifest fields at the top level and adding `source`, `deletable`, and optional `deleteReason` metadata alongside them.
- Added regression tests for registered-only listing, deletion, built-in deletion rejection, and legacy preset-id collision cleanup; full suite now at 244 tests.

## v0.4.0 - 2026-06-22

- **PowerPoint (.pptx) template import now reproduces the source title slide's visual identity**, not just abstract theme tokens. Importing a designer template and scaffolding a deck reuses the original title slide's background, logos, placeholder geometry, and text alignment — only the title/subtitle copy changes — so a scaffolded deck looks like it came from the same template instead of a generic re-skin.
  - **Background fidelity**: the importer now captures the title slide's actual background — solid fills, gradients (synthesized to an image so PowerPoint shows the real gradient), and picture/blip fills — and resolves them through the slide → slideLayout → slideMaster inheritance chain. Theme **scheme-color references** (`<a:schemeClr val="accent1"/>`, `<p:bgRef idx="1001">`) are resolved against the theme so a layout-level accent background (the common designer pattern) reproduces its true color (e.g. Duarte's `accent1` → `#006ea4`) instead of being dropped.
  - **Logos & placeholder geometry**: top-of-deck logo/picture marks and the title/subtitle placeholder positions and sizes are captured. When a slide placeholder omits its own geometry or alignment, the importer inherits them from the slideLayout (and alignment from the slideMaster `txStyles`, defaulting to OOXML left), so the scaffold keeps the template's intended composition.
  - **DeckSpec** gained a per-slide `background` ( `{ color? , imageDataUri? }` ); the renderer paints it via pptxgenjs `slide.background`. Template scaffold slides gained `background`, `logos`, `titleBox`, and `subtitleBox`.
- **Scaffold safety hardening**: every scaffolded element (background, logos, title, subtitle) is clamped to the linter's 13.333×7.5in canvas, so importing a non-16:9 or oversized template can no longer emit a non-auto-fixable `layout.out-of-bounds` error. Scaffolded title/subtitle text now guarantees ≥4.5:1 contrast against the captured background — when softer brand-neutral anchors fall short on a mid-tone fill, it drops to a pure `#000000`/`#ffffff` anchor — preventing a render-blocking `text.low-contrast` error.
- Added regression tests for scheme-color background capture + geometry/alignment inheritance, oversized non-16:9 canvas clamping, and the mid-tone contrast floor; full suite now at 239 tests.

## v0.3.1 - 2026-06-21

- Fixed card text overlapping or crowding a left-edge color accent bar (the colored "category" block on report/overview cards) and card text overflowing past the card's right edge. The layout/polish engine now runs an `insetCardContentForBars` pass that, for every rounded card carrying a left accent bar, shifts the card's whole left-aligned content block (heading, body, and any bullet dots) right as one unit so it clears the normalized bar with ≥0.12in breathing room while preserving the original dot↔text spacing. In-card text that runs past the card's right edge is clamped back inside, and any narrowed text box is re-fit (font + height) so it never silently overflows.
  - Card-content association now has a **geometric fallback** (≥60% area containment, vertically inside, non-full-bleed) so agent-authored category cards that do not use the `<card>-<content>` id convention still get their backgrounds grown to contain text and their content inset clear of accent bars.
  - The fix is purely positional in polish, so it applies to every rendered/finalized deck (CLI, MCP, samples) without changing copy; bullet markers keep their size and are never ballooned to a text-width floor.
- Added regression tests covering left-bar clearance (text + dot pushed right of the bar, dot size preserved), idempotency, right-edge overflow clamping, and no over-indentation of plain (no-bar) cards; full suite now at 233 tests.

## v0.3.0 - 2026-06-21

- Added **PowerPoint (.pptx) template import**: extract a presentation's design system — theme colors (background/surface/text/muted/accent, plus best-effort danger/success derived from the accent palette), heading/body fonts (including East-Asian font fallbacks), slide size, header/footer visibility + footer text, and title/closing slide scaffolding — into a reusable pptcreater `TemplateManifest`.
  - New CLI commands: `pptcreater template import <file.pptx> [--id --name --locale --register --overwrite -o --json]` and `pptcreater template scaffold <templateId> [--title --subtitle --locale -o --json]`.
  - New MCP tools: `import_template` (reads a local `.pptx`, optionally registers it) and `scaffold_from_template` (creates a starter title+closing deck that reuses a built-in or imported template).
  - New core helper `scaffoldDeckFromTemplate(template, options)` builds a lint-clean 2-slide starter deck carrying the imported tokens, slide size, and header/footer.
- The PPTX renderer now honors `deck.slideSize` (via a custom `defineLayout`) and `deck.headerFooter` (footer text / date / slide number placeholders) so imported templates render at their original canvas with their footer chrome.
- The DeckSpec and template manifest schemas gained optional `slideSize`, `headerFooter`, `titleSlide`, and `closingSlide` fields; importing never weakens accessibility defaults (imported templates keep min 18pt body / 4.5:1 contrast / required slide titles, reading order, and alt text).
- Note: the layout/polish engine still assumes the standard 13.333×7.5in (16:9) canvas. Imported 16:9 templates (the common case) render with zero behavioral change; non-16:9 slide sizes are applied to the output canvas but dense decks on those sizes may need manual width tweaks. `scaffoldDeckFromTemplate` clamps starter elements to ≤13.333×7.5 so scaffolds always render safely.
- Added unit + integration tests for the OOXML parsers, manifest extraction, and scaffold rendering; full suite at 229 tests.

## v0.2.10 - 2026-06-20

- Fixed a false-positive `diagram.visible-labels-missing` blocking error that aborted `finalize` on decks with thin horizontal connector-track diagrams (e.g. a left-to-right phase rail) whose stage labels live as adjacent text elements directly below the diagram. The lint is now context-aware: connector-track-shaped diagrams (very thin minor axis or aspect ratio ≥ 3) are accepted when ≥2 aligned sibling labels span ≥40% of the diagram's major axis, while ordinary block diagrams still require inline labels.
- `layout.bad-line-break` is now genuinely auto-fixed by polish/`finalize` instead of merely being advertised as polish-fixable. Two author-supplied break defects are resolved at the engine level:
  - Japanese okurigana / particle onsets: the text wrapper no longer emits a line that starts by binding a hiragana to the preceding kanji (e.g. `…覆` / `す反…`), mirroring the line-break linter — but only when the held-back onset still fits the real box width, so it never trades an orphan onset for an overflow that would hard-split a Latin identifier.
  - Orphaned list markers: a long Latin identifier that nearly fills the line no longer pushes its `• ` bullet onto a line of its own; the marker is glued to the following content.
- Hardened the wrap/overflow estimator so onset-suppression only affects emitted text, not the physical-overflow measurement, keeping sample decks lint-clean.
- Added regression tests for the connector-track lint exception and the line-break fixes; full suite at 222 tests.

## v0.2.9 - 2026-06-20

- Fixed card/background containment for dense card layouts: rounded card backgrounds and their accent bars now expand to include associated text and bullet markers, preventing text from visually spilling below the card while still preserving slide boundaries.
- Regenerated shipped sample PPTX files with the card containment polish.
- Re-rendered the reported Yokohama "メリットと注意点" slide; the card backgrounds now contain all bullet rows, with readable 12pt labels and no text overflow.

## v0.2.8 - 2026-06-20

- Improved global text fitting for dense diagrams and tables: captions/diagram labels now keep a 12pt readable floor instead of shrinking into tiny text; if a compact label still cannot fit, polish shortens it with an ellipsis rather than allowing visible overflow or unreadable glyphs.
- Tightened small-font lint guidance so ordinary captions below 12pt are treated as too small to read, while existing generated Diagram Intent exceptions remain allowed.
- Regenerated all shipped samples with the updated fitting behavior and re-rendered the reported Yokohama child-rearing support deck. The regenerated deck has no estimated text overflow, no text below 12pt, and opens in PowerPoint.

## v0.2.7 - 2026-06-20

- Added explicit per-mode schematic template definitions (`SCHEMATIC_MODE_TEMPLATES`) so each style profile (`minimal`, `stylish`, `report`, `presentation`, `technical`) carries a complete 25-pattern schematic template set instead of only sharing one generic pattern list.
- Updated `list_schematic_presets` (MCP) and `pptcreater schematic-presets --json` to return the selected mode's concrete templates, including tone, title, usage, items, secondary items, and axis labels.
- Reworked `npm run sample:schematics` so every mode overview sample (`pptcreater-overview-minimal/stylish/report/presentation/technical`) now contains all 25 schematic slides in that mode's tone, plus a reference slide. The standalone `schematic-patterns` sample remains as a minimal-mode quick catalog.
- Improved schematic sample titles, including the table pattern, by replacing mechanical labels like `表: ...` with cleaner slide-ready phrasing such as `判断材料を一枚でそろえる`.
- Fixed another PowerPoint corruption path from native `ellipse` shapes: `rectRadius` is now emitted only for rounded rectangles, never for ellipses/ovals. Decks with decorative ellipse backgrounds and bullet dots now open correctly.
- Removed generated notes master references/parts from rendered PPTX packages while keeping notes slides. This avoids stale `notesMaster` references and keeps both PowerPoint and Open XML validation happy.

## v0.2.6 - 2026-06-20

- Fixed PPTX files being unreadable in PowerPoint even when Open XML validation reported zero errors. Root cause: the renderer's post-processing moved `notesMasterIdLst` before `sldIdLst`; that ordering can be schema-friendly but PowerPoint rejects it. The renderer now preserves pptxgenjs' PowerPoint-compatible `presentation.xml` order.
- Fixed another PowerPoint corruption path for SVG/diagram elements. pptxgenjs created `.png` fallback media whose bytes were actually SVG XML, so PowerPoint treated the package as corrupt. The renderer now rasterizes SVG, diagram, local `.svg`, and SVG data URI images to real PNG bytes before embedding them.
- Added `sharp` to `@pptcreater/render-pptx`, updated renderer tests to assert PNG signatures/no embedded SVG media, and regenerated every shipped sample `.pptx` with the fixed renderer. The regenerated samples were opened successfully through PowerPoint automation.

## v0.2.5 - 2026-06-20

- Regenerated `samples/schematic-patterns.deck.json`, `samples/schematic-patterns.pptx`, and `samples/schematic-patterns.html` so the sample catalog now includes one slide for every supported schematic kind: all 25 patterns from `table` through `mockup`.
- Added `scripts/generate-schematic-pattern-samples.mjs` and `npm run sample:schematics` so the schematic sample deck can be rebuilt directly from the current renderer/catalog instead of hand-maintaining embedded SVG.
- Increased a few small schematic labels to avoid SVG internal text readability warnings in the generated sample deck.

## v0.2.4 - 2026-06-20

- Added a complete Slideland-style schematic pattern library for overflow-safe slide visuals: `table`, `tree`, `flow`, `vertical-flow`, `cycle`, `before-after`, `map`, `puzzle`/honeycomb, `correlation`, `matrix`, `venn`, `cross`/equation, `set`, `contrast`, `scale-contrast`, `grow`/TAM-SAM-SOM, `layer`, `triangle`, `step`, `gantt`, `ranking`, `list`, `list-horizontal`, `list-enumeration`, and `mockup`.
- Added mode-aware schematic presets for `minimal`, `stylish`, `report`, `presentation`, and `technical` style profiles, each with a matching tone and recommended primary pattern set. Future style modes should ship a complete schematic recommendation set alongside template tokens.
- Expanded MCP `generate_schematic` and CLI `pptcreater schematic` to accept every new pattern, plus `axisX`/`axisY` for matrix-style diagrams. Added `list_schematic_presets` (MCP) and `pptcreater schematic-presets` (CLI) so agents can choose the right reusable layout before drawing.
- Updated slide creation rules, installed guidance, and skill packs so agents prefer schematic presets for comparisons, hierarchies, processes, analyses, schedules, groupings, rankings, and mockups instead of hand-placing fragile custom SVG/text boxes.

## v0.2.3 - 2026-06-19

- **Fixed a PowerPoint "needs repair"/corruption regression.** The renderer wrote an invalid raw `decorative="1"` attribute onto every decorative shape's `<p:cNvPr>`. `decorative` is not a declared OOXML attribute, so PowerPoint flagged the file as corrupt (the Open XML SDK reported one schema error per decorative shape — 60+ in a typical deck). Decorative intent is now carried solely by the schema-valid `<a:extLst>` extension, upgraded to PowerPoint's canonical `adec:decorative val="1"` form so shapes are genuinely marked decorative for screen readers. Regression introduced 2026-06-14.
- Reordered `notesMasterIdLst` to sit before `sldIdLst` in `presentation.xml` (per the `CT_Presentation` schema sequence) so every rendered deck is now strictly Open XML valid, not just tolerated.
- Regenerated all shipped `samples/*.pptx` with the fixed renderer; each now validates with zero Open XML errors.
- Removed a leaked `should-not-render-out-of-bounds.pptx` test artifact that had been accidentally committed.

## v0.2.2 - 2026-06-19

- Fixed `pptcreater new` and `pptcreater business-plan` rejecting `--slide-count` with `error: unknown option`. The CLI now accepts `--slide-count` as an alias for `--slides`, matching the MCP `slideCount` field name that agents already know — so a natural option guess no longer dead-ends the CLI and forces a slow manual fallback. `--slides` remains the canonical documented flag and wins if both are passed.
- `pptcreater --version` now reports the real package version (read from `package.json`) instead of a hardcoded string that could drift out of sync with releases.

## v0.2.1 - 2026-06-20

- Added a one-shot `pptcreater finalize` CLI command and `finalize_deck` MCP tool that polish the layout, render the `.pptx`, and classify lint in a single pass — so agents stop running separate `lint` → `polish` → `render` cycles and stop hand-editing issues that polish resolves automatically.
- Centralized the set of polish-fixable lint codes (`layout.text-overflow-risk`, `layout.bad-line-break`, `layout.text-too-small-to-read`, `layout.card-accent-bar-unshaped`, `element.reading-order-duplicate`) in core as `POLISH_FIXABLE_LINT_CODES`, exposed `isPolishFixableLintCode` / `classifyLintReport`, and annotated each such lint issue with `polishFixable: true` (also surfaced through localized output). The PPTX renderer now reuses this shared set instead of a duplicated local list.
- Updated MCP guidance and the slide-creation rules (ja-JP / en-US) to recommend the `finalize` one-shot and to NOT hand-edit polish-fixable items, plus added performance guidance discouraging long blocking shell web-search calls during deck creation.

## v0.2.0 - 2026-06-20

- Added keyword-to-icon auto-mapping so cards, lists, and visual scaffolds carry a meaningful builtin icon instead of a bare monogram. A curated Japanese/English synonym table (`suggestIconForKeyword`) plus an icon-tag fallback maps concepts such as `セキュリティ`/`security`→shield, `コスト削減`/`cost`→cash, `自動化`/`automation`→workflow, and `ガバナンス`/`governance`→settings.
- `generate_visual_scaffold` (MCP) now auto-selects an emblem icon from the slide `concept` when no explicit `icon` is passed, and only falls back to a monogram when nothing matches; an explicit `icon` still wins.
- Added a `suggest_icon` MCP tool and a `pptcreater icon-suggest <keyword>` CLI command that return the resolved builtin icon name and recolored inline SVG (or null) for use in your own card/grid compositions.
- Hardened keyword matching so Latin synonyms/tags match on whole-word boundaries (e.g. `ratio` no longer false-matches inside `collaboration`) while Japanese keywords keep substring matching.



- Expanded `generate_intent_diagram` / `pptcreater diagram-intent` with four new editable native-object presets so process and change stories keep a fixed, intended composition: `lifecycle` (continuous improvement loop of numbered stages), `maturity-ladder` (ascending capability levels with an axis and risers), `before-after` (current-vs-target two-panel comparison with a transition arrow), and `relationship-map` (a central hub function connected to surrounding related domains).
- All new presets render as native PowerPoint `shape`/`text` elements with orthogonal connectors, frame-preserving scaling, AA-contrast labels, and visible callouts (never flattened/crushed SVG raster), so they satisfy the diagram visible-label and editable-object gates.
- Updated slide creation rules (JA/EN) so agents pick the right intent preset for repeating cycles, staged improvement, current-vs-target contrast, and hub-and-spoke relationships.
- Updated MCP `generate_intent_diagram` and CLI `diagram-intent` descriptions to document all six intent kinds, and added `examples/lifecycle.intent.json`, `examples/maturity-ladder.intent.json`, `examples/before-after.intent.json`, and `examples/relationship-map.intent.json` samples.

## v0.1.8 - 2026-06-20

- Added `generate_visual_scaffold` (MCP) and `pptcreater visual-scaffold` (CLI) to attach an editable right-rail concept visual to a content slide: a rounded panel, an icon or monogram emblem, a bold concept label, an optional caption, and up to four short aspect chips.
- The scaffold is composed entirely of native DeckSpec `shape`/`text` elements plus an optional inline SVG icon (resolved from a builtin icon name), so it adds per-slide imagery in the style of strong reference decks without flattened/crushed raster images and satisfies the visual-richness gate.
- The scaffold guarantees AA text contrast against its panel and chips, keeps the rail inside the slide/frame bounds, and drops overflowing aspect points with a warning instead of cramming the frame.
- Updated slide creation rules (JA/EN) and the recommended workflow so agents attach a visual scaffold to content slides that do not already carry a dedicated diagram, and added an `examples/visual-scaffold.json` sample.

## v0.1.7 - 2026-06-20

- Added `generate_section_divider` (MCP) and `pptcreater section-divider` (CLI) to insert accessible, overflow-safe section/chapter title slides (`layout: section`) between major sections of longer decks, adopting the section-title-slide pattern from strong reference decks while keeping pptcreater's layout strictness.
- Section dividers ship a saturated full-bleed background, numbered eyebrow (`SECTION 01 / 05`), large assertion title, and optional one-line summary, with AA text contrast guaranteed regardless of the brand accent.
- Updated slide creation rules and the MCP recommended workflow so agents insert section dividers for decks longer than six slides; divider slides remain exempt from the visual-richness gate as navigation slides.

## v0.1.6 - 2026-06-19

- Added Diagram Intent rendering through `generate_intent_diagram` / `pptcreater diagram-intent` for concept diagrams where the intended composition and granularity must not drift.
- Added editable native-object intent presets for Enterprise Access Model / access-plane maps and closed zero-trust privileged path comparisons.
- Added example Diagram Intent JSON files for the Enterprise Access Model and Zero Trust privileged path diagrams.
- Updated slide creation rules, MCP schema guidance, README, and installed Copilot/Claude guidance so agents use Diagram Intent before general diagram generation when a target composition is known.

## v0.1.5 - 2026-06-19

- Regenerated the bundled sample DeckSpecs, Studio previews, and PowerPoint files with the latest renderer and layout polish.
- Added a references slide to the schematic sample deck so source URL guidance passes the latest lint rules.
- Removed stale `--language` options from README sample/smoke commands and documented `--polish` for sample rendering.
- Prevented Studio preview generation from emitting whitespace-only lines in regenerated HTML samples.

## v0.1.4 - 2026-06-18

- Added expanded generated provider preset assets for Microsoft/Azure/Entra/Microsoft 365/Power Platform/Dynamics 365, AWS, and Google Cloud/Workspace architecture slides.
- Added official icon source catalog guidance for Fluent UI, Google Material Symbols, AWS Architecture Icons, Azure/Entra/Microsoft 365/Dynamics 365/Power Platform icons, and Google Cloud icons through CLI/MCP surfaces.
- Added MCP `list_icon_sources` for agents that need tool-based access to upstream icon catalog and licensing guidance before registering exact official SVGs.
- Added first-pass slide creation rules via CLI `pptcreater rules`, MCP `get_slide_creation_rules`, and `design://slide-creation-rules` so agents constrain layout/content/visual choices before lint/render.

## v0.1.3 - 2026-06-18

- Blocked large technical SVG diagrams from rendering as flattened `image` elements; agents must use native editable diagram elements instead of delivering crushed diagram images.
- Changed SVG diagram fallback output to keep a slide-shaped canvas, so intentional SVG exports are not distorted when placed in standard 16:9 slide frames.

## v0.1.2 - 2026-06-18

- Added `generate_native_diagram` / `pptcreater diagram-native` to create architecture/flow/ponchi-e diagrams as editable PowerPoint `shape` and `text` elements instead of flattened SVG images.
- Added `diagram.image-svg-not-editable` lint guidance for large technical SVG images that should be recreated as native PowerPoint objects.
- Added a render-blocking `diagram.visible-labels-missing` lint rule so meaningful diagrams cannot be boxes/connectors only; SVG diagrams now need visible labels/callouts instead of relying only on alt text or notes.

## v0.1.1 - 2026-06-17

- Calibrated `report-formal` layout polishing so dense report decks do not rely on unreadably small text.
- Normalized rounded-card accent bars so vertical bars are inset and rounded instead of flush square strips.
- Expanded text boxes when a readable font size requires more vertical room, rather than shrinking below practical floors.
- Added hard-wrap safeguards for long mixed Japanese/English technical labels while avoiding arbitrary identifier corruption.
- Adjusted reference slide spacing for large-title templates.
- Made Studio previews clip text closer to the slide canvas and avoid browser-only arbitrary word breaks.
- Added CI for build/test validation and documented release-tag based installation/update workflow.
