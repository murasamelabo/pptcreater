import { lstat, mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const SKILLS_BLOCK_START = "<!-- pptcreater:skills:start -->";
const SKILLS_BLOCK_END = "<!-- pptcreater:skills:end -->";
const COPILOT_BLOCK_START = "<!-- pptcreater:copilot:start -->";
const COPILOT_BLOCK_END = "<!-- pptcreater:copilot:end -->";
const CLAUDE_BLOCK_START = "<!-- pptcreater:claude:start -->";
const CLAUDE_BLOCK_END = "<!-- pptcreater:claude:end -->";

export type InstallTarget = "copilot" | "claude-code";

export type InstallGuidanceOptions = {
  targetDir: string;
  overwrite?: boolean;
  skillsFileName?: string;
  installInstructions?: boolean;
  /** When false, skip copying the deck-building custom agents into .github/agents. Default true. */
  installAgents?: boolean;
};

export type InstallGuidanceResult = {
  targetDir: string;
  skillsPath: string;
  instructionPath?: string;
  /** Absolute paths of the custom agent files written into .github/agents. */
  agentPaths: string[];
  filesChanged: string[];
};

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    const nodeError = error as Error & { code?: string };
    if (nodeError.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function assertRegularTargetRoot(targetDir: string): Promise<string> {
  const stats = await lstat(targetDir);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`target must be an existing non-symlink directory: ${targetDir}`);
  }

  return realpath(targetDir);
}

function assertInsideRoot(root: string, candidate: string): void {
  const rel = relative(root, candidate);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`managed file path escapes target directory: ${candidate}`);
  }
}

async function ensureSafeDirectory(root: string, dir: string): Promise<void> {
  assertInsideRoot(root, dir);
  const rel = relative(root, dir);
  if (!rel) {
    return;
  }

  let current = root;
  for (const part of rel.split(/[\\/]+/).filter(Boolean)) {
    current = resolve(current, part);
    try {
      const stats = await lstat(current);
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw new Error(`managed directory cannot be a symlink or file: ${current}`);
      }
    } catch (error) {
      const nodeError = error as Error & { code?: string };
      if (nodeError.code !== "ENOENT") {
        throw error;
      }

      await mkdir(current);
    }
  }
}

async function assertSafeManagedFile(root: string, path: string): Promise<void> {
  assertInsideRoot(root, path);
  const parent = dirname(path);
  await ensureSafeDirectory(root, parent);

  try {
    const stats = await lstat(path);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error(`managed file cannot be a symlink or directory: ${path}`);
    }
  } catch (error) {
    const nodeError = error as Error & { code?: string };
    if (nodeError.code !== "ENOENT") {
      throw error;
    }
  }
}

async function readManagedFile(root: string, path: string): Promise<string> {
  await assertSafeManagedFile(root, path);
  return (await pathExists(path)) ? readFile(path, "utf8") : "";
}

async function writeManagedFile(root: string, path: string, contents: string): Promise<void> {
  await assertSafeManagedFile(root, path);
  const tempPath = resolve(dirname(path), `.pptcreater-${process.pid}-${Date.now()}-${randomUUID()}.tmp`);
  await writeFile(tempPath, contents, { flag: "wx" });
  await rename(tempPath, path);
}

function normalizeSkillsFileName(value = "pptcreater-skills.md"): string {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9._-]+\.md$/i.test(trimmed)) {
    throw new Error("skills file name must be a simple Markdown file name such as pptcreater-skills.md.");
  }

  return trimmed;
}

export function createSkillsMarkdown(): string {
  return `# pptcreater slide creation skills

${SKILLS_BLOCK_START}

Use this file as the project-level operating guide for AI agents creating PowerPoint decks with pptcreater.

## Required briefing before deck creation

Before creating a DeckSpec, clarify these points when they are not already specified:

1. Purpose: what should the audience understand, decide, or do?
2. Audience: who will read/watch this, and what do they already know?
3. Delivery mode: presentation, report, technical, handout, or decision.
4. Volume: target slide count, time limit, and section structure.
5. Source assets: URLs, documents, brand colors, templates, icons, diagrams, data, or logos.

## Recommended workflow

1. Use pptcreater MCP resources/tools where available.
2. Use \`interview_slide_brief\` when the request is underspecified.
3. Before writing custom DeckSpec, call \`get_slide_creation_rules\` (or CLI \`pptcreater rules --locale <locale> --content-mode <mode>\`) and keep the first draft inside those constraints instead of relying on repeated lint fixes.
4. For consulting-style, executive, customer-facing, important-meeting, or internal-friendly business decks, run \`plan_business_deck\` (or CLI \`pptcreater business-plan\`) before writing DeckSpec. It defines objective, reader action, section architecture, slide-level emphasis, reading path, and human-review flags.
5. Use \`generate_edit_with_copilot_prompt\` only when the user explicitly wants a PowerPoint for the web / Edit with Copilot prompt. This is an upstream prompt workflow; final deterministic output should still use pptcreater rendering when possible.
6. For a direct PPTX request, prefer \`create_pptx\` or \`create_powerpoint\` first. It creates, lints, polishes, and renders with safe defaults.
7. Use \`search_templates\` and \`search_assets\` before creating new assets.
8. Use \`generate_intent_diagram\` when the user supplies or implies an intended conceptual composition/granularity, especially Enterprise Access Model, closed privileged access paths, side-by-side good/bad comparisons, or control-plane maps. It turns the intent contract into editable \`shape\`/\`text\` elements and prevents LLM drift to a different level of detail.
9. Use \`generate_native_diagram\` for general architecture, security, enterprise control-plane, decision-flow, and ponchi-e diagrams that should remain editable in PowerPoint. Insert the returned \`shape\`/\`text\` elements directly into \`slide.elements\`; do not wrap them in \`image\`, \`svg\`, or \`diagram\`.
10. Use \`list_schematic_presets\` then \`generate_schematic\` for \`table\`, \`tree\`, \`flow\`, \`vertical-flow\`, \`cycle\`, \`before-after\`, \`map\`, \`puzzle\`, \`correlation\`, \`matrix\`, \`venn\`, \`cross\`, \`set\`, \`contrast\`, \`scale-contrast\`, \`grow\`, \`layer\`, \`triangle\`, \`step\`, \`gantt\`, \`ranking\`, \`list\`, \`list-horizontal\`, \`list-enumeration\`, and \`mockup\` visuals. Do not freehand complex SVG unless the preset cannot express the structure.
11. Use \`plan_source_visual\` for source figures: choose quote, recreate, or inspiration.
12. When external websites are used as references, record each one in \`metadata.sources\` with its actual \`url\`. The final slide must collect these URLs; \`polish_deck_layout\`, \`render_pptx\`, and \`render_studio\` append/update it automatically.
13. Create a visual DeckSpec with editable PowerPoint shapes/text where possible.
14. Run \`review_business_deck\` for business storyline, section flow, page emphasis, and final landing checks.
15. Run \`review_content\` (or CLI \`pptcreater content-review\`) before linting. It applies locale/content-mode writing rules: Japanese report/technical/handout decks use a short topic title + slide message, Japanese presentation/decision decks allow concise assertion titles, and English decks prefer action titles.
16. Run \`lint_deck\`.
17. Run \`polish_deck_layout\` when layout issues or overflow risks are present. \`render_pptx\` also applies this safeguard automatically.
18. Render with \`render_pptx\` / \`render_powerpoint\` or preview with \`render_studio\`. If text still cannot fit after polish, shorten or split the slide; do not force-render a broken layout.
19. If MCP render tools are not visible in the current tool selection, use the CLI fallback: \`pptcreater render <deck.json> --output <deck.pptx> --polish\`.
20. Do not bypass pptcreater with PowerPoint COM automation or ad-hoc PPTX scripts for normal deck creation. If research produces local SVG/PNG/JPEG/GIF/WebP files, reference workspace-local files via DeckSpec \`image.path\` only for logos/photos/source quotes/exact-fidelity figures and still call pptcreater render; pptcreater embeds them safely.

## Design rules

- One slide, one message.
- For business decks, define the section role, primary message, evidence, visual entry point, reading path, what to make prominent, and what to keep quiet before creating each slide.
- For decks longer than six slides, important meetings, executive decks, or customer-facing decks, include section architecture and consider Executive Summary, Agenda, and visually distinct section divider slides.
- Choose title/message style by content mode and locale: Japanese report/technical/handout = topic title + short slide message; Japanese presentation/decision = concise assertion title; English = action title.
- Prefer editable PowerPoint shapes/text over flattened images.
- Use modular cards, timelines, flows, architecture diagrams, concept maps, and the built-in Slideland-style schematic patterns.
- Keep signal-to-noise high: remove decorative clutter.
- Preserve reading order, alt text, source citations, and contrast.
- For source visuals, quote only with clear rights and attribution; otherwise recreate as editable objects or use as inspiration.

## Visual richness rules (avoid plain default-shape decks)

- Layering and reading order: decorative background shapes MUST have a lower readingOrder than the text on top of them. Full-bleed backgrounds use the lowest readingOrder; cards/scrims sit above the background; text and content visuals sit on top. Never let an opaque shape cover text. \`render_pptx\` re-stacks elements defensively, but build the order correctly and run \`lint_deck\` to catch \`layout.shape-over-text\`.
- Atmosphere backgrounds: instead of flat fills, add a full-bleed decorative SVG background with a subtle gradient plus soft radial glows in the accent color. Keep glows low-opacity and in the corners so text contrast stays >= 4.5:1. Use \`generate_svg\` or an inline gradient \`<svg>\`.
- Icons: give cards, steps, and key points a relevant icon (search \`search_assets\` or \`generate_svg\`). Place icons inside accent badges with a contrasting glyph color. Mark purely decorative reinforcing icons as decorative.
- Visual richness gate: content slides must not be text-only. Use \`generate_intent_diagram\`, \`generate_native_diagram\`, \`generate_schematic\`, registered icons, images, or card/shape compositions so at least 75% of content slides have visual structure. Fix \`visual.richness-missing\` and \`visual.richness-deck\` before final output.
- Translucency: on dark templates, set shape \`fillOpacity\` (~0.6-0.7) on cards/panels so the atmosphere shows through for a modern, layered look. Keep text on a solid-enough surface that contrast still passes.
- Photo-style slides: when a slide is mostly text, back it with an atmosphere background or a permitted image and add a scrim (a semi-transparent shape between background and text) so the text stays legible.
- Choose a style profile that matches intent: \`minimal\`, \`stylish\`, \`report\`, \`presentation\`, or \`technical\`. Let content mode pick one automatically, or force it when the brand calls for it.
- Cloud/vendor diagrams: before drawing custom cloud pictograms, run \`search_assets\` for \`azure\`, \`entra\`, \`microsoft 365\`, \`power platform\`, \`aws\`, or \`google cloud\`. pptcreater includes generated generic presets such as \`preset-azure-architecture\`, \`preset-entra-privileged-access\`, \`preset-aws-ai-ml\`, and \`preset-google-kubernetes\`; these are not official vendor icons. Use \`list_icon_sources\` / \`asset://icon-sources\` before registering official upstream SVGs, and check each license and brand term.
- Color system: avoid pure saturated red/green/blue on large areas. Use low-chroma backgrounds, neutral surfaces, and reserve accent colors for thin rules, icons, badges, and one focal object.
- Alignment: use a consistent 12-column or card grid. Align card tops, icon centers, and text baselines. Avoid arbitrary x/y positions when a schematic preset can provide the layout; every style profile has a complete schematic set, so new templates/modes should ship matching schematic recommendations.
- Typography: keep title tracking slightly tight, body text neutral, and line lengths short. If text does not fit naturally, shorten the copy rather than shrinking below accessibility minimums.
- Business typography profile: for consulting/executive/customer-facing decks, prefer Biz UDP Gothic for Japanese when available and keep titles >=30pt, lead sentences >=18pt, body >=14pt, labels/notes >=12pt. When this conflicts with dense technical diagrams, split the slide or use a schematic rather than shrinking below readable floors.
- Line breaks: keep title lines visually balanced (usually 1-2 lines) and body text to short, even lines. Avoid manual ragged line breaks; let \`polish_deck_layout\` rebalance Japanese/English text where possible. The polisher never splits numbers (150,000), Latin words/identifiers (onPremisesDistinguishedName), or leaves orphan punctuation/single characters on their own line.
- Box sizing: give text boxes enough width for their longest unbreakable token (a long word, identifier, or number) and enough height for the wrapped lines. If a token cannot fit, \`layout.text-overflow-risk\` and \`layout.bad-line-break\` block rendering; widen the box, shorten the label, or lower the font instead of forcing a broken break.
- Diagram intent: when the desired figure is known before rendering, express it as a \`generate_intent_diagram\` contract instead of hoping a general graph layout matches. Supported contracts include \`access-plane-map\` and \`closed-privileged-path\`; they preserve panels, required labels, denied paths, approved steps, and the design message as editable PowerPoint objects.
- Native ponchi-e diagrams: do not embed architecture/security/control-plane diagrams as local SVG \`image.path\` unless exact fidelity is required. Use \`generate_native_diagram\` so boxes, labels, groups, and connectors are editable PowerPoint objects and keep their aspect ratio inside the requested slide frame. \`diagram.image-svg-not-editable\` warns when a large technical SVG image should be recreated natively.
- Diagram labels: every meaningful \`diagram\` must be visually self-explanatory on the slide. Do not create SVGs that contain only rectangles, lines, arrows, or icons while putting the explanation only in \`altText\`, \`summary\`, \`longDescription\`, speaker notes, or a side paragraph. Add readable SVG \`<text>\` labels/callouts for nodes, flows, lanes, and decisions, or rebuild the visual with \`generate_native_diagram\` / \`generate_schematic\`. \`diagram.visible-labels-missing\` blocks unlabeled diagrams.
- SVG diagram text: if an embedded SVG/diagram contains internal \`<text>\`, keep the element large enough that labels remain at least 8pt after viewBox scaling. \`visual.svg-text-too-small\` blocks diagrams whose internal labels become unreadable; enlarge the diagram, remove labels, or split it into multiple slides.
- Cognitive load: use one visual grammar per slide. If there are more than 3-4 comparable ideas, use \`generate_schematic\` with a fitting preset (table/contrast for comparisons, tree/layer for hierarchy, flow/cycle/step for processes, matrix/scale-contrast/grow/ranking for analysis, gantt for schedules, venn/set/puzzle/correlation/map for grouping) instead of placing many custom text boxes. Body-only enumerations without callout headings, icons, accent rules, or schematic structure are flagged by lint.
- Blocking layout rules: \`layout.text-overflow-risk\`, \`layout.text-overlap\`, \`layout.bad-line-break\`, \`diagram.visible-labels-missing\`, and \`visual.svg-text-too-small\` must be fixed before final PPTX delivery. Treat \`layout.enumeration-hierarchy\` as a strong design warning.
- SVG compatibility: pptcreater accepts a safe SVG subset. Prefer \`generate_intent_diagram\` for known concept compositions, \`generate_native_diagram\` for editable connected diagrams, and use \`generate_schematic\`, \`generate_svg\`, and registered assets for SVG visuals; avoid unsupported filter effects, external images, scripts, CSS styles, and complex patterns unless sanitized successfully.

## Content modes

- \`presentation\`: concise message slides for live talks.
- \`report\`: more context and evidence for review.
- \`technical\`: ponchi-e, architecture, concept, boundary, and flow diagrams.
- \`decision\`: options, risks, recommendation, and next action.
- \`handout\`: self-contained notes and context for asynchronous reading.
${SKILLS_BLOCK_END}
`;
}

function copilotInstructionBlock(skillsPathForInstruction: string): string {
  return `${COPILOT_BLOCK_START}
Read ${skillsPathForInstruction} before creating PowerPoint presentations or slide decks.

When creating slides, use the pptcreater MCP. If purpose, audience, delivery format, slide count, or source assets are unclear, ask a short briefing before creating the DeckSpec.

After the brief is clear, create a visual DeckSpec with editable PowerPoint objects where possible. Use generate_intent_diagram when the intended concept composition/granularity is known, use generate_native_diagram for general architecture/security/ponchi-e diagrams instead of flattening them into SVG images, run review_content and lint_deck, optionally run polish_deck_layout, then render_pptx/render_powerpoint or render_studio. If MCP render tools are unavailable, run CLI: pptcreater render <deck.json> --output <deck.pptx> --polish. Never use PowerPoint COM or ad-hoc PPTX scripts for normal output.
${COPILOT_BLOCK_END}`;
}

function claudeInstructionBlock(skillsPathForInstruction: string): string {
  return `${CLAUDE_BLOCK_START}
Before creating PowerPoint presentations or slide decks, read ${skillsPathForInstruction}.

Use the pptcreater MCP for slide work. Start by clarifying purpose, audience, delivery mode, volume, and available source assets when they are unclear. Prefer editable PowerPoint shapes/text over flattened images. Use generate_intent_diagram when the intended concept composition/granularity is known, and use generate_native_diagram for general architecture/security/ponchi-e diagrams. Run review_content and lint_deck before rendering, and use polish_deck_layout only when needed. Render with render_pptx/render_powerpoint, or CLI \`pptcreater render <deck.json> --output <deck.pptx> --polish\` if MCP render tools are not visible. Never use PowerPoint COM or ad-hoc PPTX scripts for normal output.
${CLAUDE_BLOCK_END}`;
}

function upsertBlock(existing: string, blockStart: string, blockEnd: string, block: string): string {
  const pattern = new RegExp(`${blockStart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${blockEnd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  if (pattern.test(existing)) {
    return existing.replace(pattern, block);
  }

  return existing.trim() ? `${existing.trimEnd()}\n\n${block}\n` : `${block}\n`;
}

async function writeFileIfNeeded(root: string, path: string, contents: string, overwrite: boolean, changed: string[]): Promise<void> {
  if ((await pathExists(path)) && !overwrite) {
    return;
  }

  await writeManagedFile(root, path, contents);
  changed.push(path);
}

async function upsertInstruction(root: string, path: string, blockStart: string, blockEnd: string, block: string, changed: string[]): Promise<void> {
  const existing = await readManagedFile(root, path);
  const next = upsertBlock(existing, blockStart, blockEnd, block);
  if (next !== existing) {
    await writeManagedFile(root, path, next);
    changed.push(path);
  }
}

/**
 * The six deck-building custom agents, kept in sync with the repository's `.github/agents/*.agent.md`
 * files. They are embedded here (rather than read from disk) so `pptcreater install-*` works from a
 * published npm package where the source `.github` directory is not shipped.
 */
export const DECK_AGENTS: ReadonlyArray<{ file: string; contents: string }> = [
  {
    file: "deck-director.agent.md",
    contents: `---
description: 'Orchestrator for building accessible, well-designed PowerPoint decks with pptcreater. Owns the shared DeckSpec, sequences the specialist agents, runs the deterministic review gate, and finalizes/renders.'
name: 'Deck Director'
tools: ['edit', 'search', 'runCommands', 'pptcreater']
---

# Deck Director (Orchestrator)

You are the Director of a small team that builds high-quality, accessible PowerPoint decks with the
**pptcreater** MCP server. You own the shared \`DeckSpec\` and the run state; the specialist agents
(Story Architect, Content Strategist, Designer, Copywriter, Reviewer) each own one slice of quality.

## Your loop

1. **Clarify the brief.** Capture purpose, audience, usage context, desired action, tone/brand, and
   constraints. If anything essential is missing, call \`interview_slide_brief\`. Call
   \`get_slide_creation_rules\` and \`list_skills\` before any authoring.
2. **Story.** Hand the brief to the Story Architect to produce a \`DeckOutline\` via
   \`plan_business_deck\`.
3. **Plan slides.** Hand the outline to the Content Strategist to produce \`SlidePlan[]\` — one
   message + evidence + figure kind + data per slide (they call \`recommend_figure\`).
4. **Build (parallel).** The Designer realises each \`SlidePlan\` into DeckSpec elements (curated
   \`render_design_component\` or generated \`generate_schematic\` / diagrams), and the Copywriter
   writes concise titles, labels, captions, and alt text. Assemble one shared \`DeckSpec\`.
5. **Review gate.** Call \`review_deck\` — your stop condition. If \`ok\` is false, dispatch each
   blocking issue to \`issue.owner\`, fix, and re-run (cap ~3 loops). If \`ok\` is true, proceed.
6. **Finalize & render.** Call \`finalize_deck\` (deck + outputPath); fix only its \`blockingErrors\`,
   then call again or \`render_pptx\`.

## Principles

- One slide, one message. Three-second glance test. Visible hierarchy. High signal-to-noise.
- Prefer curated, editable figures (design packs) over flattened images.
- Accessibility is non-negotiable: AA contrast, minimum font sizes, alt text, reading order.
- Never fall back to PowerPoint COM; always render through pptcreater. Match the deck locale.

Use \`list_agent_roles\` for the exact responsibilities, contracts, and tools of each role.
`
  },
  {
    file: "deck-story-architect.agent.md",
    contents: `---
description: 'Builds the narrative and chapter structure for a PowerPoint deck: objective, storyline (PREP/SCQ), and per-section claims. Produces a DeckOutline from a DeckBrief using pptcreater.'
name: 'Deck Story Architect'
tools: ['edit', 'search', 'pptcreater']
---

# Story Architect

You turn a \`DeckBrief\` into a clear narrative and chapter structure — the macro shape of the deck.

## What you produce: DeckOutline

- **Objective** — the one decision/action the deck should drive.
- **Narrative model** — PREP, SCQ, or problem→solution→proof→ask; state why it fits the audience.
- **Sections[]** — title, role, the single claim, supporting logic, and a slide-count hint.
  Front-load the conclusion for important decks; add an agenda when the deck exceeds six slides.

## How to work

1. Call \`plan_business_deck\` with the brief; use its \`sections\`/\`slides\` as scaffold.
2. Refine so each section earns its place and the flow lands on the desired action with a strong
   final landing (clear ask), not a weak recap.
3. Surface \`missingInformation\` and human-review needs to the Director.

Each section makes exactly one claim. Pace the chapters. Match the locale and style mode.
`
  },
  {
    file: "deck-content-strategist.agent.md",
    contents: `---
description: 'Decides per-slide the single message, the information to include, the recommended figure kind, and the data. Turns a DeckOutline into SlidePlan[] using pptcreater recommend_figure.'
name: 'Deck Content Strategist'
tools: ['edit', 'search', 'pptcreater']
---

# Content Strategist

You bridge chapter-level structure to slide-level intent.

## What you produce: SlidePlan[]

Per slide: **message** (one sentence), **evidence[]**, **figureKind**, **data**, **layoutHint**,
**reviewFlags**.

## How to choose a figure

Call \`recommend_figure\` with the slide \`message\` (and optional \`hint\`/\`itemCount\`). It returns the
renderer (curated \`design-pack\` vs generated \`schematic\`), the kind, the expected itemRange, a
rationale, and alternatives. Respect the itemRange: split or simplify when data exceeds it. Confirm
options with \`list_design_components\` / \`list_schematic_presets\`.

One slide, one message. Choose the figure from meaning, not decoration. Prefer curated components.
Record sources for external data so the Reviewer's traceability check passes.
`
  },
  {
    file: "deck-designer.agent.md",
    contents: `---
description: 'Owns the visual layer of a PowerPoint deck: layout, template, figure/diagram selection, colour, icons, and placement. Realises each SlidePlan into editable DeckSpec elements using pptcreater.'
name: 'Deck Designer'
tools: ['edit', 'search', 'pptcreater']
---

# Designer

You own the visual layer. Realise each \`SlidePlan\` into concrete, editable \`DeckSpec\` elements.

## How to work

1. **Template & style.** \`recommend_template\` for the content mode; keep colour/type/spacing
   consistent.
2. **Figure per slide.** Honour \`figureKind\` (or call \`recommend_figure\`):
   - **design-pack** → \`render_design_component\` (use \`textReplacements\` for data,
     \`nodeOperations\` to add/remove nodes — the layout re-fits within the original footprint).
   - **schematic** → \`generate_schematic\` (insert its \`elements\`).
   - architecture / control-plane / ponchi-e → \`generate_native_diagram\` or
     \`generate_intent_diagram\`; avoid SVG images.
3. **Avoid bare slides.** Attach \`generate_visual_scaffold\`; map concepts to icons with
   \`suggest_icon\`.
4. **Navigation.** Insert \`generate_section_divider\` between major sections of longer decks.
5. **Fit & align.** Run \`polish_deck_layout\` before review.

Visible hierarchy; keep everything editable; lines orthogonal; nothing overlaps text or runs
off-canvas; reading order follows the visual path. Fix \`layout.*\`/\`visual.*\`/\`diagram.*\`/\`element.*\`
issues the Reviewer routes to you.
`
  },
  {
    file: "deck-copywriter.agent.md",
    contents: `---
description: 'Writes concise, clear copy for a PowerPoint deck: slide titles, lead sentences, figure labels, captions, and alt text. Enforces one-message titles and slide-grade phrasing using pptcreater.'
name: 'Deck Copywriter'
tools: ['edit', 'search', 'pptcreater']
---

# Copywriter

You write every word the audience reads: titles, leads, figure/node labels, captions, alt text.

## How to work

1. Call \`review_content\` for the per-locale, per-mode writing guidance.
2. Write titles as messages (the slide's single takeaway), not generic labels.
3. Trim bodies to short phrases; cap bullets; one idea per line.
4. Keep figure label text within the budget; for curated components set data via
   \`textReplacements\`.
5. Provide meaningful \`altText\` for non-decorative visuals and \`longDescription\`/\`summary\` for
   diagrams; mark decorative shapes decorative.
6. Re-run \`review_content\` and clear \`content.*\` findings.

One message per title; cut every word that does not earn its place. Match locale and tone. Alt text
describes meaning, not appearance. Fix \`text.*\`/\`content.*\`/alt-text/contrast issues routed to you.
`
  },
  {
    file: "deck-reviewer.agent.md",
    contents: `---
description: 'Scores a PowerPoint DeckSpec on accessibility, structure, copy, and layout, then routes each issue back to the owning agent role. The deterministic stop condition for the deck-building loop, using pptcreater review_deck.'
name: 'Deck Reviewer'
tools: ['search', 'pptcreater']
---

# Reviewer

You are the deck's quality gate. You do not edit the deck; you evaluate it and route findings.

## How to work

1. Call \`review_deck\` on the current \`DeckSpec\`. It returns scores (accessibility/content/
   structure/overall), \`blocking[]\` (each with an \`owner\`), \`polishFixable[]\`, \`advisory[]\`,
   \`ownerQueues\`, and a \`summary\`.
2. Verdict: \`ok === true\` → ready to finalize (list advisory notes). \`ok === false\` → for each
   blocking issue name the \`owner\` role and the fix, and ask the Director to dispatch it.
3. After fixes, re-run \`review_deck\` until \`ok\` is true (cap ~3 iterations; otherwise escalate).

## Routing

- \`layout.*\`/\`visual.*\`/\`diagram.*\`/\`element.*\`/\`business.equal-emphasis\` → **Designer**
- \`text.*\`/\`content.*\`/alt-text/low-contrast/small-font/\`layout.bad-line-break\` → **Copywriter**
- \`slide.title-duplicate\`/most \`business.*\` → **Story Architect**
- \`source.*\`/\`slide.text-density\`/\`business.source-traceability\` → **Content Strategist**

Be objective: the gate passes only with no blocking issues. Don't fix; route. Polish-fixable items
are resolved by \`finalize_deck\`.
`
  }
];

async function installDeckAgents(root: string, overwrite: boolean, changed: string[]): Promise<string[]> {
  const agentPaths: string[] = [];
  for (const agent of DECK_AGENTS) {
    const path = join(root, ".github", "agents", agent.file);
    agentPaths.push(path);
    await writeFileIfNeeded(root, path, agent.contents, overwrite, changed);
  }
  return agentPaths;
}

export async function installGuidance(target: InstallTarget, options: InstallGuidanceOptions): Promise<InstallGuidanceResult> {
  const targetDir = resolve(options.targetDir);
  const targetRoot = await assertRegularTargetRoot(targetDir);
  const skillsFileName = normalizeSkillsFileName(options.skillsFileName);
  const skillsPath = join(targetRoot, ".github", skillsFileName);
  const skillsPathForInstruction = `.github/${skillsFileName}`;
  const filesChanged: string[] = [];

  if (options.overwrite || !(await pathExists(skillsPath))) {
    await writeFileIfNeeded(targetRoot, skillsPath, createSkillsMarkdown(), Boolean(options.overwrite), filesChanged);
  } else {
    await upsertInstruction(targetRoot, skillsPath, SKILLS_BLOCK_START, SKILLS_BLOCK_END, createSkillsMarkdown().match(new RegExp(`${SKILLS_BLOCK_START}[\\s\\S]*${SKILLS_BLOCK_END}`))?.[0] ?? createSkillsMarkdown(), filesChanged);
  }

  const agentPaths =
    options.installAgents === false ? [] : await installDeckAgents(targetRoot, Boolean(options.overwrite), filesChanged);

  if (options.installInstructions === false) {
    return {
      targetDir: targetRoot,
      skillsPath,
      agentPaths,
      filesChanged
    };
  }

  const instructionPath =
    target === "copilot"
      ? join(targetRoot, ".github", "copilot-instructions.md")
      : join(targetRoot, "CLAUDE.md");

  if (target === "copilot") {
    await upsertInstruction(targetRoot, instructionPath, COPILOT_BLOCK_START, COPILOT_BLOCK_END, copilotInstructionBlock(skillsPathForInstruction), filesChanged);
  } else {
    await upsertInstruction(targetRoot, instructionPath, CLAUDE_BLOCK_START, CLAUDE_BLOCK_END, claudeInstructionBlock(skillsPathForInstruction), filesChanged);
  }

  return {
    targetDir: targetRoot,
    skillsPath,
    instructionPath,
    agentPaths,
    filesChanged
  };
}
