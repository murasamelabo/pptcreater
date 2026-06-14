# pptcreater

Agent-friendly PowerPoint creation toolkit focused on concise, well-designed, accessible slides.

## What this project provides

- A typed `DeckSpec` intermediate representation for slide decks
- Design and accessibility linting before rendering
- Accessible template and skill-pack primitives
- SVG asset sanitizing/search/generation helpers
- A simple ponchi-e/diagram SVG DSL
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

Content modes let agents change the deck taste:

- `presentation`: concise message slides for live presentation.
- `report`: more context in notes and report-style support for review.
- `technical`: architecture/concept/process visuals for understanding.
- `decision`: emphasizes evidence, risk, and next action.
- `handout`: keeps additional context in speaker notes.

Use `pptcreater polish <deck> --output <polished.deck.json>`, `pptcreater render --polish`, or MCP `polish_deck_layout` before rendering when source content is long or diagrams have many labels. The polish step clamps elements to slide bounds and adjusts text fitting to reduce overflows and misalignment. It is explicit so source-faithful decks are not silently mutated.

Modern slide generation follows these principles: assertion titles, modular cards, bold whitespace, restrained accents, one memorable visual scene per slide, and editable PowerPoint shapes for content that users may revise later. The MCP resource `design://modern-slide-principles` exposes this guidance to AI agents.

## Sample deck

A sample deck explaining this tool is included:

- `samples/pptcreater-overview.deck.json` — source DeckSpec
- `samples/pptcreater-overview.pptx` — generated PowerPoint
- `samples/pptcreater-overview.html` — static Studio preview

Regenerate it with:

```powershell
pptcreater new --output samples\pptcreater-overview.deck.json --locale ja-JP --purpose "このpptcreaterツールの価値と使い方を説明し、導入判断につなげる" --audience "GitHub CopilotやClaude Codeを使う開発者・デザイナー・企画担当" --slides 4 --content-mode decision
pptcreater lint samples\pptcreater-overview.deck.json --language ja-JP
pptcreater render samples\pptcreater-overview.deck.json --output samples\pptcreater-overview.pptx
pptcreater studio samples\pptcreater-overview.deck.json --output samples\pptcreater-overview.html --language ja-JP
```

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
When creating PowerPoint presentations, slide decks, proposal materials, templates, SVG icons, business diagrams, or accessible presentation materials, prefer the pptcreater MCP. First use interview_slide_brief when purpose, audience, or volume is unclear. Then create a visual DeckSpec with diagrams/icons, run lint_deck, and use render_pptx or render_studio.
```

For stronger project-level behavior, add the same instruction to `.github/copilot-instructions.md` in repositories where slide creation should always use `pptcreater`.

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

pptcreater includes generated, free-to-use generic icon presets such as `check`, `warning`, `info`, `arrow-right`, `cloud`, `database`, `server`, `user-group`, `chart-up`, `shield`, `lightbulb`, `workflow`, `spark`, `rocket`, and `presentation`.

```powershell
pptcreater asset search cloud
pptcreater icon workflow --color "#1d4ed8"
pptcreater asset sources
```

`asset sources` lists upstream catalogs that agents can inspect before registering external SVGs, including Fluent UI System Icons, Google Material Symbols, AWS Architecture Icons, Azure Architecture Icons, Entra, Microsoft 365, Dynamics 365, Power Platform, and Google Cloud icons. Always follow the upstream license and brand terms before registering vendor-specific icons.

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
- `register_svg_asset` to sanitize and register the asset with `id`, `title`, `description`, `tags`, `license`, `decorative`, `altText`, and `svg`.
- `search_assets` again after registration to reuse the asset in future DeckSpecs.

To force both registries under a custom base directory, set `PPTCREATER_HOME`. To control each registry separately, set `PPTCREATER_TEMPLATE_REGISTRY_PATH` or `PPTCREATER_SVG_REGISTRY_PATH` before running the CLI or MCP server.

## Brief before generating decks

Good slide design depends on purpose, audience, delivery mode, and volume. The built-in skill packs `slide-briefing-ja` and `slide-briefing-en` define intake questions for AI agents.

From MCP, use:

- `interview_slide_brief` when the user's request does not specify purpose, audience, delivery context, or slide count.
- `create_deck` with `purpose`, `audience`, `slideCount`, and `contentMode` when those details are known.
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