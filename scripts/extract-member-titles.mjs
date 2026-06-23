import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const zip = await JSZip.loadAsync(await readFile(resolve(root, "design-packs/zukai/zukai-patterns-full.pptx")));
const manifest = JSON.parse(await readFile(resolve(root, "design-packs/zukai/manifest.json"), "utf8"));

// Member-title fills: dark navy (white cards) and white (colored cards).
const TITLE_FILLS = new Set(["16243B", "FFFFFF"]);

function decode(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function extractTitles(xml) {
  const re = /<p:sp>([\s\S]*?)<\/p:sp>/g;
  let m;
  const out = [];
  while ((m = re.exec(xml))) {
    const body = m[1];
    const off = /<a:off x="(-?\d+)" y="(-?\d+)"/.exec(body);
    const ext = /<a:ext cx="(-?\d+)" cy="(-?\d+)"/.exec(body);
    const fill = (/<a:solidFill><a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(body) || [])[1] || "";
    const texts = [...body.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((z) => decode(z[1])).join("");
    if (!texts) continue;
    const x = Number(off?.[1] ?? 0);
    const y = Number(off?.[2] ?? 0);
    const cx = Number(ext?.[1] ?? 0);
    const cy = Number(ext?.[2] ?? 0);
    const t = texts.trim();
    // Exclusions
    if (/^\d{1,2}$/.test(t)) continue; // number badge
    if (/^STEP\s*\d+$/i.test(t)) continue;
    if (/^P\d+$/.test(t)) continue; // pattern badge
    if (y < 1400000) continue; // slide title band
    if (y > 6000000) continue; // footer band
    if (!TITLE_FILLS.has(fill.toUpperCase())) continue;
    out.push({ t, x, y, cx, cy, fill });
  }
  return out;
}

const result = {};
for (const c of manifest.components) {
  const xml = await zip.file(`ppt/slides/slide${c.sourceSlideIndex}.xml`).async("string");
  const titles = extractTitles(xml);
  result[c.id] = { kind: c.kind, slide: c.sourceSlideIndex, titles: titles.map((z) => z.t) };
}

await writeFile(resolve(root, "generated/member-titles.json"), JSON.stringify(result, null, 1), "utf8");
console.log("Wrote member-titles.json for", manifest.components.length, "components");
// Print a sample per kind (P1)
const seen = new Set();
for (const [id, info] of Object.entries(result)) {
  if (seen.has(info.kind)) continue;
  seen.add(info.kind);
  console.log(`${info.kind} (${id}): ${info.titles.length} -> ${info.titles.join(" | ")}`);
}
