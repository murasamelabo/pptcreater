# pptcreater

Agent-friendly PowerPoint creation toolkit focused on concise, well-designed, accessible slides.

## What this project provides

- A typed `DeckSpec` intermediate representation for slide decks
- Design and accessibility linting before rendering
- Accessible template and skill-pack primitives
- SVG asset sanitizing/search/generation helpers
- A simple ponchi-e/diagram SVG DSL plus preset schematics for tables, trees, flows, lists, and mockups
- PowerPoint `.pptx` rendering
- CLI and MCP surfaces for GitHub Copilot, Claude Code, and other agent workflows
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
npm run cli -- studio examples\generated.deck.json --output generated\studio.html --language ja-JP
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

The starter visuals are generated as native PowerPoint shapes and text boxes where possible, not flattened screenshots. This means cards, labels, and roadmap elements can be edited later in PowerPoint. For any diagram with arrows or connected nodes (architecture, flow, sequence, ponchi-e), use `generate_diagram` instead of hand-placing `line`/`rightArrow` shapes: omit node `x`/`y` to get an automatic layered layout, and connectors clip to node borders with real arrowheads and detour through clear gutters when they skip a rank, so arrows never dangle, mis-angle, or pierce a node. The returned SVG is embedded as one accessible `diagram` element. (`lint_deck` emits `diagram.native-connectors` when it detects a connected diagram built from hand-placed arrow shapes.)

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

From MCP, use `create_pptx` when the user simply asks for a `.pptx`. It creates a styled DeckSpec, lints it, polishes layout, and renders the PowerPoint in one call. Use the lower-level `create_deck` -> `review_content` -> `lint_deck` -> `render_pptx` workflow only when you need to manually edit the DeckSpec.

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

`visual.richness-missing` and `visual.richness-deck` are also render-blocking: pptcreater should not deliver text-only content slides. Add `generate_schematic`, `generate_diagram`, registered icons, images, or card/shape composition so at least 75% of content slides have visual structure.

Lint blocks `layout.text-overflow-risk`, `layout.out-of-bounds`, `layout.text-overlap`, `layout.bad-line-break`, and `visual.svg-text-too-small` so agents must fix overflow, collision, orphan lines, and unreadably tiny SVG-internal diagram labels before delivering a deck. Content-quality rules from `review_content` are also included in `lint_deck` as warnings/suggestions. `layout.enumeration-hierarchy` warns when body-only enumerations should be converted to callout headings, icons, accent rules, or schematic list/table layouts.

For lower cognitive load, use one visual grammar per slide: `table` for comparisons, `tree` for hierarchy, `flow` / `vertical-flow` for processes, and `list` / `list-horizontal` for 3-4 key points. Avoid many custom text boxes with uneven manual line breaks. When embedding SVG diagrams that contain `<text>`, keep the diagram large enough that internal labels remain at least 8pt after scaling; otherwise split the diagram or recreate it with `generate_diagram` / `generate_schematic`.


Modern slide generation follows these principles: content-mode-aware titles/messages, modular cards, bold whitespace, restrained accents, one memorable visual scene per slide, and editable PowerPoint shapes for content that users may revise later. The MCP resource `design://modern-slide-principles` exposes this guidance to AI agents.

## Slideland-style schematic presets

For structured visuals, prefer MCP `generate_schematic` instead of freehand SVG. It returns safe SVG for common slide patterns inspired by Slideland categories:

- `table`: comparison/KPI matrix
- `tree`: hierarchy and branching
- `flow`: horizontal process
- `vertical-flow`: step-by-step vertical process
- `list`, `list-horizontal`, `list-enumeration`: clean bullet/list layouts
- `mockup`: UI/mockup-style visual block

Each schematic supports `tone`: `minimal`, `cool`, `luxury`, or `report`. The presets use low-chroma palettes, aligned grids, readable labels, and safe SVG elements, reducing renderer failures such as unsupported filters, styles, or complex patterns.

CLI usage:

```powershell
pptcreater schematic .\examples\flow-schematic.json --output generated\flow.svg
```

## Sample deck

A sample deck explaining this tool is included:

- `samples/pptcreater-overview.deck.json` — source DeckSpec
- `samples/pptcreater-overview.pptx` — generated PowerPoint
- `samples/pptcreater-overview.html` — static Studio preview
- `samples/pptcreater-overview-minimal.*` — minimal/simple explanation pattern
- `samples/pptcreater-overview-stylish.*` — stylish/cool presentation pattern
- `samples/pptcreater-overview-report.*` — formal report pattern
- `samples/pptcreater-overview-presentation.*` — bold live-presentation pattern
- `samples/pptcreater-overview-technical.*` — technical/architecture pattern
- `samples/schematic-patterns.deck.json` — Slideland-inspired schematic preset examples
- `samples/schematic-patterns.pptx` — generated schematic examples
- `samples/schematic-patterns.html` — static Studio preview

Regenerate it with:

```powershell
pptcreater new --output samples\pptcreater-overview.deck.json --locale ja-JP --purpose "このpptcreaterツールの価値と使い方を説明し、導入判断につなげる" --audience "GitHub CopilotやClaude Codeを使う開発者・デザイナー・企画担当" --slides 4 --content-mode decision
pptcreater lint samples\pptcreater-overview.deck.json --language ja-JP
pptcreater render samples\pptcreater-overview.deck.json --output samples\pptcreater-overview.pptx
pptcreater studio samples\pptcreater-overview.deck.json --output samples\pptcreater-overview.html --language ja-JP
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
git checkout v0.1.1
npm install
npm run build
npm link
pptcreater --help
```

For development or quick follow-up, use `main` instead of a release tag. For stable operational use, pin a tag such as `v0.1.1`, record that tag/commit in the consuming project, and update deliberately after smoke testing.

## Updating an existing installation

When `pptcreater` is installed as a normal Git clone, updates are easy to track and roll back:

```powershell
cd C:\tools\pptcreater
git status
git fetch --tags origin
git checkout v0.1.1
npm install
npm run build
npm link
pptcreater --help
```

If you intentionally track active development, replace `git checkout v0.1.1` with:

```powershell
git checkout main
git pull --ff-only origin main
```

After updating, run a smoke test before using it from Copilot or Claude Code:

```powershell
pptcreater new --output generated\smoke.deck.json --locale ja-JP --content-mode report
pptcreater render generated\smoke.deck.json --output generated\smoke.pptx --polish
pptcreater studio generated\smoke.deck.json --output generated\smoke.html --language ja-JP
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
When creating PowerPoint presentations, slide decks, proposal materials, templates, SVG icons, business diagrams, or accessible presentation materials, prefer the pptcreater MCP. Use create_pptx/create_powerpoint for direct PPTX output. For custom DeckSpecs, first use interview_slide_brief when purpose, audience, or volume is unclear, use review_content to apply locale/content-mode writing rules, use search_assets and generate_schematic/generate_diagram for visual structure, then run lint_deck and render_pptx/render_powerpoint or render_studio. If the MCP render tool is not visible in the current tool selection, run the CLI fallback `pptcreater render <deck.json> --output <deck.pptx> --polish`. Never deliver text-only content slides; visual.richness-* lint errors must be fixed before final output.
```

For stronger project-level behavior, add the same instruction to `.github/copilot-instructions.md` in repositories where slide creation should always use `pptcreater`.

Avoid falling back to PowerPoint COM automation, ad-hoc scripts, or manual PPTX generation for normal deck creation. If MCP `render_pptx` / `render_powerpoint` is not exposed, use the CLI fallback `pptcreater render <deck.json> --output <deck.pptx> --polish` instead. If you generate local SVG/PNG/JPEG/GIF/WebP files during research, reference them from DeckSpec `image.path` as workspace-local files and still call pptcreater render; pptcreater will sanitize SVGs and embed the files safely.

## Install project guidance files

You can install project-level guidance files so GitHub Copilot and Claude Code know to brief first and use pptcreater for slide work.

For GitHub Copilot:

```powershell
pptcreater install-copilot --target C:\path\to\your-project
```

This creates or updates:

- `.github\pptcreater-skills.md`
- `.github\copilot-instructions.md`

For Claude Code:

```powershell
pptcreater install-claude-code --target C:\path\to\your-project
```

This creates or updates:

- `.github\pptcreater-skills.md`
- `CLAUDE.md`

Both commands are idempotent. Existing instruction files are updated inside a managed `pptcreater` block. Existing root-level `SKILLS.md` files are not modified. Pass `--no-instructions` if you only want to install `.github\pptcreater-skills.md` without updating `.github\copilot-instructions.md` or `CLAUDE.md`.

## Add PowerPoint templates

Templates are registered as pptcreater template manifests: JSON files that define design tokens, layouts, locale, tags, and accessibility constraints. Direct `.pptx` / `.potx` template import is not supported yet; use a manifest to describe the reusable slide system.

Start from an existing template:

```powershell
pptcreater template list --json
```

Create a manifest such as `templates\my-template\template.json`, then register it:

```powershell
pptcreater template register templates\my-template\template.json
pptcreater template list
```

Registered custom templates are stored in:

```powershell
pptcreater template registry-path
```

By default this is a user-level registry under your pptcreater config directory, such as `%APPDATA%\pptcreater\templates\registry.json` on Windows or `~/.config/pptcreater/templates/registry.json` on Linux. Commit a registry file only when you intentionally set `PPTCREATER_TEMPLATE_REGISTRY_PATH` to a project path and want to share it with teammates.

From an MCP-capable AI agent, use:

- `search_templates` to inspect existing templates before creating duplicates.
- `register_template` to register a complete template manifest.
- `deckspec://schema` to understand how `template` ids are referenced from decks.

## Add reusable SVG icons and assets

SVG icons can be registered as sanitized reusable assets. Use this for icons, logos, simple illustrations, and diagram parts that should be reused across decks.

pptcreater includes generated, free-to-use generic icon presets for UI, business, security, data, flow, slide-design, and cloud architecture patterns. In addition to base icons such as `check`, `table`, `tree`, `lock`, `workflow`, and `presentation`, `search_assets` includes Microsoft/Azure/Entra/Microsoft 365/Power Platform/Dynamics 365, AWS, and Google Cloud/Workspace preset pictograms such as `preset-azure-architecture`, `preset-entra-identity`, `preset-aws-cloud`, and `preset-google-cloud`. These vendor presets are generated generic pictograms, not official logos or product icons. Bundled preset SVG files are visible under `assets\svg\presets\`.

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
- `search_assets` before registering a new SVG, to avoid duplicates.
- `generate_schematic` before freehand SVG when the visual is a table, tree, flow, list, or mockup.
- `register_svg_asset` to sanitize and register the asset with `id`, `title`, `description`, `tags`, `license`, `decorative`, `altText`, and `svg`.
- `search_assets` again after registration to reuse the asset in future DeckSpecs.

To force both registries under a custom base directory, set `PPTCREATER_HOME`. To control each registry separately, set `PPTCREATER_TEMPLATE_REGISTRY_PATH` or `PPTCREATER_SVG_REGISTRY_PATH` before running the CLI or MCP server.

## Brief before generating decks

Good slide design depends on purpose, audience, delivery mode, and volume. The built-in skill packs `slide-briefing-ja` and `slide-briefing-en` define intake questions for AI agents.

From MCP, use:

- `interview_slide_brief` when the user's request does not specify purpose, audience, delivery context, or slide count.
- `create_pptx` when the user wants a PowerPoint file directly.
- `create_deck` with `purpose`, `audience`, `slideCount`, and `contentMode` when those details are known and you need to inspect or edit DeckSpec.
- `generate_schematic` for table/tree/flow/list/mockup visuals before attempting custom SVG.
- `design://modern-slide-principles` when the agent needs modern slide composition guidance.
- `plan_source_visual` when summarizing a source document or URL that contains figures. It helps the agent choose whether to quote the original figure, recreate it as editable PowerPoint objects, or use it only as inspiration.

The default deck generator follows the design reference principles: three-second glance test, one slide / one message, high signal-to-noise, visible hierarchy, diagrams/icons on slides, and accessibility checks before rendering.

When using source visuals, prefer recreation as editable PowerPoint shapes when the goal is explanation, localization, simplification, or later editing. Quote original figures only when exact fidelity is required and usage rights are clear; record attribution in `metadata.sources`, `sourceId`, and `citation`.

When a deck uses external websites as references, record each source in `metadata.sources` with its actual `url`. `render_pptx`, `render_studio`, and `polish_deck_layout` automatically add or update the final references slide (`参考URL・出典` / `References and sources`) so the deck ends with a consolidated list of reference URLs. Per-slide citations are optional for URL-backed sources as long as the final references slide contains the actual URLs.

## Design principles

- One slide, one message
- Template-level accessibility defaults
- WCAG-inspired contrast thresholds
- Explicit reading order and alternative text
- Japanese/English aware typography and copy density
- Extensible renderers, assets, templates, diagram generators, and MCP tools
