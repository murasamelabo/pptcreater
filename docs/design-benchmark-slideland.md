# Slideland Design Benchmark

This note records the design traits observed from the Slideland taste reference pages inspected on
2026-06-28:

- https://www.slideland.tech/docs/taste/cool
- https://www.slideland.tech/docs/taste/minimal
- https://www.slideland.tech/docs/taste/trust

Use these pages as a taste benchmark, not as source material to copy. They inform how pptcreater
should evaluate expression quality, typography, placement, spacing, whitespace, and color discipline.

## Cool / Stylish

Observed examples lean on black, blue, green, red, and strong two-tone treatments across company
decks, IR decks, culture decks, and presentation covers. The common pattern is not decoration density;
it is controlled confidence:

- high contrast between background, type, and one accent
- large title areas or image crops with clear focal hierarchy
- generous negative space around the main statement
- editorial asymmetry rather than evenly filled grids
- accent color used as a deliberate signal, not repeated on every card

## Minimal / Simple

Observed examples use black, light blue, white, and sparse icon/flow/tree treatments. The design value
comes from reduction:

- few elements per slide and few colors per slide
- exact alignment and quiet grids
- simple flow, tree, before-after, or venn structures instead of busy diagrams
- strong text hierarchy despite the reduced palette
- whitespace that separates groups without extra rules or borders

## Trust

Observed examples appear often in company profiles, IR materials, manufacturing, healthcare,
education, real estate, finance, and integrated reports. They favor calm reliability:

- navy, blue, brown, beige, green, and other restrained palettes
- stable grids and predictable reading order
- tables/charts that prioritize legibility over ornament
- conservative but not flat typography hierarchy
- measured spacing that keeps dense information readable

## Review Heuristics

The visual review gate should evaluate:

- Expression: does the slide have a clear visual idea, or is it only generic cards and text?
- Typography: is there an obvious entry point through title, number, or callout hierarchy?
- Placement: are objects aligned to a deliberate grid or visual path?
- Spacing and whitespace: do related items sit together while unrelated groups breathe?
- Color: is there one dominant accent and a neutral support system, or many competing colors?

Current deterministic advisories:

- `visual.slideland-whitespace-tight`
- `visual.slideland-typography-flat`
- `visual.slideland-color-discipline`

These warnings are not blockers by themselves. They tell the Designer and Reviewer to compare the deck
against the `cool`, `minimal`, and `trust` reference families and decide whether refinement is needed.