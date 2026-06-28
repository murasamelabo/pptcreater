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
8. Before building ANY multi-element figure (flow, process, timeline, comparison, hierarchy, cycle, matrix, radar), call \`recommend_figure\` with the slide message (and/or \`list_schematic_presets\`) and follow its \`renderer\`. When it returns \`design-pack\`, PREFER \`render_design_component\` with a curated component of the recommended \`kind\` from the zukai pack (the 14 figure kinds: flow-horizontal, flow-vertical, cycle, before-after, matrix, venn, formula, comparison, scale, step, gantt, list-vertical, list-horizontal, list-enumeration, plus tree) — call \`list_design_components\` to pick a P1-P6 variant, use \`textReplacements\` to fill the eyebrow/title/labels/sub-labels/caption (replace every catalog placeholder), and \`nodeOperations\` to match the node count (the layout re-fits and renumbers). Use \`radar\` via \`generate_schematic\` for 4-8 axis score profiles of one option; use \`matrix\` for two-axis positioning of multiple options and \`ranking\` for ordered comparisons. Do NOT change ○/△/✕ marks via text (they are colored icon shapes); keep the source mark pattern and map your columns onto it. Only when it returns \`schematic\` (no curated component) fall back to \`generate_schematic\` (auto-fits labels) or \`generate_native_diagram\` (routes connectors border-to-border). Only hand-build simple, short-label compositions (a few cards, a badge, an accent rule).
9. Use \`generate_intent_diagram\` when the user supplies or implies an intended conceptual composition/granularity, especially Enterprise Access Model, closed privileged access paths, side-by-side good/bad comparisons, or control-plane maps. It turns the intent contract into editable \`shape\`/\`text\` elements and prevents LLM drift to a different level of detail.
10. Use \`generate_native_diagram\` for general architecture, security, enterprise control-plane, decision-flow, and ponchi-e diagrams that should remain editable in PowerPoint. Insert the returned \`shape\`/\`text\` elements directly into \`slide.elements\`; do not wrap them in \`image\`, \`svg\`, or \`diagram\`.
11. Use \`list_schematic_presets\` then \`generate_schematic\` for \`table\`, \`tree\`, \`flow\`, \`vertical-flow\`, \`cycle\`, \`before-after\`, \`map\`, \`puzzle\`, \`correlation\`, \`matrix\`, \`venn\`, \`cross\`, \`set\`, \`contrast\`, \`scale-contrast\`, \`grow\`, \`layer\`, \`triangle\`, \`step\`, \`gantt\`, \`ranking\`, \`radar\`, \`list\`, \`list-horizontal\`, \`list-enumeration\`, and \`mockup\` visuals. Do not freehand complex SVG unless the preset cannot express the structure.
11b. For the few slides that genuinely need fuller PROSE — a detailed explanation, a Q&A / FAQ, or a 得られること/benefits list with descriptions — use \`generate_detail_slide\` (variant \`explanation\`/\`qa\`/\`benefits\`) instead of forcing the content into bullets or a figure. The returned \`detail\`/\`qa\` slide is exempt from the visual-richness gate; keep its title/heading/question concise and put the longer text in the body/answer/description. Keep these the exception so the deck stays scannable.
12. Use \`plan_source_visual\` for source figures: choose quote, recreate, or inspiration.
13. When external websites are used as references, record each one in \`metadata.sources\` with its actual \`url\`. The final slide must collect these URLs; \`polish_deck_layout\`, \`render_pptx\`, and \`render_studio\` append/update it automatically.
14. Create a visual DeckSpec with editable PowerPoint shapes/text where possible.
15. Run \`review_business_deck\` for business storyline, section flow, page emphasis, and final landing checks.
16. Run \`review_content\` (or CLI \`pptcreater content-review\`) before linting. It applies locale/content-mode writing rules: Japanese report/technical/handout decks use a short topic title + slide message, Japanese presentation/decision decks allow concise assertion titles, and English decks prefer action titles.
17. Run \`lint_deck\`, then \`review_deck\` as the REQUIRED quality gate before declaring the deck done: it aggregates lint + content + business reviews, classifies findings (blocking / polish-fixable / advisory), and routes each blocking issue to its owner role. Fix every blocking finding and re-run until \`ok\` is true. A generic code review is not a substitute for \`review_deck\`.
18. Run \`polish_deck_layout\` when layout issues or overflow risks are present. \`render_pptx\` also applies this safeguard automatically.
19. Render with \`render_pptx\` / \`render_powerpoint\` or preview with \`render_studio\`. If text still cannot fit after polish, shorten or split the slide; do not force-render a broken layout.
20. If MCP render tools are not visible in the current tool selection, use the CLI fallback: \`pptcreater render <deck.json> --output <deck.pptx> --polish\`.
21. Do not bypass pptcreater with PowerPoint COM automation or ad-hoc PPTX scripts for normal deck creation. Do NOT author your own script (JS/TS/Python) that imports \`@pptcreater/core\` or any pptcreater package to build/render a deck — that bypasses the figure tools (recommend_figure / render_design_component / generate_native_diagram / generate_schematic) and the review gate, and is the main cause of clipped text, broken connectors, and unused zukai figures. Use the pptcreater MCP tools or the \`pptcreater\` CLI instead. If research produces local SVG/PNG/JPEG/GIF/WebP files, reference workspace-local files via DeckSpec \`image.path\` only for logos/photos/source quotes/exact-fidelity figures and still call pptcreater render; pptcreater embeds them safely.

## Using a provided PowerPoint template (.pptx/.potx)

When the user gives you a PowerPoint template and wants their deck to actually use it (not just look similar):

1. \`import_template\` with \`register=true\` (CLI \`pptcreater template import <file> --register\`). This embeds the source slide master, layouts, and theme and saves them to the registry. Without registering, rendering only mimics the template and emits a \`template.package-not-embedded\` warning.
2. Start the deck with \`scaffold_from_template\` (CLI \`pptcreater template scaffold <id>\`). The scaffold reuses the template's OWN cover/closing and sets \`DeckSpec.template\` to the registered id so render embeds the real master.
3. Add your content slides, then optionally \`apply_template_design\` to re-skin the middle content slides to the template.
4. Do NOT draw a custom hero/cover (accent bars, chips, side panels, full-bleed background) over a referenced template — it hides the template's own cover. Likewise, do NOT put a full-bleed generated background on content slides — it hides the template's content layout. Drawing cards/diagrams on the template's content layout IS the intended way to fill it. \`render_pptx\`/\`finalize_deck\` flag these as \`template.cover-overdrawn\` and \`template.content-overdrawn\`; rebuild the cover from \`scaffold_from_template\`, and for content slides remove the full-bleed background or re-skin with \`apply_template_design\`.
5. Always treat \`template.package-not-embedded\` (master not embedded — register the source and reference its id), \`template.cover-overdrawn\` (generated cover hides the template), and \`template.content-overdrawn\` (full-bleed content background hides the template) warnings in the render result as defects to fix, not noise.

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

## Slide craft method (message-first, subtract to clarify)

A message-first craft loop for slides that land in three seconds. Follow it before reaching for layout details.

- Explanation before slides: be able to say the conclusion, the big picture, and the abstraction out loud first; verbalize the point, then author DeckSpec. If you cannot say it, do not draw it.
- The audience is the protagonist: each slide answers "what does this boil down to?" in one sentence — make that sentence the title or key message (one slide, one message).
- Extract structure, then pick the figure: decide whether the content is parallel, contrast, containment, sequence, or causation, then let \`recommend_figure\` / \`list_schematic_presets\` map it to list/contrast/tree/flow-step/cycle/matrix. Do not start from a blank canvas of free text boxes.
- Subtract to clarify: a slide is subtraction. Conceptually make everything gray first, then add one accent only where the eye must go. Cut anything that does not serve the message (legends, gridlines, boxes, shadows, extra colors).
- Whitespace is an element: don't cram; put related items close and leave generous space between groups. "Step back" (zoom out / squint) and check the blocks are still readable — fix both the sparse and the crammed extremes.
- Build boxes, then align and repeat: lay out regions (boxes) first, lead the eye in a Z (top-left → bottom-right), align cleanly, and make a pattern then repeat it so the deck feels consistent.
- Make numbers big and label directly: write legends/labels onto the elements, keep gridlines/rules in a supporting role with text as the lead, enlarge key figures, and limit emphasis to bold (avoid underline, shadow, and multi-color emphasis).
- Whitespace is an invisible divider: separate groups with space, not rules or boxes. Drawing lines/borders to partition content adds noise; the same separation expressed as whitespace reads cleaner. Whitespace is an element — give it meaning (no needlessly tiny or oversized visuals).
- Don't let a figure float: give every figure a region (box) and a title, differentiate roles by color/shape, and keep arrows in a supporting role (not the star) — use their direction/type to show what is exchanged. Convert bullet lists into a labeled box grid (category header cell + item cells) sorted into rows/columns.
- Self-diagnose on two axes — amount of information x amount of decoration — and avoid the six failure types (too sparse / wall-of-text / decorative-photo crutch / flat-no-emphasis / crammed / over-decorated). The ideal sits balanced on both axes; a too-sparse deck is fixed by reworking the content (message + evidence) before the design, not by adding decoration. The \`slide-craft-ja\` / \`slide-craft-en\` skill packs (\`list_skills\`) carry this method in full.

## Visual richness rules (avoid plain default-shape decks)

- Layering and reading order: decorative background shapes MUST have a lower readingOrder than the text on top of them. Full-bleed backgrounds use the lowest readingOrder; cards/scrims sit above the background; text and content visuals sit on top. Never let an opaque shape cover text. \`render_pptx\` re-stacks elements defensively, but build the order correctly and run \`lint_deck\` to catch \`layout.shape-over-text\`.
- Atmosphere backgrounds: instead of flat fills, add a full-bleed decorative SVG background with a subtle gradient plus soft radial glows in the accent color. Keep glows low-opacity and in the corners so text contrast stays >= 4.5:1. Use \`generate_svg\` or an inline gradient \`<svg>\`.
- Icons: give cards, steps, and key points a relevant icon (search \`search_assets\` or \`generate_svg\`). Place icons inside accent badges with a contrasting glyph color. Mark purely decorative reinforcing icons as decorative.
- Visual richness gate: content slides must not be text-only. Use \`generate_intent_diagram\`, \`generate_native_diagram\`, \`generate_schematic\`, registered icons, images, or card/shape compositions so at least 75% of content slides have visual structure. Fix \`visual.richness-missing\` and \`visual.richness-deck\` before final output.
- Text-rich detail slides are allowed (the deck should not be ALL bullets/figures): for content that genuinely needs fuller prose — a detailed explanation, a Q&A / FAQ, or a 得られること/benefits list with descriptions — call \`generate_detail_slide\` (variants \`explanation\`/\`qa\`/\`benefits\`). It emits a slide with a \`detail\`/\`qa\` layout marker that is exempt from the visual-richness gate and excluded from the 75% denominator, so detailed paragraphs do NOT need a figure. Keep the title and any heading/label/question concise; put the longer explanation in \`body\`/\`answer\`/\`description\`. AA contrast, reading order, overflow fitting, and concise-title checks still apply; detail-slide body copy may be 14-16pt. Keep these the exception — \`visual.prose-heavy\` warns when prose/Q&A slides outnumber the visual body slides.
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
- Adopt a prepared figure (do not hand-build diagrams): before placing your own node boxes + connector lines, timeline rails, comparison columns, or step rows, call \`recommend_figure\` with the slide message (and/or \`list_schematic_presets\`) and follow its \`renderer\`. When it returns \`design-pack\`, PREFER \`render_design_component\` with a curated component of the recommended \`kind\` from the zukai pack (flow-horizontal, flow-vertical, cycle, before-after, matrix, venn, formula, comparison, scale, step, gantt, list-vertical, list-horizontal, list-enumeration, plus tree). These are real, professionally designed PowerPoint figure slides: pick a P1-P6 variant with \`list_design_components\`, fill EVERY catalog placeholder (eyebrow, title, main labels, sub-labels, caption) with \`textReplacements\`, and match the node count with \`nodeOperations\` (it re-fits and renumbers within the footprint). Keep ○/△/✕ marks as-is (colored icon shapes) and map your columns onto the source pattern. Only when \`recommend_figure\` returns \`schematic\` (no curated component) fall back to \`generate_schematic\` (auto-fits labels so node text never clips) or \`generate_native_diagram\` (routes connectors border-to-border so arrows never dangle). Reserve hand-built shape compositions for simple, short-label layouts. \`diagram.native-connectors\` warns on a hand-built connected diagram and becomes a blocking error once the flow is complex (4+ hand-placed connectors); fix it by rebuilding with a design-pack component or generator, not by nudging coordinates.
- Cognitive load: use one visual grammar per slide. If there are more than 3-4 comparable ideas, use \`generate_schematic\` with a fitting preset (table/contrast for comparisons, tree/layer for hierarchy, flow/cycle/step for processes, matrix/scale-contrast/grow/ranking for analysis, gantt for schedules, venn/set/puzzle/correlation/map for grouping) instead of placing many custom text boxes. Body-only enumerations without callout headings, icons, accent rules, or schematic structure are flagged by lint.
- Blocking layout rules: \`layout.text-overflow-risk\`, \`layout.text-overlap\`, \`layout.bad-line-break\`, \`diagram.visible-labels-missing\`, and \`visual.svg-text-too-small\` must be fixed before final PPTX delivery. Treat \`layout.enumeration-hierarchy\` as a strong design warning.
- SVG compatibility: pptcreater accepts a safe SVG subset. Prefer \`generate_intent_diagram\` for known concept compositions, \`generate_native_diagram\` for editable connected diagrams, and use \`generate_schematic\`, \`generate_svg\`, and registered assets for SVG visuals; avoid unsupported filter effects, external images, scripts, CSS styles, and complex patterns unless sanitized successfully.

## Content modes

- \`presentation\`: concise message slides for live talks.
- \`report\`: more context and evidence for review.
- \`technical\`: ponchi-e, architecture, concept, boundary, and flow diagrams.
- \`decision\`: options, risks, recommendation, and next action.
- \`handout\`: self-contained notes and context for asynchronous reading.

## Multi-agent orchestration (use the deck team for non-trivial decks)

For anything beyond a quick one-off slide — multi-slide decks, important/executive/customer-facing
presentations, or when quality matters — you MUST delegate to the deck-building agents installed in
\`.github/agents/\` instead of doing everything in a single pass:

- \`deck-director\` (orchestrator) — start here. It owns the shared DeckSpec, sequences the
  specialists, runs the review gate, and finalizes/renders. The Director is host-independent: it
  plans the deck and, when the host cannot spawn sub-agents, returns a plan you execute yourself
  (including a per-slide figure choice from \`recommend_figure\`).
- \`deck-story-architect\` — narrative + chapter structure (DeckOutline).
- \`deck-content-strategist\` — per-slide message + figure choice (SlidePlan[]); calls \`recommend_figure\`.
- \`deck-designer\` — layout, figures, colour, icons, placement.
- \`deck-copywriter\` — concise titles, labels, captions, alt text.
- \`deck-reviewer\` — runs \`review_deck\` and routes each finding to the owning role.

How routing works:

1. Hand non-trivial deck requests to \`deck-director\`; for a single slice you may invoke a specialist
   directly. Use \`list_agent_roles\` for each role's responsibility, hand-off contract, and tools. If
   your host cannot spawn the specialists, follow the Director's returned plan step by step yourself —
   do NOT skip the plan and free-hand the deck.
2. The flow is DeckBrief -> DeckOutline -> SlidePlan[] -> DeckSpec -> DeckReviewReport. Each SlidePlan
   must name its figure: call \`recommend_figure\` per slide and use \`render_design_component\` (design
   pack) or \`generate_schematic\` / \`generate_native_diagram\` (schematic) — never hand-place node
   boxes + connectors.
3. \`review_deck\` is the REQUIRED, deterministic stop condition (a generic code review is not a
   substitute): it runs lint + content + business reviews, classifies each finding (blocking /
   polish-fixable / advisory), scores the deck, and routes each blocking issue to its owner role
   (\`layout.*\`/\`visual.*\`/\`diagram.*\` -> Designer; \`text.*\`/\`content.*\` -> Copywriter;
   \`slide.*\`/most \`business.*\` -> Story Architect; \`source.*\` -> Content Strategist). Fix blocking
   issues, re-run, and only finalize when \`ok\` is true.

Do NOT author your own script that imports \`@pptcreater/core\` (or any pptcreater package) to build or
render a deck, and do NOT use PowerPoint COM or ad-hoc PPTX assembly. Always go through the pptcreater
MCP tools or the pptcreater CLI; a hand-written generator script bypasses the figure tools and the
review gate and is the main cause of clipped text, broken connectors, and unused zukai figures.
${SKILLS_BLOCK_END}
`;
}

function copilotInstructionBlock(skillsPathForInstruction: string): string {
  return `${COPILOT_BLOCK_START}
Read ${skillsPathForInstruction} before creating PowerPoint presentations or slide decks.

For multi-slide, important, executive, or customer-facing decks, you MUST delegate to the deck-building custom agents in .github/agents: hand the request to the "Deck Director" agent first. The Director plans the deck (DeckBrief -> DeckOutline -> SlidePlan[]) including a per-slide figure choice, and sequences the Story Architect, Content Strategist, Designer, Copywriter, and Reviewer; if your host cannot spawn those sub-agents, follow the Director's returned plan yourself step by step. Only a genuine single quick slide may be handled directly without the Director.

Do NOT build decks by writing your own script that imports @pptcreater/core (or any pptcreater package) and calls render/generation functions directly, and do NOT use PowerPoint COM or ad-hoc PPTX assembly. Always go through the pptcreater MCP tools (or the pptcreater CLI). Hand-writing a generator script bypasses the figure tools and is the main cause of clipped text and broken connectors.

When creating slides, use the pptcreater MCP. If purpose, audience, delivery format, slide count, or source assets are unclear, ask a short briefing before creating the DeckSpec.

For every figure (flow, process, timeline, comparison, hierarchy, cycle, matrix, etc.), call recommend_figure first and use what it returns: when renderer is "design-pack", use render_design_component with a curated zukai component of the recommended kind; only when renderer is "schematic" fall back to generate_schematic or generate_native_diagram. Use generate_intent_diagram when the intended concept composition/granularity is known. Never hand-place node boxes + connector lines for a connected diagram.

After the brief is clear, create a visual DeckSpec with editable PowerPoint objects, run review_content and lint_deck, and run review_deck as the required quality gate before declaring the deck done — fix every blocking finding and re-run until ok is true (a generic code review is not a substitute for review_deck). Then render with render_pptx/render_powerpoint or finalize_deck, or CLI: pptcreater render <deck.json> --output <deck.pptx> --polish.
${COPILOT_BLOCK_END}`;
}

function claudeInstructionBlock(skillsPathForInstruction: string): string {
  return `${CLAUDE_BLOCK_START}
Before creating PowerPoint presentations or slide decks, read ${skillsPathForInstruction}.

For multi-slide, important, executive, or customer-facing decks, you MUST delegate to the deck-building custom agents in .github/agents: start with the "Deck Director" agent. The Director plans the deck (DeckBrief -> DeckOutline -> SlidePlan[]) including a per-slide figure choice and sequences the Story Architect, Content Strategist, Designer, Copywriter, and Reviewer; if your host cannot spawn those sub-agents, follow the Director's returned plan yourself step by step. Only a genuine single quick slide may be handled directly without the Director.

Do NOT build decks by writing your own script that imports @pptcreater/core (or any pptcreater package) and calls render/generation functions directly, and do NOT use PowerPoint COM or ad-hoc PPTX assembly. Always go through the pptcreater MCP tools (or the pptcreater CLI). Hand-writing a generator script bypasses the figure tools and is the main cause of clipped text and broken connectors.

Use the pptcreater MCP for slide work. Start by clarifying purpose, audience, delivery mode, volume, and available source assets when they are unclear. Prefer editable PowerPoint shapes/text over flattened images. For every figure (flow, comparison, timeline, hierarchy, cycle, matrix, etc.), call recommend_figure first: when renderer is "design-pack", use render_design_component with a curated zukai component of the recommended kind; only when renderer is "schematic" fall back to generate_schematic or generate_native_diagram. Use generate_intent_diagram when the intended concept composition/granularity is known. Never hand-place node boxes + connector lines for a connected diagram. Run review_content and lint_deck, and run review_deck as the required quality gate before declaring the deck done (a generic code review does not replace review_deck) — fix every blocking finding and re-run until ok is true. Render with render_pptx/render_powerpoint or finalize_deck, or CLI \`pptcreater render <deck.json> --output <deck.pptx> --polish\`.
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

You are host-independent: when your host can spawn the specialist sub-agents, dispatch to them; when
it cannot, perform each step yourself in their role and RETURN A PLAN the caller can execute. Either
way the steps and the review gate are the same — never skip the plan and free-hand the deck.

1. **Clarify the brief.** Capture purpose, audience, usage context, desired action, tone/brand, and
   constraints. If anything essential is missing, call \`interview_slide_brief\`. Call
   \`get_slide_creation_rules\` and \`list_skills\` before any authoring.
2. **Story.** Hand the brief to the Story Architect to produce a \`DeckOutline\` via
   \`plan_business_deck\`.
3. **Plan slides.** Hand the outline to the Content Strategist to produce \`SlidePlan[]\` — one
   message + evidence + figure kind + data per slide. Each SlidePlan MUST name its figure: call
   \`recommend_figure\` per slide and record whether it is a design-pack component (kind + variant) or
   a schematic kind.
4. **Build (parallel).** The Designer realises each \`SlidePlan\` into DeckSpec elements using the
   figure the plan named: \`render_design_component\` for a design-pack (zukai) component, else
   \`generate_schematic\` / \`generate_native_diagram\` / \`generate_intent_diagram\`. Never hand-place
   node boxes + connector lines for a connected diagram. The Copywriter writes concise titles, labels,
   captions, and alt text. Assemble one shared \`DeckSpec\`.
5. **Review gate (required).** Call \`review_deck\` — your deterministic stop condition. A generic code
   review is NOT a substitute. If \`ok\` is false, dispatch each blocking issue to \`issue.owner\`, fix,
   and re-run (cap ~3 loops). If \`ok\` is true, proceed.
6. **Finalize & render.** Call \`finalize_deck\` (deck + outputPath); fix only its \`blockingErrors\`,
   then call again or \`render_pptx\`.

## Principles

- One slide, one message. Three-second glance test. Visible hierarchy. High signal-to-noise.
- Prefer curated, editable figures (design packs) over flattened images.
- Accessibility is non-negotiable: AA contrast, minimum font sizes, alt text, reading order.
- Never author a script that imports \`@pptcreater/core\` to build/render a deck, never use PowerPoint
  COM, and never hand-place connectors — always go through the pptcreater MCP tools / CLI and the
  figure tools. Match the deck locale.

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
