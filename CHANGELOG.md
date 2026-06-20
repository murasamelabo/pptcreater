# Changelog

## Unreleased

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
