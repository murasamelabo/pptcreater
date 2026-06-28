# pptcreater

Agent-friendly PowerPoint creation toolkit focused on concise, well-designed, accessible slides.

## What this project provides

- A typed `DeckSpec` intermediate representation for slide decks
- Design and accessibility linting before rendering
- Accessible template and skill-pack primitives
- SVG asset sanitizing/search/generation helpers
- A ponchi-e/diagram DSL that can emit editable PowerPoint shape/text elements, Diagram Intent presets for concept fidelity, plus SVG output and preset schematics for tables, trees, flows, lists, and mockups
- PowerPoint `.pptx` rendering
- CLI and MCP surfaces for GitHub Copilot, Claude Code, and other agent workflows
- Workspace custom agents for running a separate pptcreater development/evaluation loop
- Static Studio HTML previews for reviewing slides, lint issues, templates, skills, and SVG assets

## Quick start

Prerequisites:

- Node.js `>=22.12.0`
- npm `>=10`

```powershell
npm install
npm run build
npm run cli -- new --output examples\generated.deck.json --locale ja-JP
npm run cli -- lint examples\generated.deck.json
npm run cli -- render examples\generated.deck.json --output examples\generated.pptx
npm run cli -- studio examples\generated.deck.json --output generated\studio.html
```

`new` creates a visual starter deck, not a text-only deck. You can pass briefing context so the generated DeckSpec includes an audience-specific message, diagrams, icons, and quality-gate slides:

```powershell
pptcreater new `
  --output examples\proposal.deck.json `
  --locale ja-JP `
  --purpose "経営会議でAIスライド作成ツール導入を判断してもらう" `
  --audience "経営層と部門長" `
  --slides 4 `
  --content-mode decision
```

The starter visuals are generated as native PowerPoint shapes and text boxes where possible, not flattened screenshots. This means cards, labels, roadmap elements, and most architecture/flow ponchi-e diagrams can be edited later in PowerPoint. When the intended conceptual composition is already known, use `generate_intent_diagram` / `pptcreater diagram-intent` first: it encodes required panels, labels, denied paths, approved steps, and the design message so the generated object diagram does not drift to a different granularity. For general diagrams with arrows or connected nodes (architecture, flow, sequence, security, ponchi-e), use `generate_native_diagram` instead of embedding a local SVG as `image.path` or hand-placing `line`/`rightArrow` shapes: omit node `x`/`y` to get an automatic layered layout, and insert the returned `shape`/`text` elements directly into `slide.elements`. The generator preserves the diagram aspect ratio inside the requested slide frame, routes connectors border-to-border, keeps labels as editable text, and returns density warnings when a diagram should be split. Use `generate_diagram` only when you intentionally need a single fixed SVG illustration; its SVG fallback now preserves a slide-shaped canvas to avoid squeezed image embeddings. (`lint_deck` emits `diagram.native-connectors` for hand-placed arrow diagrams, blocks `diagram.image-svg-not-editable` for large technical SVG images that should be recreated natively, and blocks `diagram.visible-labels-missing` when a diagram SVG contains only boxes/connectors without visible labels.)

Content modes let agents change the deck taste, and each mode selects a styled built-in template automatically:

- `presentation`: bold keynote style (`presentation-bold`) with large type and minimal words.
- `report`: formal report style (`report-formal`) with denser supporting text.
- `technical`: dark technical style (`technical-architecture`) for architecture/concept/process visuals.
- `decision`: clean modern style (`modern-simple`) emphasizing evidence, risk, and next action.
- `handout`: report style for self-contained reading.

You can also force a style directly:

```powershell
pptcreater new --output examples\deck.json --locale ja-JP --content-mode presentation --style stylish
```

Available styles: `minimal`, `stylish`, `report`, `presentation`, `technical`. From MCP, use `recommend_template` to get the template and style for a content mode, or pass `styleProfile` to `create_deck`. Built-in styled templates (`modern-simple`, `stylish-editorial`, `report-formal`, `presentation-bold`, `technical-architecture`) are listed by `pptcreater template list` and MCP `search_templates`.

From MCP, use `create_pptx` when the user simply asks for a `.pptx`. It creates a styled DeckSpec, lints it, polishes layout, and renders the PowerPoint in one call. `create_pptx`, `create_powerpoint`, and `create_deck` accept `slideCount` from 1 to 40 (the CLI `pptcreater new --slides` uses the same range); when more than the four built-in slides are requested, extra section-numbered card/step content slides are inserted before the closing slide. Use the lower-level `create_deck` -> `review_content` -> `lint_deck` -> `render_pptx` workflow only when you need to manually edit the DeckSpec.

When you already know the deck's one-message-per-slide structure, prefer the Message Map generator instead of authoring boxes by hand. It turns `DeckMessageMap` / `SlideIntent[]` into a complete editable DeckSpec with varied visual archetypes:

```powershell
pptcreater from-message-map .\message-map.json `
  --title "横浜市周辺の産後ケア施設比較" `
  --locale ja-JP `
  --content-mode report `
  --output .\deck.json
```

From MCP, use `create_deck_from_message_map` for the same workflow. Follow it with `finalize_deck` / `render_pptx`, then run `review_message_map` and `review_visual_quality`. The generator adds inline SVG icons/illustration accents to message slides, uses categorized panels for hub-map / ponchi-e style comparisons to avoid broken radial connector layouts, and supports `visualType: "image"` with `visualAsset` for left/right official-image-or-illustration + message layouts. Only embed official images, screenshots, or photos when usage rights are clear; otherwise recreate the idea as an editable illustration and still record sources. The first-pass rules also incorporate locally OCRed PowerPoint-craft principles from both supplied PDFs: decide the audience action before opening PowerPoint, treat whitespace as a design element, plan eye flow/axes before placing objects, weaken supporting elements before strengthening the hero, keep table grids/arrows/chart axes subordinate, and break text into semantic chunks instead of black blocks.

`review_content` / `pptcreater content-review` provides the content-writing guardrail that prevents AI-generated decks from reading like long documents. It switches rules by locale and `contentMode`:

- Japanese `report`, `technical`, and `handout`: use a short topic-label title plus a separate slide message (one factual claim, about 50 characters or fewer).
- Japanese `presentation` and `decision`: concise assertion titles are allowed, but they must stay glanceable and avoid stuffing conditions into the title.
- English modes: prefer action titles — short, specific complete-sentence takeaways supported by 3-5 proof points.

It flags generic titles, verbose document-like titles, missing Japanese slide messages, long supporting messages, prose-like body text, and excessive bullets.

For consulting-style, executive, customer-facing, important-meeting, or internal-friendly business decks, use the business director layer before writing the DeckSpec:

```powershell
pptcreater business-plan `
  --locale ja-JP `
  --topic "生成AI活用" `
  --purpose "経営会議でPoC実施判断を得る" `
  --audience "経営層" `
  --desired-action "PoC実施を承認する" `
  --slides 9 `
  --important-meeting `
  --json
```

MCP tools:

- `plan_business_deck`: creates objective/audience/action framing, 3-5 section architecture, slide-level message/evidence/reading-path plans, and human-review flags.
- `review_business_deck`: reviews section flow, Executive Summary/Agenda needs, lead sentences, equal emphasis, repeated card grids, final landing, and source traceability.
- `generate_edit_with_copilot_prompt`: creates a PowerPoint for the web / Edit with Copilot prompt when the user explicitly wants that workflow. It is an upstream prompt path; final deterministic `.pptx` output should still use `render_pptx` / `render_powerpoint` when possible.

Use `pptcreater polish <deck> --output <polished.deck.json>`, `pptcreater render --polish`, or MCP `polish_deck_layout` before rendering when source content is long or diagrams have many labels. The polish step clamps elements to slide bounds, rebalances Japanese/English line breaks (without splitting numbers like 150,000, Latin words/identifiers like onPremisesDistinguishedName, or leaving orphan punctuation/single characters), and adjusts text fitting to reduce overflows and misalignment. `render_pptx` also applies this safeguard automatically before drawing. If text still cannot fit after polish, `layout.text-overflow-risk` and `layout.bad-line-break` are render-blocking errors; widen the box, shorten the copy, split the slide, or choose a schematic/table/list layout instead of forcing a broken PPTX.

To finish a draft in a single pass, prefer `pptcreater finalize <deck> --output <deck.pptx>` (CLI) or `finalize_deck` (MCP) instead of running separate `lint` -> `polish` -> `render` cycles. `finalize` polishes the layout, renders the `.pptx`, and reports lint split into `blockingErrors` (must fix by hand), `polishFixable` (auto-resolved — do **not** hand-edit these), and `warnings`. The polish-fixable codes (`layout.text-overflow-risk`, `layout.bad-line-break`, `layout.text-too-small-to-read`, `layout.card-accent-bar-unshaped`, `element.reading-order-duplicate`) are annotated with `polishFixable: true`; spend iteration effort only on `blockingErrors`.

`visual.richness-missing` and `visual.richness-deck` are also render-blocking: pptcreater should not deliver text-only content slides. Add `generate_intent_diagram`, `generate_native_diagram`, `generate_schematic`, registered icons, images, or card/shape composition so at least 75% of content slides have visual structure.

Lint blocks `layout.text-overflow-risk`, `layout.out-of-bounds`, `layout.text-overlap`, `layout.bad-line-break`, `diagram.visible-labels-missing`, `diagram.image-svg-not-editable`, and `visual.svg-text-too-small` so agents must fix overflow, collision, orphan lines, unlabeled diagrams, flattened technical SVG diagrams, and unreadably tiny SVG-internal diagram labels before delivering a deck. Content-quality rules from `review_content` are also included in `lint_deck` as warnings/suggestions. `layout.enumeration-hierarchy` warns when body-only enumerations should be converted to callout headings, icons, accent rules, or schematic list/table layouts.

For lower cognitive load, use one visual grammar per slide: `table` for comparisons, `tree` for hierarchy, `flow` / `vertical-flow` for processes, `timeline`/`gantt` for schedules and milestones, `generate_intent_diagram` for known concept compositions, `generate_native_diagram` for editable architecture/security/flow ponchi-e diagrams, and `list` / `list-horizontal` for 3-4 key points. Timeline and architecture diagrams are valid expression choices; what is discouraged is fragile hand-built connector geometry or flattened technical SVGs when an editable generator exists. Avoid many custom text boxes with uneven manual line breaks. Diagrams must be visually self-explanatory on the slide: do not put the explanation only in `altText`, `summary`, `longDescription`, notes, or a side paragraph while leaving boxes/arrows blank. Keep labels visible as editable text for native diagrams; when embedding SVG diagrams that contain `<text>`, keep the diagram large enough that internal labels remain at least 8pt after scaling, otherwise split the diagram or recreate it with `generate_intent_diagram`, `generate_native_diagram`, or `generate_schematic`.

**Adopt a prepared figure instead of hand-building diagrams.** Before placing your own node boxes + connector lines, timeline rails, comparison columns, or step rows, call `recommend_figure` with the slide message (or `list_schematic_presets`) and follow its `renderer` / `tool`. When it returns `design-pack`, prefer `render_design_component` with a curated component of the recommended `kind` from the **zukai pack** — 14 professionally designed PowerPoint figure kinds (flow-horizontal, flow-vertical, cycle, before-after, matrix, venn, formula, comparison, scale, step, gantt, list-vertical, list-horizontal, list-enumeration, plus tree). Pick a P1-P6 variant with `list_design_components`, fill every catalog placeholder (eyebrow, title, labels, sub-labels, caption) via `textReplacements`, and match the node count with `nodeOperations` (it re-fits and renumbers within the footprint); keep `○/△/✕` marks as-is (colored icon shapes). When it returns `schematic`, use `generate_schematic` (auto-fits each label so card text never clips). When it returns `native-diagram`, use `generate_native_diagram` (routes every connector border-to-border so arrows never dangle). Reserve hand-built shape compositions for simple, short-label layouts. `lint_deck` emits `diagram.native-connectors` when a connected diagram is hand-built; it is a warning for a small flow and a **blocking error once the flow is complex (4+ hand-placed connectors)**. Fix it by rebuilding with a design-pack component or generator, not by nudging coordinates.


Modern slide generation follows these principles: content-mode-aware titles/messages, modular cards, bold whitespace, restrained accents, one memorable visual scene per slide, and editable PowerPoint shapes for content that users may revise later. The MCP resource `design://modern-slide-principles` exposes this guidance to AI agents.

## Development improvement loop

For improving pptcreater itself, use the development-loop architecture in
[`docs/dev-loop-architecture.md`](docs/dev-loop-architecture.md). It is intentionally separate from
the deck-authoring agent team: the development loop uses a Dev Lead, User Simulator, Evaluator, and
QA Gatekeeper to implement focused changes, create real pptcreater artifacts, convert quality issues
into PatchRequests, and stop only when deterministic gates pass.

## Diagram Intent presets

Use Diagram Intent when the visual concept is known and the LLM must not simplify or change the grain of the diagram. Instead of asking the model to infer a freeform node graph, encode the required composition as a contract and generate editable PowerPoint objects.

Supported intent kinds:

- `access-plane-map`: Enterprise Access Model / control-plane maps with Control, Management, Data/Workload, User, App, Privileged Access, blocked escalation paths, and a design message.
- `closed-privileged-path`: side-by-side "avoid this / target state" diagrams with uncontrolled source paths, a protected target, approved path steps, denied paths, and a design message.
- `lifecycle`: a continuous improvement loop of 3-6 numbered stages (`label`, optional `sublabel`) with flow arrows, a return loop, and a loop label — for repeating cycles such as joiner/mover/leaver/review.
- `maturity-ladder`: 3-5 ascending capability levels (`label`, optional `description`) on an axis with `Lv.N` badges and orthogonal risers — for staged improvement from manual to assured operations.
- `before-after`: two panels (current vs target) each with a title and 1-6 bullet points plus a center transition arrow and label — for current-vs-target contrast.
- `relationship-map`: a central hub function (`center`) connected to 3-6 surrounding nodes (`label`, optional `sublabel`, optional `relationship`) — for hub-and-spoke relationships between a core capability and related domains.

CLI usage:

```powershell
pptcreater diagram-intent .\examples\enterprise-access-model.intent.json --output generated\enterprise-access-model-elements.json
```

The output is a JSON payload with `elements`; insert those `shape`/`text` elements directly into a DeckSpec slide. From MCP, use `generate_intent_diagram`.

## Section divider slides

For longer decks (more than about six slides), insert section/chapter title slides between major sections so the audience can track structure, mirroring the section-title-slide pattern from strong reference decks. Use `generate_section_divider` (MCP) or `pptcreater section-divider` (CLI) instead of hand-building dividers: the result is a full DeckSpec `Slide` with `layout: section`, a saturated full-bleed background, a numbered eyebrow (`SECTION 01 / 05`), a large assertion title, and an optional one-line summary. AA text contrast is guaranteed regardless of the brand accent, and divider slides are exempt from the visual-richness gate because they are navigation slides.

CLI usage:

```powershell
pptcreater section-divider .\examples\section-dividers.json --output generated\section-dividers.json
```

The input is a JSON array of `{ title, subtitle? }` sections; the output is a JSON payload with `slides`. Insert those slides directly into `deck.slides` ahead of each section's first content slide. Pass `--no-numbered` to drop the `01 / 05` counter and `--accent <#hex>` to override the divider color.

## Per-slide concept visual scaffold

To give a content slide lightweight visual structure without a full diagram — and to avoid text-only/low-richness slides — attach an editable right-rail concept visual with `generate_visual_scaffold` (MCP) or `pptcreater visual-scaffold` (CLI). The scaffold is a rounded panel containing an icon or monogram emblem, a bold concept label, an optional caption, and up to four short aspect chips. It is composed entirely of native DeckSpec `shape`/`text` elements plus an optional inline SVG icon (resolved from a builtin icon name), so it adds per-slide imagery like strong reference decks without flattened/crushed raster images, and it satisfies the visual-richness gate. AA text contrast is guaranteed against the panel and chips, the rail is kept inside the slide/frame bounds, and aspect points that do not fit are dropped with a warning instead of cramming the frame.

CLI usage:

```powershell
pptcreater visual-scaffold .\examples\visual-scaffold.json --output generated\scaffold.json
```

The input is a JSON object `{ concept, caption?, points?, icon?, locale?, accent?, frame?, idPrefix? }`; the output is a JSON payload with `elements`, `summary`, `longDescription`, and `warnings`. Push the `elements` into the target slide's `elements` array, and use `summary`/`longDescription` for alt text or speaker notes. Pass `--icon <name>` (a builtin icon name) for the emblem, `--accent <#hex>` to override the color, and omit `icon` to auto-map an icon from the `concept` keyword (falling back to a monogram of the concept's first character only when nothing matches).

### Keyword-to-icon auto-mapping

Cards, lists, and the visual scaffold read better with a meaningful icon than a bare monogram. `suggest_icon` (MCP) and `pptcreater icon-suggest <keyword>` (CLI) map a free-text concept (Japanese or English) to the best-matching builtin icon name and return its recolored inline SVG (or `null` when nothing matches). `generate_visual_scaffold` applies this mapping automatically when no explicit `icon` is given; call `suggest_icon` yourself when composing your own card/grid layouts.

```powershell
pptcreater icon-suggest "セキュリティ強化" --json   # -> shield
pptcreater icon-suggest "コスト削減"                 # -> cash
pptcreater icon-suggest "Automation workflow"        # -> workflow
```

Matching uses a curated synonym table first (e.g. `セキュリティ`/`security`→shield, `ガバナンス`/`governance`→settings, `ライフサイクル`→workflow) and falls back to builtin icon tags. Latin keywords match on whole-word boundaries so short tokens do not false-match inside unrelated words; Japanese keywords match as substrings.

## Slideland-style schematic presets

For structured visuals, prefer MCP `generate_schematic` instead of freehand SVG. It returns editable native PowerPoint shape/text elements for common slide patterns (with an SVG fallback for compatibility) inspired by Slideland categories:

- `table`: comparison/KPI matrix
- `tree`: hierarchy and branching
- `flow`: horizontal process
- `vertical-flow`: step-by-step vertical process
- `radar`: 4-8 axis score profile for one option/facility/product
- `list`, `list-horizontal`, `list-enumeration`: clean bullet/list layouts
- `mockup`: UI/mockup-style visual block

Each schematic supports `tone`: `minimal`, `cool`, `luxury`, or `report`. The presets use low-chroma palettes, aligned grids, and readable editable labels, reducing renderer failures from flattened or overly complex custom SVGs.

For true PowerPoint SmartArt experiments, DeckSpec also supports a `smartart` element that transplants an existing SmartArt `graphicFrame` and its `ppt/diagrams/*` OpenXML parts from a template `.pptx`/`.potx` into the generated deck. Use this when you intentionally want PowerPoint-native SmartArt behavior and have a curated SmartArt template deck; otherwise prefer `generate_schematic` / `generate_native_diagram` for deterministic cross-platform generation.

## Design Asset Packs (curated slide components)

When a visual is better served by a human-designed slide than by generated geometry, pptcreater can transplant a curated PowerPoint slide component into a generated deck. The `pptxSlide` DeckSpec element copies the editable shapes and text (`<p:spTree>` children) of a source slide into the target slide, renumbering shape ids and copying relationships so everything stays editable in PowerPoint — no flattened images.

Curated components live under `design-packs/<pack>/`, each with a `manifest.json` describing its components (id, `kind`, `name`, `sourceSlideIndex`, `bestFor`, authoring `constraints`, and optional `editableGroups`) and a source `.pptx`. Discovery scans every `design-packs/<pack>/manifest.json`, so packs compose without code changes. Two packs ship today:

- **`tree`** — seven tree-diagram components: vertical org, horizontal, logic, indented, decision, radial/mind-map, and pyramid.
- **`zukai`** ("図解デザイン大全") — 83 schematic components across 14 figure types (`kind`s): `flow-horizontal`, `flow-vertical`, `cycle`, `before-after`, `matrix`, `venn`, `formula`, `comparison`, `scale`, `step`, `gantt`, `list-vertical`, `list-horizontal`, and `list-enumeration`, each with 5-6 human-designed variations (`<kind>-p1` … `<kind>-p6`).

CLI usage:

```powershell
pptcreater design list                 # list all curated components (both packs)
pptcreater design list cycle           # filter by kind (e.g. a zukai figure type)
pptcreater design render matrix-p1 --output generated\matrix.deck.json
pptcreater render generated\matrix.deck.json --output generated\matrix.pptx
```

Render the full galleries with `npm run sample:tree-design` and `npm run sample:zukai-design`.

MCP tools `list_design_components` and `render_design_component` expose the same discovery and DeckSpec generation to agents. Source slides are loaded from an in-workspace `templatePath` or an inline `templateDataUri`; external files must be passed as a data URI.

### Substituting curated data (`textReplacements`)

A curated component ships with placeholder data. To reuse the same human-designed layout with your own content, add `textReplacements` to the `pptxSlide` element (or pass it to `renderDesignComponentDeck`). Each entry replaces the text of a run either by 0-based run index (`at`) or by exact original text (`match`); the new text is XML-escaped automatically:

```jsonc
{
  "type": "pptxSlide",
  "templatePath": "design-packs/tree/tree-diagrams_Oxml.pptx",
  "sourceSlideIndex": 5,
  "textReplacements": [
    { "at": 3, "to": "コストを下げる" },
    { "match": "客数を増やす", "to": "固定費を削る" }
  ],
  "summary": "ロジックツリー（データ差し替え）",
  "longDescription": "Curated logic tree reused with custom MECE cost-reduction data."
}
```

The visible number of boxes is fixed by the curated geometry (the shapes are human-designed); `textReplacements` changes the labels/data inside those boxes. `npm run sample:tree-design` renders the as-shipped gallery, and `node scripts/generate-tree-varied-gallery.mjs` renders the same seven trees with substituted, domain-specific data.

### Re-toning for light or dark decks (`tone` / `background` / `recolor`)

Curated figures are authored on a light slide background, and that background is **not** carried when the figure is transplanted into another deck — so a curated figure dropped into a dark-template deck would lose its backdrop and its dark catalog title would read dark-on-dark. `render_design_component` / `renderDesignComponentDeck` accept a `tone` so the figure carries the right colors:

- `tone: "light"` (default) emits a full-bleed light (`#F4F7FC`) backdrop so the figure is self-contained and readable in any deck.
- `tone: "dark"` emits a dark backdrop and lightens the figure's dark catalog title so it reads on dark.
- `background` overrides the backdrop color, or `"none"` inherits the deck/template (use this when the deck already has a dark master so the figure integrates without an extra full-bleed layer).
- `recolor` is an explicit list of `{ from, to, scope }` color remaps applied to the transplanted figure; `scope` is `text` (run text only), `fill` (shape fills only), or `all` (default). An explicit `recolor` **replaces** the tone's default remap — pass `recolor: []` to disable re-coloring entirely (important for figures like `comparison` where the catalog title hue is also used for card-body text, which must stay dark on its white card).

For a deck that already uses a dark template, a clean pattern is `tone: "dark"`, `background: "none"`, `recolor: []` (so card text is untouched), blank the figure's catalog eyebrow/title via `textReplacements`, and add your own deck-native title text element on top — the figure body and caption then sit on the dark master exactly like your other slides.

### Adding and removing nodes (`nodeOperations`)

To change the *number* of nodes (not just their text), a component can declare `editableGroups` — sibling sets that support structural edits. The shipped `tree` pack declares editable groups for the vertical-org, horizontal, and logic trees. Issue operations on the `pptxSlide` element (or pass `nodeOperations` to `renderDesignComponentDeck` / the MCP `render_design_component` tool):

```jsonc
{
  "type": "pptxSlide",
  "templatePath": "design-packs/tree/tree-diagrams_Oxml.pptx",
  "sourceSlideIndex": 3,
  "nodeGroups": [
    { "id": "eigyo", "axis": "x", "parentText": "営業本部", "members": ["第一営業部", "第二営業部"] }
  ],
  "nodeOperations": [
    { "op": "add", "group": "eigyo", "cloneFrom": "第一営業部", "label": "第三営業部" },
    { "op": "remove", "target": "人事総務" }
  ],
  "summary": "組織図（ノード編集）",
  "longDescription": "Curated org tree with an added 営業部 and a removed 人事総務."
}
```

The engine re-lays-out each edited sibling group **within its original footprint**, preserving the curated gap-to-box ratio so boxes and gaps scale together — added nodes never collide with neighboring groups, and removed nodes never leave a dangling connector. Removing down to one child drops the connector bus and re-centers the remaining box under its parent. Added nodes clone a sibling's box/label/connector so styling stays consistent. Use `node scripts/generate-tree-nodes-gallery.mjs` to render an add/remove demo across all three editable trees. `list_design_components` reports each component's `editableGroups` (and their `axis`/`members`) so agents know which nodes are editable.

Node add/remove also works on **non-tree figures** through a generic cluster engine. A group's `layout` selects the relayout strategy:

- `tree` — hierarchical sibling rows/columns under a parent (the tree pack).
- `linear-x` / `linear-y` — a row/column of card clusters (flow, lists, gantt rows); `connectorBetween: true` regenerates the arrow/chevron in each gap; `renumber: true` rewrites numeric step badges.
- `staircase-x` — ascending step blocks sharing a baseline (their heights ramp automatically).
- `radial` — a ring of nodes around an optional centroid hub (cycles); the hub is auto-detected and preserved while the ring re-distributes by angle.

A "cluster" is a node's full visual unit (frame card/panel/bar + its title, badge, accent bar, …), so the whole node moves, scales, clones, and deletes together. In the `zukai` pack, 33 components across 7 kinds (flow horizontal/vertical, cycle, step, gantt, list vertical/horizontal) ship with `editableGroups`; fixed-geometry and decorative-layout patterns (matrix, venn, formula, scale, comparison, before-after, list-enumeration, and a few special variants) remain text-edit-only. Render `node scripts/generate-zukai-node-gallery.mjs` for an add+remove demo across every enabled component.

CLI usage:

```powershell
pptcreater diagram-native .\examples\private-marketplace-diagram.json --output generated\native-diagram-elements.json
pptcreater diagram-intent .\examples\enterprise-access-model.intent.json --output generated\intent-diagram-elements.json
pptcreater schematic .\examples\flow-schematic.json --output generated\flow.svg
```

## Sample deck

A sample deck explaining this tool is included:

- `samples/pptcreater-overview.deck.json` — source DeckSpec
- `samples/pptcreater-overview.pptx` — generated PowerPoint
- `samples/pptcreater-overview.html` — static Studio preview
- `samples/pptcreater-overview-minimal.*` — minimal/simple explanation pattern plus all 25 minimal schematic templates
- `samples/pptcreater-overview-stylish.*` — stylish/cool presentation pattern plus all 25 stylish schematic templates
- `samples/pptcreater-overview-report.*` — formal report pattern plus all 25 report schematic templates
- `samples/pptcreater-overview-presentation.*` — bold live-presentation pattern plus all 25 presentation schematic templates
- `samples/pptcreater-overview-technical.*` — technical/architecture pattern plus all 25 technical schematic templates
- `samples/schematic-patterns.deck.json` — minimal-mode Slideland-inspired schematic preset examples
- `samples/schematic-patterns.pptx` — generated minimal schematic examples
- `samples/schematic-patterns.html` — static Studio preview

Regenerate it with:

```powershell
pptcreater new --output samples\pptcreater-overview.deck.json --locale ja-JP --purpose "このpptcreaterツールの価値と使い方を説明し、導入判断につなげる" --audience "GitHub CopilotやClaude Codeを使う開発者・デザイナー・企画担当" --slides 4 --content-mode decision
pptcreater lint samples\pptcreater-overview.deck.json
pptcreater render samples\pptcreater-overview.deck.json --output samples\pptcreater-overview.pptx --polish
pptcreater studio samples\pptcreater-overview.deck.json --output samples\pptcreater-overview.html
npm run sample:schematics
foreach ($name in "pptcreater-overview-minimal","pptcreater-overview-stylish","pptcreater-overview-report","pptcreater-overview-presentation","pptcreater-overview-technical","pptcreater-overview","schematic-patterns") {
  pptcreater render "samples\$name.deck.json" --output "samples\$name.pptx" --polish
  pptcreater studio "samples\$name.deck.json" --output "samples\$name.html"
}
```

The style-pattern samples intentionally change the communication context, not just the color palette:

- `minimal`: short assertion slides with whitespace and one focused visual.
- `stylish`: mockup/photo-style visuals and large editorial messaging.
- `report`: comparison tables, risk/mitigation tables, and governance lists.
- `presentation`: live-talk pacing with big statements, a simple flow, and three-point framing.
- `technical`: ponchi-e architecture, vertical flow, tree, and safety checklist diagrams.

Use these samples to compare which structure fits the deck you want before asking an agent to create new slides.

To use it from another terminal after cloning this repository:

```powershell
git clone https://github.com/murasamelabo/pptcreater.git C:\tools\pptcreater
cd C:\tools\pptcreater
git checkout v0.2.0
npm install
npm run build
npm link
pptcreater --help
```

For development or quick follow-up, use `main` instead of a release tag. For stable operational use, pin a tag such as `v0.2.0`, record that tag/commit in the consuming project, and update deliberately after smoke testing.

## Updating an existing installation

When `pptcreater` is installed as a normal Git clone, updates are easy to track and roll back:

```powershell
cd C:\tools\pptcreater
git status
git fetch --tags origin
git checkout v0.2.0
npm install
npm run build
npm link
pptcreater --help
```

If you intentionally track active development, replace `git checkout v0.2.0` with:

```powershell
git checkout main
git pull --ff-only origin main
```

After updating, run a smoke test before using it from Copilot or Claude Code:

```powershell
pptcreater new --output generated\smoke.deck.json --locale ja-JP --content-mode report
pptcreater render generated\smoke.deck.json --output generated\smoke.pptx --polish
pptcreater studio generated\smoke.deck.json --output generated\smoke.html
```

MCP configuration normally does not change as long as the clone path stays `C:\tools\pptcreater` and the server path remains `C:\tools\pptcreater\packages\mcp-server\dist\index.js`. Restart the MCP client after rebuilding.

## Release strategy

- GitHub Releases are the stable distribution channel for now; the package remains `private` and is not published to npm yet.
- Use semantic tags (`v0.1.x`) for operator-facing fixes and document the tag in consuming projects.
- `main` may move quickly while layout, template, and diagram quality improves; pin a release tag for repeatable deck generation.
- Before creating a release, run `npm run build`, `npm test`, and render a smoke deck with `--polish`.
- If a release regresses, roll back with `git checkout <previous-tag>` followed by `npm install`, `npm run build`, and MCP restart.

## Use automatically from new GitHub Copilot projects

Register the MCP server in your user-level MCP configuration on each terminal. Use a stable clone path so new projects can reuse the same server without per-repository setup.

```json
{
  "mcpServers": {
    "pptcreater": {
      "command": "node",
      "args": [
        "C:\\tools\\pptcreater\\packages\\mcp-server\\dist\\index.js"
      ]
    }
  }
}
```

Add this to your global Copilot instructions so slide-related requests prefer this tool:

```text
When creating PowerPoint presentations, slide decks, proposal materials, templates, SVG icons, business diagrams, or accessible presentation materials, prefer the pptcreater MCP. Use create_pptx/create_powerpoint for direct PPTX output. For custom DeckSpecs, first call get_slide_creation_rules and keep the first draft inside those constraints; use interview_slide_brief when purpose, audience, or volume is unclear, use review_content to apply locale/content-mode writing rules, use search_assets and generate_intent_diagram/generate_native_diagram/generate_schematic for visual structure, then run lint_deck and render_pptx/render_powerpoint or render_studio. If the MCP render tool is not visible in the current tool selection, run the CLI fallback `pptcreater render <deck.json> --output <deck.pptx> --polish`. Never deliver text-only content slides, flattened editable diagrams, or unlabeled box-and-arrow diagrams; visual.richness-*, diagram.image-svg-not-editable, and diagram.visible-labels-missing lint findings must be fixed before final output.
```

For stronger project-level behavior, add the same instruction to `.github/copilot-instructions.md` in repositories where slide creation should always use `pptcreater`.

Avoid falling back to PowerPoint COM automation, ad-hoc scripts, or manual PPTX generation for normal deck creation. If MCP `render_pptx` / `render_powerpoint` is not exposed, use the CLI fallback `pptcreater render <deck.json> --output <deck.pptx> --polish` instead. If you generate local SVG/PNG/JPEG/GIF/WebP files during research, reference them from DeckSpec `image.path` only for logos/photos/source quotes/exact-fidelity figures and still call pptcreater render; pptcreater will sanitize SVGs and embed the files safely.

## Install project guidance files

You can install project-level guidance files so GitHub Copilot and Claude Code know to brief first and use pptcreater for slide work.

For GitHub Copilot:

```powershell
pptcreater install-copilot --target C:\path\to\your-project
```

This creates or updates:

- `.github\pptcreater-skills.md`
- `.github\agents\*.agent.md` — the six deck-building custom agents (`deck-director` and five specialists)
- `.github\copilot-instructions.md`

For Claude Code:

```powershell
pptcreater install-claude-code --target C:\path\to\your-project
```

This creates or updates:

- `.github\pptcreater-skills.md`
- `.github\agents\*.agent.md` — the six deck-building custom agents
- `CLAUDE.md`

Both commands are idempotent. Existing instruction files are updated inside a managed `pptcreater` block. Existing root-level `SKILLS.md` files are not modified. The custom agents (see [`docs/AGENTS.md`](docs/AGENTS.md)) are installed into `.github\agents` so the Director and its specialists are available in your project; existing agent files are not overwritten unless you pass `--overwrite`. Pass `--no-instructions` to skip the instruction file, or `--no-agents` to skip installing the custom agents.

## Add PowerPoint templates

Templates are registered as pptcreater template manifests: JSON files that define design tokens, layouts, locale, tags, accessibility constraints, and optional title/closing slide scaffolding captured from `.pptx` files.

Start from an existing template:

```powershell
pptcreater template list --json
```

Create a manifest such as `templates\my-template\template.json`, then register it:

```powershell
pptcreater template register templates\my-template\template.json
pptcreater template list
```

`pptcreater template list` shows whether each template is a locked preset or a deletable registered template:

```text
id                    name                  source      delete
minimal-consulting    Minimal Consulting    preset      locked
brand                 Brand                 registered  deletable
```

To list only custom/imported templates that are stored in the registry:

```powershell
pptcreater template list --registered-only
```

To delete a registered custom/imported template:

```powershell
pptcreater template delete brand
```

Built-in preset templates are marked `locked` and cannot be deleted.

Registered custom templates are stored in:

```powershell
pptcreater template registry-path
```

By default this is a user-level registry under your pptcreater config directory, such as `%APPDATA%\pptcreater\templates\registry.json` on Windows or `~/.config/pptcreater/templates/registry.json` on Linux. Commit a registry file only when you intentionally set `PPTCREATER_TEMPLATE_REGISTRY_PATH` to a project path and want to share it with teammates.

### Reuse an existing PowerPoint as a template

Import the design system (theme colors, heading/body fonts, slide size, header/footer, and title/closing slide text) from any `.pptx`, `.potx`, `.potm`, or `.pptm` into a reusable template, then scaffold a starter deck that inherits it:

```powershell
pptcreater template import brand-deck.potx --id brand --name "Brand" --register
pptcreater template scaffold brand --title "四半期レビュー" -o generated\brand.deck.json
pptcreater finalize generated\brand.deck.json --output generated\brand.pptx
```

The importer resolves the theme the slide master actually references (not just the first theme in the file), so imported colors and fonts match the template's real identity, and it captures a representative content-slide background/branding blueprint. When the template is registered, pptcreater also stores the source PowerPoint package and applies its real `slideMaster` / `slideLayout` / `theme` parts at render time, so `.potx` imports are not just visually approximated — generated slides inherit the imported master layouts. If the imported master uses a dark background, free-standing slide text is contrast-repaired during render while card/panel text keeps its local background-aware colors.

> **Note:** `template import` only *saves* the template when you pass `--register` (add it to the registry) or `-o <path>` (write the manifest JSON to a file). Without one of those the import succeeds but the result is discarded — it will not appear in `template list` and cannot be used by `template apply` / `template scaffold` — so the CLI prints a warning. The `import_template` MCP tool behaves the same way (set `register=true`) and returns a `warning` field when the import was not persisted.

`template scaffold` only carries the template identity onto the title and closing slides. After you author the middle content slides, re-skin them to the template — adopting its colors/fonts, remapping any baked old-palette colors, injecting the captured content background, and repairing contrast — with `template apply`:

```powershell
pptcreater template apply generated\brand.deck.json brand -o generated\brand.deck.json
pptcreater finalize generated\brand.deck.json --output generated\brand.pptx
```

Use `--no-retheme` to only inject the template's content background/branding without changing the deck's tokens or baked colors. Re-apply from the originally authored deck, not a deck that was already re-skinned (a second remap is a no-op once the palette already matches).

**Make sure the template is actually used.** A deck only inherits the real PowerPoint master/layouts when its `template` field references a **registered** template that carries the embedded package. Render surfaces three warnings (in the `warnings` array of `render_pptx` / `create_pptx` / `finalize`, and in the CLI render/finalize summary) when this goes wrong:

- `template.package-not-embedded` — the referenced template id is not registered (or was registered without the source PowerPoint package), so the `.pptx`/`.potx` master was **not** embedded and the deck only mimics the look with generated shapes/backgrounds. Fix: `template import <file> --register` (MCP `import_template` with `register=true`) and reference that id.
- `template.cover-overdrawn` — the template master *was* embedded, but the cover/closing slide draws a generated hero (accent bars, chips, side panels, or a full-bleed background) over the template's own cover, hiding it. Fix: build that slide from `template scaffold` / `scaffold_from_template` (which reuses the template's native cover) instead of drawing a custom hero over a referenced template.
- `template.content-overdrawn` — a content (middle) slide draws a full-bleed generated background over the template's content layout, hiding the template's background/branding. Drawing cards/diagrams on the template is expected and is **not** flagged; only a full-canvas generated background is. Fix: remove the full-bleed background so the template shows through, or re-skin the deck with `template apply` / `apply_template_design` (it injects the template's own content background instead).

Accessibility defaults (minimum body size, contrast, required slide titles / reading order / alt text) are always preserved on imported templates. The layout/polish engine assumes a 13.333×7.5in (16:9) canvas, so non-16:9 imports are rendered at their original size but very dense decks on those sizes may need manual width tweaks.

From an MCP-capable AI agent, use:

- `search_templates` to inspect existing templates before creating duplicates.
- `list_templates` to inspect existing templates with `source` and `deletable` status.
- `register_template` to register a complete template manifest.
- `import_template` to extract a reusable template from a local `.pptx` / `.potx` / `.potm` / `.pptm` file (optionally `register: true`).
- `delete_template` to delete a registered custom/imported template. Preset templates are locked.
- `scaffold_from_template` to create a starter title+closing deck that reuses a built-in or imported template.
- `apply_template_design` to re-skin an authored deck's middle content slides to a template (`retheme: true` by default).
- `deckspec://schema` to understand how `template` ids are referenced from decks.

## Add reusable SVG icons and assets

SVG icons can be registered as sanitized reusable assets. Use this for icons, logos, simple illustrations, and diagram parts that should be reused across decks.

pptcreater includes generated, free-to-use generic icon presets for UI, business, security, data, flow, slide-design, and cloud architecture patterns. In addition to base icons such as `check`, `table`, `tree`, `lock`, `workflow`, and `presentation`, `search_assets` includes Microsoft/Azure/Entra/Microsoft 365/Power Platform/Dynamics 365, AWS, and Google Cloud/Workspace preset pictograms such as `preset-azure-architecture`, `preset-entra-identity`, `preset-entra-privileged-access`, `preset-aws-cloud`, `preset-aws-ai-ml`, `preset-google-cloud`, and `preset-google-kubernetes`. These vendor presets are generated generic pictograms, not official logos or product icons. The generated preset catalog is documented under `assets\svg\presets\`.

```powershell
pptcreater asset search cloud
pptcreater asset search azure
pptcreater asset search aws
pptcreater asset search "google cloud"
pptcreater icon workflow --color "#315f9f"
pptcreater asset sources
```

`asset sources` lists upstream catalogs that agents can inspect before registering exact official SVGs, including Fluent UI System Icons, Google Material Symbols, AWS Architecture Icons, Azure Architecture Icons, Entra, Microsoft 365, Dynamics 365, Power Platform, and Google Cloud icons. Use the bundled generated presets when a generic cloud/service pictogram is enough; use upstream official icon packs only after checking each license and brand term.

```powershell
pptcreater asset register .\icons\rocket.svg `
  --id rocket-launch `
  --title "Rocket launch" `
  --description "Rocket icon used for launch or acceleration concepts." `
  --tag rocket launch startup `
  --license custom `
  --alt-text "Rocket launch icon"

pptcreater asset search rocket --json
```

Registered SVG assets are stored in:

```powershell
pptcreater asset registry-path
```

By default this is a user-level registry under your pptcreater config directory, such as `%APPDATA%\pptcreater\assets\svg\registry.json` on Windows or `~/.config/pptcreater/assets/svg/registry.json` on Linux. Commit a registry file only when you intentionally set `PPTCREATER_SVG_REGISTRY_PATH` to a project path and want to share it.

From an MCP-capable AI agent, use:

- `asset://registration-guide` to read the registration workflow.
- `asset://icon-sources` to discover known upstream icon catalogs and licensing guidance notes.
- `list_icon_sources` when a tool result is preferable to reading the MCP resource.
- `search_assets` before registering a new SVG, to avoid duplicates.
- `generate_intent_diagram` before general diagram generation when the intended concept composition/granularity is known.
- `generate_native_diagram` before embedding architecture/security/control-plane/ponchi-e diagrams as SVG images; it returns editable DeckSpec `shape`/`text` elements.
- `generate_schematic` before freehand SVG when the visual is a table, tree, flow, list, or mockup.
- `generate_section_divider` to insert accessible section/chapter title slides between major sections of decks longer than six slides.
- `generate_visual_scaffold` to attach an editable right-rail concept visual (panel + icon/monogram + heading + aspect chips) to a content slide that lacks a dedicated diagram.
- `suggest_icon` to map a concept/keyword to a builtin icon name and inline SVG for cards, lists, and grids.
- `register_svg_asset` to sanitize and register the asset with `id`, `title`, `description`, `tags`, `license`, `decorative`, `altText`, and `svg`.
- `search_assets` again after registration to reuse the asset in future DeckSpecs.

To force both registries under a custom base directory, set `PPTCREATER_HOME`. To control each registry separately, set `PPTCREATER_TEMPLATE_REGISTRY_PATH` or `PPTCREATER_SVG_REGISTRY_PATH` before running the CLI or MCP server.

## Brief before generating decks

Good slide design depends on purpose, audience, delivery mode, and volume. The built-in skill packs `slide-briefing-ja` and `slide-briefing-en` define intake questions for AI agents, and `slide-craft-ja` / `slide-craft-en` carry a message-first craft method (explanation before slides, distill to one sentence, extract structure, subtract to clarify, then minimal decoration) plus the deck anti-patterns to self-check against. List them with `list_skills`.

To reduce repeated lint/render fixes, fetch the first-pass rules before writing custom DeckSpec:

```powershell
pptcreater rules --locale ja-JP --content-mode technical
pptcreater rules --locale ja-JP --content-mode technical --json
```

From MCP, use:

- `get_slide_creation_rules` before manually writing DeckSpec, so content length, layout slots, visual grammar, alt text, sources, and diagram choices are constrained up front.
- `interview_slide_brief` when the user's request does not specify purpose, audience, delivery context, or slide count.
- `create_pptx` when the user wants a PowerPoint file directly.
- `create_deck` with `purpose`, `audience`, `slideCount`, and `contentMode` when those details are known and you need to inspect or edit DeckSpec.
- `create_deck_from_message_map` when the deck objective, desired action, and per-slide `SlideIntent` entries are known. This is the preferred path for high-stakes decks because it varies visual archetypes from the message plan instead of repeating generic cards.
- `generate_intent_diagram` for access-plane maps, closed privileged paths, and other known concept compositions before attempting general diagram generation.
- `generate_native_diagram` for editable architecture/security/control-plane/ponchi-e diagrams before attempting SVG image generation.
- `generate_schematic` for table/tree/flow/list/mockup visuals before attempting custom SVG.
- `generate_section_divider` for section/chapter title slides when a deck has more than six slides and spans multiple major sections.
- `generate_visual_scaffold` to attach an editable right-rail concept visual (panel + icon/monogram + heading + aspect chips) to a content slide that has no dedicated diagram, avoiding text-only/low-richness slides.
- `suggest_icon` to map a free-text concept/keyword (JA/EN) to the best-matching builtin icon name and inline SVG when composing your own cards, lists, or grids.
- `design://modern-slide-principles` when the agent needs modern slide composition guidance.
- `plan_source_visual` when summarizing a source document or URL that contains figures. It helps the agent choose whether to quote the original figure, recreate it as editable PowerPoint objects, or use it only as inspiration.

The default deck generator follows the design reference principles: three-second glance test, one slide / one message, high signal-to-noise, visible hierarchy, diagrams/icons on slides, and accessibility checks before rendering.

When using source visuals, prefer recreation as editable PowerPoint shapes when the goal is explanation, localization, simplification, or later editing. Quote original figures only when exact fidelity is required and usage rights are clear; record attribution in `metadata.sources`, `sourceId`, and `citation`.

When a deck uses external websites as references, record each source in `metadata.sources` with its actual `url`. `render_pptx`, `render_studio`, and `polish_deck_layout` automatically add or update the final references slide (`参考URL・出典` / `References and sources`) so the deck ends with a consolidated list of reference URLs. Per-slide citations are optional for URL-backed sources as long as the final references slide contains the actual URLs.

## Multi-agent slide authoring

For larger or higher-stakes decks, pptcreater supports a six-role agent workflow — Director,
Story Architect, Content Strategist, Designer, Copywriter, and Reviewer — coordinated around one
shared `DeckSpec`. Delegate multi-slide, important, executive, or customer-facing decks to the
**Deck Director** rather than free-handing them. The Director is host-independent: when the host can
spawn sub-agents it dispatches to the specialists; when it cannot, it plays each role itself and
returns an executable step-by-step plan. Each slide's figure is chosen with `recommend_figure`
(curated design-pack component vs. generated schematic) and realised with the matching tool —
never by hand-placing boxes and connectors, and never by writing a script that imports
`@pptcreater/core` directly. The Reviewer step is the required gate and is deterministic: `reviewDeck`
runs lint + content + business reviews in one pass, classifies every finding (blocking /
polish-fixable / advisory), scores the deck (accessibility / content / structure / overall), and
routes each issue to the agent role that owns the fix, so the iteration loop stops on objective
criteria.

```powershell
pptcreater agents                 # print the role pipeline + hand-off contracts
pptcreater figure --message "導入の手順を5つの工程で示す"   # recommend a figure (design-pack vs schematic)
pptcreater review deck.json       # aggregated, routed, scored review gate
pptcreater review deck.json --json --no-business
```

From MCP, use `list_agent_roles` to discover the pipeline, `recommend_figure` to pick a figure per
slide (curated design-pack component vs. generated schematic, with item-count validation), and
`review_deck` as the Reviewer/stop condition (then `finalize_deck` + `render_pptx` when `ok` is
true). Ready-made Copilot CLI / VS Code custom agents for all six roles live in
[`.github/agents/`](.github/agents) (`deck-director` and five specialists). See
[`docs/AGENTS.md`](docs/AGENTS.md) for the roles, contracts, routing table, and loop.

## Design principles

- One slide, one message
- Mostly visual, with room for prose: most content slides carry a figure/structure, but text-rich
  detail / Q&A / 得られること(benefits) slides are first-class via `generate_detail_slide` (layout
  `detail`/`qa`) — exempt from the visual-richness gate, with concise titles but fuller body copy
- Template-level accessibility defaults
- WCAG-inspired contrast thresholds
- Explicit reading order and alternative text
- Japanese/English aware typography and copy density
- Extensible renderers, assets, templates, diagram generators, and MCP tools
