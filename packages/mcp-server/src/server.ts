import type { Stats } from "node:fs";
import { lstat, mkdir, realpath, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BUILTIN_ICON_NAMES, createSimpleIconSvg, getDefaultSvgRegistryPath, listIconSourceCatalogs, registerSvgAsset, searchAllSvgAssets } from "@pptcreater/assets-svg";
import { renderNativePonchiDiagram, renderPonchiDiagram, renderSchematicDiagram } from "@pptcreater/diagram";
import {
  BUSINESS_STYLE_MODES,
  createEditWithCopilotPrompt,
  ContentModeSchema,
  createSampleDeck,
  DeckSpecSchema,
  ensureSourceReferenceSlide,
  getBusinessDeckGuidance,
  getContentGuidance,
  getDefaultTemplateRegistryPath,
  listSkillPacks,
  lintDeckSpec,
  LocaleSchema,
  localizeLintReport,
  normalizeDeckLayout,
  parseDeckSpec,
  planSourceVisualStrategy,
  planBusinessDeck,
  recommendTemplateForContentMode,
  registerTemplateManifest,
  reviewBusinessDeck,
  reviewDeckContent,
  searchTemplates,
  STYLE_PROFILES,
  TemplateManifestSchema,
  type DeckSpec
} from "@pptcreater/core";
import { renderDeckToPptx } from "@pptcreater/render-pptx";
import { renderStudioHtml } from "@pptcreater/studio";

function jsonText(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

type McpOutputPath = {
  outputRoot: string;
  resolvedOutputPath: string;
};

const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

function isPathInside(child: string, parent: string): boolean {
  const childRelative = relative(parent, child);
  return childRelative === "" || (!childRelative.startsWith("..") && !isAbsolute(childRelative));
}

function normalizeMcpOutputPathInput(outputPath: string): string {
  return outputPath.trim();
}

function assertSafeRelativeOutputSegments(outputPath: string): void {
  const segments = outputPath.split(/[\\/]+/).filter(Boolean);
  segments.forEach((segment) => {
    if (segment.includes(":")) {
      throw new Error("outputPath cannot contain ':' characters.");
    }

    if (segment.endsWith(".") || segment.endsWith(" ")) {
      throw new Error("outputPath segments cannot end with spaces or dots.");
    }

    if (WINDOWS_RESERVED_NAMES.test(segment)) {
      throw new Error(`outputPath uses a reserved Windows device name: ${segment}`);
    }
  });
}

function resolveMcpOutputPath(outputPath: string): McpOutputPath {
  const normalizedOutputPath = normalizeMcpOutputPathInput(outputPath);
  if (normalizedOutputPath.includes("\0")) {
    throw new Error("outputPath cannot contain null bytes.");
  }

  assertSafeRelativeOutputSegments(normalizedOutputPath);

  if (isAbsolute(normalizedOutputPath)) {
    throw new Error("MCP outputPath must be relative (for example, deck.pptx). Files are written under the generated directory.");
  }

  const extension = extname(normalizedOutputPath).toLowerCase();
  if (extension !== ".pptx" && extension !== ".html") {
    throw new Error("outputPath must end with .pptx or .html.");
  }

  const outputRoot = resolve(process.cwd(), "generated");
  const resolvedOutputPath = resolve(outputRoot, normalizedOutputPath);
  const relativePath = relative(outputRoot, resolvedOutputPath);

  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("outputPath must stay inside the generated directory.");
  }

  return { outputRoot, resolvedOutputPath };
}

async function assertNoSymlinkComponents(outputRoot: string, targetDirectory: string, resolvedOutputPath: string): Promise<void> {
  const rootStat = await lstat(outputRoot);
  if (rootStat.isSymbolicLink()) {
    throw new Error("generated output root cannot be a symbolic link.");
  }

  const directoryParts = relative(outputRoot, targetDirectory).split(/[\\/]+/).filter(Boolean);
  let current = outputRoot;
  for (const part of directoryParts) {
    current = resolve(current, part);
    const stat = await lstat(current);
    if (stat.isSymbolicLink()) {
      throw new Error("generated output path cannot contain symbolic links.");
    }
  }

  const outputStat = await getPathStats(resolvedOutputPath);
  if (outputStat?.isSymbolicLink()) {
    throw new Error("Refusing to write through a symbolic link output file.");
  }
}

async function getPathStats(path: string): Promise<Stats | undefined> {
  try {
    return await lstat(path);
  } catch (error) {
    const nodeError = error as Error & { code?: string };
    if (nodeError.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

async function ensureSafeDirectoryPath(outputRoot: string, targetDirectory: string): Promise<void> {
  const rootStats = await getPathStats(outputRoot);
  if (rootStats) {
    if (rootStats.isSymbolicLink()) {
      throw new Error("generated output root cannot be a symbolic link.");
    }

    if (!rootStats.isDirectory()) {
      throw new Error("generated output root must be a directory.");
    }
  } else {
    await mkdir(outputRoot);
  }

  const realRoot = await realpath(outputRoot);
  const directoryParts = relative(outputRoot, targetDirectory).split(/[\\/]+/).filter(Boolean);
  let current = outputRoot;

  for (const part of directoryParts) {
    current = resolve(current, part);
    const stats = await getPathStats(current);

    if (stats) {
      if (stats.isSymbolicLink()) {
        throw new Error("generated output path cannot contain symbolic links.");
      }

      if (!stats.isDirectory()) {
        throw new Error("generated output path component must be a directory.");
      }
    } else {
      await mkdir(current);
    }

    const realCurrent = await realpath(current);
    if (!isPathInside(realCurrent, realRoot)) {
      throw new Error("generated output path resolves outside the generated directory.");
    }
  }
}

async function assertNoSymlinkPathComponents(root: string, resolvedPath: string): Promise<void> {
  const relativePath = relative(root, resolvedPath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("image.path must stay inside the current workspace.");
  }

  let current = root;
  for (const segment of relativePath.split(/[\\/]+/).filter(Boolean)) {
    current = resolve(current, segment);
    const stats = await lstat(current);
    if (stats.isSymbolicLink()) {
      throw new Error("image.path cannot contain symbolic links.");
    }
  }
}

async function prepareMcpOutputPath(outputPath: string, overwrite: boolean): Promise<string> {
  const { outputRoot, resolvedOutputPath } = resolveMcpOutputPath(outputPath);
  const targetDirectory = dirname(resolvedOutputPath);

  await ensureSafeDirectoryPath(outputRoot, targetDirectory);
  await assertNoSymlinkComponents(outputRoot, targetDirectory, resolvedOutputPath);

  const [realRoot, realDirectory] = await Promise.all([realpath(outputRoot), realpath(targetDirectory)]);
  if (!isPathInside(realDirectory, realRoot)) {
    throw new Error("outputPath resolves outside the generated directory.");
  }

  const outputStats = await getPathStats(resolvedOutputPath);
  if (outputStats?.isSymbolicLink()) {
    throw new Error("Refusing to write through a symbolic link output file.");
  }

  if (outputStats && !overwrite) {
    throw new Error("Refusing to overwrite existing PPTX. Set overwrite to true to replace it.");
  }

  return resolvedOutputPath;
}

async function assertSafeLocalImagePaths(deck: DeckSpec): Promise<void> {
  const workspaceRoot = await realpath(process.cwd());
  await Promise.all(
    deck.slides.flatMap((slide, slideIndex) =>
      slide.elements.map(async (element, elementIndex) => {
        if (element.type === "image" && element.path) {
          if (element.path.includes("\0")) {
            throw new Error(`image.path cannot contain null bytes at slides.${slideIndex}.elements.${elementIndex}.`);
          }

          const extension = extname(element.path).toLowerCase();
          if (![".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(extension)) {
            throw new Error(`image.path must be SVG, PNG, JPEG, GIF, or WebP at slides.${slideIndex}.elements.${elementIndex}.`);
          }

        const resolvedPath = resolve(process.cwd(), element.path);
        await assertNoSymlinkPathComponents(resolve(process.cwd()), resolvedPath);
        const realPath = await realpath(resolvedPath);
        if (!isPathInside(realPath, workspaceRoot)) {
          throw new Error(`image.path must stay inside the current workspace at slides.${slideIndex}.elements.${elementIndex}. Use image.dataUri for external files.`);
        }

        const stats = await lstat(realPath);
        if (!stats.isFile()) {
          throw new Error(`image.path must reference a regular non-symlink file at slides.${slideIndex}.elements.${elementIndex}.`);
        }
        }
      })
    )
  );
}

export function createPptcreaterMcpServer(): McpServer {
  const server = new McpServer({
    name: "pptcreater",
    version: "0.1.1"
  });
  const createPowerPointInputSchema = {
    locale: z.enum(["ja-JP", "en-US"]).default("ja-JP"),
    purpose: z.string().optional(),
    audience: z.string().optional(),
    slideCount: z.number().int().min(1).max(4).optional(),
    contentMode: z.enum(["presentation", "report", "technical", "handout", "decision"]).optional(),
    styleProfile: z.enum(STYLE_PROFILES).optional(),
    outputPath: z.string().min(1),
    overwrite: z.boolean().default(false)
  };
  const renderPowerPointInputSchema = {
    deck: DeckSpecSchema,
    outputPath: z.string().min(1),
    overwrite: z.boolean().default(false),
    polishLayout: z.boolean().default(false)
  };
  const businessBriefInputSchema = {
    locale: LocaleSchema.default("ja-JP"),
    topic: z.string().optional(),
    purpose: z.string().optional(),
    audience: z.string().optional(),
    usageContext: z.string().optional(),
    desiredAction: z.string().optional(),
    slideCount: z.number().int().min(3).max(40).optional(),
    styleMode: z.enum(BUSINESS_STYLE_MODES).default("consulting"),
    brandDirection: z.string().optional(),
    sourceSummary: z.string().optional(),
    customerFacing: z.boolean().default(false),
    importantMeeting: z.boolean().default(false)
  };
  const createPowerPoint = async ({
    locale,
    purpose,
    audience,
    slideCount,
    contentMode,
    styleProfile,
    outputPath,
    overwrite
  }: {
    locale: "ja-JP" | "en-US";
    purpose?: string;
    audience?: string;
    slideCount?: number;
    contentMode?: "presentation" | "report" | "technical" | "handout" | "decision";
    styleProfile?: (typeof STYLE_PROFILES)[number];
    outputPath: string;
    overwrite: boolean;
  }) => {
    const deck = createSampleDeck(locale, { purpose, audience, slideCount, contentMode, styleProfile });
    const lint = localizeLintReport(lintDeckSpec(deck), locale);
    const resolvedOutputPath = await prepareMcpOutputPath(outputPath, overwrite);
    if (extname(resolvedOutputPath).toLowerCase() !== ".pptx") {
      throw new Error("create_pptx outputPath must end with .pptx.");
    }
    const render = await renderDeckToPptx(deck, resolvedOutputPath, { polishLayout: true });
    return jsonText({ deck, lint, render });
  };
  const renderPowerPoint = async ({
    deck,
    outputPath,
    overwrite,
    polishLayout
  }: {
    deck: DeckSpec;
    outputPath: string;
    overwrite: boolean;
    polishLayout: boolean;
  }) => {
    const parsedDeck = ensureSourceReferenceSlide(parseDeckSpec(deck));
    await assertSafeLocalImagePaths(parsedDeck);
    const resolvedOutputPath = await prepareMcpOutputPath(outputPath, overwrite);
    if (extname(resolvedOutputPath).toLowerCase() !== ".pptx") {
      throw new Error("render_pptx outputPath must end with .pptx.");
    }
    return jsonText(await renderDeckToPptx(parsedDeck, resolvedOutputPath, { polishLayout }));
  };

  server.registerTool(
    "create_deck",
    {
      title: "Create sample DeckSpec",
      description: "Create a starter visual DeckSpec. The content mode selects a styled template (presentation/report/technical), or pass styleProfile to force a style.",
      inputSchema: {
        locale: z.enum(["ja-JP", "en-US"]).default("ja-JP"),
        purpose: z.string().optional(),
        audience: z.string().optional(),
        slideCount: z.number().int().min(1).max(4).optional(),
        contentMode: z.enum(["presentation", "report", "technical", "handout", "decision"]).optional(),
        styleProfile: z.enum(STYLE_PROFILES).optional()
      }
    },
    async ({ locale, purpose, audience, slideCount, contentMode, styleProfile }) =>
      jsonText(createSampleDeck(locale, { purpose, audience, slideCount, contentMode, styleProfile }))
  );

  server.registerTool(
    "create_pptx",
    {
      title: "Create and render PowerPoint",
      description:
        "One-shot safe workflow: create a styled DeckSpec with built-in layout, icons, visual backgrounds, lint, polish, and render it to .pptx. Use this instead of PowerPoint COM when the user asks to create a PPTX directly.",
      inputSchema: createPowerPointInputSchema
    },
    createPowerPoint
  );

  server.registerTool(
    "create_powerpoint",
    {
      title: "Create PowerPoint with pptcreater",
      description:
        "Alias for create_pptx. One-shot PowerPoint generation through pptcreater; use when tool search surfaces PowerPoint wording but not create_pptx. Never fall back to PowerPoint COM for normal deck creation.",
      inputSchema: createPowerPointInputSchema
    },
    createPowerPoint
  );

  server.registerTool(
    "recommend_template",
    {
      title: "Recommend a styled template",
      description: "Recommend a built-in styled template and style profile for a content mode (presentation, report, technical, handout, decision).",
      inputSchema: {
        contentMode: z.enum(["presentation", "report", "technical", "handout", "decision"]).default("presentation")
      }
    },
    async ({ contentMode }) => jsonText(recommendTemplateForContentMode(contentMode))
  );

  server.registerTool(
    "lint_deck",
    {
      title: "Lint DeckSpec",
      description: "Validate and lint a DeckSpec for design and accessibility issues.",
      inputSchema: {
        deck: DeckSpecSchema,
        locale: LocaleSchema.optional()
      }
    },
    async ({ deck, locale }) => {
      const parsedDeck = parseDeckSpec(deck);
      return jsonText(localizeLintReport(lintDeckSpec(parsedDeck), locale ?? parsedDeck.locale));
    }
  );

  server.registerTool(
    "review_content",
    {
      title: "Review slide content writing",
      description:
        "Return bilingual, content-mode-specific slide writing guidance and optionally review a DeckSpec for verbose titles, missing slide messages, prose-like body text, and excessive bullets. Use before rendering when AI-generated slide copy reads like a document.",
      inputSchema: {
        deck: DeckSpecSchema.optional(),
        locale: LocaleSchema.optional(),
        contentMode: ContentModeSchema.optional()
      }
    },
    async ({ deck, locale, contentMode }) => {
      if (!deck) {
        return jsonText({ guidance: getContentGuidance(locale ?? "ja-JP", contentMode ?? "presentation"), issues: [] });
      }

      const parsedDeck = parseDeckSpec(deck);
      return jsonText(reviewDeckContent(parsedDeck, locale ?? parsedDeck.locale, contentMode ?? parsedDeck.metadata.contentMode ?? "presentation"));
    }
  );

  server.registerTool(
    "plan_business_deck",
    {
      title: "Plan a business PowerPoint deck",
      description:
        "Create a business deck director plan before DeckSpec production: objective, audience action, 3-5 section architecture, slide-level message/evidence/reading-path plan, and human-review flags. Use for consulting-style, executive, customer-facing, internal-friendly, or Edit with Copilot workflows.",
      inputSchema: businessBriefInputSchema
    },
    async (brief) => jsonText(planBusinessDeck(brief))
  );

  server.registerTool(
    "generate_edit_with_copilot_prompt",
    {
      title: "Generate Edit with Copilot prompt",
      description:
        "Generate a complete PowerPoint for the web / Edit with Copilot prompt from the business deck director plan. This is an upstream prompt workflow; final deterministic PPTX output should still use pptcreater DeckSpec rendering when possible.",
      inputSchema: businessBriefInputSchema
    },
    async (brief) => jsonText({ prompt: createEditWithCopilotPrompt(brief), plan: planBusinessDeck(brief) })
  );

  server.registerTool(
    "review_business_deck",
    {
      title: "Review business deck storyline",
      description:
        "Review a DeckSpec for business presentation direction: executive summary, agenda/section pacing, lead sentences, equal emphasis, repeated card grids, final landing, and source traceability. Run alongside review_content and lint_deck.",
      inputSchema: {
        deck: DeckSpecSchema,
        locale: LocaleSchema.optional(),
        styleMode: z.enum(BUSINESS_STYLE_MODES).default("consulting"),
        customerFacing: z.boolean().default(false),
        importantMeeting: z.boolean().default(false)
      }
    },
    async ({ deck, locale, styleMode, customerFacing, importantMeeting }) => {
      const parsedDeck = parseDeckSpec(deck);
      return jsonText(reviewBusinessDeck(parsedDeck, { locale: locale ?? parsedDeck.locale, styleMode, customerFacing, importantMeeting }));
    }
  );

  server.registerTool(
    "polish_deck_layout",
    {
      title: "Polish DeckSpec layout",
      description: "Normalize slide bounds and text fitting before rendering to reduce overflow and misalignment.",
      inputSchema: {
        deck: DeckSpecSchema,
        locale: LocaleSchema.optional()
      }
    },
    async ({ deck, locale }) => {
      const polished = normalizeDeckLayout(ensureSourceReferenceSlide(parseDeckSpec(deck)));
      return jsonText({
        deck: polished,
        lint: localizeLintReport(lintDeckSpec(polished), locale ?? polished.locale)
      });
    }
  );

  server.registerTool(
    "render_pptx",
    {
      title: "Render PowerPoint",
      description:
        "Render a DeckSpec to a local .pptx path through pptcreater. This is the normal final output path; use CLI `pptcreater render` if this MCP tool is not visible, and do not use PowerPoint COM.",
      inputSchema: renderPowerPointInputSchema
    },
    renderPowerPoint
  );

  server.registerTool(
    "render_powerpoint",
    {
      title: "Render PowerPoint with pptcreater",
      description:
        "Alias for render_pptx. Render a DeckSpec to .pptx through pptcreater when tool search surfaces PowerPoint wording but not render_pptx. If no render MCP tool is visible, run CLI `pptcreater render <deck> --output <file>.pptx --polish`; never use PowerPoint COM for normal output.",
      inputSchema: renderPowerPointInputSchema
    },
    renderPowerPoint
  );

  server.registerTool(
    "render_studio",
    {
      title: "Render Studio HTML",
      description: "Render a static local Studio HTML preview for a DeckSpec.",
      inputSchema: {
        deck: DeckSpecSchema,
        outputPath: z.string().min(1),
        locale: LocaleSchema.optional(),
        overwrite: z.boolean().default(false)
      }
    },
    async ({ deck, outputPath, locale, overwrite }) => {
      const parsedDeck = parseDeckSpec(deck);
      const resolvedOutputPath = await prepareMcpOutputPath(outputPath, overwrite);
      if (extname(resolvedOutputPath).toLowerCase() !== ".html") {
        throw new Error("render_studio outputPath must end with .html.");
      }

      await writeFile(resolvedOutputPath, renderStudioHtml(parsedDeck, locale ?? parsedDeck.locale), "utf8");
      return jsonText({ outputPath: resolvedOutputPath });
    }
  );

  server.registerTool(
    "plan_source_visual",
    {
      title: "Plan source visual usage",
      description: "Help an agent choose whether to quote an original source figure, recreate it as editable objects, or use it only as inspiration.",
      inputSchema: {
        sourceTitle: z.string().min(1),
        sourceUrl: z.string().url().optional(),
        visualDescription: z.string().min(1),
        hasPermission: z.boolean().optional(),
        needsExactFidelity: z.boolean().optional()
      }
    },
    async (input) => jsonText(planSourceVisualStrategy(input))
  );

  server.registerTool(
    "search_templates",
    {
      title: "Search templates",
      description: "List built-in accessible slide templates.",
      inputSchema: {
        query: z.string().default("")
      }
    },
    async ({ query }) => {
      return jsonText(await searchTemplates(query));
    }
  );

  server.registerTool(
    "register_template",
    {
      title: "Register template",
      description: "Register a validated template manifest as a reusable pptcreater template.",
      inputSchema: {
        template: TemplateManifestSchema,
        overwrite: z.boolean().default(false)
      }
    },
    async ({ template, overwrite }) => jsonText(await registerTemplateManifest(template, { overwrite }))
  );

  server.registerTool(
    "search_assets",
    {
      title: "Search SVG assets",
      description: "Search registered SVG icons and visual assets.",
      inputSchema: {
        query: z.string().default("")
      }
    },
    async ({ query }) => jsonText(await searchAllSvgAssets(query))
  );

  server.registerTool(
    "register_svg_asset",
    {
      title: "Register reusable SVG asset",
      description: "Sanitize and register an SVG icon or illustration for repeated use by search_assets and future decks.",
      inputSchema: {
        id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/),
        title: z.string().min(1),
        description: z.string().min(1),
        tags: z.array(z.string()).default([]),
        license: z.string().default("custom"),
        decorative: z.boolean().default(false),
        altText: z.string().optional(),
        svg: z.string().min(1).max(200_000),
        overwrite: z.boolean().default(false)
      }
    },
    async ({ overwrite, ...asset }) => jsonText(await registerSvgAsset(asset, { overwrite }))
  );

  server.registerTool(
    "generate_svg",
    {
      title: "Generate SVG icon",
      description: "Generate a simple safe SVG icon asset.",
      inputSchema: {
        name: z.enum(BUILTIN_ICON_NAMES).default("info"),
        color: z.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/).default("#1d4ed8")
      }
    },
    async ({ name, color }) => jsonText(createSimpleIconSvg(name, color))
  );

  server.registerTool(
    "generate_diagram",
    {
      title: "Generate ponchi-e diagram",
      description:
        "Render an architecture/flow ponchi-e as one fixed accessible SVG with visible labels. Prefer generate_native_diagram for most architecture, flow, security, and ponchi-e slides because it returns editable PowerPoint shape/text elements. Use this SVG tool only when a single fixed illustration is required. Omit node x/y to get automatic layered layout: just give nodes (id, label, kind) and arrows (from, to); set diagram.direction 'LR' or 'TB' and optional node.layer/lane hints. Never embed shape-only SVG diagrams: every meaningful node/lane/decision/flow needs readable SVG <text> labels or callouts; altText/summary/longDescription alone is not visible to slide viewers.",
      inputSchema: {
        diagram: z.unknown()
      }
    },
    async ({ diagram }) => jsonText(renderPonchiDiagram(diagram))
  );

  server.registerTool(
    "generate_native_diagram",
    {
      title: "Generate editable PowerPoint ponchi-e diagram",
      description:
        "Generate an architecture/flow/security ponchi-e as native DeckSpec shape/text elements, not an image or SVG. Use this first for diagrams like Private Marketplace, enterprise control planes, decision flows, and security architectures. It preserves aspect ratio inside the requested slide frame, spaces nodes automatically when x/y are omitted, routes connector line segments border-to-border, keeps labels as editable PowerPoint text, and returns warnings when a dense diagram should be split. Insert the returned elements directly into a slide.elements array; do not wrap them in image/svg/diagram.",
      inputSchema: {
        diagram: z.unknown(),
        frame: z
          .object({
            x: z.number().min(0).default(0.75),
            y: z.number().min(0).default(1.55),
            w: z.number().positive().default(11.85),
            h: z.number().positive().default(5.35)
          })
          .optional(),
        idPrefix: z.string().min(1).max(60).default("native-diagram"),
        readingOrderStart: z.number().int().min(0).default(100)
      }
    },
    async ({ diagram, frame, idPrefix, readingOrderStart }) => jsonText(renderNativePonchiDiagram(diagram, { frame, idPrefix, readingOrderStart }))
  );

  server.registerTool(
    "generate_schematic",
    {
      title: "Generate Slideland-style schematic",
      description:
        "Generate a safe, presentation-ready schematic SVG from a preset kind. Prefer this over freehand SVG when creating tables, trees, horizontal/vertical flows, lists, or mockup-style visuals.",
      inputSchema: {
        schematic: z.object({
          kind: z.enum(["table", "tree", "flow", "vertical-flow", "list", "list-horizontal", "list-enumeration", "mockup"]),
          title: z.string().min(1),
          summary: z.string().min(1),
          longDescription: z.string().min(20),
          items: z.array(z.string().min(1)).min(1).max(8),
          secondaryItems: z.array(z.string().min(1)).max(8).default([]),
          tone: z.enum(["minimal", "cool", "luxury", "report"]).default("minimal"),
          width: z.number().min(960).default(960),
          height: z.number().min(540).default(540)
        })
      }
    },
    async ({ schematic }) => jsonText(renderSchematicDiagram(schematic))
  );

  server.registerTool(
    "list_skills",
    {
      title: "List skill packs",
      description: "List built-in slide design skill packs.",
      inputSchema: {}
    },
    async () => jsonText(listSkillPacks())
  );

  server.registerResource(
    "icon-source-catalogs",
    "asset://icon-sources",
    {
      title: "Icon source catalogs",
      description: "Free or publicly documented icon catalogs that agents may use after checking each source's license and brand terms.",
      mimeType: "application/json"
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(listIconSourceCatalogs(), null, 2)
        }
      ]
    })
  );

  server.registerResource(
    "asset-registration-guide",
    "asset://registration-guide",
    {
      title: "Asset registration guide",
      description: "How AI agents should register reusable SVG assets and templates in pptcreater.",
      mimeType: "text/markdown"
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: [
            "# pptcreater asset registration",
            "",
            "Use `register_svg_asset` when the user provides or asks you to create an SVG that should be reused in future decks.",
            "",
            "Required SVG fields: `id`, `title`, `description`, and `svg`.",
            "Recommended fields: `tags`, `license`, `decorative`, and `altText`.",
            "The server sanitizes SVG markup before writing it to the registry.",
            `Default SVG registry: ${getDefaultSvgRegistryPath()}`,
            "",
            "Use `search_assets` before creating a duplicate asset. Built-in generated presets include generic Microsoft/Azure/Entra/Microsoft 365/Power Platform/Dynamics 365, AWS, and Google Cloud/Workspace pictograms such as `preset-azure-architecture`, `preset-aws-cloud`, and `preset-google-cloud`.",
            "Use these generated presets for conceptual cloud diagrams when official logo fidelity is not required. They are not official vendor icons.",
            "Use `asset://icon-sources` to discover upstream icon catalogs and their license/brand guidance notes before registering exact official SVGs.",
            "",
            "Use `register_template` for reusable slide template manifests. A template manifest must include design tokens, layouts, locale, tags, and accessibility constraints.",
            `Default template registry: ${getDefaultTemplateRegistryPath()}`,
            "",
            "After registration, use `search_assets` or `search_templates` to discover the new reusable item."
          ].join("\n")
        }
      ]
    })
  );

  server.registerResource(
    "modern-slide-principles",
    "design://modern-slide-principles",
    {
      title: "Modern slide design principles",
      description: "Design principles distilled from modern slide galleries without copying any specific design.",
      mimeType: "text/markdown"
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: [
            "# Modern slide design principles",
            "",
            "Use these as style guidance, not as a license to copy specific third-party slides.",
            "",
            "- Choose the content framework before writing: Japanese report/technical decks usually split topic title + slide message; English executive/presentation decks usually use action titles.",
            "- Use a modular grid: cards, bands, large numerals, timelines, and process blocks.",
            "- Build one memorable visual scene per slide.",
            "- Keep typography bold, sparse, and hierarchical.",
            "- Use generous whitespace and one intentional accent color.",
            "- Prefer editable PowerPoint shapes/text over flattened images.",
            "- For report decks, use more structure and evidence blocks.",
            "- For presentation decks, use fewer words and more visual contrast.",
            "- For technical decks, use architecture, concept, boundary, and flow diagrams.",
            "- Diagrams must be visually self-explanatory and editable where possible: use generate_native_diagram for architecture/flow/security ponchi-e diagrams, and do not flatten boxes/connectors/labels into image.path SVG unless exact fidelity is required.",
            "- Run `review_content`, `polish_deck_layout`, and `lint_deck` before rendering."
          ].join("\n")
        }
      ]
    })
  );

  server.registerResource(
    "business-ppt-director",
    "design://business-ppt-director",
    {
      title: "Business PowerPoint director guidance",
      description: "Business deck planning guidance for storyline, section architecture, page-level emphasis, and post-generation review.",
      mimeType: "application/json"
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              consulting: getBusinessDeckGuidance("ja-JP", "consulting"),
              internalFriendly: getBusinessDeckGuidance("ja-JP", "internal-friendly"),
              workflow: [
                "Use plan_business_deck before creating DeckSpec for executive, customer-facing, consulting-style, or internal-friendly decks.",
                "Use generate_edit_with_copilot_prompt only when the user wants a PowerPoint for the web / Edit with Copilot production prompt.",
                "Use review_business_deck after DeckSpec generation, alongside review_content and lint_deck.",
                "Render deterministic final output with render_pptx/render_powerpoint or the CLI fallback; do not replace pptcreater rendering with raw PowerPoint automation."
              ]
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerResource(
    "source-visual-guide",
    "source://visual-use-guide",
    {
      title: "Source visual usage guide",
      description: "How to decide between quoting a source figure and recreating it as editable PowerPoint objects.",
      mimeType: "text/markdown"
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: [
            "# Source visual usage guide",
            "",
            "When a deck summarizes a source document or URL, first decide whether each source visual should be quoted, recreated, or used only as inspiration.",
            "",
            "- Quote: only when exact fidelity is required and usage rights are clear. Add `metadata.sources[].usage = quote`, `sourceId`, and `citation`.",
            "- Recreate: preferred for explanatory slides because PowerPoint objects remain editable and can be localized/simplified.",
            "- Inspiration: use when rights are unclear or the original is too detailed; do not copy the original visual.",
            "- References slide: whenever an external URL is used, add it to `metadata.sources[].url`. `render_pptx`, `render_studio`, and `polish_deck_layout` append/update the final references slide with the actual URLs. Per-slide citations are optional for URL-backed sources when the final references slide is complete.",
            "",
            "Use the `plan_source_visual` tool to present these choices to the agent/user before rendering."
          ].join("\n")
        }
      ]
    })
  );

  server.registerResource(
    "deckspec-schema",
    "deckspec://schema",
    {
      title: "DeckSpec schema",
      description: "Current DeckSpec schema guidance for agent use.",
      mimeType: "application/json"
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              version: "0.1",
              description: "Use create_pptx/create_powerpoint for direct PPTX requests. Use create_deck for examples and lint_deck before render_pptx/render_powerpoint when manually editing a DeckSpec. If MCP render tools are not visible, use CLI `pptcreater render <deck.json> --output <deck.pptx> --polish`; never use PowerPoint COM for normal output.",
              templateField: "DeckSpec.template must be the id of a template returned by search_templates. Register reusable custom templates with register_template.",
              assetFlow: "Use search_assets to find registered SVG assets. Use generate_native_diagram for architecture/network/sequence/security ponchi-e diagrams that should remain editable in PowerPoint, generate_schematic for table/tree/flow/list/mockup visuals, generate_diagram only when a single fixed SVG illustration is required, and register_svg_asset for reusable SVGs. If research produces local SVG/PNG/JPEG/GIF/WebP files, keep them inside the workspace, reference them with DeckSpec image.path only for logos/photos/source quotes/exact-fidelity figures, and still call render_pptx/render_powerpoint or CLI `pptcreater render`; do not switch to PowerPoint COM or ad-hoc PPTX generation.",
              shapeFlow: "Use native shape/text elements for editable cards, dividers, badges, accent bars, and generator-created ponchi-e diagrams. Do NOT hand-place line/rightArrow shapes for connected architecture/flow diagrams: use generate_native_diagram so spacing, border-to-border connector routing, labels, and reading order are generated consistently.",
              diagramFlow: "generate_native_diagram returns DeckSpec shape/text elements, not SVG/image. Insert its elements directly into slide.elements to keep nodes, labels, group lanes, and connectors editable in PowerPoint. Omit node x/y to get automatic layered layout — supply only nodes (id, label, kind) and arrows (from, to), set direction 'LR'/'TB', and optionally node.layer/lane to steer placement. Use arrow.style 'orthogonal', arrow.bidirectional, arrow.label, node.sublabel, and node.emphasis for hierarchy. Use generate_diagram SVG only when you intentionally need a fixed single illustration.",
              businessFlow: "For consulting-style, executive, customer-facing, important meeting, or internal-friendly business decks, call plan_business_deck before writing DeckSpec. It creates purpose/audience/reader-action framing, 3-5 section architecture, slide-level message/evidence/reading-path plans, and human-review flags. After DeckSpec generation, call review_business_deck alongside review_content and lint_deck.",
              contentFlow: "Before rendering, call review_content with the deck locale and contentMode. It applies different writing rules for presentation, report, technical, handout, and decision decks. For Japanese report/technical/handout decks, prefer a short topic-label title plus a separate 50-character slide message. For Japanese presentation/decision decks, concise assertion titles are allowed. For English decks, prefer action titles: short complete-sentence takeaways supported by 3-5 proof points.",
              layoutGuardrails: "render_pptx always applies layout polish (token-aware Japanese/Latin wrapping, font auto-fit, manual-break reflow) and reading-order normalization before drawing, so most overflow, mid-word/kanji splits, orphaned punctuation, and decorative-over-text overlaps are fixed automatically. It still blocks only when content genuinely cannot fit (a box far too small even at the minimum font), low contrast, missing alt text, duplicate ids, out-of-bounds shapes, or SVG-internal diagram text that would render below 8pt; the error lists each offending code and path. Fix those by shortening copy, enlarging the box/diagram, reducing labels, moving dense content into generate_native_diagram/generate_schematic, or splitting dense diagrams across slides.",
              cognitiveLoad: "Use one visual grammar per slide. Prefer table for comparisons, tree for hierarchy, generate_native_diagram for architecture/security/flow with editable connectors, flow/vertical-flow for processes, and list/list-horizontal for 3-4 key points. Avoid many custom text boxes with uneven manual line breaks or body-only enumerations. Let layout polish wrap Japanese text instead of hand-coding line breaks. Content slides must not be text-only: fix visual.richness-missing and visual.richness-deck by adding generate_schematic, generate_native_diagram, registered icons, images, or card/shape composition so at least 75% of content slides have visual structure. When embedding SVG diagrams, keep internal labels at least 8pt after scaling or recreate/split them.",
              sourceReferences: "Whenever a deck uses external websites, record each source in metadata.sources with the actual url. render_pptx, render_studio, and polish_deck_layout automatically append/update the final references slide (参考URL・出典 / References and sources) so the last slide contains all external URLs. Per-slide citations are optional for URL-backed sources when the final references slide is complete.",
              sourceVisuals: "Use metadata.sources plus element.sourceId/citation when quoting, recreating, or using source visuals as inspiration. Prefer editable shape/text objects for recreated visuals. For URL-backed sources, final-slide references can replace per-slide citation text.",
              requiredVisualAccessibility: "Non-decorative SVG, image, and diagram elements require altText. Diagram elements also require summary and longDescription.",
              recommendedWorkflow: ["plan_business_deck for business/executive/customer-facing decks", "create_pptx/create_powerpoint for direct output", "search_templates", "search_assets", "generate_native_diagram for editable ponchi-e/architecture/security diagrams", "generate_schematic for structured visuals", "create_deck or custom DeckSpec", "review_business_deck for storyline/section/emphasis checks", "review_content", "lint_deck", "render_pptx/render_powerpoint or render_studio", "CLI fallback if render MCP tools are hidden: pptcreater render <deck.json> --output <deck.pptx> --polish"]
            },
            null,
            2
          )
        }
      ]
    })
  );

  server.registerPrompt(
    "interview_slide_brief",
    {
      title: "Interview slide brief",
      description: "Ask the minimum useful questions before creating a visual slide deck.",
      argsSchema: {
        locale: z.enum(["ja-JP", "en-US"]).default("ja-JP")
      }
    },
    ({ locale }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              locale === "ja-JP"
                ? [
                    "スライド作成前に、以下を1つずつユーザーへ確認してから、図解中心のDeckSpecを作成してください:",
                    "1. この資料で聴衆に理解・判断・行動してほしいことは何ですか？",
                    "2. 主な聴衆は誰で、前提知識はどの程度ですか？",
                    "3. 発表用、配布用、非同期レビュー用、Web公開用のどれに近いですか？",
                    "4. 希望する枚数、時間、章立てはありますか？",
                    "5. 使いたいテンプレート、ブランド色、アイコン、ロゴ、図表、データソースはありますか？",
                    "経営向け・顧客向け・コンサルティング風・社内向けビジネス資料の場合は、回答後に plan_business_deck で章立てとページごとの強弱を設計してください。",
                    "その後、search_templates と search_assets を使い、図・アイコンを含むDeckSpecを作成し、review_business_deck、review_content、lint_deck 後に render_pptx または render_studio を使ってください。"
                  ].join("\n")
                : [
                    "Before creating slides, ask the user these questions one at a time, then create a visual DeckSpec:",
                    "1. What should the audience understand, decide, or do?",
                    "2. Who is the audience and what do they already know?",
                    "3. Is this for live presentation, handout, async review, or public sharing?",
                    "4. What slide count, time limit, or section structure is desired?",
                    "5. Are there templates, brand colors, icons, logos, diagrams, or data sources to reuse?",
                    "For executive, customer-facing, consulting-style, or internal-friendly business decks, call plan_business_deck after the answers to design sections and page-level emphasis.",
                    "Then use search_templates and search_assets, create a DeckSpec with diagrams/icons, run review_business_deck, review_content, and lint_deck, then render_pptx or render_studio."
                  ].join("\n")
          }
        }
      ]
    })
  );

  server.registerPrompt(
    "register_reusable_svg_asset",
    {
      title: "Register reusable SVG asset",
      description: "Guide an agent to turn an SVG into a reusable pptcreater asset.",
      argsSchema: {
        assetName: z.string().min(1),
        purpose: z.string().min(1)
      }
    },
    ({ assetName, purpose }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Register a reusable SVG asset named "${assetName}" for this purpose: ${purpose}. First call search_assets to avoid duplicates. If no suitable asset exists, provide safe SVG markup and call register_svg_asset with a stable id, title, description, tags, license, decorative flag, and altText when the asset conveys meaning.`
          }
        }
      ]
    })
  );

  server.registerPrompt(
    "create_concise_slide_deck",
    {
      title: "Create concise accessible deck",
      description: "Guide an agent to create a concise DeckSpec before rendering.",
      argsSchema: {
        topic: z.string().min(1),
        locale: z.enum(["ja-JP", "en-US"]).default("ja-JP")
      }
    },
    ({ topic, locale }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Create a concise accessible DeckSpec about "${topic}" for locale ${locale}. Use the content-mode-specific rules from review_content (Japanese report/technical: topic title + slide message; English: action title), one message per slide, explicit readingOrder, altText for visuals, and run review_content plus lint_deck before rendering.`
          }
        }
      ]
    })
  );

  return server;
}
