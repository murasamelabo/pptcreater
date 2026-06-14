import { mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultTokens } from "./color.js";
import { registerTemplateManifest, searchTemplates } from "./templates.js";

function customTemplate(id: string) {
  return {
    id,
    name: id,
    locale: "en-US" as const,
    description: `Template ${id}.`,
    tokens: defaultTokens("en-US"),
    layouts: [
      {
        id: "title-content",
        name: "Title and content",
        description: "Assertion title and concise body.",
        placeholders: ["title", "body"]
      }
    ],
    accessibility: {
      minimumBodyFontSize: 20,
      minimumContrast: 4.5,
      requiresSlideTitles: true,
      requiresReadingOrder: true,
      requiresAltText: true
    },
    tags: ["board", "custom"]
  };
}

describe("template registry", () => {
  it("registers custom templates for later search", async () => {
    const registryPath = join(await mkdtemp(join(tmpdir(), "pptcreater-templates-")), "registry.json");
    await registerTemplateManifest(customTemplate("custom-board-report"), { registryPath });

    const templates = await searchTemplates("board", { registryPath });

    expect(templates.some((template) => template.id === "custom-board-report")).toBe(true);
  });

  it("preserves concurrent template registrations", async () => {
    const registryPath = join(await mkdtemp(join(tmpdir(), "pptcreater-templates-")), "registry.json");

    await Promise.all([
      registerTemplateManifest(customTemplate("concurrent-template-one"), { registryPath }),
      registerTemplateManifest(customTemplate("concurrent-template-two"), { registryPath })
    ]);

    const templates = await searchTemplates("concurrent-template", { registryPath });

    expect(templates.some((template) => template.id === "concurrent-template-one")).toBe(true);
    expect(templates.some((template) => template.id === "concurrent-template-two")).toBe(true);
  });

  it("recovers stale template registry locks", async () => {
    const registryPath = join(await mkdtemp(join(tmpdir(), "pptcreater-templates-")), "registry.json");
    await mkdir(`${registryPath}.lock`);
    await writeFile(join(`${registryPath}.lock`, "owner.json"), JSON.stringify({ pid: 0, token: "stale", createdAt: 0 }));

    await registerTemplateManifest(customTemplate("stale-lock-template"), { registryPath });

    const templates = await searchTemplates("stale-lock-template", { registryPath });

    expect(templates.some((template) => template.id === "stale-lock-template")).toBe(true);
  });

  it("recovers malformed stale template registry locks", async () => {
    const registryPath = join(await mkdtemp(join(tmpdir(), "pptcreater-templates-")), "registry.json");
    const lockDir = `${registryPath}.lock`;
    await mkdir(lockDir);
    await writeFile(join(lockDir, "owner.json"), JSON.stringify({ broken: true }));
    await utimes(lockDir, new Date(0), new Date(0));

    await registerTemplateManifest(customTemplate("malformed-lock-template"), { registryPath });

    const templates = await searchTemplates("malformed-lock-template", { registryPath });

    expect(templates.some((template) => template.id === "malformed-lock-template")).toBe(true);
  });
});
