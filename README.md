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
npm install
npm run build
npm link
pptcreater --help
```

## Design principles

- One slide, one message
- Template-level accessibility defaults
- WCAG-inspired contrast thresholds
- Explicit reading order and alternative text
- Japanese/English aware typography and copy density
- Extensible renderers, assets, templates, diagram generators, and MCP tools