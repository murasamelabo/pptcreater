# Multi-agent slide authoring

pptcreater is designed so a small team of specialised agents can build a deck together, with one
**Director** owning the shared `DeckSpec` and an objective, deterministic review gate deciding when
the deck is done. This document defines the roles, the hand-off contracts between them, the
iteration loop, and how each role maps onto the existing pptcreater tools.

Run `pptcreater agents` (or the MCP tool `list_agent_roles`) to print the live role definitions, and
`pptcreater review <deck.json>` (or the MCP tool `review_deck`) to run the aggregated quality gate.

## Roles

| # | Role | Owns | Consumes → Produces |
|---|------|------|---------------------|
| 1 | **Director (Orchestrator)** | The shared `DeckSpec` and run state | `DeckBrief` → final `.pptx` |
| 2 | **Story Architect** | Narrative & chapter structure | `DeckBrief` → `DeckOutline` |
| 3 | **Content Strategist** | Per-slide message, info, figure kind, data | `DeckOutline` → `SlidePlan[]` |
| 4 | **Designer** | Layout, template, figures, colour, icons, placement | `SlidePlan` → slide elements |
| 5 | **Copywriter** | Titles, leads, labels, captions, alt text | slide elements → finalised copy |
| 6 | **Reviewer** | Accessibility / structure / copy / layout scoring | `DeckSpec` → `DeckReviewReport` |

The Reviewer step is implemented deterministically by `reviewDeck` (see below), so the loop
terminates on objective criteria rather than model judgement. The other five roles are LLM agents
that call pptcreater tools.

## Pipeline

```
DeckBrief
  │
  ▼ 1. Director — clarify brief, pick skill pack + budget, sequence agents
  ▼ 2. Story Architect → DeckOutline      (plan_business_deck, interview_slide_brief)
  ▼ 3. Content Strategist → SlidePlan[]   (recommend_template, list_design_components, list_schematic_presets)
  ├─────────────── parallel ───────────────┐
  ▼ 4. Designer                            ▼ 5. Copywriter
     (render_design_component,                (review_content guidance,
      generate_schematic / native_diagram /    textReplacements for curated data,
      intent_diagram, generate_visual_scaffold, concise titles / labels / alt text)
      generate_section_divider, suggest_icon,
      recommend_template, polish_deck_layout)
  └──────────────→ DeckSpec (draft) ←───────┘
  ▼ 6. Reviewer → DeckReviewReport         (review_deck = lint + content + business, routed)
  │     ├─ ok = false → dispatch each blocking issue to its owner role, then re-run (max N loops)
  │     └─ ok = true
  ▼ 1. Director — finalize_deck → render_pptx → final .pptx
```

## Figure selection (Content Strategist → Designer)

`selectFigure` (CLI `pptcreater figure`, MCP `recommend_figure`) turns a slide's one-sentence
message — or an explicit `figureKind` — into a concrete renderer choice:

- **renderer** — `design-pack` (a curated, fully-editable component via `render_design_component`)
  when a matching kind exists, otherwise `schematic` (a generated native figure via
  `generate_schematic`).
- **kind** — the concrete design-pack or schematic kind to render.
- **itemRange** — how many data points the figure expects (the selector warns when the slide's
  `itemCount` is outside it, so the Content Strategist can split or simplify).
- **rationale + alternatives** — why this figure, and other viable intents for the Designer.

The selector is deterministic and keyword-driven (JA + EN cues), preferring curated components so
the deck stays editable. Example: "導入の手順を5つの工程で示す" → `process-horizontal` →
design-pack `flow-horizontal` (items 3–6). Use `pptcreater figure --list` to see every intent.

## Hand-off contracts

Keep the data passed between agents typed and explicit so the workflow is reproducible and the
ambiguity stays inside each agent, not between them.

- **DeckBrief** — purpose, audience, usage context, desired action, tone/brand, constraints
  (time, slide count, customer-facing). Mirrors `BusinessDeckBrief`.
- **DeckOutline** — the narrative model (PREP / SCQ / …) plus `sections[]` with title, role, claim,
  and slide-count hint. Produced by `plan_business_deck` (`BusinessDeckPlan.sections`).
- **SlidePlan[]** — one entry per slide: `{ message (one sentence), evidence[], figureKind, data,
  layoutHint, reviewFlags }`. Mirrors `BusinessSlidePlan` and adds the chosen figure kind/data.
- **DeckReviewReport** — `reviewDeck` output: `ok`, `scores`, `blocking[]`, `polishFixable[]`,
  `advisory[]`, `ownerQueues`, `summary`.

## The review gate (`reviewDeck`)

`reviewDeck(deck, options)` runs three existing reviewers in one pass and routes every finding to the
role that must fix it:

- **lint** (`lintDeckSpec`) — accessibility (contrast, font size, alt text), layout (overflow,
  overlap, bounds, shape-over-text), visual richness, diagram editability.
- **content** (`reviewDeckContent`) — one-message titles, prose vs. slide phrasing, bullet counts.
- **business** (`reviewBusinessDeck`) — executive summary, agenda/section pacing, lead sentences,
  equal emphasis, final landing, source traceability. Optional via `includeBusinessReview`.

Each finding becomes a `RoutedReviewIssue` with:

- **disposition** — `blocking` (must fix by hand), `polish-fixable` (auto-resolved by
  `finalize_deck` / layout polish), or `advisory`.
- **owner** — the `AgentRoleId` responsible (`ownerForCode` maps each code, with prefix fallbacks).
- **scores** — accessibility / content / structure / overall, 0–100.

**Stop condition:** the deck is ready when `report.ok === true` (no blocking issues). Polish-fixable
items are resolved automatically by `finalize_deck`; advisory notes are optional improvements.

### Routing summary

| Finding family | Owner |
|----------------|-------|
| `layout.*`, `visual.*`, `diagram.*`, `element.*`, `business.equal-emphasis` | **Designer** |
| `text.*`, `content.*`, `*alt-text*`, `*low-contrast*`, `*small-font*`, `layout.bad-line-break` | **Copywriter** |
| `slide.title-duplicate`, most `business.*` | **Story Architect** |
| `source.*`, `slide.text-density`, `business.source-traceability` | **Content Strategist** |

## Implementation status

- **Phase 1 (done):** role/contract definitions (`AGENT_ROLES`, `describeAgentPipeline`), the
  deterministic review gate (`reviewDeck`), and their CLI (`agents`, `review`) and MCP
  (`list_agent_roles`, `review_deck`) surfaces.
- **Phase 2 (done):** deterministic figure selection (`selectFigure` / `pptcreater figure` /
  `recommend_figure`) mapping per-slide intent to a curated design-pack component or a generated
  schematic, with item-count validation — the Content Strategist → Designer bridge.
- **Phase 3 (next):** wrap the loop as Copilot CLI custom agents (one per role), with the Director
  dispatching via the Task tool and using `review_deck` as the stop condition.

## How to drive it today

1. Director: `pptcreater rules` / `list_skills`, then ask the Story Architect to run
   `plan_business_deck`.
2. Content Strategist turns the plan into `SlidePlan[]`, choosing a `figureKind` per slide with
   `recommend_figure` (or `pptcreater figure --message "…"`), which also picks the renderer
   (curated design-pack vs. schematic) and validates the item count.
3. Designer renders elements (`render_design_component`, `generate_schematic`, …); Copywriter writes
   concise copy and `textReplacements` for curated components.
4. Reviewer: `pptcreater review deck.json` (or `review_deck`). For each blocking issue, hand it to
   `issue.owner` and repeat.
5. Director: `pptcreater finalize deck.json --output deck.pptx` (or `finalize_deck` + `render_pptx`).
