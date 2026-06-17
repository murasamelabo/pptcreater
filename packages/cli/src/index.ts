#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Command, InvalidArgumentError } from "commander";
import { BUILTIN_ICON_NAMES, createSimpleIconSvg, getDefaultSvgRegistryPath, listIconSourceCatalogs, registerSvgAsset, searchAllSvgAssets, type BuiltinIconName } from "@pptcreater/assets-svg";
import { renderPonchiDiagram, renderSchematicDiagram } from "@pptcreater/diagram";
import {
  cliMessage,
  createSampleDeck,
  ensureSourceReferenceSlide,
  getContentGuidance,
  getDefaultTemplateRegistryPath,
  listAllTemplates,
  listSkillPacks,
  lintDeckSpec,
  localizeLintReport,
  normalizeDeckLayout,
  parseDeckSpec,
  registerTemplateManifest,
  reviewDeckContent,
  STYLE_PROFILES,
  type ContentMode,
  type Locale,
  type StyleProfile
} from "@pptcreater/core";
import { renderDeckToPptx } from "@pptcreater/render-pptx";
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
  if (!Number.isInteger(count) || count < 1 || count > 4) {
    throw new InvalidArgumentError("Slide count must be an integer from 1 to 4.");
  }

  return count;
}

function parseContentMode(value: string): ContentMode {
  if (value === "presentation" || value === "report" || value === "technical" || value === "handout" || value === "decision") {
    return value;
  }

  throw new InvalidArgumentError("Content mode must be one of: presentation, report, technical, handout, decision.");
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

program
  .name("pptcreater")
  .description("Create concise accessible PowerPoint decks from DeckSpec.")
  .version("0.1.1")
  .option("--language <locale>", "CLI output language: ja-JP or en-US");

program
  .command("install-copilot")
  .description("Install .github/pptcreater-skills.md and optional GitHub Copilot project instructions.")
  .option("--target <path>", "Project directory to update", ".")
  .option("--skills-file <name>", "Skills Markdown file name under .github", "pptcreater-skills.md")
  .option("--no-instructions", "Only install the .github skills file and skip copilot-instructions.md")
  .option("--overwrite", "Overwrite an existing skills file", false)
  .option("--json", "Emit JSON", false)
  .action(commandAction(async (options: { target: string; skillsFile: string; instructions: boolean; overwrite: boolean; json: boolean }) => {
    const result = await installGuidance("copilot", {
      targetDir: options.target,
      skillsFileName: options.skillsFile,
      installInstructions: options.instructions,
      overwrite: options.overwrite
    });
    console.log(options.json ? JSON.stringify(result, null, 2) : `Installed Copilot guidance: ${result.filesChanged.join(", ") || "already up to date"}`);
  }));

program
  .command("install-claude-code")
  .description("Install .github/pptcreater-skills.md and optional Claude Code CLAUDE.md instructions.")
  .option("--target <path>", "Project directory to update", ".")
  .option("--skills-file <name>", "Skills Markdown file name under .github", "pptcreater-skills.md")
  .option("--no-instructions", "Only install the .github skills file and skip CLAUDE.md")
  .option("--overwrite", "Overwrite an existing skills file", false)
  .option("--json", "Emit JSON", false)
  .action(commandAction(async (options: { target: string; skillsFile: string; instructions: boolean; overwrite: boolean; json: boolean }) => {
    const result = await installGuidance("claude-code", {
      targetDir: options.target,
      skillsFileName: options.skillsFile,
      installInstructions: options.instructions,
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
  .option("--slides <count>", "Target slide count from 1 to 4", parseSlideCount)
  .option("--content-mode <mode>", "presentation, report, technical, handout, or decision", parseContentMode)
  .option("--style <profile>", "Force a style: minimal, stylish, report, presentation, technical", parseStyleProfile)
  .action(commandAction(async (options: { output: string; locale: string; purpose?: string; audience?: string; slides?: number; contentMode?: ContentMode; style?: StyleProfile }) => {
    const locale = asLocale(options.locale);
    await writeJson(options.output, createSampleDeck(locale, {
      purpose: options.purpose,
      audience: options.audience,
      slideCount: options.slides,
      contentMode: options.contentMode,
      styleProfile: options.style
    }));
    console.log(cliMessage(outputLocale(locale), "cli.created", { path: options.output }));
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

templateCommand
  .command("list")
  .description("List built-in templates.")
  .option("--json", "Emit JSON", false)
  .action(commandAction(async (options: { json: boolean }) => {
    const templates = await listAllTemplates();
    console.log(options.json ? JSON.stringify(templates, null, 2) : templates.map((template) => `${template.id}\t${template.name}`).join("\n"));
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
  .command("schematic")
  .description("Render a preset schematic JSON file (table/tree/flow/list/mockup) to SVG.")
  .argument("<schematic>", "Schematic JSON path")
  .requiredOption("-o, --output <path>", "Output SVG path")
  .action(commandAction(async (schematicPath: string, options: { output: string }) => {
    const result = renderSchematicDiagram(await readJson(schematicPath));
    await writeFile(options.output, `\uFEFF${result.svg}\n`, "utf8");
    console.log(`Created ${options.output}`);
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
