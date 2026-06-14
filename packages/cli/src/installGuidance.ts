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
};

export type InstallGuidanceResult = {
  targetDir: string;
  skillsPath: string;
  instructionPath: string;
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

function normalizeSkillsFileName(value = "SKILLS.md"): string {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9._-]+\.md$/i.test(trimmed)) {
    throw new Error("skills file name must be a simple Markdown file name such as SKILLS.md.");
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
3. Use \`search_templates\` and \`search_assets\` before creating new assets.
4. Use \`plan_source_visual\` for source figures: choose quote, recreate, or inspiration.
5. Create a visual DeckSpec with editable PowerPoint shapes/text where possible.
6. Run \`lint_deck\`.
7. Run \`polish_deck_layout\` only when layout issues or overflow risks are present.
8. Render with \`render_pptx\` or preview with \`render_studio\`.

## Design rules

- One slide, one message.
- Use assertion titles, not topic labels.
- Prefer editable PowerPoint shapes/text over flattened images.
- Use modular cards, timelines, flows, architecture diagrams, and concept maps.
- Keep signal-to-noise high: remove decorative clutter.
- Preserve reading order, alt text, source citations, and contrast.
- For source visuals, quote only with clear rights and attribution; otherwise recreate as editable objects or use as inspiration.

## Content modes

- \`presentation\`: concise message slides for live talks.
- \`report\`: more context and evidence for review.
- \`technical\`: ponchi-e, architecture, concept, boundary, and flow diagrams.
- \`decision\`: options, risks, recommendation, and next action.
- \`handout\`: self-contained notes and context for asynchronous reading.
${SKILLS_BLOCK_END}
`;
}

function copilotInstructionBlock(skillsFileName: string): string {
  return `${COPILOT_BLOCK_START}
Read ${skillsFileName} before creating PowerPoint presentations or slide decks.

When creating slides, use the pptcreater MCP. If purpose, audience, delivery format, slide count, or source assets are unclear, ask a short briefing before creating the DeckSpec.

After the brief is clear, create a visual DeckSpec with editable PowerPoint objects where possible, run lint_deck, optionally run polish_deck_layout, then render_pptx or render_studio.
${COPILOT_BLOCK_END}`;
}

function claudeInstructionBlock(skillsFileName: string): string {
  return `${CLAUDE_BLOCK_START}
Before creating PowerPoint presentations or slide decks, read ${skillsFileName}.

Use the pptcreater MCP for slide work. Start by clarifying purpose, audience, delivery mode, volume, and available source assets when they are unclear. Prefer editable PowerPoint shapes/text over flattened images. Run lint_deck before rendering, and use polish_deck_layout only when needed.
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

export async function installGuidance(target: InstallTarget, options: InstallGuidanceOptions): Promise<InstallGuidanceResult> {
  const targetDir = resolve(options.targetDir);
  const targetRoot = await assertRegularTargetRoot(targetDir);
  const skillsFileName = normalizeSkillsFileName(options.skillsFileName);
  const skillsPath = join(targetRoot, skillsFileName);
  const filesChanged: string[] = [];

  if (options.overwrite || !(await pathExists(skillsPath))) {
    await writeFileIfNeeded(targetRoot, skillsPath, createSkillsMarkdown(), Boolean(options.overwrite), filesChanged);
  } else {
    await upsertInstruction(targetRoot, skillsPath, SKILLS_BLOCK_START, SKILLS_BLOCK_END, createSkillsMarkdown().match(new RegExp(`${SKILLS_BLOCK_START}[\\s\\S]*${SKILLS_BLOCK_END}`))?.[0] ?? createSkillsMarkdown(), filesChanged);
  }

  const instructionPath =
    target === "copilot"
      ? join(targetRoot, ".github", "copilot-instructions.md")
      : join(targetRoot, "CLAUDE.md");

  if (target === "copilot") {
    await upsertInstruction(targetRoot, instructionPath, COPILOT_BLOCK_START, COPILOT_BLOCK_END, copilotInstructionBlock(skillsFileName), filesChanged);
  } else {
    await upsertInstruction(targetRoot, instructionPath, CLAUDE_BLOCK_START, CLAUDE_BLOCK_END, claudeInstructionBlock(skillsFileName), filesChanged);
  }

  return {
    targetDir: targetRoot,
    skillsPath,
    instructionPath,
    filesChanged
  };
}
