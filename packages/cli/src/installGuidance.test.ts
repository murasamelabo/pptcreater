import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { installGuidance, DECK_AGENTS } from "./installGuidance.js";

describe("installGuidance", () => {
  it("installs GitHub Copilot guidance without clobbering existing skills", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "pptcreater-copilot-"));
    await writeFile(join(targetDir, "SKILLS.md"), "# Existing skills\n\nKeep this.\n", "utf8");

    const result = await installGuidance("copilot", { targetDir });
    const existingSkills = await readFile(join(targetDir, "SKILLS.md"), "utf8");
    const skills = await readFile(join(targetDir, ".github", "pptcreater-skills.md"), "utf8");
    const instructions = await readFile(join(targetDir, ".github", "copilot-instructions.md"), "utf8");

    expect(result.filesChanged.length).toBeGreaterThan(0);
    expect(existingSkills).toContain("Keep this.");
    expect(skills).toContain("AI agents creating PowerPoint decks");
    expect(skills).toContain("Multi-agent orchestration");
    expect(skills).toContain("deck-director");
    // The installed skills carry the message-first craft method.
    expect(skills).toContain("Slide craft method");
    expect(instructions).toContain("Read .github/pptcreater-skills.md");
    // The instruction block routes non-trivial decks to the Director agent.
    expect(instructions).toContain("Deck Director");
    expect(instructions).toContain(".github/agents");
  });

  it("installs Claude Code guidance", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "pptcreater-claude-"));

    await installGuidance("claude-code", { targetDir });
    const claude = await readFile(join(targetDir, "CLAUDE.md"), "utf8");

    expect(claude).toContain("Use the pptcreater MCP");
    expect(claude).toContain("Deck Director");
    expect(claude).toContain(".github/agents");
  });

  it("is idempotent on repeated installs", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "pptcreater-idempotent-"));

    await installGuidance("copilot", { targetDir });
    const second = await installGuidance("copilot", { targetDir });

    expect(second.filesChanged).toHaveLength(0);
  });

  it("can skip instruction file installation", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "pptcreater-no-instructions-"));

    const result = await installGuidance("copilot", { targetDir, installInstructions: false });

    expect(result.instructionPath).toBeUndefined();
    await expect(readFile(join(targetDir, ".github", "pptcreater-skills.md"), "utf8")).resolves.toContain("AI agents creating PowerPoint decks");
    await expect(readFile(join(targetDir, ".github", "copilot-instructions.md"), "utf8")).rejects.toThrow();
  });

  it("installs the six deck-building custom agents", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "pptcreater-agents-"));

    const result = await installGuidance("copilot", { targetDir });

    expect(result.agentPaths).toHaveLength(6);
    const director = await readFile(join(targetDir, ".github", "agents", "deck-director.agent.md"), "utf8");
    expect(director).toContain("name: 'Deck Director'");
    expect(director).toContain("review_deck");
    // All six agent files exist with frontmatter.
    for (const file of [
      "deck-director.agent.md",
      "deck-story-architect.agent.md",
      "deck-content-strategist.agent.md",
      "deck-designer.agent.md",
      "deck-copywriter.agent.md",
      "deck-reviewer.agent.md"
    ]) {
      const contents = await readFile(join(targetDir, ".github", "agents", file), "utf8");
      expect(contents.startsWith("---")).toBe(true);
      expect(contents).toMatch(/name: '/);
    }
  });

  it("can skip installing the custom agents", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "pptcreater-no-agents-"));

    const result = await installGuidance("copilot", { targetDir, installAgents: false });

    expect(result.agentPaths).toHaveLength(0);
    await expect(readFile(join(targetDir, ".github", "agents", "deck-director.agent.md"), "utf8")).rejects.toThrow();
  });

  it("keeps the embedded agents in sync with the repository .github/agents sources", async () => {
    // The CLI embeds the agent files so install works from a published package; this guard ensures
    // the embedded copies don't drift from the source-of-truth files under .github/agents.
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
    const agentsDir = join(repoRoot, ".github", "agents");
    let sourceAvailable = true;
    try {
      await readFile(join(agentsDir, "deck-director.agent.md"), "utf8");
    } catch {
      sourceAvailable = false; // running from a packaged checkout without .github
    }
    if (!sourceAvailable) return;

    const frontmatterField = (text: string, field: string): string | undefined =>
      new RegExp(`^${field}: (.*)$`, "m").exec(text)?.[1];

    for (const agent of DECK_AGENTS) {
      const source = await readFile(join(agentsDir, agent.file), "utf8");
      // name and tools frontmatter must match exactly between source and embedded copy.
      expect(frontmatterField(agent.contents, "name")).toBe(frontmatterField(source, "name"));
      expect(frontmatterField(agent.contents, "tools")).toBe(frontmatterField(source, "tools"));
      expect(frontmatterField(agent.contents, "description")).toBe(frontmatterField(source, "description"));
    }
  });

  it("rejects symlinked managed files when supported by the filesystem", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "pptcreater-symlink-"));
    const outsideFile = join(await mkdtemp(join(tmpdir(), "pptcreater-outside-")), "outside.md");
    await writeFile(outsideFile, "outside", "utf8");

    try {
      await symlink(outsideFile, join(targetDir, ".github"));
    } catch {
      return;
    }

    await expect(installGuidance("copilot", { targetDir })).rejects.toThrow(/symlink/);
  });
});
