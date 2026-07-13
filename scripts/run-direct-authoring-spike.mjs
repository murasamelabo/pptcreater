import path from "node:path";
import process from "node:process";
import { renderDirectAuthoringSpike } from "../packages/authoring-contracts/dist/index.js";

const sourceMarkdownPath = process.argv[2];
const outputPath = process.argv[3] ?? path.resolve("generated/direct-authoring-spike.pptx");
if (!sourceMarkdownPath) {
  console.error("Usage: node scripts/run-direct-authoring-spike.mjs <source.md> [output.pptx]");
  process.exit(1);
}

const result = await renderDirectAuthoringSpike({
  sourceMarkdownPath: path.resolve(sourceMarkdownPath),
  outputPath: path.resolve(outputPath),
  title: "Direct Authoring Architecture Spike"
});
console.log(JSON.stringify(result, null, 2));
