# Changelog

## Unreleased

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
