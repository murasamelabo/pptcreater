import type { Stats } from "node:fs";
import { lstat, mkdir, realpath, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BUILTIN_ICON_NAMES, createSimpleIconSvg, getDefaultSvgRegistryPath, listIconSourceCatalogs, registerSvgAsset, resolveIconForKeyword, searchAllSvgAssets, suggestIconForKeyword } from "@pptcreater/assets-svg";
import { DiagramIntentSchema, SCHEMATIC_KIND_CATALOG, SCHEMATIC_MODE_TEMPLATES, SCHEMATIC_STYLE_PRESETS, SchematicKindSchema, SchematicToneSchema, renderDiagramIntent, renderNativePonchiDiagram, renderNativeSchematicDiagram, renderPonchiDiagram, renderSchematicDiagram, schematicPresetForStyleProfile, schematicTemplatesForStyleProfile } from "@pptcreater/diagram";
import {
  applyTemplateContentDesign,
  BUSINESS_STYLE_MODES,
  createDeckFromMessageMap,
  createEditWithCopilotPrompt,
  ContentModeSchema,
  createSampleDeck,
  createSectionDividerSlides,
  createDetailSlide,
  createVisualScaffold,
  classifyFinalizeLintReports,
  DeckMessageMapSchema,
  DeckSpecSchema,
  deleteTemplateManifest,
  ensureSourceReferenceSlide,
  formatSlideCreationRules,
  getBusinessDeckGuidance,
  getContentGuidance,
  getDefaultTemplateRegistryPath,
  getSlideCreationRules,
  listDesignComponents,
  listAllTemplates,
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
  renderDesignComponentDeck,
  reviewBusinessDeck,
  reviewDeck,
  reviewDeckContent,
  reviewMessageMap,
  reviewVisualQuality,
  describeAgentPipeline,
  selectFigure,
  listFigureIntents,
  scaffoldDeckFromTemplate,
  searchTemplateEntries,
  searchTemplates,
  STYLE_PROFILES,
  TemplateManifestSchema,
  type DeckSpec
} from "@pptcreater/core";
import { importNotPersistedWarning, importTemplateFromPptx, renderDeckToPptx } from "@pptcreater/render-pptx";
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
    version: "0.5.43"
  });
  const createPowerPointInputSchema = {
    locale: z.enum(["ja-JP", "en-US"]).default("ja-JP"),
    purpose: z.string().optional(),
    audience: z.string().optional(),
    slideCount: z.number().int().min(1).max(40).optional(),
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
  const sourceInputSchema = z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      url: z.string().url().optional(),
      usage: z.enum(["quote", "recreate", "inspiration"]),
      attribution: z.string().optional(),
      notes: z.string().optional()
    })
  );
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
        slideCount: z.number().int().min(1).max(40).optional(),
        contentMode: z.enum(["presentation", "report", "technical", "handout", "decision"]).optional(),
        styleProfile: z.enum(STYLE_PROFILES).optional()
      }
    },
    async ({ locale, purpose, audience, slideCount, contentMode, styleProfile }) =>
      jsonText(createSampleDeck(locale, { purpose, audience, slideCount, contentMode, styleProfile }))
  );

  server.registerTool(
    "create_deck_from_message_map",
    {
      title: "Create DeckSpec from Message Map",
      description:
        "Create a complete editable DeckSpec directly from a DeckMessageMap / SlideIntent plan. Use this when the deck message is known and the output must materially vary visual archetypes instead of repeating generic cards.",
      inputSchema: {
        title: z.string().min(1),
        messageMap: DeckMessageMapSchema,
        locale: LocaleSchema.default("ja-JP"),
        contentMode: ContentModeSchema.default("report"),
        styleProfile: z.enum(STYLE_PROFILES).optional(),
        template: z.string().optional(),
        author: z.string().optional(),
        sources: sourceInputSchema.optional(),
        includeCover: z.boolean().default(true),
        includeClosing: z.boolean().default(true)
      }
    },
    async ({ title, messageMap, locale, contentMode, styleProfile, template, author, sources, includeCover, includeClosing }) =>
      jsonText(
        createDeckFromMessageMap(messageMap, {
          title,
          locale,
          contentMode,
          styleProfile,
          template,
          author,
          sources,
          includeCover,
          includeClosing
        })
      )
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
    "get_slide_creation_rules",
    {
      title: "Get first-pass slide creation rules",
      description:
        "Return the upfront rules an agent should follow before writing DeckSpec, reducing lint/polish/render retry loops. Call this before creating custom PPTX decks.",
      inputSchema: {
        locale: LocaleSchema.default("ja-JP"),
        contentMode: ContentModeSchema.default("presentation")
      }
    },
    async ({ locale, contentMode }) => jsonText(getSlideCreationRules(locale, contentMode))
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
    "review_message_map",
    {
      title: "Review DeckSpec message map",
      description:
        "Review the deck's Message Map / SlideIntent plan before rendering. Use this to ensure every content slide has one clear message, evidence, visualType, and emphasis; if it fails, clarify the brief before authoring more slides.",
      inputSchema: {
        deck: DeckSpecSchema
      }
    },
    async ({ deck }) => jsonText(reviewMessageMap(parseDeckSpec(deck)))
  );

  server.registerTool(
    "review_visual_quality",
    {
      title: "Review visual quality",
      description:
        "Review a DeckSpec for visual-quality issues that make slides look AI-generated: truncated text, inconsistent role typography, repeated colored accent-bar card grids, repeated layout runs, and non-orthogonal matrix axes. Run after polish/finalize before accepting the deck.",
      inputSchema: {
        deck: DeckSpecSchema
      }
    },
    async ({ deck }) => jsonText(reviewVisualQuality(parseDeckSpec(deck)))
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
    "review_deck",
    {
      title: "Aggregated multi-agent review gate",
      description:
        "Run the Director's aggregated quality gate: lint + content + business reviews in one pass, with every finding classified (blocking / polish-fixable / advisory), scored (accessibility/content/structure/overall), and routed to the owning agent role (designer/copywriter/story-architect/content-strategist). Use this as the Reviewer step and the loop's stop condition: when ok=true, finalize_deck then render_pptx; otherwise dispatch each blocking issue to its owner role and re-run.",
      inputSchema: {
        deck: DeckSpecSchema,
        locale: LocaleSchema.optional(),
        contentMode: ContentModeSchema.optional(),
        styleMode: z.enum(BUSINESS_STYLE_MODES).optional(),
        includeBusinessReview: z.boolean().default(true)
      }
    },
    async ({ deck, locale, contentMode, styleMode, includeBusinessReview }) => {
      const parsedDeck = parseDeckSpec(deck);
      return jsonText(
        reviewDeck(parsedDeck, {
          locale: locale ?? parsedDeck.locale,
          contentMode: contentMode ?? parsedDeck.metadata.contentMode ?? "presentation",
          styleMode,
          includeBusinessReview
        })
      );
    }
  );

  server.registerTool(
    "list_agent_roles",
    {
      title: "List slide-authoring agent roles",
      description:
        "Return the six-role slide-authoring pipeline (director, story-architect, content-strategist, designer, copywriter, reviewer) with each role's responsibility, the hand-off contract it consumes/produces, and the pptcreater tools it should use. Use this to orchestrate a multi-agent workflow where the Director owns the shared DeckSpec and review_deck is the stop condition.",
      inputSchema: {}
    },
    async () => jsonText({ pipeline: describeAgentPipeline() })
  );

  server.registerTool(
    "recommend_figure",
    {
      title: "Recommend a figure for a slide",
      description:
        "Content Strategist → Designer bridge: given a slide's one-sentence message (and/or an explicit figure kind), recommend whether to use a curated editable design-pack component (render_design_component) or a generated schematic (generate_schematic), the concrete kind, the expected item-count range, a rationale, and alternatives. Pass `list: true` to enumerate every supported figure intent.",
      inputSchema: {
        message: z.string().optional(),
        figureKind: z.string().optional(),
        hint: z.string().optional(),
        itemCount: z.number().int().min(0).optional(),
        locale: LocaleSchema.optional(),
        list: z.boolean().default(false)
      }
    },
    async ({ message, figureKind, hint, itemCount, locale, list }) => {
      if (list) {
        return jsonText({ intents: listFigureIntents() });
      }
      return jsonText(selectFigure({ message, figureKind, hint, itemCount, locale }));
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
    "finalize_deck",
    {
      title: "Finalize DeckSpec (polish + lint + render in one pass)",
      description:
        "One-shot finishing tool: polish layout, lint, and (when outputPath is given) render a DeckSpec in a single call. Returns the polished deck plus lint classified into blockingErrors (must fix by hand), polishFixable (already resolved by polish: line breaks, overflow, small text, reading order), and warnings. Prefer this over calling polish_deck_layout + lint_deck + render_pptx separately, and only manually edit copy for blockingErrors.",
      inputSchema: {
        deck: DeckSpecSchema,
        outputPath: z.string().optional(),
        overwrite: z.boolean().default(false),
        force: z.boolean().default(false),
        locale: LocaleSchema.optional()
      }
    },
    async ({ deck, outputPath, overwrite, force, locale }) => {
      const base = ensureSourceReferenceSlide(parseDeckSpec(deck));
      const polished = normalizeDeckLayout(base);
      const outputLocale = locale ?? polished.locale;
      // Classify the authored (pre-polish) deck so polishFixable lists what polish auto-resolves.
      const report = localizeLintReport(lintDeckSpec(base), outputLocale);
      const polishedReport = localizeLintReport(lintDeckSpec(polished), outputLocale);
      const { blockingErrors, polishFixable, warnings } = classifyFinalizeLintReports(report, polishedReport);

      let render: Awaited<ReturnType<typeof renderDeckToPptx>> | undefined;
      const blocked = blockingErrors.length > 0 && !force;
      if (outputPath && !blocked) {
        await assertSafeLocalImagePaths(polished);
        const resolvedOutputPath = await prepareMcpOutputPath(outputPath, overwrite);
        if (extname(resolvedOutputPath).toLowerCase() !== ".pptx") {
          throw new Error("finalize_deck outputPath must end with .pptx.");
        }
        render = await renderDeckToPptx(polished, resolvedOutputPath, { allowLintErrors: true, polishLayout: true });
      }

      return jsonText({
        ok: blockingErrors.length === 0,
        rendered: Boolean(render),
        deck: polished,
        blockingErrors,
        polishFixable,
        warnings,
        render,
        nextStep:
          blockingErrors.length === 0
            ? render
              ? "Done. Deck rendered; polishFixable issues were auto-resolved."
              : "No blocking issues. Call again with outputPath to render the .pptx."
            : "Fix the blockingErrors (genuine layout/accessibility problems), then call finalize_deck again. Do not hand-edit polishFixable items."
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
      description: "List built-in and registered template manifests. Use list_templates when you need source/deletable status.",
      inputSchema: {
        query: z.string().default("")
      }
    },
    async ({ query }) => {
      return jsonText(await searchTemplates(query));
    }
  );

  server.registerTool(
    "list_templates",
    {
      title: "List templates with delete status",
      description:
        "List preset and registered templates with source/deletable status. Preset templates are built in and locked; registered custom/imported templates can be deleted with delete_template.",
      inputSchema: {
        query: z.string().default(""),
        registeredOnly: z.boolean().default(false),
        includeBuiltins: z.boolean().optional()
      }
    },
    async ({ query, registeredOnly, includeBuiltins }) =>
      jsonText(await searchTemplateEntries(query, { registeredOnly, includeBuiltins }))
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
    "delete_template",
    {
      title: "Delete registered template",
      description:
        "Delete a registered custom/imported template from the user template registry. Built-in preset templates are locked and cannot be deleted.",
      inputSchema: {
        templateId: z.string().min(1)
      }
    },
    async ({ templateId }) => jsonText(await deleteTemplateManifest(templateId))
  );

  server.registerTool(
    "import_template",
    {
      title: "Import template from .pptx",
      description:
        "Extract colors, fonts, slide size, header/footer, and title/closing scaffolding from an existing PowerPoint (.pptx/.potx) file into a reusable template manifest, AND embed the source slide master/layouts/theme so the real template — not just its colors — is applied at render. Set register=true to save it to the registry; this is required for the template to actually be used: render only embeds the master when the deck's `template` field references a REGISTERED template that carries the embedded package. If you skip register (or the deck references an unregistered id), the deck just mimics the look and render returns a `template.package-not-embedded` warning.",
      inputSchema: {
        pptxPath: z.string().min(1).describe("Absolute or relative path to the source .pptx file"),
        id: z.string().optional(),
        name: z.string().optional(),
        locale: LocaleSchema.optional(),
        register: z.boolean().default(false),
        overwrite: z.boolean().default(false)
      }
    },
    async ({ pptxPath, id, name, locale, register, overwrite }) => {
      const result = await importTemplateFromPptx(pptxPath, { id, name, locale, register, overwrite });
      const warning = importNotPersistedWarning({
        templateId: result.template.id,
        registryPath: result.registryPath
      });
      return jsonText(warning ? { ...result, warning } : result);
    }
  );

  server.registerTool(
    "scaffold_from_template",
    {
      title: "Scaffold deck from template",
      description:
        "Create a starter DeckSpec whose title and closing slides reproduce the imported template's OWN cover (its captured background, logos, and title/subtitle placement) and whose `template` field references the registered template so render embeds the real slide master/layouts. ALWAYS start a template-faithful deck from here and add content slides on top — do NOT generate a custom hero/cover over a referenced template, because that hides the template's cover and triggers a `template.cover-overdrawn` warning. Pair with import_template (register=true) to reuse a provided .pptx/.potx design.",
      inputSchema: {
        templateId: z.string().min(1),
        title: z.string().optional(),
        subtitle: z.string().optional(),
        locale: LocaleSchema.optional()
      }
    },
    async ({ templateId, title, subtitle, locale }) => {
      const templates = await listAllTemplates();
      const template = templates.find((item) => item.id === templateId);
      if (!template) {
        throw new Error(`Template "${templateId}" was not found. Use search_templates to list available ids.`);
      }
      return jsonText(scaffoldDeckFromTemplate(template, { title, subtitle, locale }));
    }
  );

  server.registerTool(
    "apply_template_design",
    {
      title: "Apply template design to an existing deck",
      description:
        "Re-skin an existing DeckSpec so its middle content slides adopt a built-in or imported template's identity. By default (retheme=true) it adopts the template's colors + fonts, remaps the deck's old baked palette colors to the template's, repairs any text that drops below the contrast threshold, and injects the template's content-slide background/branding. Use this after scaffold_from_template + authoring content slides so the whole deck — not just the title/closing — matches the template. Note: this re-skins MIDDLE content slides only; it does NOT rebuild the cover, so if the title/closing were authored as a custom hero they will still overdraw the template cover — build those from scaffold_from_template instead. Keep the deck's `template` field set to the registered template id so render embeds the real master. Returns the updated deck plus appliedSlideCount and rethemed.",
      inputSchema: {
        deck: DeckSpecSchema,
        templateId: z.string().min(1),
        retheme: z.boolean().default(true)
      }
    },
    async ({ deck, templateId, retheme }) => {
      const templates = await listAllTemplates();
      const template = templates.find((item) => item.id === templateId);
      if (!template) {
        throw new Error(`Template "${templateId}" was not found. Use search_templates to list available ids.`);
      }
      const result = applyTemplateContentDesign(parseDeckSpec(deck), template, { retheme });
      return jsonText({
        deck: result.deck,
        appliedSlideCount: result.appliedSlideCount,
        rethemed: result.rethemed,
        nextStep:
          "Call finalize_deck (polish + lint + render) on the returned deck to produce the .pptx."
      });
    }
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
    "list_icon_sources",
    {
      title: "List icon source catalogs",
      description: "List official/public icon catalogs and license guidance notes before registering exact vendor SVGs.",
      inputSchema: {}
    },
    async () => jsonText(listIconSourceCatalogs())
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
    "suggest_icon",
    {
      title: "Suggest a builtin icon for a keyword",
      description:
        "Map a free-text concept/keyword (Japanese or English, e.g. a card heading or aspect label such as 'security', 'コスト削減', 'ライフサイクル') to the best-matching builtin icon name so cards, lists, and visual scaffolds can carry a meaningful icon instead of a bare monogram. Returns { keyword, icon, matched, svg } where `icon` is the builtin name (or null when nothing matches) and `svg` is the recolored inline SVG when matched. generate_visual_scaffold already auto-applies this mapping when no explicit icon is passed; use this tool to pick icons for your own card/grid compositions.",
      inputSchema: {
        keyword: z.string().min(1),
        color: z.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/).default("#1d4ed8")
      }
    },
    async ({ keyword, color }) => {
      const icon = suggestIconForKeyword(keyword);
      const asset = icon ? resolveIconForKeyword(keyword, color) : null;
      return jsonText({ keyword, icon, matched: Boolean(icon), svg: asset?.svg ?? null });
    }
  );

  server.registerTool(
    "generate_diagram",
    {
      title: "Generate ponchi-e diagram",
      description:
        "Render an architecture/flow ponchi-e as one fixed accessible SVG with visible labels. Prefer generate_intent_diagram when the intended conceptual composition/granularity is known, and generate_native_diagram for most architecture, flow, security, and ponchi-e slides because it returns editable PowerPoint shape/text elements. Use this SVG tool only when a single fixed illustration is required. Omit node x/y to get automatic layered layout: just give nodes (id, label, kind) and arrows (from, to); set diagram.direction 'LR' or 'TB' and optional node.layer/lane hints. Never embed shape-only SVG diagrams: every meaningful node/lane/decision/flow needs readable SVG <text> labels or callouts; altText/summary/longDescription alone is not visible to slide viewers.",
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
        "Generate an architecture/flow/security ponchi-e as native DeckSpec shape/text elements, not an image or SVG. Use this first for diagrams like Private Marketplace, enterprise control planes, decision flows, and security architectures. It preserves aspect ratio inside the requested slide frame, spaces nodes automatically when x/y are omitted, routes connector line segments border-to-border, keeps labels as editable PowerPoint text, and returns warnings when a dense diagram should be split. All nodes share ONE accent (node kind does NOT change the hue — following the one-accent / no-category-coloring principle); set node.emphasis on the single most important node to make it stand out, pass `accent` to theme the whole diagram to your deck, or node.accent to override one node. Insert the returned elements directly into a slide.elements array; do not wrap them in image/svg/diagram.",
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
        accent: z
          .string()
          .regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/)
          .optional(),
        readingOrderStart: z.number().int().min(0).default(100)
      }
    },
    async ({ diagram, frame, idPrefix, accent, readingOrderStart }) => jsonText(renderNativePonchiDiagram(diagram, { frame, idPrefix, accent, readingOrderStart }))
  );

  server.registerTool(
    "generate_intent_diagram",
    {
      title: "Generate editable diagram from explicit visual intent",
      description:
        "Generate native editable DeckSpec shape/text elements from a Diagram Intent contract. Use this before freeform native diagrams when the user cares about exact conceptual granularity or a specific ponchi-e layout. Supported intent kinds: `access-plane-map` for Enterprise Access Model / control-plane diagrams, `closed-privileged-path` for zero-trust privileged access path comparisons, `lifecycle` for a 3-6 stage cyclic process with a continuous-improvement loop, `maturity-ladder` for a 3-5 level ascending maturity model, `before-after` for current-vs-target comparison panels, and `relationship-map` for a hub-and-spoke governance/stakeholder relationship diagram. The input captures required panels, labels, denied paths, approved steps, stages/levels/nodes, and design message so the LLM does not drift to a different level of detail.",
      inputSchema: {
        intent: DiagramIntentSchema,
        frame: z
          .object({
            x: z.number().min(0).default(0.45),
            y: z.number().min(0).default(0.5),
            w: z.number().positive().default(12.45),
            h: z.number().positive().default(6.55)
          })
          .optional(),
        idPrefix: z
          .string()
          .min(1)
          .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,59}$/)
          .default("diagram-intent"),
        readingOrderStart: z.number().int().min(0).default(100)
      }
    },
    async ({ intent, frame, idPrefix, readingOrderStart }) => jsonText(renderDiagramIntent(intent, { frame, idPrefix, readingOrderStart }))
  );

  server.registerTool(
    "generate_section_divider",
    {
      title: "Generate section divider slides",
      description:
        "Generate accessible, overflow-safe section divider (chapter) slides as full DeckSpec slides with layout 'section'. Use this to insert chapter breaks between major sections of longer decks (e.g., 概要 / 機能詳細 / メリット / まとめ), matching the section-title-slide pattern that strong reference decks use. Each divider has a saturated full-bleed background, a numbered eyebrow (SECTION 01 / 05), a large assertion title, and an optional one-line summary, with AA contrast guaranteed. Insert the returned slides directly into deck.slides at the start of each section; they are exempt from the visual-richness gate because they are navigation slides, not content slides.",
      inputSchema: {
        sections: z
          .array(
            z.object({
              title: z.string().min(1),
              subtitle: z.string().optional(),
              eyebrow: z.string().optional()
            })
          )
          .min(1),
        locale: LocaleSchema.default("ja-JP"),
        numbered: z.boolean().default(true),
        accent: z
          .string()
          .regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/)
          .optional(),
        idPrefix: z
          .string()
          .min(1)
          .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,59}$/)
          .default("section")
      }
    },
    async ({ sections, locale, numbered, accent, idPrefix }) =>
      jsonText({ slides: createSectionDividerSlides(sections, { locale, numbered, accent, idPrefix }) })
  );

  server.registerTool(
    "generate_detail_slide",
    {
      title: "Generate a text-rich detail / Q&A / benefits slide",
      description:
        "Generate a single accessible, overflow-safe TEXT-RICH slide for content that genuinely needs fuller prose — a detailed explanation, a Q&A / FAQ, or a 得られること / benefits list with descriptions — mirroring strong reference decks (e.g. Slideland's 得られること and Q&A page types). Most slides should still be visual, but use this for the few slides where deliberate explanation is the point: the returned slide uses a layout marker ('detail' or 'qa') that is EXEMPT from the visual-richness gate and excluded from the deck's visual-ratio denominator, while AA contrast, minimum font sizes, reading order, overflow fitting, and concise-title rules all still apply. Keep the `title` and any `heading`/`label`/`question` concise; put the longer explanation in `body`/`answer`/`description`. Variants: 'explanation' (concise heading + lead + prose blocks), 'qa' (Q/A pairs), 'benefits' (numbered label + description). Insert the returned `slide` into deck.slides; up to 6 items/blocks per slide (extras are dropped with a warning — split across slides).",
      inputSchema: {
        variant: z.enum(["explanation", "qa", "benefits"]).default("explanation"),
        title: z.string().min(1),
        lead: z.string().optional(),
        blocks: z
          .array(z.object({ heading: z.string().optional(), body: z.string().min(1) }))
          .optional(),
        items: z
          .array(
            z.union([
              z.object({ question: z.string().min(1), answer: z.string().min(1) }),
              z.object({ label: z.string().min(1), description: z.string().min(1) })
            ])
          )
          .optional(),
        locale: LocaleSchema.default("ja-JP"),
        accent: z
          .string()
          .regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/)
          .optional(),
        idPrefix: z
          .string()
          .min(1)
          .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,59}$/)
          .default("detail")
      }
    },
    async ({ variant, title, lead, blocks, items, locale, accent, idPrefix }) =>
      jsonText(
        createDetailSlide(
          { variant, title, lead, blocks, items: items as never },
          { locale, accent, idPrefix }
        )
      )
  );

  server.registerTool(
    "generate_visual_scaffold",
    {
      title: "Generate per-slide concept visual scaffold",
      description:
        "Generate a tasteful, EDITABLE right-rail concept visual (rounded panel + icon/monogram emblem + bold concept label + optional caption + up to 4 short aspect chips) to attach to a content slide. Use this so every content slide carries lightweight visual structure (like strong reference decks that put a concept image/icon on each slide) WITHOUT flattened/crushed raster images — the scaffold is composed of native DeckSpec shape/text elements plus an optional inline SVG icon, so it stays accessible, overflow-safe, and passes the visual-richness gate (it adds shapes + an SVG/monogram). Pass an optional builtin `icon` name (resolved to an inline SVG) for the emblem; when omitted, an icon is auto-mapped from the `concept` keyword (Japanese or English) and only falls back to the first grapheme of `concept` as a monogram when no icon matches. Push the returned `elements` into the target slide's elements array. Keep aspect `points` to short phrases (<= ~24 chars); extra points beyond what fits the frame are dropped with a warning. Returns { elements, summary, longDescription, warnings } — use summary/longDescription for alt text / speaker notes.",
      inputSchema: {
        concept: z.string().min(1),
        caption: z.string().optional(),
        points: z.array(z.string().min(1)).max(8).optional(),
        icon: z.enum([...BUILTIN_ICON_NAMES] as [string, ...string[]]).optional(),
        locale: LocaleSchema.default("ja-JP"),
        accent: z
          .string()
          .regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/)
          .optional(),
        frame: z
          .object({
            x: z.number().min(0),
            y: z.number().min(0),
            w: z.number().positive(),
            h: z.number().positive()
          })
          .partial()
          .optional(),
        idPrefix: z
          .string()
          .min(1)
          .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,59}$/)
          .default("scaffold"),
        readingOrderStart: z.number().int().min(0).default(200)
      }
    },
    async ({ concept, caption, points, icon, locale, accent, frame, idPrefix, readingOrderStart }) => {
      const resolvedIcon = icon ?? suggestIconForKeyword(concept) ?? undefined;
      const iconSvg = resolvedIcon ? createSimpleIconSvg(resolvedIcon, "#ffffff").svg : undefined;
      return jsonText(
        createVisualScaffold(
          { concept, caption, points, iconSvg },
          { locale, accent, frame, idPrefix, readingOrderStart }
        )
      );
    }
  );

  server.registerTool(
    "list_design_components",
    {
      title: "List design asset components",
      description: "List curated design components from local design-packs, such as approved tree diagram slide templates.",
      inputSchema: {
        kind: z.string().optional()
      }
    },
    async ({ kind }) => jsonText({ components: await listDesignComponents({ kind }) })
  );

  server.registerTool(
    "render_design_component",
    {
      title: "Render design component DeckSpec",
      description: "Create a DeckSpec that uses a curated design component from a design-pack (e.g. the zukai 14-figure pack). Render it with render_pptx/finalize_deck to transplant the source PowerPoint slide component. Use textReplacements to substitute the curated placeholder data (replace every catalog placeholder), and nodeOperations to add/remove nodes in the component's editableGroups (the layout re-fits within the original footprint). Use tone ('light' default, or 'dark') so a curated light-background figure carries its own backdrop and reads correctly when dropped into a dark deck; pass background to force a specific full-bleed backdrop color (or 'none' to inherit the deck/template), and recolor for extra color remaps. NOTE: ○/△/✕ comparison marks are colored icon shapes — do not change them via textReplacements; keep the source mark pattern and map your columns onto it.",
      inputSchema: {
        componentId: z.string().min(1),
        title: z.string().optional(),
        tone: z.enum(["light", "dark"]).optional(),
        background: z.string().optional(),
        recolor: z
          .array(
            z.object({
              from: z.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/),
              to: z.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/),
              scope: z.enum(["all", "text", "fill"]).optional()
            })
          )
          .optional(),
        textReplacements: z
          .array(
            z.union([
              z.object({ match: z.string().min(1), to: z.string() }),
              z.object({ at: z.number().int().min(0), to: z.string() })
            ])
          )
          .optional(),
        nodeOperations: z
          .array(
            z.union([
              z.object({ op: z.literal("remove"), target: z.string().min(1) }),
              z.object({
                op: z.literal("add"),
                group: z.string().min(1),
                label: z.string().min(1),
                cloneFrom: z.string().min(1).optional(),
                at: z.number().int().min(0).optional()
              })
            ])
          )
          .optional()
      }
    },
    async ({ componentId, title, tone, background, recolor, textReplacements, nodeOperations }) =>
      jsonText(await renderDesignComponentDeck(componentId, { title, tone, background, recolor, textReplacements, nodeOperations }))
  );

  server.registerTool(
    "generate_schematic",
    {
      title: "Generate Slideland-style schematic",
      description:
        "Generate a safe, presentation-ready schematic from a preset kind. Returns editable native PowerPoint shape/text elements first, plus an SVG fallback for backward compatibility. Prefer inserting `elements` directly into slides so `table`, `tree`, `flow`, `vertical-flow`, `cycle`, `before-after`, `map`, `puzzle`, `correlation`, `matrix`, `venn`, `cross`, `set`, `contrast`, `scale-contrast`, `grow`, `layer`, `triangle`, `step`, `gantt`, `ranking`, `list`, `list-horizontal`, `list-enumeration`, or `mockup` visuals remain editable.",
      inputSchema: {
        schematic: z.object({
          kind: SchematicKindSchema,
          title: z.string().min(1),
          summary: z.string().min(1),
          longDescription: z.string().min(20),
          items: z.array(z.string().min(1)).min(1).max(8),
          secondaryItems: z.array(z.string().min(1)).max(8).default([]),
          tone: SchematicToneSchema,
          axisX: z.string().min(1).optional(),
          axisY: z.string().min(1).optional(),
          width: z.number().min(960).default(960),
          height: z.number().min(540).default(540)
        })
      }
    },
    async ({ schematic }) => {
      const native = renderNativeSchematicDiagram(schematic, { frame: { x: 0.45, y: 1.5, w: 12.45, h: 5.75 }, idPrefix: `schematic-${schematic.kind}` });
      const svg = renderSchematicDiagram(schematic);
      return jsonText({ ...native, svg: svg.svg, svgSummary: svg.summary, svgLongDescription: svg.longDescription });
    }
  );

  server.registerTool(
    "list_schematic_presets",
    {
      title: "List schematic presets",
      description: "List Slideland-style schematic kinds and mode-aware presets. Use this before selecting a schematic kind for a slide.",
      inputSchema: {
        styleProfile: z.enum(["minimal", "stylish", "report", "presentation", "technical"]).optional(),
        includeAll: z.boolean().default(false)
      }
    },
    async ({ styleProfile, includeAll }) =>
      jsonText({
        selected: schematicPresetForStyleProfile(styleProfile),
        selectedTemplates: schematicTemplatesForStyleProfile(styleProfile),
        presets: SCHEMATIC_STYLE_PRESETS,
        ...(includeAll ? { templates: SCHEMATIC_MODE_TEMPLATES } : {}),
        kinds: SCHEMATIC_KIND_CATALOG
      })
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
            "Use `search_assets` before creating a duplicate asset. Built-in generated presets include generic Microsoft/Azure/Entra/Microsoft 365/Power Platform/Dynamics 365, AWS, and Google Cloud/Workspace pictograms such as `preset-azure-architecture`, `preset-entra-privileged-access`, `preset-aws-ai-ml`, and `preset-google-kubernetes`.",
            "Use these generated presets for conceptual cloud diagrams when official logo fidelity is not required. They are not official vendor icons.",
            "Use `list_icon_sources` or `asset://icon-sources` to discover upstream icon catalogs and their license/brand guidance notes before registering exact official SVGs.",
            "",
            "Use `register_template` for reusable slide template manifests. A template manifest must include design tokens, layouts, locale, tags, and accessibility constraints.",
            `Default template registry: ${getDefaultTemplateRegistryPath()}`,
            "",
            "After registration, use `search_assets`, `search_templates`, or `list_templates` to discover the new reusable item.",
            "`list_templates` includes source/deletable status; preset templates are locked, while registered custom/imported templates can be removed with `delete_template`."
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
            "- Diagrams must be visually self-explanatory and editable where possible: use generate_intent_diagram when the intended composition/granularity is known, use generate_native_diagram for general architecture/flow/security ponchi-e diagrams, and do not flatten boxes/connectors/labels into image.path SVG unless exact fidelity is required.",
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
    "slide-creation-rules",
    "design://slide-creation-rules",
    {
      title: "First-pass slide creation rules",
      description: "Upfront rules for generating PPTX DeckSpec inside constraints before lint/render, reducing repeated fix loops.",
      mimeType: "text/markdown"
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: formatSlideCreationRules(getSlideCreationRules("ja-JP", "technical"))
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
              description: "Use get_slide_creation_rules before manually writing DeckSpec so the first draft stays inside layout/content/visual constraints. Use create_pptx/create_powerpoint for direct PPTX requests. Use create_deck for examples and lint_deck before render_pptx/render_powerpoint when manually editing a DeckSpec. If MCP render tools are not visible, use CLI `pptcreater render <deck.json> --output <deck.pptx> --polish`; never use PowerPoint COM for normal output.",
              orchestration: "For multi-slide, important, executive, or customer-facing decks, delegate to the deck-building custom agents in .github/agents (install them with install-copilot/install-claude-code): start with the Deck Director, which plans the deck and sequences the Story Architect, Content Strategist, Designer, Copywriter, and Reviewer. If the host cannot spawn sub-agents, the Director returns a plan to execute step by step — do not skip it and free-hand the deck. Use list_agent_roles for each role's contract.",
              noSelfAuthoredScripts: "Do NOT build or render decks by writing your own script (JS/TS/Python) that imports @pptcreater/core or any pptcreater package and calls render/generation functions directly, and do NOT use PowerPoint COM or ad-hoc PPTX assembly. Always go through these MCP tools or the pptcreater CLI. A hand-written generator script bypasses the figure tools (recommend_figure/render_design_component/generate_native_diagram/generate_schematic) and the review_deck gate, and is the main cause of clipped node text, dangling connectors, and unused curated zukai figures.",
              reviewGate: "review_deck is the REQUIRED quality gate before declaring a deck done — a generic code review is not a substitute. It aggregates lint + content + business reviews, classifies findings (blocking/polish-fixable/advisory), scores the deck, and routes each blocking issue to its owner role. Fix every blocking finding and re-run until ok is true, then finalize_deck/render_pptx.",
              templateField: "DeckSpec.template must be the id of a template returned by search_templates. Register reusable custom templates with register_template.",
              templateFlow: "To actually USE a provided PowerPoint template (.pptx/.potx), not just imitate it: (1) import_template with register=true so its slide master/layouts/theme are embedded and saved to the registry; (2) START the deck with scaffold_from_template so the cover/closing reuse the template's OWN cover and the deck's `template` field references the registered id; (3) add content slides, then optionally apply_template_design to re-skin middle slides. Do NOT draw a custom hero/cover over a referenced template, and do NOT put a full-bleed generated background on content slides — both hide the template design. Drawing cards/diagrams on the template's content layout IS the intended way to fill it. render_pptx/finalize_deck return warnings when this goes wrong: `template.package-not-embedded` means the real master was NOT embedded (the id is unregistered or lacks the package — re-run import_template register=true and reference that id); `template.cover-overdrawn` means a generated hero/backdrop is hiding the template cover (rebuild that slide via scaffold_from_template); `template.content-overdrawn` means a content slide's full-bleed background is hiding the template's content layout (remove the full-bleed background or re-skin with apply_template_design).",
              assetFlow: "Use search_assets to find registered SVG assets. Use generate_intent_diagram when the user gives an intended conceptual diagram or exact ponchi-e granularity to preserve, generate_native_diagram for general architecture/network/sequence/security ponchi-e diagrams that should remain editable in PowerPoint, generate_schematic for structured Slideland-style visuals (table/tree/flow/vertical-flow/cycle/before-after/map/puzzle/correlation/matrix/venn/cross/set/contrast/scale-contrast/grow/layer/triangle/step/gantt/ranking/list/list-horizontal/list-enumeration/mockup), generate_diagram only when a single fixed SVG illustration is required, and register_svg_asset for reusable SVGs. If research produces local SVG/PNG/JPEG/GIF/WebP files, keep them inside the workspace, reference them with DeckSpec image.path only for logos/photos/source quotes/exact-fidelity figures, and still call render_pptx/render_powerpoint or CLI `pptcreater render`; do not switch to PowerPoint COM or ad-hoc PPTX generation.",
              shapeFlow: "Use native shape/text elements for editable cards, dividers, badges, accent bars, and generator-created ponchi-e diagrams. Do NOT hand-place line/rightArrow shapes for connected architecture/flow diagrams: use generate_native_diagram so spacing, border-to-border connector routing, labels, and reading order are generated consistently.",
              diagramFlow: "When a diagram has an intended composition, first encode it as a Diagram Intent and call generate_intent_diagram. This is stricter than generate_native_diagram: it preserves conceptual granularity for patterns such as access-plane-map and closed-privileged-path. For general ponchi-e graphs, generate_native_diagram returns DeckSpec shape/text elements, not SVG/image. Insert its elements directly into slide.elements to keep nodes, labels, group lanes, and connectors editable in PowerPoint. Omit node x/y to get automatic layered layout — supply only nodes (id, label, kind) and arrows (from, to), set direction 'LR'/'TB', and optionally node.layer/lane to steer placement. Use arrow.style 'orthogonal', arrow.bidirectional, arrow.label, node.sublabel, and node.emphasis for hierarchy. Coloring follows the one-accent principle: every node shares a single accent (node.kind selects the icon/role, NOT a different fill hue, so mixed kinds never become a rainbow); use node.emphasis for the one focal node, the `accent` option to theme the diagram to your deck, or node.accent to override a single node. Use generate_diagram SVG only when you intentionally need a fixed single illustration.",
              figureAdoption: "ADOPT a prepared figure instead of hand-building diagrams. Before placing your own node boxes + connector lines, timeline rails, comparison columns, or step rows, call recommend_figure with the slide message (and/or list_schematic_presets) and follow its `renderer`: (1) When renderer is \"design-pack\" (a curated component exists), PREFER render_design_component with a component of the recommended `kind` from the zukai pack — the 14 curated figure kinds flow-horizontal, flow-vertical, cycle, before-after, matrix, venn, formula, comparison, scale, step, gantt, list-vertical, list-horizontal, list-enumeration (plus tree). These are real, professionally designed PowerPoint figure slides: call list_design_components to pick a P1-P6 variant, use textReplacements to fill in the eyebrow/title/labels/sub-labels/caption (replace EVERY catalog placeholder, not just the main labels), and nodeOperations to add/remove nodes so the count matches (the layout re-fits and renumbers within the original footprint). Do NOT change ○/△/✕ mark glyphs via text — they are colored icon shapes; instead keep the source mark pattern and map your columns/criteria onto it. (2) Only when renderer is \"schematic\" (no curated component for that kind) generate a native figure: generate_schematic auto-fits each label so card text never clips; generate_native_diagram routes connectors border-to-border so arrows never dangle; generate_intent_diagram preserves a known composition. Hand-placing shapes for these is the main source of clipped node text and arrows that don't reach their boxes. Reserve hand-built shape compositions for simple, short-label layouts (a few cards, a badge, an accent rule). lint emits diagram.native-connectors when a connected diagram is hand-built (an error once it is complex); fix it by rebuilding with a design-pack component or generator, not by nudging coordinates.",
              businessFlow: "For consulting-style, executive, customer-facing, important meeting, or internal-friendly business decks, call plan_business_deck before writing DeckSpec. It creates purpose/audience/reader-action framing, 3-5 section architecture, slide-level message/evidence/reading-path plans, and human-review flags. After DeckSpec generation, call review_business_deck alongside review_content and lint_deck.",
              contentFlow: "Before rendering, call review_content with the deck locale and contentMode. It applies different writing rules for presentation, report, technical, handout, and decision decks. For Japanese report/technical/handout decks, prefer a short topic-label title plus a separate 50-character slide message. For Japanese presentation/decision decks, concise assertion titles are allowed. For English decks, prefer action titles: short complete-sentence takeaways supported by 3-5 proof points.",
              layoutGuardrails: "render_pptx and finalize_deck always apply layout polish (token-aware Japanese/Latin wrapping, font auto-fit, manual-break reflow) and reading-order normalization before drawing, so most overflow, mid-word/kanji splits, orphaned punctuation, and decorative-over-text overlaps are fixed automatically. Lint reports these polish-fixable codes (layout.text-overflow-risk, layout.bad-line-break, layout.text-too-small-to-read, layout.card-accent-bar-unshaped, element.reading-order-duplicate) as errors with polishFixable:true — do NOT hand-edit copy for them; one polish/finalize pass resolves them. Rendering still blocks only when content genuinely cannot fit (a box far too small even at the minimum font), low contrast, missing alt text, duplicate ids, out-of-bounds shapes, or SVG-internal diagram text that would render below 8pt; the error lists each offending code and path. Fix those by shortening copy, enlarging the box/diagram, reducing labels, moving dense content into generate_intent_diagram/generate_native_diagram/generate_schematic, or splitting dense diagrams across slides.",
              finishFlow: "To finish a deck in ONE pass, call finalize_deck (deck + outputPath) instead of separate polish_deck_layout + lint_deck + render_pptx. It polishes, lints, and renders together and returns blockingErrors (the only items you must hand-fix), polishFixable (auto-resolved), and warnings. This avoids the slow edit→lint→polish→render loop. CLI equivalent: pptcreater finalize <deck.json> --output <deck.pptx>.",
              researchPerformance: "Do not run blocking shell web-search commands (PowerShell Invoke-WebRequest/Invoke-RestMethod scraping, curl loops) to gather sources — they can hang for many minutes and dominate runtime. Use the host's documentation/fetch/search tools instead, fetch sources in parallel, and keep research scoped to what the deck needs.",
              cognitiveLoad: "Use one visual grammar per slide. Call list_schematic_presets before choosing a structured diagram kind. Prefer table/contrast for comparisons, tree/layer for hierarchy, flow/vertical-flow/cycle/step for processes, matrix/scale-contrast/grow/ranking for analysis, gantt for schedules, venn/set/puzzle/correlation/map for conceptual grouping, generate_intent_diagram for known concept compositions/granularity, and generate_native_diagram for general architecture/security flows with editable connectors. Avoid many custom text boxes with uneven manual line breaks or body-only enumerations. Let layout polish wrap Japanese text instead of hand-coding line breaks. Content slides must not be text-only: fix visual.richness-missing and visual.richness-deck by adding generate_schematic, generate_intent_diagram, generate_native_diagram, registered icons, images, or card/shape composition so at least 75% of content slides have visual structure. When embedding SVG diagrams, keep internal labels at least 8pt after scaling or recreate/split them.",
              proseDetailSlides: "Text-rich slides ARE allowed for the few slides that genuinely need fuller prose — a detailed explanation, a Q&A / FAQ, or a 得られること/benefits list with descriptions. Use generate_detail_slide (variant explanation/qa/benefits): it returns a slide with a detail/qa layout marker that is exempt from the visual-richness gate and excluded from the 75% denominator, so detailed paragraphs do not need a figure. Keep the title and any heading/label/question concise and put the longer text in body/answer/description; AA contrast, reading order, overflow fitting, and concise-title checks still apply (detail body may be 14-16pt). Keep these the exception — visual.prose-heavy warns when prose/Q&A slides outnumber the visual body slides.",
              sourceReferences: "Whenever a deck uses external websites, record each source in metadata.sources with the actual url. render_pptx, render_studio, and polish_deck_layout automatically append/update the final references slide (参考URL・出典 / References and sources) so the last slide contains all external URLs. Per-slide citations are optional for URL-backed sources when the final references slide is complete.",
              sourceVisuals: "Use metadata.sources plus element.sourceId/citation when quoting, recreating, or using source visuals as inspiration. Prefer editable shape/text objects for recreated visuals. For URL-backed sources, final-slide references can replace per-slide citation text.",
              requiredVisualAccessibility: "Non-decorative SVG, image, and diagram elements require altText. Diagram elements also require summary and longDescription.",
              recommendedWorkflow: ["get_slide_creation_rules before custom DeckSpec authoring", "plan_business_deck for business/executive/customer-facing decks", "create_pptx/create_powerpoint for direct output", "search_templates", "search_assets", "generate_section_divider to insert chapter/section title slides between major sections of longer decks", "generate_detail_slide for the few text-rich slides that need fuller prose (detailed explanation / Q&A / 得られること benefits)", "generate_intent_diagram when the intended ponchi-e composition/granularity is known", "generate_native_diagram for general editable ponchi-e/architecture/security diagrams", "list_schematic_presets then generate_schematic for structured visuals", "create_deck or custom DeckSpec", "review_business_deck for storyline/section/emphasis checks", "review_content", "finalize_deck (deck + outputPath) for a single polish+lint+render pass — fix only its blockingErrors, then call again", "or step-by-step: lint_deck, render_pptx/render_powerpoint or render_studio", "CLI fallback if MCP tools are hidden: pptcreater finalize <deck.json> --output <deck.pptx> (one pass) or pptcreater render <deck.json> --output <deck.pptx> --polish"]
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
                    "回答後、DeckSpecを書く前に get_slide_creation_rules を呼び、そのルール内で構成・文章・図解・配置を決めてください。",
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
                    "After the answers, call get_slide_creation_rules before writing DeckSpec and keep structure, copy, visuals, and placement inside those rules.",
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
            text: `Create a concise accessible DeckSpec about "${topic}" for locale ${locale}. First call get_slide_creation_rules and keep the first draft inside those constraints. Then use the content-mode-specific rules from review_content (Japanese report/technical: topic title + slide message; English: action title), one message per slide, explicit readingOrder, altText for visuals, and run review_content plus lint_deck before rendering.`
          }
        }
      ]
    })
  );

  return server;
}
