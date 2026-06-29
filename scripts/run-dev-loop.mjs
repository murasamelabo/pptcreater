#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const cliPath = path.join(repoRoot, "packages", "cli", "dist", "index.js");
const scenarioDocPath = path.join(repoRoot, "docs", "dev-loop-test-scenarios.md");

const validVisualTypes = new Set([
  "section",
  "summary",
  "table",
  "contrast",
  "matrix",
  "flow",
  "before-after",
  "step",
  "cycle",
  "map",
  "ponchi-e",
  "native-diagram",
  "detail",
  "visual-scaffold",
  "cards"
]);

function parseArgs(argv) {
  const options = {
    loops: 1,
    scenarios: "all",
    output: path.join("generated", "dev-loop-runs", `run-${timestampForPath(new Date())}`),
    force: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--loops") {
      options.loops = Number(argv[++index]);
    } else if (arg === "--scenarios") {
      options.scenarios = argv[++index];
    } else if (arg === "--output") {
      options.output = argv[++index];
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.loops) || options.loops < 1) {
    throw new Error("--loops must be a positive integer.");
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/run-dev-loop.mjs [options]\n\nOptions:\n  --loops <n>        Number of loop iterations to run (default: 1)\n  --scenarios <sel>  all | first:N | comma-separated scenario ids (default: all)\n  --output <dir>     Output run directory (default: generated/dev-loop-runs/run-<timestamp>)\n  --force            Overwrite an existing output directory\n  -h, --help         Show this help`);
}

function timestampForPath(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function readScenarios() {
  const markdown = readFileSync(scenarioDocPath, "utf8");
  const matches = [...markdown.matchAll(/```json\s*([\s\S]*?)\s*```/g)];
  const scenarios = [];
  for (const match of matches) {
    const raw = match[1].trim();
    if (!raw.startsWith("{")) {
      continue;
    }
    const parsed = JSON.parse(raw);
    if (parsed.id && parsed.userRequest) {
      scenarios.push(parsed);
    }
  }
  if (scenarios.length === 0) {
    throw new Error(`No ScenarioSpec objects found in ${scenarioDocPath}`);
  }
  return scenarios;
}

function selectScenarios(scenarios, selector) {
  if (selector === "all") {
    return scenarios;
  }
  const firstMatch = selector.match(/^first:(\d+)$/i);
  if (firstMatch) {
    return scenarios.slice(0, Number(firstMatch[1]));
  }
  const ids = new Set(selector.split(",").map((item) => item.trim()).filter(Boolean));
  const selected = scenarios.filter((scenario) => ids.has(scenario.id));
  if (selected.length !== ids.size) {
    const found = new Set(selected.map((scenario) => scenario.id));
    const missing = [...ids].filter((id) => !found.has(id));
    throw new Error(`Unknown scenario id(s): ${missing.join(", ")}`);
  }
  return selected;
}

function ensureDirectory(dir) {
  mkdirSync(dir, { recursive: true });
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(file, value) {
  writeFileSync(file, value, "utf8");
}

function toPosixRelative(file) {
  return path.relative(repoRoot, file).replaceAll(path.sep, "/");
}

function runCli(args, outputFile) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  writeText(outputFile, output);
  return {
    command: `node ${toPosixRelative(cliPath)} ${args.map(quoteArg).join(" ")}`,
    exitCode: result.status ?? 1,
    outputFile: toPosixRelative(outputFile),
    json: parseJsonOutput(result.stdout ?? output)
  };
}

function quoteArg(value) {
  return /\s/.test(value) ? JSON.stringify(value) : value;
}

function parseJsonOutput(output) {
  const text = output.trim();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(text.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function messageMapForScenario(scenario, loopNumber, improvementState) {
  const expressions = Array.isArray(scenario.requiredExpressions) && scenario.requiredExpressions.length > 0 ? scenario.requiredExpressions : ["summary", "table", "step"];
  const profile = qualityProfile(loopNumber, improvementState);
  const topics = normalizeTopics(scenario, profile);
  return {
    objective: scenario.purpose,
    audience: scenario.audience,
    desiredAction: scenario.purpose,
    intents: topics.map((topic, index) => {
      const expression = expressions[index % expressions.length];
      const visualType = visualTypeForExpression(expression, index, profile);
      if (!validVisualTypes.has(visualType)) {
        throw new Error(`Internal visualType mapping produced invalid value: ${visualType}`);
      }
      return {
        slideId: `s${String(index + 1).padStart(2, "0")}-${slug(topic)}`,
        title: titleForTopic(topic, profile),
        message: messageForTopic(topic, scenario, profile),
        evidence: evidenceForTopic(topic, scenario, expression, profile),
        quietInfo: [shorten(`tone: ${scenario.tone ?? "not specified"}`, 42), `loop: ${loopNumber}`, `profile: ${profile.name}`],
        visualType,
        emphasis: titleForTopic(topic, profile)
      };
    })
  };
}

function qualityProfile(loopNumber, improvementState) {
  const compactCopyLevel = Math.max(loopNumber >= 2 ? 1 : 0, improvementState.compactCopyLevel ?? 0);
  const expressionPolishLevel = improvementState.expressionPolishLevel ?? 0;
  return {
    name: [
      loopNumber <= 1 ? "baseline" : "adaptive",
      compactCopyLevel > 0 ? "compact-copy" : null,
      improvementState.forceExecutiveSummary ? "executive-summary" : null,
      improvementState.safeContrast ? "safe-contrast" : null,
      expressionPolishLevel > 0 ? `expression-polish-${expressionPolishLevel}` : null
    ].filter(Boolean).join("+"),
    includeExecutiveSummary: loopNumber >= 2 || Boolean(improvementState.forceExecutiveSummary),
    compactCopy: compactCopyLevel > 0,
    compactCopyLevel,
    evidenceMax: compactCopyLevel >= 2 ? 2 : compactCopyLevel >= 1 ? 3 : 4,
    titleMax: improvementState.shortenTitles ? 18 : compactCopyLevel > 0 ? 22 : 36,
    topicLimit: improvementState.reduceSlideDensity ? 7 : 10,
    safeContrast: Boolean(improvementState.safeContrast),
    expressionPolishLevel
  };
}

function normalizeTopics(scenario, profile) {
  const mustCover = Array.isArray(scenario.mustCover) ? scenario.mustCover.filter(Boolean) : [];
  const topics = mustCover.length >= 4 ? mustCover.slice(0, profile.topicLimit) : [...mustCover, "Overview", "Why it matters", "Options", "Next actions"].slice(0, Math.min(6, profile.topicLimit));
  const needsSummary = scenario.contentMode === "decision" || (scenario.requiredTools ?? []).includes("plan_business_deck");
  if ((needsSummary || profile.includeExecutiveSummary) && !topics.some((topic) => String(topic).toLowerCase().includes("executive"))) {
    return ["Executive Summary", ...topics].slice(0, profile.topicLimit);
  }
  return topics;
}

function visualTypeForExpression(expression, index, profile = {}) {
  const value = String(expression).toLowerCase();
  if ((profile.expressionPolishLevel ?? 0) >= 3 && (value.includes("structured") || value.includes("faq") || value.includes("detail"))) return "cards";
  if (value.includes("summary") || value.includes("overview") || value.includes("hero")) return "summary";
  if (value.includes("roi") || value.includes("kpi") || value.includes("table") || value.includes("dashboard") || value.includes("budget") || value.includes("cost") || value.includes("source")) return "table";
  if (value.includes("matrix") || value.includes("risk") || value.includes("comparison") || value.includes("competitive") || value.includes("radar") || value.includes("ranking") || value.includes("persona")) return "matrix";
  if (value.includes("before") || value.includes("after") || value.includes("contrast")) return "before-after";
  if (value.includes("roadmap") || value.includes("timeline") || value.includes("gantt") || value.includes("calendar") || value.includes("step") || value.includes("checklist")) return "step";
  if (value.includes("flow") || value.includes("workflow") || value.includes("funnel")) return "flow";
  if (value.includes("architecture") || value.includes("governance") || value.includes("repo") || value.includes("map") || value.includes("stakeholder") || value.includes("dependency")) return "native-diagram";
  if (value.includes("card") || value.includes("tip") || value.includes("story") || value.includes("photo") || value.includes("illustration")) return "cards";
  if (value.includes("detail") || value.includes("structured") || value.includes("faq")) return "detail";
  const rotation = ["summary", "flow", "table", "matrix", "step", "cards"];
  return rotation[index % rotation.length];
}

function titleForTopic(topic, profile = { titleMax: 36 }) {
  return String(topic)
    .replace(/[-_]+/g, " ")
    .replace(/^\w/, (match) => match.toUpperCase())
    .slice(0, profile.titleMax ?? 36);
}

function messageForTopic(topic, scenario, profile) {
  if (String(topic).toLowerCase().includes("executive")) {
    return "結論、重要性、次の判断を先に示す。";
  }
  if (profile.expressionPolishLevel >= 2) {
    return `${shorten(topic, 12)}の見方を一目で伝える。`;
  }
  if (profile.compactCopy) {
    return `${shorten(topic, 14)}を判断に使える形にする。`;
  }
  return `${shorten(topic, 18)}を整理し、次の判断材料にする。`;
}

function evidenceForTopic(topic, scenario, expression, profile) {
  const audience = profile.compactCopyLevel >= 2 ? audienceLabel(scenario.audience) : shorten(scenario.audience ?? "対象者", profile.compactCopy ? 18 : 28);
  const tone = shorten(scenario.tone ?? "標準", profile.compactCopy ? 12 : 20);
  return [
    `対象: ${audience}`,
    `観点: ${shorten(topic, profile.compactCopy ? 18 : 24)}`,
    `表現: ${shorten(expression, 18)}`,
    `口調: ${tone}`
  ].slice(0, profile.evidenceMax ?? 4);
}

function audienceLabel(audience) {
  const text = String(audience ?? "対象者").toLowerCase();
  if (/エンジニア|開発|developer|engineer/.test(text)) return "エンジニア";
  if (/経営|役員|意思決定|decision|executive/.test(text)) return "意思決定者";
  if (/営業|sales/.test(text)) return "営業";
  if (/自治体|行政|public sector/.test(text)) return "自治体";
  if (/投資|investor|vc/.test(text)) return "投資家";
  if (/顧客|customer/.test(text)) return "顧客";
  return shorten(audience ?? "対象者", 14);
}

function shorten(value, maxLength) {
  const text = String(value).replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, Math.max(1, maxLength - 1));
}

function slug(value) {
  const normalized = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return normalized || "topic";
}

function titleForScenario(scenario, loopNumber, profile = {}) {
  const maxLength = profile.shortenTitles ? 30 : profile.compactCopy ? 42 : 54;
  const base = String(scenario.userRequest ?? scenario.id).split("。")[0].replace(/を作ってください$/, "").slice(0, maxLength);
  return `L${String(loopNumber).padStart(2, "0")} ${base}`;
}

function styleForContentMode(contentMode, profile = {}) {
  if (profile.safeContrast) {
    return "report";
  }
  switch (contentMode) {
    case "presentation":
      return "presentation";
    case "technical":
      return "technical";
    case "decision":
      return "stylish";
    case "handout":
    case "report":
    default:
      return "report";
  }
}

function runScenario(scenario, loopNumber, loopDir, improvementState) {
  const scenarioDir = path.join(loopDir, scenario.id);
  ensureDirectory(scenarioDir);

  const scenarioFile = path.join(scenarioDir, "scenario.json");
  const messageMapFile = path.join(scenarioDir, "message-map.json");
  const deckFile = path.join(scenarioDir, "deck.json");
  const polishedFile = path.join(scenarioDir, "polished.deck.json");
  const pptxFile = path.join(scenarioDir, "deck.pptx");
  const studioFile = path.join(scenarioDir, "studio.html");

  const messageMap = messageMapForScenario(scenario, loopNumber, improvementState);
  const profile = qualityProfile(loopNumber, improvementState);
  writeJson(scenarioFile, scenario);
  writeJson(messageMapFile, messageMap);

  const commands = [];

  if (Array.isArray(scenario.requiredExpressions)) {
    scenario.requiredExpressions.forEach((expression, index) => {
      commands.push(runCli([
        "figure",
        "--kind",
        String(expression),
        "--message",
        `${scenario.purpose ?? scenario.userRequest} ${expression}`,
        "--items",
        String(Math.max(3, Math.min(8, (scenario.mustCover ?? []).length || 4))),
        "--json"
      ], path.join(scenarioDir, `figure-${String(index + 1).padStart(2, "0")}.json`)));
    });
  }

  if (Array.isArray(scenario.requiredTools) && scenario.requiredTools.includes("plan_business_deck")) {
    commands.push(runCli([
      "business-plan",
      "--locale",
      "ja-JP",
      "--topic",
      titleForScenario(scenario, loopNumber, profile),
      "--purpose",
      scenario.purpose ?? scenario.userRequest,
      "--audience",
      scenario.audience ?? "未指定",
      "--desired-action",
      scenario.purpose ?? "次の判断へ進む",
      "--slides",
      String(scenario.suggestedSlideCount ?? 8),
      "--important-meeting",
      "--json",
      "--output",
      path.join(scenarioDir, "business-plan.json")
    ], path.join(scenarioDir, "business-plan.stdout.txt")));
  }

  commands.push(runCli([
    "from-message-map",
    messageMapFile,
    "--title",
    titleForScenario(scenario, loopNumber, profile),
    "--locale",
    "ja-JP",
    "--content-mode",
    scenario.contentMode ?? "report",
    "--style",
    styleForContentMode(scenario.contentMode, profile),
    "--output",
    deckFile,
    "--json"
  ], path.join(scenarioDir, "from-message-map.stdout.txt")));

  commands.push(runCli([
    "finalize",
    deckFile,
    "--output",
    pptxFile,
    "--polished-out",
    polishedFile,
    "--force",
    "--json"
  ], path.join(scenarioDir, "finalize.txt")));

  const reviewTarget = existsSync(polishedFile) ? polishedFile : deckFile;
  commands.push(runCli([
    "review",
    reviewTarget,
    "--json"
  ], path.join(scenarioDir, "review.txt")));

  commands.push(runCli([
    "studio",
    reviewTarget,
    "--output",
    studioFile
  ], path.join(scenarioDir, "studio.txt")));

  const zip = existsSync(pptxFile) ? inspectZip(pptxFile) : { exists: false, zeroNonDir: null, entries: 0 };
  const hashes = {
    deckJson: fileHashIfExists(deckFile),
    polishedDeckJson: fileHashIfExists(polishedFile),
    pptx: fileHashIfExists(pptxFile)
  };
  const evalReport = evaluateScenario(scenario, loopNumber, commands, zip, hashes);
  const userReport = {
    role: "User Simulator",
    scenarioId: scenario.id,
    loop: loopNumber,
    model: "host-selected",
    artifacts: artifactList(scenarioDir),
    commands: commands.map(({ command, exitCode, outputFile }) => ({ command, exitCode, outputFile })),
    blockingIssues: evalReport.patchRequests.filter((request) => request.severity === "critical" || request.severity === "high"),
    notes: [`Generated from realistic userRequest: ${scenario.userRequest}`]
  };

  writeJson(path.join(scenarioDir, "tool-ledger.json"), { commands });
  writeJson(path.join(scenarioDir, "user-report.json"), userReport);
  writeJson(path.join(scenarioDir, "eval-report.json"), evalReport);
  writeText(path.join(scenarioDir, "eval-summary.md"), evalSummaryMarkdown(evalReport));
  writeJson(path.join(scenarioDir, "improvement-state.json"), improvementState);

  return {
    scenarioId: scenario.id,
    directory: toPosixRelative(scenarioDir),
    patchRequestCount: evalReport.patchRequests.length,
    highOrCriticalCount: evalReport.patchRequests.filter((request) => request.severity === "critical" || request.severity === "high").length,
    expressionCraft: evalReport.scores.expressionCraft,
    expressionFingerprint: evalReport.deterministic.expressionCraft?.fingerprint,
    hashes
  };
}

function artifactList(dir) {
  const files = ["scenario.json", "message-map.json", "deck.json", "polished.deck.json", "deck.pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json", "eval-report.json"];
  return files.filter((file) => existsSync(path.join(dir, file))).map((file) => toPosixRelative(path.join(dir, file)));
}

function evaluateScenario(scenario, loopNumber, commands, zip, hashes) {
  const patchRequests = [];
  const failedCommands = commands.filter((command) => command.exitCode !== 0 && !isExpectedStructuredNonZero(command));
  for (const failed of failedCommands) {
    patchRequests.push({
      severity: "critical",
      problem: "A required pptcreater CLI command failed during scenario generation.",
      evidence: `${failed.command} exited ${failed.exitCode}; see ${failed.outputFile}`,
      expected: "Scenario artifacts should be generated without command failures.",
      suggestedScope: ["packages/cli", "packages/core", "packages/render-pptx"]
    });
  }

  if (zip.exists && zip.zeroNonDir !== 0) {
    patchRequests.push({
      severity: "critical",
      problem: "Rendered PPTX has zero-length non-directory zip entries.",
      evidence: `zeroNonDir=${zip.zeroNonDir}; entries=${zip.entries}`,
      expected: "PPTX zip integrity should have zeroNonDir=0.",
      suggestedScope: ["packages/render-pptx"]
    });
  }

  const finalizeJson = lastJsonForCommand(commands, "finalize");
  const reviewJson = lastJsonForCommand(commands, "review");
  const deckJson = loadJsonIfExists(findScenarioArtifact(commands, "from-message-map", "deck.json"));
  const expressionCraft = evaluateExpressionCraft(deckJson, scenario);
  const reviewBlocking = reviewJson?.blocking?.length ?? reviewJson?.blockingIssues?.length ?? 0;
  const reviewOk = reviewJson?.ok ?? (reviewBlocking === 0);
  if (!reviewOk || reviewBlocking > 0) {
    patchRequests.push({
      severity: "high",
      problem: "Aggregated review found blocking issues.",
      evidence: `blocking=${reviewBlocking}; see review.txt`,
      expected: "Review should report ok=true with no blocking issues for generated scenarios.",
      suggestedScope: ["packages/core/src/lint.ts", "packages/core/src/director.ts", "packages/core/src/messageDeck.ts"]
    });
  }

  const requiredTools = new Set(scenario.requiredTools ?? []);
  const commandText = commands.map((command) => command.command).join("\n");
  const missingRequiredTools = [...requiredTools].filter((tool) => !toolCovered(tool, commandText));
  if (missingRequiredTools.length > 0) {
    patchRequests.push({
      severity: "medium",
      problem: "Scenario required tools were not fully exercised by the deterministic runner.",
      evidence: `missing=${missingRequiredTools.join(", ")}`,
      expected: "The loop runner or User Simulator should exercise every ScenarioSpec.requiredTools entry or record a justified waiver.",
      suggestedScope: ["scripts/run-dev-loop.mjs", "docs/dev-loop-test-scenarios.md", ".github/agents/pptcreater-dev-user.agent.md"]
    });
  }

  const sourceExpected = requiredTools.has("source-check") || (scenario.requiredExpressions ?? []).some((expression) => String(expression).includes("source"));
  if (sourceExpected && !existsSync(path.join(repoRoot, "generated"))) {
    // This branch is intentionally unreachable in normal repo runs; it keeps the source-check warning explicit.
  }
  if (sourceExpected) {
    patchRequests.push({
      severity: "medium",
      problem: "Source-backed scenario needs live source verification that the deterministic runner cannot infer from placeholders.",
      evidence: "Scenario expects source-check or source-note; generated message-map contains no live URLs.",
      expected: "User Simulator should collect official source URLs and record source-check.txt for source-backed decks.",
      suggestedScope: ["scripts/run-dev-loop.mjs", "docs/dev-loop-test-scenarios.md"]
    });
  }

  if (expressionCraft.score < 3) {
    patchRequests.push({
      severity: "medium",
      problem: "Generated deck lacks scenario-specific expressive craft.",
      evidence: expressionCraft.evidence,
      expected: "Decks should vary their expressive strategy by scenario, using sample-derived tactics such as anchored realism, focal proof, spatial models, deliberate repetition, deck rhythm, or brand materiality.",
      suggestedScope: ["packages/core/src/messageDeck.ts", "packages/core/src/visualQuality.ts", "scripts/run-dev-loop.mjs", ".github/agents/pptcreater-dev-evaluator.agent.md"]
    });
  }

  const toolCoverage = requiredTools.size === 0 ? 5 : Math.max(0, Math.round(((requiredTools.size - missingRequiredTools.length) / requiredTools.size) * 5));
  const commandScore = failedCommands.length === 0 ? 5 : 1;
  const reviewScore = reviewOk ? 4 : 2;
  const zipScore = !zip.exists ? 1 : zip.zeroNonDir === 0 ? 5 : 0;

  return {
    role: "Evaluator",
    model: "Opus4.8",
    scenarioId: scenario.id,
    loop: loopNumber,
    deterministic: {
      commandFailures: failedCommands.length,
      reviewOk,
      reviewBlocking,
      zip,
      hashes,
      expressionCraft,
      finalize: summarizeJson(finalizeJson),
      review: summarizeJson(reviewJson)
    },
    scores: {
      messageFit: reviewScore,
      visualFit: reviewScore,
      expressionCraft: expressionCraft.score,
      editability: Math.min(reviewScore, zipScore),
      accessibility: reviewJson?.scores?.accessibility ? Math.round(reviewJson.scores.accessibility / 20) : reviewScore,
      toolDiscipline: Math.min(toolCoverage, commandScore)
    },
    patchRequests,
    residualRisks: patchRequests.length === 0 ? [] : ["Review generated artifacts manually in PowerPoint/Studio before accepting visual quality."]
  };
}

function findScenarioArtifact(commands, commandName, fallbackName) {
  const command = commands.find((entry) => entry.command.includes(` ${commandName} `));
  if (!command?.outputFile) {
    return null;
  }
  return path.join(repoRoot, path.dirname(command.outputFile), fallbackName);
}

function loadJsonIfExists(file) {
  if (!file || !existsSync(file)) {
    return null;
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

function evaluateExpressionCraft(deck, scenario) {
  if (!deck?.slides) {
    return { score: 1, evidence: "deck.json was not available for expression craft evaluation." };
  }

  const bodySlides = deck.slides.filter((slide) => !["cover", "title", "section", "divider", "closing", "references"].includes(slide.layout ?? ""));
  const layouts = bodySlides.map((slide) => slide.layout ?? "unknown");
  const fingerprint = layouts.join(" > ");
  const layoutCounts = countBy(layouts);
  const dominantLayoutShare = bodySlides.length ? Math.max(...Object.values(layoutCounts)) / bodySlides.length : 1;
  const slidesWithLargeMedia = bodySlides.filter(hasLargeMedia).length;
  const slidesWithFocalProof = bodySlides.filter(hasFocalProof).length;
  const slidesWithSpatialModel = bodySlides.filter(hasSpatialModel).length;
  const slidesWithDeliberateRepetition = bodySlides.filter(hasDeliberateRepetition).length;
  const layoutDiversity = Object.keys(layoutCounts).length;

  const scenarioText = [scenario.purpose, scenario.audience, scenario.userRequest, ...(scenario.requiredExpressions ?? [])].join(" ").toLowerCase();
  const wantsAnchoredRealism = /採用|会社|事例|顧客|製品|現場|office|customer|product|case|recruit/.test(scenarioText);
  const wantsFocalProof = /kpi|roi|売上|数字|指標|実績|効果|比較|データ|budget|finance/.test(scenarioText);
  const wantsSpatialModel = /プロセス|関係|構造|アーキテクチャ|移行|ロードマップ|journey|workflow|architecture|roadmap/.test(scenarioText);

  let score = 2;
  if (layoutDiversity >= Math.min(4, bodySlides.length)) score += 1;
  if (dominantLayoutShare <= 0.45) score += 1;
  if (slidesWithLargeMedia > 0 || !wantsAnchoredRealism) score += 0.5;
  if (slidesWithFocalProof > 0 || !wantsFocalProof) score += 0.5;
  if (slidesWithSpatialModel > 0 || !wantsSpatialModel) score += 0.5;
  if (slidesWithDeliberateRepetition > 0) score += 0.5;
  score = Math.max(1, Math.min(5, Math.round(score)));

  const missing = [];
  if (layoutDiversity < Math.min(4, bodySlides.length)) missing.push("deck rhythm / layout diversity");
  if (dominantLayoutShare > 0.45) missing.push(`dominant layout share ${dominantLayoutShare.toFixed(2)}`);
  if (wantsAnchoredRealism && slidesWithLargeMedia === 0) missing.push("anchored realism: no large photo/image/product visual");
  if (wantsFocalProof && slidesWithFocalProof === 0) missing.push("focal proof: no large KPI/number proof slide");
  if (wantsSpatialModel && slidesWithSpatialModel === 0) missing.push("spatial model: no map/flow/matrix/diagram/step spatial explanation");

  return {
    score,
    fingerprint,
    evidence: `expressionCraft=${score}/5; bodySlides=${bodySlides.length}; layoutDiversity=${layoutDiversity}; dominantLayoutShare=${dominantLayoutShare.toFixed(2)}; largeMedia=${slidesWithLargeMedia}; focalProof=${slidesWithFocalProof}; spatialModel=${slidesWithSpatialModel}; deliberateRepetition=${slidesWithDeliberateRepetition}; missing=${missing.join("; ") || "none"}`
  };
}

function countBy(values) {
  return values.reduce((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function hasLargeMedia(slide) {
  return (slide.elements ?? []).some((element) => ["image", "svg", "diagram"].includes(element.type) && element.w >= 3.5 && element.h >= 2.2 && !element.decorative);
}

function hasFocalProof(slide) {
  return (slide.elements ?? []).some((element) => element.type === "text" && (element.fontSize ?? 0) >= 28 && /\d|%|倍|億|万|円|pt|ポイント/u.test(element.text ?? ""));
}

function hasSpatialModel(slide) {
  const layout = slide.layout ?? "";
  return /flow|matrix|map|diagram|step|journey|architecture|before-after/u.test(layout);
}

function hasDeliberateRepetition(slide) {
  const cards = (slide.elements ?? []).filter((element) => element.type === "shape" && ["roundRect", "roundedRect", "rect"].includes(element.shape) && element.w >= 1.5 && element.h >= 0.8);
  return cards.length >= 3;
}

function lastJsonForCommand(commands, name) {
  const found = [...commands].reverse().find((command) => command.command.includes(` ${name} `) || command.command.endsWith(` ${name}`));
  return found?.json ?? null;
}

function summarizeJson(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return {
    ok: value.ok,
    scores: value.scores,
    blocking: Array.isArray(value.blocking) ? value.blocking.length : undefined,
    warnings: Array.isArray(value.warnings) ? value.warnings.length : undefined,
    blockingErrors: Array.isArray(value.blockingErrors) ? value.blockingErrors.length : undefined,
    polishFixable: Array.isArray(value.polishFixable) ? value.polishFixable.length : undefined
  };
}

function toolCovered(tool, commandText) {
  const normalized = tool.replaceAll("_", "-").toLowerCase();
  const aliases = {
    rules: [" rules"],
    recommend_template: ["recommend-template", " template", " from-message-map", " new"],
    recommend_figure: [" figure"],
    generate_schematic: [" schematic", "from-message-map"],
    render_design_component: [" design render", "from-message-map"],
    generate_native_diagram: [" diagram-native", "from-message-map"],
    generate_visual_scaffold: [" visual-scaffold", "from-message-map"],
    plan_business_deck: [" business-plan"],
    finalize: [" finalize"],
    review: [" review"],
    polish: [" polish", " finalize"],
    source_check: ["source-check"],
    source: ["source-check"],
    pptx_zip_check: ["zip-check"],
    "pptx-zip-check": ["zip-check"]
  };
  const candidates = aliases[tool] ?? aliases[normalized] ?? [` ${normalized}`];
  return candidates.some((candidate) => commandText.toLowerCase().includes(candidate));
}

function inspectZip(file) {
  const bytes = readFileSync(file);
  let eocd = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 66000); index -= 1) {
    if (bytes.readUInt32LE(index) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) {
    return { exists: true, valid: false, entries: 0, zeroNonDir: null, size: bytes.length };
  }
  const entries = bytes.readUInt16LE(eocd + 10);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  let cursor = centralOffset;
  let zeroNonDir = 0;
  for (let entry = 0; entry < entries; entry += 1) {
    if (bytes.readUInt32LE(cursor) !== 0x02014b50) {
      break;
    }
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    if (!name.endsWith("/") && compressedSize === 0 && uncompressedSize === 0) {
      zeroNonDir += 1;
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return { exists: true, valid: true, entries, zeroNonDir, size: bytes.length };
}

function fileHashIfExists(file) {
  if (!existsSync(file) || !statSync(file).isFile()) {
    return null;
  }
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function evalSummaryMarkdown(report) {
  const lines = [`# Eval Summary: ${report.scenarioId}`, "", `Loop: ${report.loop}`, "", "## Scores", ""];
  for (const [key, value] of Object.entries(report.scores)) {
    lines.push(`- ${key}: ${value}/5`);
  }
  lines.push("", "## Patch Requests", "");
  if (report.patchRequests.length === 0) {
    lines.push("- None");
  } else {
    report.patchRequests.forEach((request, index) => {
      lines.push(`${index + 1}. **${request.severity}** ${request.problem}`);
      lines.push(`   Evidence: ${request.evidence}`);
      lines.push(`   Expected: ${request.expected}`);
    });
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function createLoopQaReport(loopNumber, maxLoops, scenarioResults) {
  const highOrCritical = scenarioResults.reduce((sum, result) => sum + result.highOrCriticalCount, 0);
  const patchRequests = scenarioResults.reduce((sum, result) => sum + result.patchRequestCount, 0);
  const expressionCraftAverage = scenarioResults.length
    ? scenarioResults.reduce((sum, result) => sum + (result.expressionCraft ?? 0), 0) / scenarioResults.length
    : 0;
  const fingerprintCounts = countBy(scenarioResults.map((result) => result.expressionFingerprint).filter(Boolean));
  const repeatedFingerprintCount = Object.values(fingerprintCounts).filter((count) => count > 1).reduce((sum, count) => sum + count, 0);
  const repeatedFingerprintShare = scenarioResults.length ? repeatedFingerprintCount / scenarioResults.length : 0;
  const decision = loopNumber >= maxLoops ? "stop" : "continue";
  return {
    role: "QA Gatekeeper",
    model: "Opus4.8",
    loop: loopNumber,
    decision,
    exitCriteria: {
      type: "loop-count",
      current: loopNumber,
      target: maxLoops,
      met: loopNumber >= maxLoops
    },
    reasons: decision === "stop" ? [`Loop count reached ${maxLoops}.`] : [`Loop count ${loopNumber}/${maxLoops}; continue.`],
    patchRequestCount: patchRequests,
    highOrCriticalCount: highOrCritical,
    expressionCraft: {
      average: Number(expressionCraftAverage.toFixed(2)),
      repeatedFingerprintShare: Number(repeatedFingerprintShare.toFixed(2)),
      repeatedFingerprints: Object.fromEntries(Object.entries(fingerprintCounts).filter(([, count]) => count > 1))
    },
    requiredNextWork: decision === "stop" ? [] : ["Apply dev-lead-plan.json to the next loop generation profile."],
    acceptedRisks: [
      ...(decision === "stop" && patchRequests > 0 ? ["Exit criterion is count-only for this run; outstanding PatchRequests remain for later development review."] : []),
      ...(repeatedFingerprintShare >= 0.5 ? ["Multiple scenarios share similar layout fingerprints; expression diversity should be improved in a future Dev Lead pass."] : [])
    ]
  };
}

function writeRunIndex(runDir, loops) {
  const lines = ["# Dev Loop Run", "", `Run directory: ${toPosixRelative(runDir)}`, "", "## Loops", ""];
  for (const loop of loops) {
    lines.push(`- [Loop ${String(loop.loop).padStart(2, "0")}](${path.posix.join(`loop-${String(loop.loop).padStart(2, "0")}`, "qa-report.json")}) - decision: ${loop.qa.decision}, patches: ${loop.qa.patchRequestCount}, high/critical: ${loop.qa.highOrCriticalCount}`);
  }
  lines.push("", "Review each loop directory to compare scenario outputs across iterations. Each scenario folder contains `deck.pptx`, `studio.html`, and `eval-summary.md`.", "");
  writeText(path.join(runDir, "index.md"), lines.join("\n"));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const scenarios = selectScenarios(readScenarios(), options.scenarios);
  const runDir = path.resolve(repoRoot, options.output);
  if (existsSync(runDir) && !options.force) {
    throw new Error(`Output directory already exists: ${runDir}. Use --force or choose another --output.`);
  }
  ensureDirectory(runDir);

  const runStartedAt = new Date().toISOString();
  const loopSummaries = [];
  let improvementState = initialImprovementState();
  writeJson(path.join(runDir, "run-config.json"), {
    startedAt: runStartedAt,
    loops: options.loops,
    scenarioCount: scenarios.length,
    scenarios: scenarios.map((scenario) => scenario.id),
    exitCriteria: { type: "loop-count", target: options.loops }
  });

  for (let loop = 1; loop <= options.loops; loop += 1) {
    const loopDir = path.join(runDir, `loop-${String(loop).padStart(2, "0")}`);
    ensureDirectory(loopDir);
    writeJson(path.join(loopDir, "input-improvement-state.json"), improvementState);
    const scenarioResults = scenarios.map((scenario) => runScenario(scenario, loop, loopDir, improvementState));
    const qa = createLoopQaReport(loop, options.loops, scenarioResults);
    const devLeadPlan = createDevLeadPlan(loop, options.loops, loopDir, qa, improvementState);
    const nextImprovementState = loop < options.loops ? applyDevLeadPlan(improvementState, devLeadPlan) : improvementState;
    writeJson(path.join(loopDir, "qa-report.json"), qa);
    writeJson(path.join(loopDir, "dev-lead-plan.json"), devLeadPlan);
    writeText(path.join(loopDir, "dev-lead-plan.md"), devLeadPlanMarkdown(devLeadPlan));
    writeJson(path.join(loopDir, "next-improvement-state.json"), nextImprovementState);
    writeJson(path.join(loopDir, "loop-summary.json"), { loop, scenarioResults, qa, devLeadPlan, nextImprovementState });
    loopSummaries.push({ loop, scenarioResults, qa, devLeadPlan, nextImprovementState });
    improvementState = nextImprovementState;
    console.log(`Loop ${loop}/${options.loops}: ${scenarioResults.length} scenarios, patches=${qa.patchRequestCount}, highOrCritical=${qa.highOrCriticalCount}, decision=${qa.decision}, actions=${devLeadPlan.actions.length}`);
  }

  const finalQa = loopSummaries.at(-1)?.qa ?? null;
  writeJson(path.join(runDir, "final-qa-report.json"), finalQa);
  writeJson(path.join(runDir, "run-summary.json"), {
    startedAt: runStartedAt,
    finishedAt: new Date().toISOString(),
    loops: loopSummaries,
    finalQa,
    finalImprovementState: improvementState
  });
  writeRunIndex(runDir, loopSummaries);
  console.log(`Run artifacts written to ${toPosixRelative(runDir)}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
}

function isExpectedStructuredNonZero(command) {
  if (!command.json) {
    return false;
  }
  return command.command.includes(" review ") || command.command.includes(" finalize ");
}

function initialImprovementState() {
  return {
    forceExecutiveSummary: false,
    compactCopyLevel: 0,
    safeContrast: false,
    shortenTitles: false,
    reduceSlideDensity: false,
    expressionPolishLevel: 0,
    appliedActions: []
  };
}

function collectBlockingCodes(loopDir) {
  const counts = new Map();
  for (const scenarioDir of readdirDirectories(loopDir)) {
    const reviewPath = path.join(scenarioDir, "review.txt");
    if (!existsSync(reviewPath)) {
      continue;
    }
    const review = parseJsonOutput(readFileSync(reviewPath, "utf8"));
    for (const issue of [...(review?.blocking ?? []), ...(review?.blockingIssues ?? [])]) {
      counts.set(issue.code, (counts.get(issue.code) ?? 0) + 1);
    }
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function readdirDirectories(dir) {
  return existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => path.join(dir, entry.name)) : [];
}

function createDevLeadPlan(loopNumber, maxLoops, loopDir, qa, currentState) {
  const blockingCodes = collectBlockingCodes(loopDir);
  const actions = [];

  if ((blockingCodes["business.executive-summary-missing"] ?? 0) > 0 && !currentState.forceExecutiveSummary) {
    actions.push({
      id: "force-executive-summary",
      kind: "bugfix",
      reason: "Business review repeatedly expects an early executive summary for important decks.",
      changes: { forceExecutiveSummary: true }
    });
  }

  if ((blockingCodes["visual.truncated-text"] ?? 0) > 0 || (blockingCodes["layout.compact-label-wrap"] ?? 0) > 0) {
    actions.push({
      id: "compact-copy-and-labels",
      kind: "bugfix+expression-improvement",
      reason: "Text truncation and label wrapping indicate the generated copy is too dense for the chosen visual grammar.",
      changes: {
        compactCopyLevel: Math.min(3, Math.max(currentState.compactCopyLevel ?? 0, 1) + 1),
        reduceSlideDensity: true
      }
    });
  }

  if ((blockingCodes["text.low-contrast"] ?? 0) > 0 && !currentState.safeContrast) {
    actions.push({
      id: "safe-contrast-style",
      kind: "bugfix",
      reason: "Low contrast findings mean the next loop should prefer a safer high-contrast style profile.",
      changes: { safeContrast: true }
    });
  }

  if ((blockingCodes["content.title-too-long"] ?? 0) > 0 && !currentState.shortenTitles) {
    actions.push({
      id: "shorten-slide-titles",
      kind: "bugfix+expression-improvement",
      reason: "Long titles reduce scanability and trigger content review blockers.",
      changes: { shortenTitles: true }
    });
  }

  actions.push({
    id: "increase-expression-polish",
    kind: "expression-improvement",
    reason: "Every loop should improve not just correctness but also clarity, scanability, and visual presentation.",
    changes: { expressionPolishLevel: Math.min(5, (currentState.expressionPolishLevel ?? 0) + 1) }
  });

  return {
    role: "Development Lead",
    loop: loopNumber,
    model: "host-selected",
    qaDecision: qa.decision,
    exitCriteriaMet: qa.exitCriteria.met,
    blockingCodes,
    actions,
    nextLoopWillApply: loopNumber < maxLoops,
    risks: actions.length === 0 ? ["No automatic improvement actions were selected."] : []
  };
}

function applyDevLeadPlan(currentState, plan) {
  const nextState = {
    ...currentState,
    appliedActions: [...(currentState.appliedActions ?? [])]
  };
  for (const action of plan.actions ?? []) {
    Object.assign(nextState, action.changes ?? {});
    nextState.appliedActions.push({ loop: plan.loop, id: action.id, kind: action.kind, changes: action.changes });
  }
  return nextState;
}

function devLeadPlanMarkdown(plan) {
  const lines = ["# Dev Lead Plan", "", `Loop: ${plan.loop}`, "", "## Blocking Codes", ""];
  const entries = Object.entries(plan.blockingCodes ?? {});
  if (entries.length === 0) {
    lines.push("- none");
  } else {
    for (const [code, count] of entries) {
      lines.push(`- \`${code}\`: ${count}`);
    }
  }
  lines.push("", "## Actions", "");
  for (const action of plan.actions ?? []) {
    lines.push(`- **${action.kind}** \`${action.id}\`: ${action.reason}`);
  }
  lines.push("", `Next loop will apply: ${plan.nextLoopWillApply}`, "");
  return `${lines.join("\n")}\n`;
}