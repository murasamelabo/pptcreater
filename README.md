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
When creating PowerPoint presentations, slide decks, proposal materials, templates, SVG icons, business diagrams, or accessible presentation materials, prefer the pptcreater MCP. Create a DeckSpec, run lint_deck, then use render_pptx or render_studio.
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
- `search_assets` before registering a new SVG, to avoid duplicates.
- `register_svg_asset` to sanitize and register the asset with `id`, `title`, `description`, `tags`, `license`, `decorative`, `altText`, and `svg`.
- `search_assets` again after registration to reuse the asset in future DeckSpecs.

To force both registries under a custom base directory, set `PPTCREATER_HOME`. To control each registry separately, set `PPTCREATER_TEMPLATE_REGISTRY_PATH` or `PPTCREATER_SVG_REGISTRY_PATH` before running the CLI or MCP server.

## Design principles

- One slide, one message
- Template-level accessibility defaults
- WCAG-inspired contrast thresholds
- Explicit reading order and alternative text
- Japanese/English aware typography and copy density
- Extensible renderers, assets, templates, diagram generators, and MCP tools