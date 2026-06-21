import { mkdir, mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, defaultTokens } from "./color.js";
import { applyTemplateContentDesign, deleteTemplateManifest, listTemplateEntries, registerTemplateManifest, scaffoldDeckFromTemplate, searchTemplateEntries, searchTemplates } from "./templates.js";
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

describe("applyTemplateContentDesign re-skins content slides to the template identity", () => {
  const OLD_ACCENT = "#4f81bd";
  const NEW_ACCENT = "#1860c5";

  function rethemeTemplate(id: string) {
    const base = defaultTokens("en-US");
    return {
      ...customTemplate(id),
      tokens: {
        colors: { ...base.colors, accent: NEW_ACCENT, surface: "#f2f2f2" },
        typography: {
          ...base.typography,
          headingFont: "Segoe Sans Display Semilight",
          bodyFont: "Segoe Sans Display Semilight",
          fallbackFonts: ["Arial", "sans-serif"]
        },
        spacing: base.spacing
      },
      contentSlide: { background: { color: "#ffffff" }, logos: [] }
    };
  }

  function deckWithOldPalette() {
    const base = defaultTokens("en-US");
    return parseDeckSpec({
      version: "0.1" as const,
      title: "Old palette deck",
      locale: "en-US" as const,
      template: "legacy",
      tokens: {
        colors: { ...base.colors, accent: OLD_ACCENT },
        typography: {
          ...base.typography,
          headingFont: "Calibri",
          bodyFont: "Calibri",
          fallbackFonts: ["Meiryo"]
        },
        spacing: base.spacing
      },
      slides: [
        {
          id: "title",
          title: "Cover",
          layout: "title",
          elements: [{ id: "cover-title", type: "text", role: "title", text: "Cover", x: 0.75, y: 3, w: 8, h: 1.2, fontSize: 40 }]
        },
        {
          id: "s-content",
          title: "Content",
          layout: "title-content",
          elements: [
            { id: "badge", type: "shape", shape: "ellipse", fill: OLD_ACCENT, x: 0.75, y: 1.5, w: 0.4, h: 0.4 },
            {
              id: "badge-num",
              type: "text",
              role: "caption",
              text: "1",
              color: "#000000",
              contrastBackground: OLD_ACCENT,
              x: 0.75,
              y: 1.5,
              w: 0.4,
              h: 0.4,
              fontSize: 8.8
            },
            { id: "accent-text", type: "text", role: "body", text: "Accent label", color: OLD_ACCENT, x: 1.4, y: 1.5, w: 6, h: 0.5, fontSize: 24 },
            { id: "rule", type: "shape", shape: "line", x: 0.75, y: 2.2, w: 6, h: 0, line: { color: OLD_ACCENT, width: 2 } }
          ]
        },
        {
          id: "closing",
          title: "Closing",
          layout: "closing",
          elements: [{ id: "closing-title", type: "text", role: "title", text: "Thanks", x: 0.75, y: 3, w: 8, h: 1.2, fontSize: 40 }]
        }
      ]
    });
  }

  it("adopts the template tokens and unions the deck's font fallbacks", () => {
    const result = applyTemplateContentDesign(deckWithOldPalette(), rethemeTemplate("retheme-tokens"));

    expect(result.rethemed).toBe(true);
    expect(result.deck.tokens?.colors.accent).toBe(NEW_ACCENT);
    expect(result.deck.tokens?.typography.headingFont).toBe("Segoe Sans Display Semilight");
    // Japanese fallback from the deck is preserved alongside the template's Latin fallbacks.
    expect(result.deck.tokens?.typography.fallbackFonts).toEqual(expect.arrayContaining(["Meiryo", "Arial", "sans-serif"]));
  });

  it("remaps baked old-palette colors on text, shape fill, and line across the deck", () => {
    const result = applyTemplateContentDesign(deckWithOldPalette(), rethemeTemplate("retheme-remap"));
    const content = result.deck.slides[1];
    const badge = content.elements.find((element) => element.id === "badge");
    const accentText = content.elements.find((element) => element.id === "accent-text");
    const rule = content.elements.find((element) => element.id === "rule");

    expect(badge?.type === "shape" && badge.fill).toBe(NEW_ACCENT);
    expect(accentText?.type === "text" && accentText.color).toBe(NEW_ACCENT);
    expect(rule?.type === "shape" && rule.line?.color).toBe(NEW_ACCENT);
  });

  it("repairs text whose known background darkens below the contrast threshold", () => {
    const result = applyTemplateContentDesign(deckWithOldPalette(), rethemeTemplate("retheme-repair"));
    const badgeNum = result.deck.slides[1].elements.find((element) => element.id === "badge-num");

    expect(badgeNum?.type).toBe("text");
    if (badgeNum?.type === "text") {
      // The badge backdrop remapped to the darker accent, so black text is snapped to white.
      expect(badgeNum.contrastBackground).toBe(NEW_ACCENT);
      expect(badgeNum.color).toBe("#ffffff");
      expect(contrastRatio(badgeNum.color ?? "#000000", NEW_ACCENT)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("injects the template content background and reports the applied slide count", () => {
    const result = applyTemplateContentDesign(deckWithOldPalette(), rethemeTemplate("retheme-bg"));

    expect(result.appliedSlideCount).toBe(1);
    expect(result.deck.slides[1].background?.color).toBe("#ffffff");
    // Cover and closing keep their own identity.
    expect(result.deck.slides[0].background?.color).toBeUndefined();
  });

  it("leaves tokens and baked colors untouched when retheme is disabled", () => {
    const result = applyTemplateContentDesign(deckWithOldPalette(), rethemeTemplate("retheme-off"), { retheme: false });
    const badge = result.deck.slides[1].elements.find((element) => element.id === "badge");

    expect(result.rethemed).toBe(false);
    expect(result.deck.tokens?.colors.accent).toBe(OLD_ACCENT);
    expect(badge?.type === "shape" && badge.fill).toBe(OLD_ACCENT);
  });

  it("is idempotent and leaves no residual old-palette colors or low contrast", () => {
    const template = rethemeTemplate("retheme-idempotent");
    const once = applyTemplateContentDesign(deckWithOldPalette(), template);
    const twice = applyTemplateContentDesign(once.deck, template);

    const serialized = JSON.stringify(twice.deck);
    expect(serialized).not.toContain(OLD_ACCENT);

    const report = lintDeckSpec(parseDeckSpec(twice.deck));
    const lowContrast = report.issues.filter((issue) => issue.code === "text.low-contrast");
    expect(lowContrast).toHaveLength(0);
  });

  it("does not snap light text to black over an image background it cannot read", () => {
    const TINY_IMG =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const base = defaultTokens("en-US");
    // A template that re-themes tokens but defines NO solid content background, so a content slide's
    // own full-bleed image background survives and its (unknown) local background must not be guessed.
    const imageBgTemplate = {
      ...customTemplate("retheme-image-bg"),
      tokens: {
        colors: { ...base.colors, accent: NEW_ACCENT },
        typography: { ...base.typography, headingFont: "Segoe Sans Display Semilight", bodyFont: "Segoe Sans Display Semilight" },
        spacing: base.spacing
      },
      contentSlide: { logos: [] }
    };
    const deck = parseDeckSpec({
      version: "0.1" as const,
      title: "Image background deck",
      locale: "en-US" as const,
      template: "legacy",
      slides: [
        {
          id: "title",
          title: "Cover",
          layout: "title",
          background: { imageDataUri: TINY_IMG },
          elements: [
            { id: "cover-title", type: "text", role: "title", text: "Cover", color: "#ffffff", x: 0.75, y: 3, w: 8, h: 1.2, fontSize: 40 }
          ]
        },
        {
          id: "s-photo",
          title: "Photo slide",
          layout: "title-content",
          background: { imageDataUri: TINY_IMG },
          elements: [
            { id: "photo-text", type: "text", role: "body", text: "White caption on a dark photo", color: "#ffffff", x: 0.75, y: 1.5, w: 8, h: 0.6, fontSize: 24 }
          ]
        },
        {
          id: "closing",
          title: "Closing",
          layout: "closing",
          elements: [{ id: "closing-title", type: "text", role: "title", text: "Thanks", x: 0.75, y: 3, w: 8, h: 1.2, fontSize: 40 }]
        }
      ]
    });

    const result = applyTemplateContentDesign(deck, imageBgTemplate);
    const coverTitle = result.deck.slides[0].elements.find((element) => element.id === "cover-title");
    const photoText = result.deck.slides[1].elements.find((element) => element.id === "photo-text");

    // Light text over an unknown (image) background must be left as authored, never snapped to black —
    // on the cover slide and on a content slide whose own image background is retained.
    expect(coverTitle?.type === "text" && coverTitle.color).toBe("#ffffff");
    expect(photoText?.type === "text" && photoText.color).toBe("#ffffff");
    expect(result.deck.slides[1].background?.imageDataUri).toBe(TINY_IMG);
  });
});
