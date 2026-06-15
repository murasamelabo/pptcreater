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

The starter visuals are generated as native PowerPoint shapes and text boxes where possible, not flattened screenshots. This means cards, labels, workflow nodes, arrows, and roadmap elements can be edited later in PowerPoint.

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

From MCP, use `create_pptx` when the user simply asks for a `.pptx`. It creates a styled DeckSpec, lints it, polishes layout, and renders the PowerPoint in one call. Use the lower-level `create_deck` -> `lint_deck` -> `render_pptx` workflow only when you need to manually edit the DeckSpec.

Use `pptcreater polish <deck> --output <polished.deck.json>`, `pptcreater render --polish`, or MCP `polish_deck_layout` before rendering when source content is long or diagrams have many labels. The polish step clamps elements to slide bounds, rebalances Japanese/English line breaks, and adjusts text fitting to reduce overflows and misalignment. `render_pptx` also applies this safeguard automatically before drawing. If text still cannot fit after polish, `layout.text-overflow-risk` is a render-blocking error; shorten the copy, split the slide, or choose a schematic/table/list layout instead of forcing a broken PPTX.

Lint also flags `layout.text-overflow-risk`, `layout.out-of-bounds`, and `layout.text-overlap` so agents can detect and fix collisions and overflow before delivering a deck.

For lower cognitive load, use one visual grammar per slide: `table` for comparisons, `tree` for hierarchy, `flow` / `vertical-flow` for processes, and `list` / `list-horizontal` for 3-4 key points. Avoid many custom text boxes with uneven manual line breaks.


Modern slide generation follows these principles: assertion titles, modular cards, bold whitespace, restrained accents, one memorable visual scene per slide, and editable PowerPoint shapes for content that users may revise later. The MCP resource `design://modern-slide-principles` exposes this guidance to AI agents.

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
git checkout murasamelabo/plan-slide-tool
npm install
npm run build
npm link
pptcreater --help
```

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
When creating PowerPoint presentations, slide decks, proposal materials, templates, SVG icons, business diagrams, or accessible presentation materials, prefer the pptcreater MCP. Use create_pptx for direct PPTX output. For custom DeckSpecs, first use interview_slide_brief when purpose, audience, or volume is unclear, use generate_schematic for table/tree/flow/list/mockup visuals, then run lint_deck and render_pptx or render_studio.
```

For stronger project-level behavior, add the same instruction to `.github/copilot-instructions.md` in repositories where slide creation should always use `pptcreater`.

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

pptcreater includes generated, free-to-use generic icon presets for UI, business, security, data, flow, and slide-design patterns (57 presets including `check`, `warning`, `info`, `table`, `tree`, `list`, `lock`, `key`, `laptop`, `chart-up`, `shield`, `workflow`, `rocket`, and `presentation`). These bundled preset SVG files are visible under `assets\svg\presets\`.

```powershell
pptcreater asset search cloud
pptcreater icon workflow --color "#315f9f"
pptcreater asset sources
```

`asset sources` lists upstream catalogs that agents can inspect before registering external SVGs, including Fluent UI System Icons, Google Material Symbols, AWS Architecture Icons, Azure Architecture Icons, Entra, Microsoft 365, Dynamics 365, Power Platform, and Google Cloud icons. Those vendor icon sets are not bundled in this repository; always follow the upstream license and brand terms before registering vendor-specific icons.

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

## Design principles

- One slide, one message
- Template-level accessibility defaults
- WCAG-inspired contrast thresholds
- Explicit reading order and alternative text
- Japanese/English aware typography and copy density
- Extensible renderers, assets, templates, diagram generators, and MCP tools
