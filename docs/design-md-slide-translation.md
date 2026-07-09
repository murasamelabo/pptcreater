# DESIGN.md to Slide Design Brief

`DESIGN.md` files are useful for pptcreater, even when they were written for web UI. Treat them as a source of design intent, not as PowerPoint templates or component instructions.

The goal is to translate a brand/UI design document into a slide-specific design brief before choosing visual grammars or rendering objects.

## What To Reuse

From a DESIGN.md-style source, extract:

- visual theme and atmosphere: formal, editorial, technical, playful, luxury, public-sector, etc.
- color palette and role: background, surface, accent, danger, success, muted text, divider.
- typography: heading/body font intent, weight contrast, hierarchy, line-height, and Japanese fallback rules.
- layout principles: whitespace, grid, density, rhythm, alignment, edge treatment.
- depth and surface rules: flat, framed, card-based, layered, photographic, diagram-first.
- do/don't rules: forbidden motifs, overused gradients, card density, icon style, tone of copy.
- agent prompt guidance: short operational rules that can steer generation.

## What Not To Copy

Do not copy a brand identity wholesale unless the user owns or explicitly asks for that brand treatment. Do not import web button styles, nav bars, hover states, or responsive breakpoints as slide requirements. For slides, these become broader constraints: palette, hierarchy, spacing, material, and rhythm.

## Translation Map

| DESIGN.md section | Slide Design Brief field | PPT impact |
| --- | --- | --- |
| Visual Theme & Atmosphere | `mood`, `density`, `voice` | theme direction, cover/section rhythm, visual grammar preference |
| Color Palette & Roles | `tokens.colors` candidate | deck background/surface/accent, risk/success colors, table emphasis |
| Typography Rules | `typography` intent | title/body/caption scale, Japanese line-height, mixed Latin/CJK treatment |
| Component Stylings | `surface vocabulary` | card shape, divider style, chip style, callout panels |
| Layout Principles | `layout discipline` | margins, grid, whitespace, reading path, density ceiling |
| Depth & Elevation | `surface hierarchy` | flat vs layered panels, shadow avoidance, framed tools |
| Do's and Don'ts | `review guardrails` | anti-pattern checks before render |
| Responsive Behavior | `slide adaptation` | what to simplify on dense slides or handout slides |
| Agent Prompt Guide | `generation hints` | first-pass rules for agents and MCP tools |

## Japanese DESIGN.md Notes

Japanese UI design docs are especially valuable because slide generation often fails on CJK typography before it fails on color.

When translating Japanese DESIGN.md sources, preserve:

- Japanese font fallback intent: Japanese font first, Latin fallback second, generic last.
- wider line-height than Latin-heavy layouts.
- CJK line-break awareness: avoid orphan particles, punctuation-only lines, and split compound nouns.
- mixed Latin/Japanese spacing: keep code terms readable without cutting identifiers.
- lower information density when the reading path is not obvious.

## Use In The Pipeline

1. Read source content and DESIGN.md-style design source separately.
2. Create a Deck Strategy and MessageSpec from content first.
3. Create a Slide Design Brief from DESIGN.md: theme, palette, typography, spacing, density, surface rules, don'ts.
4. Choose visual grammar from communicative purpose and data shape.
5. Apply the design brief to grammar rendering: colors, type scale, spacing, panels, icon style, rhythm.
6. Review against both message clarity and design guardrails.

## Guardrail

If message clarity and borrowed visual style conflict, message clarity wins. A slide that looks branded but does not communicate its comparison, process, decision, or key relationship fails the deck.