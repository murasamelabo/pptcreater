import { mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultTokens } from "./color.js";
import { deleteTemplateManifest, listTemplateEntries, registerTemplateManifest, scaffoldDeckFromTemplate, searchTemplateEntries, searchTemplates } from "./templates.js";
import { lintDeckSpec } from "./lint.js";
import { parseDeckSpec } from "./schema.js";

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

  it("lists presets and registered templates with deletion status", async () => {
    const registryPath = join(await mkdtemp(join(tmpdir(), "pptcreater-templates-")), "registry.json");
    await registerTemplateManifest(customTemplate("registered-board-report"), { registryPath });

    const entries = await listTemplateEntries({ registryPath });
    const preset = entries.find((entry) => entry.template.id === "minimal-consulting");
    const registered = entries.find((entry) => entry.template.id === "registered-board-report");

    expect(preset?.source).toBe("preset");
    expect(preset?.deletable).toBe(false);
    expect(preset?.deleteReason).toMatch(/cannot be deleted/);
    expect(registered?.source).toBe("registered");
    expect(registered?.deletable).toBe(true);
  });

  it("can list only registered templates", async () => {
    const registryPath = join(await mkdtemp(join(tmpdir(), "pptcreater-templates-")), "registry.json");
    await registerTemplateManifest(customTemplate("registered-only-board-report"), { registryPath });

    const entries = await searchTemplateEntries("", { registeredOnly: true, registryPath });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.template.id).toBe("registered-only-board-report");
    expect(entries[0]?.source).toBe("registered");
    expect(entries[0]?.deletable).toBe(true);
  });

  it("deletes registered custom templates without removing other templates", async () => {
    const registryPath = join(await mkdtemp(join(tmpdir(), "pptcreater-templates-")), "registry.json");
    await registerTemplateManifest(customTemplate("delete-me"), { registryPath });
    await registerTemplateManifest(customTemplate("keep-me"), { registryPath });

    const result = await deleteTemplateManifest("delete-me", { registryPath });
    const templates = await searchTemplates("", { registryPath });

    expect(result.template.id).toBe("delete-me");
    expect(templates.some((template) => template.id === "delete-me")).toBe(false);
    expect(templates.some((template) => template.id === "keep-me")).toBe(true);
  });

  it("rejects deleting built-in templates from the custom registry", async () => {
    const registryPath = join(await mkdtemp(join(tmpdir(), "pptcreater-templates-")), "registry.json");

    await expect(deleteTemplateManifest("minimal-consulting", { registryPath })).rejects.toThrow(/built in/);
  });

  it("deletes registered entries even when their id collides with a preset", async () => {
    const registryPath = join(await mkdtemp(join(tmpdir(), "pptcreater-templates-")), "registry.json");
    await writeFile(
      registryPath,
      JSON.stringify({
        version: "0.1",
        templates: [customTemplate("minimal-consulting")]
      })
    );

    const result = await deleteTemplateManifest("minimal-consulting", { registryPath });
    const registeredEntries = await listTemplateEntries({ registeredOnly: true, registryPath });
    const allEntries = await listTemplateEntries({ registryPath });

    expect(result.template.id).toBe("minimal-consulting");
    expect(registeredEntries).toHaveLength(0);
    expect(allEntries.some((entry) => entry.template.id === "minimal-consulting" && entry.source === "preset" && !entry.deletable)).toBe(true);
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

describe("scaffoldDeckFromTemplate stays renderable for imported templates", () => {
  it("clamps oversized non-16:9 captured geometry inside the linter's slide bounds", () => {
    const template = {
      ...customTemplate("oversized-import"),
      // A custom widescreen canvas larger than the 13.333x7.5 the layout/linter assume.
      slideSize: { widthInches: 20, heightInches: 11.25, aspect: "16:9" as const },
      titleSlide: {
        title: "Imported title",
        subtitle: "Imported subtitle",
        logos: [],
        background: { color: "#1f3a5f" },
        // Geometry near the source canvas edges — would overflow 13.333x7.5 unclamped.
        titleBox: { x: 1, y: 8.5, w: 18, h: 2 },
        subtitleBox: { x: 1, y: 10.5, w: 18, h: 0.7 }
      }
    };

    const deck = scaffoldDeckFromTemplate(template, { title: "新しいタイトル" });
    const report = lintDeckSpec(parseDeckSpec(deck));
    const outOfBounds = report.issues.filter((issue) => issue.code === "layout.out-of-bounds");
    expect(outOfBounds).toHaveLength(0);

    for (const slide of deck.slides) {
      for (const element of slide.elements) {
        expect(element.x + element.w).toBeLessThanOrEqual(13.333 + 1e-6);
        expect(element.y + element.h).toBeLessThanOrEqual(7.5 + 1e-6);
      }
    }
  });

  it("emits contrast-safe title text over a mid-tone scheme background", () => {
    const template = {
      ...customTemplate("midtone-import"),
      titleSlide: {
        title: "Imported title",
        subtitle: "Imported subtitle",
        logos: [],
        // Mid-tone fill where #ffffff (4.29:1) and #111827 (4.13:1) both fall short of 4.5:1,
        // so the scaffold must drop to a pure #000000 anchor (4.89:1) to stay legible.
        background: { color: "#7a7a7a" },
        titleBox: { x: 0.75, y: 3, w: 8, h: 1.6, fontSize: 18 },
        subtitleBox: { x: 0.75, y: 4.8, w: 8, h: 0.7, fontSize: 16 }
      }
    };

    const deck = scaffoldDeckFromTemplate(template, { title: "新しいタイトル" });
    const report = lintDeckSpec(parseDeckSpec(deck));
    const lowContrast = report.issues.filter((issue) => issue.code === "text.low-contrast");
    expect(lowContrast).toHaveLength(0);
  });
});
