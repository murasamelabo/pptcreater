import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const map = JSON.parse(await readFile(resolve(root, "generated/deck-map.json"), "utf8"));
const sourcePptx = process.argv[2] ?? "C:\\Users\\myrasame\\OneDrive\\music\\Documents\\pptx\\zukai-patterns-full.pptx";

const slugByNo = {
  "01": "flow-horizontal",
  "02": "flow-vertical",
  "03": "cycle",
  "04": "before-after",
  "05": "matrix",
  "06": "venn",
  "07": "formula",
  "08": "comparison",
  "09": "scale",
  "10": "step",
  "11": "gantt",
  "12": "list-vertical",
  "13": "list-horizontal",
  "14": "list-enumeration"
};

const components = [];
for (const section of map.sections) {
  const slug = slugByNo[section.sectionNo];
  if (!slug) throw new Error(`No slug for section ${section.sectionNo}`);
  for (const pattern of section.patterns) {
    const n = pattern.pattern.replace(/^P/, "");
    components.push({
      id: `${slug}-p${n}`,
      kind: slug,
      name: `${section.jaName} ${pattern.pattern}：${pattern.name}`,
      sourceSlideIndex: pattern.sourceSlideIndex,
      bestFor: [section.jaName, section.description].filter(Boolean),
      constraints: {},
      editableGroups: []
    });
  }
}

const manifest = {
  id: "zukai",
  name: "図解デザイン大全",
  description:
    "Curated editable PowerPoint schematic slide components covering 14 figure types (flow, cycle, matrix, venn, comparison, step, gantt, list, and more), each with multiple human-designed variations.",
  version: "0.1.0",
  sourcePptx: "zukai-patterns-full.pptx",
  components
};

const packDir = resolve(root, "design-packs", "zukai");
await mkdir(packDir, { recursive: true });
await writeFile(resolve(packDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
await copyFile(sourcePptx, resolve(packDir, "zukai-patterns-full.pptx"));

console.log("Wrote manifest with", components.length, "components");
console.log("Kinds:", [...new Set(components.map((c) => c.kind))].join(", "));
