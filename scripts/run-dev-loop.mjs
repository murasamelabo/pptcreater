#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
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

function messageMapForScenario(scenario, loopNumber) {
  const topics = normalizeTopics(scenario);
  const expressions = Array.isArray(scenario.requiredExpressions) && scenario.requiredExpressions.length > 0 ? scenario.requiredExpressions : ["summary", "table", "step"];
  const profile = qualityProfile(loopNumber);
  return {
    objective: scenario.purpose,
    audience: scenario.audience,
    desiredAction: scenario.purpose,
    intents: topics.map((topic, index) => {
      const expression = expressions[index % expressions.length];
      const visualType = visualTypeForExpression(expression, index);
      if (!validVisualTypes.has(visualType)) {
        throw new Error(`Internal visualType mapping produced invalid value: ${visualType}`);
      }
      return {
        slideId: `s${String(index + 1).padStart(2, "0")}-${slug(topic)}`,
        title: titleForTopic(topic),
        message: messageForTopic(topic, scenario, profile),
        evidence: evidenceForTopic(topic, scenario, expression, profile),
        quietInfo: [shorten(`tone: ${scenario.tone ?? "not specified"}`, 42), `loop: ${loopNumber}`, `profile: ${profile.name}`],
        visualType,
        emphasis: titleForTopic(topic)
      };
    })
  };
}

function qualityProfile(loopNumber) {
  return {
    name: loopNumber <= 1 ? "baseline" : "executive-compact-copy",
    includeExecutiveSummary: loopNumber >= 2,
    compactCopy: loopNumber >= 2
  };
}

function normalizeTopics(scenario) {
  const mustCover = Array.isArray(scenario.mustCover) ? scenario.mustCover.filter(Boolean) : [];
  const topics = mustCover.length >= 4 ? mustCover.slice(0, 10) : [...mustCover, "Overview", "Why it matters", "Options", "Next actions"].slice(0, 6);
  const needsSummary = scenario.contentMode === "decision" || (scenario.requiredTools ?? []).includes("plan_business_deck");
  if (needsSummary && !topics.some((topic) => String(topic).toLowerCase().includes("executive"))) {
    return ["Executive Summary", ...topics].slice(0, 10);
  }
  return topics;
}

function visualTypeForExpression(expression, index) {
  const value = String(expression).toLowerCase();
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

function titleForTopic(topic) {
  return String(topic)
    .replace(/[-_]+/g, " ")
    .replace(/^\w/, (match) => match.toUpperCase())
    .slice(0, 36);
}

function messageForTopic(topic, scenario, profile) {
  if (String(topic).toLowerCase().includes("executive")) {
    return "結論、重要性、次の判断を先に示す。";
  }
  if (profile.compactCopy) {
    return `${shorten(topic, 14)}を判断に使える形にする。`;
  }
  return `${shorten(topic, 18)}を整理し、次の判断材料にする。`;
}

function evidenceForTopic(topic, scenario, expression, profile) {
  const audience = shorten(scenario.audience ?? "対象者", profile.compactCopy ? 18 : 28);
  const tone = shorten(scenario.tone ?? "標準", profile.compactCopy ? 12 : 20);
  return [
    `対象: ${audience}`,
    `観点: ${shorten(topic, profile.compactCopy ? 16 : 24)}`,
    `表現: ${shorten(expression, 18)}`,
    `口調: ${tone}`
  ];
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

function titleForScenario(scenario, loopNumber) {
  const base = String(scenario.userRequest ?? scenario.id).split("。")[0].replace(/を作ってください$/, "").slice(0, 54);
  return `L${String(loopNumber).padStart(2, "0")} ${base}`;
}

function styleForContentMode(contentMode) {
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

function runScenario(scenario, loopNumber, loopDir) {
  const scenarioDir = path.join(loopDir, scenario.id);
  ensureDirectory(scenarioDir);

  const scenarioFile = path.join(scenarioDir, "scenario.json");
  const messageMapFile = path.join(scenarioDir, "message-map.json");
  const deckFile = path.join(scenarioDir, "deck.json");
  const polishedFile = path.join(scenarioDir, "polished.deck.json");
  const pptxFile = path.join(scenarioDir, "deck.pptx");
  const studioFile = path.join(scenarioDir, "studio.html");

  const messageMap = messageMapForScenario(scenario, loopNumber);
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
      titleForScenario(scenario, loopNumber),
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
    titleForScenario(scenario, loopNumber),
    "--locale",
    "ja-JP",
    "--content-mode",
    scenario.contentMode ?? "report",
    "--style",
    styleForContentMode(scenario.contentMode),
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

  return {
    scenarioId: scenario.id,
    directory: toPosixRelative(scenarioDir),
    patchRequestCount: evalReport.patchRequests.length,
    highOrCriticalCount: evalReport.patchRequests.filter((request) => request.severity === "critical" || request.severity === "high").length,
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
      finalize: summarizeJson(finalizeJson),
      review: summarizeJson(reviewJson)
    },
    scores: {
      messageFit: reviewScore,
      visualFit: reviewScore,
      editability: Math.min(reviewScore, zipScore),
      accessibility: reviewJson?.scores?.accessibility ? Math.round(reviewJson.scores.accessibility / 20) : reviewScore,
      toolDiscipline: Math.min(toolCoverage, commandScore)
    },
    patchRequests,
    residualRisks: patchRequests.length === 0 ? [] : ["Review generated artifacts manually in PowerPoint/Studio before accepting visual quality."]
  };
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
    requiredNextWork: decision === "stop" ? [] : ["Review eval-report.json files and decide whether Dev Lead should patch tool behavior before the next loop."],
    acceptedRisks: decision === "stop" && patchRequests > 0 ? ["Exit criterion is count-only for this run; outstanding PatchRequests remain for later development review."] : []
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
    const scenarioResults = scenarios.map((scenario) => runScenario(scenario, loop, loopDir));
    const qa = createLoopQaReport(loop, options.loops, scenarioResults);
    writeJson(path.join(loopDir, "qa-report.json"), qa);
    writeJson(path.join(loopDir, "loop-summary.json"), { loop, scenarioResults, qa });
    loopSummaries.push({ loop, scenarioResults, qa });
    console.log(`Loop ${loop}/${options.loops}: ${scenarioResults.length} scenarios, patches=${qa.patchRequestCount}, highOrCritical=${qa.highOrCriticalCount}, decision=${qa.decision}`);
  }

  const finalQa = loopSummaries.at(-1)?.qa ?? null;
  writeJson(path.join(runDir, "final-qa-report.json"), finalQa);
  writeJson(path.join(runDir, "run-summary.json"), {
    startedAt: runStartedAt,
    finishedAt: new Date().toISOString(),
    loops: loopSummaries,
    finalQa
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