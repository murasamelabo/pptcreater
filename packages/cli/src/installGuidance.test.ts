import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installGuidance } from "./installGuidance.js";

describe("installGuidance", () => {
  it("installs GitHub Copilot guidance without clobbering existing skills", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "pptcreater-copilot-"));
    await writeFile(join(targetDir, "SKILLS.md"), "# Existing skills\n\nKeep this.\n", "utf8");

    const result = await installGuidance("copilot", { targetDir });
    const skills = await readFile(join(targetDir, "SKILLS.md"), "utf8");
    const instructions = await readFile(join(targetDir, ".github", "copilot-instructions.md"), "utf8");

    expect(result.filesChanged.length).toBeGreaterThan(0);
    expect(skills).toContain("Keep this.");
    expect(skills).toContain("AI agents creating PowerPoint decks");
    expect(instructions).toContain("Read SKILLS.md");
  });

  it("installs Claude Code guidance", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "pptcreater-claude-"));

    await installGuidance("claude-code", { targetDir });
    const claude = await readFile(join(targetDir, "CLAUDE.md"), "utf8");

    expect(claude).toContain("Use the pptcreater MCP");
  });

  it("is idempotent on repeated installs", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "pptcreater-idempotent-"));

    await installGuidance("copilot", { targetDir });
    const second = await installGuidance("copilot", { targetDir });

    expect(second.filesChanged).toHaveLength(0);
  });

  it("rejects symlinked managed files when supported by the filesystem", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "pptcreater-symlink-"));
    const outsideFile = join(await mkdtemp(join(tmpdir(), "pptcreater-outside-")), "outside.md");
    await writeFile(outsideFile, "outside", "utf8");

    try {
      await symlink(outsideFile, join(targetDir, "SKILLS.md"));
    } catch {
      return;
    }

    await expect(installGuidance("copilot", { targetDir })).rejects.toThrow(/symlink/);
  });
});
