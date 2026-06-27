#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { Command, InvalidArgumentError, Option } from "commander";
import { BUILTIN_ICON_NAMES, createSimpleIconSvg, getDefaultSvgRegistryPath, listIconSourceCatalogs, registerSvgAsset, resolveIconForKeyword, searchAllSvgAssets, suggestIconForKeyword, type BuiltinIconName } from "@pptcreater/assets-svg";
import { SCHEMATIC_KIND_CATALOG, SCHEMATIC_MODE_TEMPLATES, SCHEMATIC_STYLE_PRESETS, renderDiagramIntent, renderNativePonchiDiagram, renderPonchiDiagram, renderSchematicDiagram, schematicPresetForStyleProfile, schematicTemplatesForStyleProfile } from "@pptcreater/diagram";
import {
  applyTemplateContentDesign,
  BUSINESS_STYLE_MODES,
  classifyFinalizeLintReports,
  cliMessage,
  createDeckFromMessageMap,
  createEditWithCopilotPrompt,
  createSampleDeck,
  createSectionDividerSlides,
  createVisualScaffold,
  deleteTemplateManifest,
  ensureSourceReferenceSlide,
  listDesignComponents,
  getBusinessDeckGuidance,
  getContentGuidance,
  getDefaultTemplateRegistryPath,
  getSlideCreationRules,
  DeckMessageMapSchema,
  listAllTemplates,
  listSkillPacks,
  lintDeckSpec,
  localizeLintReport,
  normalizeDeckLayout,
  planBusinessDeck,
  parseDeckSpec,
  registerTemplateManifest,
  reviewBusinessDeck,
  reviewDeckContent,
  reviewDeck,
  reviewMessageMap,
  reviewVisualQuality,
  describeAgentPipeline,
  selectFigure,
  listFigureIntents,
  renderDesignComponentDeck,
  scaffoldDeckFromTemplate,
  searchTemplateEntries,
  STYLE_PROFILES,
  formatSlideCreationRules,
  type BusinessStyleMode,
  type ContentMode,
  type DeckSpec,
  type Locale,
  type StyleProfile,
  type TemplateRegistryEntry
} from "@pptcreater/core";
import { importNotPersistedWarning, importPersistenceSuffix, importTemplateFromPptx, renderDeckToPptx } from "@pptcreater/render-pptx";
import { renderStudioHtml } from "@pptcreater/studio";
import { installGuidance } from "./installGuidance.js";

async function readJson(path: string): Promise<unknown> {
  const text = await readFile(path, "utf8");
  return JSON.parse(text.replace(/^\uFEFF/, ""));
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

type DeckSource = DeckSpec["metadata"]["sources"][number];

function isDeckSource(value: unknown): value is DeckSource {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { id?: unknown; title?: unknown; usage?: unknown; url?: unknown };
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    (candidate.url === undefined || typeof candidate.url === "string") &&
    (candidate.usage === "quote" || candidate.usage === "recreate" || candidate.usage === "inspiration")
  );
}

function extractDeckSources(raw: unknown): DeckSpec["metadata"]["sources"] | undefined {
  const container = raw as { sources?: unknown; metadata?: { sources?: unknown } };
  const rawSources = Array.isArray(container.sources) ? container.sources : Array.isArray(container.metadata?.sources) ? container.metadata.sources : undefined;
  if (!rawSources) {
    return undefined;
  }

  return rawSources.filter(isDeckSource);
}

function templateEntryJson(entry: TemplateRegistryEntry): Record<string, unknown> {
  return {
    ...entry.template,
    source: entry.source,
    deletable: entry.deletable,
    ...(entry.deleteReason ? { deleteReason: entry.deleteReason } : {})
  };
}

function templateEntryLine(entry: TemplateRegistryEntry): string {
  const deleteStatus = entry.deletable ? "deletable" : "locked";
  return `${entry.template.id}\t${entry.template.name}\t${entry.source}\t${deleteStatus}`;
}

function asLocale(value: string): Locale {
  if (value === "ja-JP" || value === "en-US") {
    return value;
  }

  throw new Error(cliMessage("en-US", "cli.unsupportedLocale", { locale: value }));
}

function outputLocale(fallback: Locale = "en-US"): Locale {
  const language = program.opts<{ language?: string }>().language;
  return language ? asLocale(language) : fallback;
}

function parseSlideCount(value: string): number {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 40) {
    throw new InvalidArgumentError("Slide count must be an integer from 1 to 40.");
  }

  return count;
}

function parseBusinessSlideCount(value: string): number {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 3 || count > 40) {
    throw new InvalidArgumentError("Business slide count must be an integer from 3 to 40.");
  }

  return count;
}

/**
 * Print render warnings about template usage (`template.package-not-embedded`,
 * `template.cover-overdrawn`) so a user can see that an imported template was not actually embedded
 * or that a generated cover is hiding the template. Other render warnings are already represented by
 * the lint summary, so only template warnings are surfaced here.
 */
function printTemplateWarnings(renderWarnings: string[]): void {
  const templateWarnings = renderWarnings.filter((warning) => warning.includes(":template."));
  if (templateWarnings.length === 0) {
    return;
  }
  console.log(`Template warnings: ${templateWarnings.length}`);
  for (const warning of templateWarnings) {
    const match = /^[^:]+:([^:]+):([^:]*):([\s\S]*)$/.exec(warning);
    if (match) {
      console.log(`TEMPLATE ${match[1]} ${match[2]}: ${match[3].trim()}`);
    } else {
      console.log(`TEMPLATE ${warning}`);
    }
  }
}

function parseContentMode(value: string): ContentMode {
  if (value === "presentation" || value === "report" || value === "technical" || value === "handout" || value === "decision") {
    return value;
  }

  throw new InvalidArgumentError("Content mode must be one of: presentation, report, technical, handout, decision.");
}

function parseBusinessStyleMode(value: string): BusinessStyleMode {
  const normalized = value.trim().toLowerCase();
  if ((BUSINESS_STYLE_MODES as readonly string[]).includes(normalized)) {
    return normalized as BusinessStyleMode;
  }

  throw new InvalidArgumentError(`Business style mode must be one of: ${BUSINESS_STYLE_MODES.join(", ")}.`);
}

function parseStyleProfile(value: string): StyleProfile {
  const normalized = value.trim().toLowerCase();
  if ((STYLE_PROFILES as readonly string[]).includes(normalized)) {
    return normalized as StyleProfile;
  }

  throw new InvalidArgumentError(`Style must be one of: ${STYLE_PROFILES.join(", ")}.`);
}

function parseBuiltinIconName(value: string): BuiltinIconName {
  const normalized = value.trim().toLowerCase();
  if (BUILTIN_ICON_NAMES.includes(normalized as BuiltinIconName)) {
    return normalized as BuiltinIconName;
  }

  throw new InvalidArgumentError(`Icon name must be one of: ${BUILTIN_ICON_NAMES.join(", ")}.`);
}

function formatCliError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function commandAction<T extends unknown[]>(action: (...args: T) => Promise<void> | void): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await action(...args);
    } catch (error) {
      console.error(formatCliError(error));
      process.exitCode = 1;
    }
  };
}

const program = new Command();

const cliPackageVersion = (() => {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

program
  .name("pptcreater")
  .description("Create concise accessible PowerPoint decks from DeckSpec.")
  .version(cliPackageVersion)
  .option("--language <locale>", "CLI output language: ja-JP or en-US");

program
  .command("install-copilot")
  .description("Install .github/pptcreater-skills.md, the deck-building custom agents, and optional GitHub Copilot project instructions.")
  .option("--target <path>", "Project directory to update", ".")
  .option("--skills-file <name>", "Skills Markdown file name under .github", "pptcreater-skills.md")
  .option("--no-instructions", "Only install the .github skills file and skip copilot-instructions.md")
  .option("--no-agents", "Skip installing the .github/agents deck-building custom agents")
  .option("--overwrite", "Overwrite an existing skills file", false)
  .option("--json", "Emit JSON", false)
  .action(commandAction(async (options: { target: string; skillsFile: string; instructions: boolean; agents: boolean; overwrite: boolean; json: boolean }) => {
    const result = await installGuidance("copilot", {
      targetDir: options.target,
      skillsFileName: options.skillsFile,
      installInstructions: options.instructions,
      installAgents: options.agents,
      overwrite: options.overwrite
    });
    console.log(options.json ? JSON.stringify(result, null, 2) : `Installed Copilot guidance: ${result.filesChanged.join(", ") || "already up to date"}`);
  }));

program
  .command("install-claude-code")
  .description("Install .github/pptcreater-skills.md, the deck-building custom agents, and optional Claude Code CLAUDE.md instructions.")
  .option("--target <path>", "Project directory to update", ".")
  .option("--skills-file <name>", "Skills Markdown file name under .github", "pptcreater-skills.md")
  .option("--no-instructions", "Only install the .github skills file and skip CLAUDE.md")
  .option("--no-agents", "Skip installing the .github/agents deck-building custom agents")
  .option("--overwrite", "Overwrite an existing skills file", false)
  .option("--json", "Emit JSON", false)
  .action(commandAction(async (options: { target: string; skillsFile: string; instructions: boolean; agents: boolean; overwrite: boolean; json: boolean }) => {
    const result = await installGuidance("claude-code", {
      targetDir: options.target,
      skillsFileName: options.skillsFile,
      installInstructions: options.instructions,
      installAgents: options.agents,
      overwrite: options.overwrite
    });
    console.log(options.json ? JSON.stringify(result, null, 2) : `Installed Claude Code guidance: ${result.filesChanged.join(", ") || "already up to date"}`);
  }));

program
  .command("new")
  .description("Create a sample DeckSpec.")
  .option("-o, --output <path>", "Output DeckSpec path", "deck.json")
  .option("--locale <locale>", "Deck locale", "ja-JP")
  .option("--purpose <purpose>", "Purpose or desired audience outcome")
  .option("--audience <audience>", "Primary audience")
  .option("--slides <count>", "Target slide count from 1 to 40", parseSlideCount)
  .addOption(new Option("--slide-count <count>", "Alias for --slides (matches the MCP slideCount field)").argParser(parseSlideCount).hideHelp())
  .option("--content-mode <mode>", "presentation, report, technical, handout, or decision", parseContentMode)
  .option("--style <profile>", "Force a style: minimal, stylish, report, presentation, technical", parseStyleProfile)
  .action(commandAction(async (options: { output: string; locale: string; purpose?: string; audience?: string; slides?: number; slideCount?: number; contentMode?: ContentMode; style?: StyleProfile }) => {
    const locale = asLocale(options.locale);
    await writeJson(options.output, createSampleDeck(locale, {
      purpose: options.purpose,
      audience: options.audience,
      slideCount: options.slides ?? options.slideCount,
      contentMode: options.contentMode,
      styleProfile: options.style
    }));
    console.log(cliMessage(outputLocale(locale), "cli.created", { path: options.output }));
  }));

program
  .command("from-message-map")
  .description("Create a complete DeckSpec from a DeckMessageMap / SlideIntent plan using varied visual archetypes.")
  .argument("<message-map>", "JSON path containing a DeckMessageMap, { messageMap }, or a DeckSpec with metadata.messageMap")
  .requiredOption("-o, --output <path>", "Output DeckSpec path")
  .requiredOption("--title <title>", "Deck title")
  .option("--locale <locale>", "Deck locale", "ja-JP")
  .option("--content-mode <mode>", "presentation, report, technical, handout, or decision", parseContentMode, "report")
  .option("--style <profile>", "Force a style: minimal, stylish, report, presentation, technical", parseStyleProfile)
  .option("--template <id>", "Template id")
  .option("--author <name>", "Deck author")
  .option("--no-cover", "Skip the generated cover slide")
  .option("--no-closing", "Skip the generated closing slide")
  .option("--json", "Emit JSON result", false)
  .action(commandAction(async (messageMapPath: string, options: {
    output: string;
    title: string;
    locale: string;
    contentMode: ContentMode;
    style?: StyleProfile;
    template?: string;
    author?: string;
    cover: boolean;
    closing: boolean;
    json: boolean;
  }) => {
    const raw = await readJson(messageMapPath);
    const container = raw as { messageMap?: unknown; metadata?: { messageMap?: unknown }; keywords?: unknown };
    const messageMap = DeckMessageMapSchema.parse(container.messageMap ?? container.metadata?.messageMap ?? raw);
    const sources = extractDeckSources(raw);
    const keywords =
      Array.isArray(container.keywords) && container.keywords.every((value): value is string => typeof value === "string") ? container.keywords : undefined;
    const deck = createDeckFromMessageMap(messageMap, {
      title: options.title,
      locale: asLocale(options.locale),
      contentMode: options.contentMode,
      styleProfile: options.style,
      template: options.template,
      author: options.author,
      includeCover: options.cover,
      includeClosing: options.closing,
      keywords,
      sources
    });
    await writeJson(options.output, deck);
    if (options.json) {
      console.log(JSON.stringify({ outputPath: options.output, deck }, null, 2));
      return;
    }
    console.log(cliMessage(outputLocale(deck.locale), "cli.created", { path: options.output }));
  }));

program
  .command("rules")
  .description("Print first-pass slide generation rules to reduce lint/render retry loops.")
  .option("--locale <locale>", "Rules locale", "ja-JP")
  .option("--content-mode <mode>", "presentation, report, technical, handout, or decision", parseContentMode, "presentation")
  .option("--json", "Emit JSON", false)
  .action(commandAction((options: { locale: string; contentMode: ContentMode; json: boolean }) => {
    const rules = getSlideCreationRules(asLocale(options.locale), options.contentMode);
    console.log(options.json ? JSON.stringify(rules, null, 2) : formatSlideCreationRules(rules));
  }));

program
  .command("lint")
  .description("Lint a DeckSpec for design and accessibility issues.")
  .argument("<deck>", "DeckSpec JSON path")
  .option("--json", "Emit JSON", false)
  .action(commandAction(async (deckPath: string, options: { json: boolean }) => {
    const deck = parseDeckSpec(await readJson(deckPath));
    const report = localizeLintReport(lintDeckSpec(deck), outputLocale(deck.locale));
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    if (report.issues.length === 0) {
      console.log(cliMessage(outputLocale(deck.locale), "cli.noLintIssues"));
      return;
    }

    report.issues.forEach((item) => {
      console.log(`${item.severity.toUpperCase()} ${item.code} ${item.path}: ${item.message}`);
    });

    if (!report.ok) {
      process.exitCode = 1;
    }
  }));

program
  .command("content-review")
  .description("Review slide titles/messages/body copy against locale and content-mode writing guidelines.")
  .argument("[deck]", "DeckSpec JSON path")
  .option("--locale <locale>", "Guidance locale when no deck is provided", "ja-JP")
  .option("--content-mode <mode>", "presentation, report, technical, handout, or decision", parseContentMode)
  .option("--json", "Emit JSON", false)
  .action(commandAction(async (deckPath: string | undefined, options: { locale: string; contentMode?: ContentMode; json: boolean }) => {
    let report: ReturnType<typeof reviewDeckContent>;
    if (deckPath) {
      const parsedDeck = parseDeckSpec(await readJson(deckPath));
      report = reviewDeckContent(parsedDeck, parsedDeck.locale, options.contentMode ?? parsedDeck.metadata.contentMode ?? "presentation");
    } else {
      report = { guidance: getContentGuidance(asLocale(options.locale), options.contentMode ?? "presentation"), issues: [] };
    }

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log(report.guidance.titleModel);
    console.log(report.guidance.messageModel);
    console.log(report.guidance.bodyModel);
    report.guidance.rules.forEach((rule) => console.log(`- ${rule}`));
    report.issues.forEach((item) => console.log(`${item.severity.toUpperCase()} ${item.code} ${item.path}: ${item.message}`));
  }));

program
  .command("business-plan")
  .description("Create a business deck director plan and optionally an Edit with Copilot prompt.")
  .option("--locale <locale>", "Plan locale", "ja-JP")
  .option("--topic <topic>", "Deck topic")
  .option("--purpose <purpose>", "Deck purpose")
  .option("--audience <audience>", "Primary audience")
  .option("--usage-context <context>", "Where/how the deck will be used")
  .option("--desired-action <action>", "What the reader should decide or do")
  .option("--slides <count>", "Target business deck slide count from 3 to 40", parseBusinessSlideCount)
  .addOption(new Option("--slide-count <count>", "Alias for --slides (matches the MCP slideCount field)").argParser(parseBusinessSlideCount).hideHelp())
  .option("--style-mode <mode>", "consulting or internal-friendly", parseBusinessStyleMode)
  .option("--brand-direction <direction>", "Brand, template, or tone constraints")
  .option("--source-summary <summary>", "Known source materials, facts, assumptions, or open questions")
  .option("--customer-facing", "Mark as customer-facing and requiring human review", false)
  .option("--important-meeting", "Mark as executive/steering/decision meeting", false)
  .option("--edit-with-copilot-prompt", "Include a PowerPoint for the web Edit with Copilot prompt", false)
  .option("-o, --output <path>", "Write JSON result to a file")
  .option("--json", "Emit JSON", false)
  .action(commandAction(async (options: {
    locale: string;
    topic?: string;
    purpose?: string;
    audience?: string;
    usageContext?: string;
    desiredAction?: string;
    slides?: number;
    slideCount?: number;
    styleMode?: BusinessStyleMode;
    brandDirection?: string;
    sourceSummary?: string;
    customerFacing: boolean;
    importantMeeting: boolean;
    editWithCopilotPrompt: boolean;
    output?: string;
    json: boolean;
  }) => {
    const brief = {
      locale: asLocale(options.locale),
      topic: options.topic,
      purpose: options.purpose,
      audience: options.audience,
      usageContext: options.usageContext,
      desiredAction: options.desiredAction,
      slideCount: options.slides ?? options.slideCount,
      styleMode: options.styleMode,
      brandDirection: options.brandDirection,
      sourceSummary: options.sourceSummary,
      customerFacing: options.customerFacing,
      importantMeeting: options.importantMeeting
    };
    const result = {
      plan: planBusinessDeck(brief),
      ...(options.editWithCopilotPrompt ? { editWithCopilotPrompt: createEditWithCopilotPrompt(brief) } : {})
    };

    if (options.output) {
      await writeJson(options.output, result);
    }

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (options.output) {
      console.log(`Wrote business plan to ${options.output}`);
      return;
    }

    console.log(result.plan.objective);
    console.log(`${result.plan.audience} -> ${result.plan.desiredAction}`);
    result.plan.sections.forEach((section, index) => console.log(`${index + 1}. ${section.title}: ${section.purpose}`));
    if (result.plan.missingInformation.length > 0) {
      console.log(`Missing: ${result.plan.missingInformation.join(", ")}`);
    }
    if (result.editWithCopilotPrompt) {
      console.log("");
      console.log("Edit with Copilot prompt:");
      console.log(result.editWithCopilotPrompt);
    }
  }));

program
  .command("message-review")
  .description("Review the DeckSpec Message Map / SlideIntent plan for one-message-per-slide coverage.")
  .argument("<deck>", "DeckSpec JSON path")
  .option("--json", "Emit JSON", false)
  .action(commandAction(async (deckPath: string, options: { json: boolean }) => {
    const deck = parseDeckSpec(await readJson(deckPath));
    const report = reviewMessageMap(deck);
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      if (!report.ok) process.exitCode = 1;
      return;
    }

    if (report.issues.length === 0) {
      console.log("No message-map issues.");
      return;
    }
    report.issues.forEach((item) => console.log(`${item.severity.toUpperCase()} ${item.code} ${item.path}: ${item.message}`));
    if (!report.ok) process.exitCode = 1;
  }));

program
  .command("visual-review")
  .description("Review a DeckSpec for visual-quality issues such as truncation, repeated accent-bar cards/layouts, axis alignment, and typography inconsistency.")
  .argument("<deck>", "DeckSpec JSON path")
  .option("--json", "Emit JSON", false)
  .action(commandAction(async (deckPath: string, options: { json: boolean }) => {
    const deck = parseDeckSpec(await readJson(deckPath));
    const report = reviewVisualQuality(deck);
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      if (!report.ok) process.exitCode = 1;
      return;
    }

    if (report.issues.length === 0) {
      console.log("No visual quality issues.");
      return;
    }
    report.issues.forEach((item) => console.log(`${item.severity.toUpperCase()} ${item.code} ${item.path}: ${item.message}`));
    if (!report.ok) process.exitCode = 1;
  }));

program
  .command("business-review")
  .description("Review a DeckSpec for business storyline, section flow, emphasis, and final landing issues.")
  .argument("<deck>", "DeckSpec JSON path")
  .option("--locale <locale>", "Review locale; defaults to the deck locale")
  .option("--style-mode <mode>", "consulting or internal-friendly", parseBusinessStyleMode)
  .option("--customer-facing", "Review as customer-facing", false)
  .option("--important-meeting", "Review as executive/steering/decision meeting", false)
  .option("--json", "Emit JSON", false)
  .action(commandAction(async (deckPath: string, options: { locale?: string; styleMode?: BusinessStyleMode; customerFacing: boolean; importantMeeting: boolean; json: boolean }) => {
    const deck = parseDeckSpec(await readJson(deckPath));
    const locale = options.locale ? asLocale(options.locale) : deck.locale;
    const report = reviewBusinessDeck(deck, {
      locale,
      styleMode: options.styleMode,
      customerFacing: options.customerFacing,
      importantMeeting: options.importantMeeting
    });

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log(getBusinessDeckGuidance(locale, options.styleMode ?? "consulting").positioning);
    if (report.issues.length === 0) {
      console.log("No business storyline issues.");
      return;
    }

    report.issues.forEach((item) => console.log(`${item.severity.toUpperCase()} ${item.code} ${item.path}: ${item.message}`));
    if (!report.ok) {
      process.exitCode = 1;
    }
  }));

program
  .command("review")
  .description("Aggregated multi-agent review gate: lint + content + business, classified, scored, and routed to owning agent roles.")
  .argument("<deck>", "DeckSpec JSON path")
  .option("--locale <locale>", "Review locale; defaults to the deck locale")
  .option("--no-business", "Skip the business storyline review")
  .option("--json", "Emit JSON", false)
  .action(commandAction(async (deckPath: string, options: { locale?: string; business: boolean; json: boolean }) => {
    const deck = parseDeckSpec(await readJson(deckPath));
    const locale = options.locale ? asLocale(options.locale) : deck.locale;
    const report = reviewDeck(deck, { locale, includeBusinessReview: options.business });

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      if (!report.ok) process.exitCode = 1;
      return;
    }

    console.log(
      `Scores  overall=${report.scores.overall} a11y=${report.scores.accessibility} content=${report.scores.content} structure=${report.scores.structure}`
    );
    console.log(report.summary);
    if (report.blocking.length > 0) {
      console.log("\nBlocking (route to owner role):");
      report.blocking.forEach((i) => console.log(`  [${i.owner}] ${i.code} ${i.path}: ${i.message}`));
    }
    if (report.polishFixable.length > 0) {
      console.log(`\nPolish-fixable (auto-resolved by finalize): ${report.polishFixable.length}`);
    }
    if (report.advisory.length > 0) {
      console.log(`Advisory: ${report.advisory.length}`);
    }
    if (!report.ok) {
      process.exitCode = 1;
    }
  }));

program
  .command("agents")
  .description("List the six-role slide-authoring agent pipeline with hand-off contracts and tools.")
  .option("--json", "Emit JSON", false)
  .action(commandAction(async (options: { json: boolean }) => {
    const pipeline = describeAgentPipeline();
    if (options.json) {
      console.log(JSON.stringify({ pipeline }, null, 2));
      return;
    }
    pipeline.forEach((role, index) => {
      console.log(`${index + 1}. ${role.title} (${role.id})`);
      console.log(`   responsibility: ${role.responsibility}`);
      console.log(`   consumes: ${role.consumes}`);
      console.log(`   produces: ${role.produces}`);
      console.log(`   tools: ${role.tools.join(", ")}`);
    });
  }));

program
  .command("figure")
  .description("Recommend a figure (design-pack component or schematic) for a slide message or explicit figure kind.")
  .option("--message <text>", "The slide's one-sentence message")
  .option("--kind <kind>", "Explicit figure intent / design-pack kind / schematic kind")
  .option("--hint <text>", "Extra hint (role, evidence, data description)")
  .option("--items <n>", "Number of data points the slide carries", (v) => Number.parseInt(v, 10))
  .option("--list", "List every figure intent instead of recommending one", false)
  .option("--json", "Emit JSON", false)
  .action(commandAction(async (options: { message?: string; kind?: string; hint?: string; items?: number; list: boolean; json: boolean }) => {
    if (options.list) {
      const intents = listFigureIntents();
      if (options.json) {
        console.log(JSON.stringify({ intents }, null, 2));
        return;
      }
      intents.forEach((i) =>
        console.log(`${i.intent.padEnd(20)} ${i.renderer.padEnd(12)} ${i.kind.padEnd(18)} ${i.labelEn} (${i.itemRange.min}-${i.itemRange.max})`)
      );
      return;
    }
    const rec = selectFigure({ figureKind: options.kind, message: options.message, hint: options.hint, itemCount: options.items });
    if (options.json) {
      console.log(JSON.stringify(rec, null, 2));
      return;
    }
    console.log(`intent:    ${rec.intent} (${rec.labelEn} / ${rec.labelJa})`);
    console.log(`renderer:  ${rec.renderer}  kind: ${rec.kind}  schematic: ${rec.schematicKind}`);
    console.log(`items:     ${rec.itemRange.min}-${rec.itemRange.max}`);
    console.log(`rationale: ${rec.rationale}`);
    console.log(`alternatives: ${rec.alternatives.join(", ")}`);
  }));

program
  .command("polish")
  .description("Normalize layout bounds and text fitting in a DeckSpec before rendering.")
  .argument("<deck>", "DeckSpec JSON path")
  .requiredOption("-o, --output <path>", "Output polished DeckSpec JSON path")
  .action(commandAction(async (deckPath: string, options: { output: string }) => {
    const polished = normalizeDeckLayout(ensureSourceReferenceSlide(parseDeckSpec(await readJson(deckPath))));
    await writeJson(options.output, polished);
    console.log(cliMessage(outputLocale(polished.locale), "cli.created", { path: options.output }));
  }));

program
  .command("render")
  .description("Render a DeckSpec to PowerPoint.")
  .argument("<deck>", "DeckSpec JSON path")
  .requiredOption("-o, --output <path>", "Output .pptx path")
  .option("--force", "Render even when lint errors are present", false)
  .option("--polish", "Apply layout polish before rendering", false)
  .action(commandAction(async (deckPath: string, options: { output: string; force: boolean; polish: boolean }) => {
    const deck = await readJson(deckPath);
    const result = await renderDeckToPptx(deck, options.output, { allowLintErrors: options.force, polishLayout: options.polish });
    const parsedDeck = parseDeckSpec(deck);
    console.log(cliMessage(outputLocale(parsedDeck.locale), "cli.rendered", { path: result.outputPath }));
    if (result.warnings.length > 0) {
      console.log(cliMessage(outputLocale(parsedDeck.locale), "cli.lintWarnings", { count: result.warnings.length }));
    }
    printTemplateWarnings(result.warnings);
  }));

program
  .command("finalize")
  .description(
    "One-shot: polish layout, lint, then render a DeckSpec in a single pass. Surfaces only genuine blocking issues; polish-fixable items (line breaks, overflow, small text, reading order) are resolved automatically. Use this instead of separate lint + polish + render calls."
  )
  .argument("<deck>", "DeckSpec JSON path")
  .option("-o, --output <path>", "Output .pptx path (omit together with --no-render to only polish and lint)")
  .option("--no-render", "Polish and lint only; do not render a .pptx")
  .option("--polished-out <path>", "Also write the polished DeckSpec JSON to this path")
  .option("--force", "Render even when genuine (non-polish-fixable) lint errors remain", false)
  .option("--json", "Emit JSON", false)
  .action(commandAction(async (deckPath: string, options: { output?: string; render: boolean; polishedOut?: string; force: boolean; json: boolean }) => {
    const base = ensureSourceReferenceSlide(parseDeckSpec(await readJson(deckPath)));
    const polished = normalizeDeckLayout(base);
    const locale = outputLocale(polished.locale);
    // Classify the authored (pre-polish) deck so polishFixable reflects what polish will auto-resolve;
    // render uses the polished deck. Non-polish-fixable errors are identical pre/post polish.
    const report = localizeLintReport(lintDeckSpec(base), locale);
    const polishedReport = localizeLintReport(lintDeckSpec(polished), locale);
    const { blockingErrors, polishFixable, warnings } = classifyFinalizeLintReports(report, polishedReport);

    if (options.polishedOut) {
      await writeJson(options.polishedOut, polished);
    }

    const wantRender = options.render && Boolean(options.output);
    const blocked = blockingErrors.length > 0 && !options.force;
    let outputPath: string | undefined;
    let renderWarnings: string[] = [];
    if (wantRender && !blocked) {
      const result = await renderDeckToPptx(polished, options.output as string, { allowLintErrors: true, polishLayout: true });
      outputPath = result.outputPath;
      renderWarnings = result.warnings;
    }

    if (blockingErrors.length > 0) {
      process.exitCode = 1;
    }

    if (options.json) {
      console.log(JSON.stringify({
        ok: blockingErrors.length === 0,
        rendered: Boolean(outputPath),
        outputPath,
        polishedDeckPath: options.polishedOut,
        blockingErrors,
        polishFixable,
        warnings,
        renderWarnings
      }, null, 2));
      return;
    }

    if (outputPath) {
      console.log(cliMessage(locale, "cli.rendered", { path: outputPath }));
    } else if (options.render && !options.output) {
      console.log("No --output given; polished and linted only (no .pptx written).");
    } else if (blocked) {
      console.log("Render skipped: fix the blocking errors below or pass --force.");
    }

    if (options.polishedOut) {
      console.log(cliMessage(locale, "cli.created", { path: options.polishedOut }));
    }

    console.log(
      `Blocking errors: ${blockingErrors.length} | Auto-resolved by polish: ${polishFixable.length} | Warnings: ${warnings.length}`
    );
    blockingErrors.forEach((item) => {
      console.log(`ERROR ${item.code} ${item.path}: ${item.message}`);
    });
    printTemplateWarnings(renderWarnings);
  }));

program
  .command("studio")
  .description("Create a static Studio HTML preview for a DeckSpec.")
  .argument("<deck>", "DeckSpec JSON path")
  .requiredOption("-o, --output <path>", "Output HTML path")
  .action(commandAction(async (deckPath: string, options: { output: string }) => {
    const deck = ensureSourceReferenceSlide(parseDeckSpec(await readJson(deckPath)));
    await mkdir(dirname(options.output), { recursive: true });
    await writeFile(options.output, renderStudioHtml(deck, outputLocale(deck.locale)), "utf8");
    console.log(cliMessage(outputLocale(deck.locale), "cli.studioCreated", { path: options.output }));
  }));

const templateCommand = program
  .command("template")
  .description("Template operations.");

const designCommand = program
  .command("design")
  .description("Design asset pack operations.");

designCommand
  .command("list")
  .description("List curated design components.")
  .argument("[kind]", "Optional component kind, e.g. tree")
  .option("--json", "Emit JSON", false)
  .action(commandAction(async (kind: string | undefined, options: { json: boolean }) => {
    const components = await listDesignComponents({ kind });
    if (options.json) {
      console.log(JSON.stringify(components, null, 2));
      return;
    }
    if (components.length === 0) {
      console.log("No design components found.");
      return;
    }
    console.log(["id", "kind", "name", "bestFor"].join("\t"));
    console.log(components.map((component) => [component.id, component.kind, component.name, component.bestFor.join(", ")].join("\t")).join("\n"));
  }));

designCommand
  .command("render")
  .description("Create a DeckSpec that uses a curated design component.")
  .argument("<componentId>", "Design component id")
  .option("--title <title>", "Slide/deck title")
  .option("-o, --output <path>", "Write the component DeckSpec JSON", "generated/design-component.deck.json")
  .option("--json", "Emit JSON", false)
  .action(commandAction(async (componentId: string, options: { title?: string; output: string; json: boolean }) => {
    const deck = await renderDesignComponentDeck(componentId, { title: options.title });
    await writeJson(options.output, deck);
    console.log(options.json ? JSON.stringify({ output: options.output, deck }, null, 2) : `Rendered design component ${componentId} to ${options.output}`);
  }));

templateCommand
  .command("list")
  .description("List templates with source and delete status. Preset templates are locked; registered custom/imported templates are deletable.")
  .argument("[query]", "Optional search query", "")
  .option("--registered-only", "List only custom/imported templates from the registry", false)
  .option("--custom-only", "Alias for --registered-only", false)
  .option("--json", "Emit JSON", false)
  .action(commandAction(async (query: string, options: { registeredOnly: boolean; customOnly: boolean; json: boolean }) => {
    const registeredOnly = options.registeredOnly || options.customOnly;
    const entries = await searchTemplateEntries(query, { registeredOnly });
    if (options.json) {
      console.log(JSON.stringify(entries.map(templateEntryJson), null, 2));
      return;
    }

    if (entries.length === 0) {
      console.log(registeredOnly ? "No registered templates found." : "No templates found.");
      return;
    }

    console.log(["id", "name", "source", "delete"].join("\t"));
    console.log(entries.map(templateEntryLine).join("\n"));
  }));

templateCommand
  .command("register")
  .description("Register a template manifest JSON for reuse.")
  .argument("<manifest>", "Template manifest JSON path")
  .option("--overwrite", "Replace an existing custom template with the same id", false)
  .option("--json", "Emit JSON", false)
  .action(commandAction(async (manifestPath: string, options: { overwrite: boolean; json: boolean }) => {
    const result = await registerTemplateManifest(await readJson(manifestPath), { overwrite: options.overwrite });
    console.log(options.json ? JSON.stringify(result, null, 2) : `Registered template ${result.template.id} in ${result.registryPath}`);
  }));

templateCommand
  .command("registry-path")
  .description("Print the template registry path.")
  .action(() => {
    console.log(getDefaultTemplateRegistryPath());
  });

templateCommand
  .command("delete")
  .alias("remove")
  .description("Delete a registered custom/imported template from the user registry. Built-in templates cannot be deleted.")
  .argument("<templateId>", "Registered custom/imported template id to delete")
  .option("--json", "Emit JSON", false)
  .action(commandAction(async (templateId: string, options: { json: boolean }) => {
    const result = await deleteTemplateManifest(templateId);
    console.log(options.json ? JSON.stringify(result, null, 2) : `Deleted template ${result.template.id} from ${result.registryPath}`);
  }));

templateCommand
  .command("import")
  .description("Import the design (colors, fonts, slide size, header/footer, and the title/closing slide background, logos, and layout) from an existing .pptx as a reusable template.")
  .argument("<pptx>", "Source .pptx file path")
  .option("--id <id>", "Template id (defaults to the file name)")
  .option("--name <name>", "Template display name (defaults to the file name)")
  .option("--locale <locale>", "Template locale (ja-JP or en-US)")
  .option("--register", "Save the imported template to the registry for reuse", false)
  .option("--overwrite", "Replace an existing custom template with the same id", false)
  .option("-o, --output <path>", "Write the imported template manifest JSON to this path")
  .option("--json", "Emit JSON", false)
  .action(
    commandAction(
      async (
        pptxPath: string,
        options: { id?: string; name?: string; locale?: string; register: boolean; overwrite: boolean; output?: string; json: boolean }
      ) => {
        const locale = options.locale === "ja-JP" || options.locale === "en-US" ? options.locale : undefined;
        const result = await importTemplateFromPptx(pptxPath, {
          id: options.id,
          name: options.name,
          locale,
          register: options.register,
          overwrite: options.overwrite
        });
        if (options.output) {
          await writeJson(options.output, result.template);
        }
        const persistence = {
          templateId: result.template.id,
          registryPath: result.registryPath,
          outputPath: options.output
        };
        const notPersistedWarning = importNotPersistedWarning(persistence);
        if (options.json) {
          const payload = notPersistedWarning ? { ...result, warning: notPersistedWarning } : result;
          console.log(JSON.stringify(payload, null, 2));
        } else {
          console.log(`Imported template ${result.template.id}${importPersistenceSuffix(persistence)}`);
        }
        if (notPersistedWarning) {
          console.warn(`Warning: ${notPersistedWarning}`);
        }
      }
    )
  );

templateCommand
  .command("scaffold")
  .description("Create a starter deck (title + closing slide) that reuses an imported or built-in template.")
  .argument("<templateId>", "Template id to reuse")
  .option("--title <title>", "Title slide heading")
  .option("--subtitle <subtitle>", "Title slide subtitle")
  .option("--locale <locale>", "Deck locale (ja-JP or en-US)")
  .option("-o, --output <path>", "Write the scaffolded DeckSpec JSON to this path", "generated/scaffold.deck.json")
  .option("--json", "Emit JSON", false)
  .action(
    commandAction(
      async (
        templateId: string,
        options: { title?: string; subtitle?: string; locale?: string; output: string; json: boolean }
      ) => {
        const templates = await listAllTemplates();
        const template = templates.find((item) => item.id === templateId);
        if (!template) {
          throw new InvalidArgumentError(`Template "${templateId}" was not found. Run "pptcreater template list" to see available ids.`);
        }
        const locale = options.locale === "ja-JP" || options.locale === "en-US" ? options.locale : undefined;
        const deck = scaffoldDeckFromTemplate(template, { title: options.title, subtitle: options.subtitle, locale });
        await writeJson(options.output, deck);
        console.log(options.json ? JSON.stringify(deck, null, 2) : `Scaffolded deck from ${template.id} to ${options.output}`);
      }
    )
  );

templateCommand
  .command("apply")
  .description("Re-skin an existing deck with an imported/built-in template's identity: adopt its colors and fonts (remapping the deck's old palette), and inject the template's content background and branding onto the middle slides. Cover and closing slides keep their own background but still follow the re-theme.")
  .argument("<deck>", "DeckSpec JSON path to re-skin")
  .argument("<templateId>", "Template id to apply")
  .option("-o, --output <path>", "Write the re-skinned DeckSpec JSON (defaults to overwriting the input deck)")
  .option("--no-retheme", "Only inject content background/branding; do not adopt the template tokens or remap baked colors")
  .option("--json", "Emit JSON", false)
  .action(
    commandAction(async (deckPath: string, templateId: string, options: { output?: string; retheme: boolean; json: boolean }) => {
      const templates = await listAllTemplates();
      const template = templates.find((item) => item.id === templateId);
      if (!template) {
        throw new InvalidArgumentError(`Template "${templateId}" was not found. Run "pptcreater template list" to see available ids.`);
      }
      const deck = parseDeckSpec(await readJson(deckPath));
      const result = applyTemplateContentDesign(deck, template, { retheme: options.retheme });
      const outputPath = options.output ?? deckPath;
      await writeJson(outputPath, result.deck);
      if (options.json) {
        console.log(
          JSON.stringify(
            { output: outputPath, appliedSlideCount: result.appliedSlideCount, rethemed: result.rethemed },
            null,
            2
          )
        );
      } else {
        const parts: string[] = [];
        if (result.rethemed) {
          parts.push(`adopted ${template.id} colors + fonts deck-wide`);
        }
        if (result.appliedSlideCount > 0) {
          parts.push(`injected content background/branding on ${result.appliedSlideCount} slide(s)`);
        }
        if (parts.length === 0) {
          console.log(`Template ${template.id} had no design to apply; ${outputPath} was written unchanged.`);
        } else {
          console.log(`Applied ${template.id}: ${parts.join("; ")}. Wrote ${outputPath}.`);
        }
      }
    })
  );

const assetCommand = program
  .command("asset")
  .description("SVG asset operations.");

assetCommand
  .command("search")
  .argument("[query]", "Search query", "")
  .option("--json", "Emit JSON", false)
  .action(commandAction(async (query: string, options: { json: boolean }) => {
    const assets = await searchAllSvgAssets(query);
    console.log(options.json ? JSON.stringify(assets, null, 2) : assets.map((asset) => `${asset.id}\t${asset.title}`).join("\n"));
  }));

assetCommand
  .command("sources")
  .description("List external icon source catalogs and license guidance notes.")
  .option("--json", "Emit JSON", false)
  .action(commandAction((options: { json: boolean }) => {
    const sources = listIconSourceCatalogs();
    console.log(options.json ? JSON.stringify(sources, null, 2) : sources.map((source) => `${source.id}\t${source.url}`).join("\n"));
  }));

assetCommand
  .command("register")
  .description("Register a sanitized SVG file as a reusable asset.")
  .argument("<svgFile>", "SVG file path")
  .requiredOption("--id <id>", "Reusable asset id")
  .requiredOption("--title <title>", "Human-readable asset title")
  .requiredOption("--description <description>", "Asset description")
  .option("--tag <tag...>", "Search tags")
  .option("--license <license>", "Asset license", "custom")
  .option("--alt-text <text>", "Default alt text")
  .option("--decorative", "Mark as decorative by default", false)
  .option("--overwrite", "Replace an existing asset with the same id", false)
  .option("--json", "Emit JSON", false)
  .action(commandAction(async (
    svgFile: string,
    options: {
      id: string;
      title: string;
      description: string;
      tag?: string[];
      license: string;
      altText?: string;
      decorative: boolean;
      overwrite: boolean;
      json: boolean;
    }
  ) => {
    const result = await registerSvgAsset(
      {
        id: options.id,
        title: options.title,
        description: options.description,
        tags: options.tag ?? [],
        license: options.license,
        decorative: options.decorative,
        altText: options.altText,
        svg: await readFile(svgFile, "utf8")
      },
      { overwrite: options.overwrite }
    );
    console.log(options.json ? JSON.stringify(result, null, 2) : `Registered SVG asset ${result.asset.id} in ${result.registryPath}`);
  }));

assetCommand
  .command("registry-path")
  .description("Print the SVG asset registry path.")
  .action(() => {
    console.log(getDefaultSvgRegistryPath());
  });

program
  .command("icon")
  .description("Generate a simple SVG icon asset.")
  .argument("<name>", `Icon name: ${BUILTIN_ICON_NAMES.join(", ")}`, parseBuiltinIconName)
  .option("--color <hex>", "Stroke color", "#1d4ed8")
  .option("--json", "Emit JSON", false)
  .action(commandAction((name: string, options: { color: string; json: boolean }) => {
    const icon = createSimpleIconSvg(name, options.color);
    console.log(options.json ? JSON.stringify(icon, null, 2) : icon.svg);
  }));

program
  .command("icon-suggest")
  .description("Map a free-text keyword (JA/EN) to the best-matching builtin icon name.")
  .argument("<keyword>", "Concept/keyword, e.g. 'security' or 'コスト削減'")
  .option("--color <hex>", "Stroke color for the resolved SVG", "#1d4ed8")
  .option("--json", "Emit JSON", false)
  .action(commandAction((keyword: string, options: { color: string; json: boolean }) => {
    const icon = suggestIconForKeyword(keyword);
    const asset = icon ? resolveIconForKeyword(keyword, options.color) : null;
    if (options.json) {
      console.log(JSON.stringify({ keyword, icon, matched: Boolean(icon), svg: asset?.svg ?? null }, null, 2));
    } else if (icon) {
      console.log(icon);
    } else {
      console.log("(no matching builtin icon)");
    }
  }));

program
  .command("diagram")
  .description("Render a ponchi-e diagram JSON file to SVG.")
  .argument("<diagram>", "Diagram JSON path")
  .requiredOption("-o, --output <path>", "Output SVG path")
  .action(commandAction(async (diagramPath: string, options: { output: string }) => {
    const result = renderPonchiDiagram(await readJson(diagramPath));
    await writeFile(options.output, `\uFEFF${result.svg}\n`, "utf8");
    console.log(`Created ${options.output}`);
  }));

program
  .command("diagram-native")
  .description("Render a ponchi-e diagram JSON file to editable DeckSpec shape/text elements.")
  .argument("<diagram>", "Diagram JSON path")
  .requiredOption("-o, --output <path>", "Output JSON path")
  .option("--frame-x <number>", "Slide frame x in inches", Number)
  .option("--frame-y <number>", "Slide frame y in inches", Number)
  .option("--frame-w <number>", "Slide frame width in inches", Number)
  .option("--frame-h <number>", "Slide frame height in inches", Number)
  .option("--id-prefix <prefix>", "Generated element id prefix", "native-diagram")
  .option("--reading-order-start <number>", "First readingOrder value", Number)
  .action(
    commandAction(
      async (
        diagramPath: string,
        options: {
          output: string;
          frameX?: number;
          frameY?: number;
          frameW?: number;
          frameH?: number;
          idPrefix: string;
          readingOrderStart?: number;
        }
      ) => {
        const frame =
          options.frameX !== undefined || options.frameY !== undefined || options.frameW !== undefined || options.frameH !== undefined
            ? {
                x: options.frameX,
                y: options.frameY,
                w: options.frameW,
                h: options.frameH
              }
            : undefined;
        const result = renderNativePonchiDiagram(await readJson(diagramPath), {
          frame,
          idPrefix: options.idPrefix,
          readingOrderStart: options.readingOrderStart
        });
        await writeFile(options.output, `\uFEFF${JSON.stringify(result, null, 2)}\n`, "utf8");
        console.log(`Created ${options.output}`);
      }
    )
  );

program
  .command("diagram-intent")
  .description("Render a Diagram Intent JSON file (access-plane-map, closed-privileged-path, lifecycle, maturity-ladder, before-after, relationship-map) to editable DeckSpec shape/text elements.")
  .argument("<intent>", "Diagram Intent JSON path")
  .requiredOption("-o, --output <path>", "Output JSON path")
  .option("--frame-x <number>", "Slide frame x in inches", Number)
  .option("--frame-y <number>", "Slide frame y in inches", Number)
  .option("--frame-w <number>", "Slide frame width in inches", Number)
  .option("--frame-h <number>", "Slide frame height in inches", Number)
  .option("--id-prefix <prefix>", "Generated element id prefix", "diagram-intent")
  .option("--reading-order-start <number>", "First readingOrder value", Number)
  .action(
    commandAction(
      async (
        intentPath: string,
        options: {
          output: string;
          frameX?: number;
          frameY?: number;
          frameW?: number;
          frameH?: number;
          idPrefix: string;
          readingOrderStart?: number;
        }
      ) => {
        const frame =
          options.frameX !== undefined || options.frameY !== undefined || options.frameW !== undefined || options.frameH !== undefined
            ? {
                x: options.frameX,
                y: options.frameY,
                w: options.frameW,
                h: options.frameH
              }
            : undefined;
        const result = renderDiagramIntent(await readJson(intentPath), {
          frame,
          idPrefix: options.idPrefix,
          readingOrderStart: options.readingOrderStart
        });
        await writeFile(options.output, `\uFEFF${JSON.stringify(result, null, 2)}\n`, "utf8");
        console.log(`Created ${options.output}`);
      }
    )
  );

program
  .command("section-divider")
  .description("Render section divider (chapter) slides from a JSON file to DeckSpec slides you insert into deck.slides.")
  .argument("<sections>", "Sections JSON path ({ sections: [{ title, subtitle?, eyebrow? }], locale?, numbered?, accent?, idPrefix? })")
  .requiredOption("-o, --output <path>", "Output JSON path")
  .option("--locale <locale>", "Deck locale (ja-JP or en-US)")
  .option("--accent <hex>", "Accent color override, e.g. #1d4ed8")
  .option("--id-prefix <prefix>", "Generated slide/element id prefix")
  .option("--no-numbered", "Disable SECTION NN / NN eyebrow numbering")
  .action(
    commandAction(
      async (
        sectionsPath: string,
        options: { output: string; locale?: string; accent?: string; idPrefix?: string; numbered?: boolean },
        command: Command
      ) => {
        const raw = (await readJson(sectionsPath)) as {
          sections?: Array<{ title: string; subtitle?: string; eyebrow?: string }>;
          locale?: Locale;
          numbered?: boolean;
          accent?: string;
          idPrefix?: string;
        };
        const sections = Array.isArray(raw) ? (raw as Array<{ title: string; subtitle?: string; eyebrow?: string }>) : raw.sections;
        if (!sections || sections.length === 0) {
          throw new InvalidArgumentError("Provide a non-empty `sections` array.");
        }
        const locale = (options.locale as Locale | undefined) ?? raw.locale;
        const numberedFromFlag = command.getOptionValueSource("numbered") === "cli";
        const numbered = numberedFromFlag ? options.numbered : raw.numbered;
        const slides = createSectionDividerSlides(sections, {
          locale,
          numbered,
          accent: options.accent ?? raw.accent,
          idPrefix: options.idPrefix ?? raw.idPrefix
        });
        await writeFile(options.output, `\uFEFF${JSON.stringify({ slides }, null, 2)}\n`, "utf8");
        console.log(`Created ${options.output}`);
      }
    )
  );

program
  .command("visual-scaffold")
  .description("Render an editable per-slide concept visual scaffold (panel + icon/monogram + concept + aspect chips) to DeckSpec elements you push into a slide.")
  .argument("<input>", "Scaffold JSON path ({ concept, caption?, points?, icon?, locale?, accent?, frame?, idPrefix? })")
  .requiredOption("-o, --output <path>", "Output JSON path")
  .option("--locale <locale>", "Deck locale (ja-JP or en-US)")
  .option("--accent <hex>", "Accent color override, e.g. #1d4ed8")
  .option("--icon <name>", "Builtin icon name for the emblem (omit for a monogram)")
  .option("--id-prefix <prefix>", "Generated element id prefix")
  .action(
    commandAction(
      async (
        inputPath: string,
        options: { output: string; locale?: string; accent?: string; icon?: string; idPrefix?: string }
      ) => {
        const raw = (await readJson(inputPath)) as {
          concept?: string;
          caption?: string;
          points?: string[];
          icon?: string;
          locale?: Locale;
          accent?: string;
          frame?: { x?: number; y?: number; w?: number; h?: number };
          idPrefix?: string;
          readingOrderStart?: number;
        };
        if (!raw.concept || raw.concept.trim().length === 0) {
          throw new InvalidArgumentError("Provide a non-empty `concept`.");
        }
        const locale = (options.locale as Locale | undefined) ?? raw.locale;
        const accent = options.accent ?? raw.accent;
        if (accent !== undefined && !/^#(?:[0-9a-fA-F]{3}){1,2}$/.test(accent)) {
          throw new InvalidArgumentError(`Accent must be a hex color like #1d4ed8 (received "${accent}").`);
        }
        const iconName = options.icon ?? raw.icon;
        let iconSvg: string | undefined;
        if (iconName) {
          if (!BUILTIN_ICON_NAMES.includes(iconName as BuiltinIconName)) {
            throw new InvalidArgumentError(`Icon name must be one of: ${BUILTIN_ICON_NAMES.join(", ")}.`);
          }
          iconSvg = createSimpleIconSvg(iconName, "#ffffff").svg;
        }
        const result = createVisualScaffold(
          { concept: raw.concept, caption: raw.caption, points: raw.points, iconSvg },
          {
            locale,
            accent,
            frame: raw.frame,
            idPrefix: options.idPrefix ?? raw.idPrefix,
            readingOrderStart: raw.readingOrderStart
          }
        );
        await writeFile(options.output, `\uFEFF${JSON.stringify(result, null, 2)}\n`, "utf8");
        console.log(`Created ${options.output}`);
      }
    )
  );

program
  .command("schematic")
  .description("Render a preset schematic JSON file (table/tree/flow/cycle/matrix/gantt/ranking/list/mockup etc.) to SVG.")
  .argument("<schematic>", "Schematic JSON path")
  .requiredOption("-o, --output <path>", "Output SVG path")
  .action(commandAction(async (schematicPath: string, options: { output: string }) => {
    const result = renderSchematicDiagram(await readJson(schematicPath));
    await writeFile(options.output, `\uFEFF${result.svg}\n`, "utf8");
    console.log(`Created ${options.output}`);
  }));

program
  .command("schematic-presets")
  .description("List Slideland-style schematic kinds and mode-aware preset recommendations.")
  .option("--style-profile <profile>", "minimal, stylish, report, presentation, or technical", parseStyleProfile)
  .option("--all", "Include all mode template sets in JSON output", false)
  .option("--json", "Emit JSON", false)
  .action(commandAction((options: { styleProfile?: StyleProfile; all: boolean; json: boolean }) => {
    const selected = schematicPresetForStyleProfile(options.styleProfile);
    const payload = {
      selected,
      selectedTemplates: schematicTemplatesForStyleProfile(options.styleProfile),
      presets: SCHEMATIC_STYLE_PRESETS,
      ...(options.all ? { templates: SCHEMATIC_MODE_TEMPLATES } : {}),
      kinds: SCHEMATIC_KIND_CATALOG
    };
    if (options.json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    console.log(`Selected style: ${selected.styleProfile} (${selected.tone})`);
    console.log(selected.note);
    console.log(`Primary kinds: ${selected.primaryKinds.join(", ")}`);
    console.log(`Mode templates: ${Object.keys(payload.selectedTemplates).length}`);
    console.log("");
    console.log(Object.entries(SCHEMATIC_KIND_CATALOG).map(([kind, entry]) => `${kind}\t${entry.labelEn}\t${entry.description}`).join("\n"));
  }));

program
  .command("skill")
  .description("Skill pack operations.")
  .command("list")
  .option("--json", "Emit JSON", false)
  .action(commandAction((options: { json: boolean }) => {
    const skills = listSkillPacks();
    console.log(options.json ? JSON.stringify(skills, null, 2) : skills.map((skill) => `${skill.id}\t${skill.name}`).join("\n"));
  }));

await program.parseAsync();
