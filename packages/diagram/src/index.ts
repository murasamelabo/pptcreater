import { z } from "zod";

export const DiagramNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  sublabel: z.string().optional(),
  // Coordinates are OPTIONAL. Omit them (on every node) to let the engine place nodes
  // automatically with a layered layout so arrows always connect border-to-border. Supply
  // explicit x/y only when you need a bespoke layout (then every node must have both).
  x: z.number().min(0).optional(),
  y: z.number().min(0).optional(),
  w: z.number().positive().default(160),
  h: z.number().positive().default(72),
  // Auto-layout hints (ignored when explicit x/y are used):
  //  - layer: force a column (LR) / row (TB) index, overriding the arrow-derived layer.
  //  - lane: keep related nodes adjacent within a rank (sorted by lane name).
  layer: z.number().int().min(0).optional(),
  lane: z.string().optional(),
  kind: z.enum(["actor", "system", "process", "data", "note", "cloud"]).default("process"),
  icon: z.enum(["actor", "system", "process", "data", "note", "cloud", "none"]).optional(),
  accent: z.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/).optional(),
  emphasis: z.boolean().default(false)
});

export const DiagramArrowSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional(),
  style: z.enum(["straight", "orthogonal"]).default("orthogonal"),
  dashed: z.boolean().default(false),
  bidirectional: z.boolean().default(false)
});

export const DiagramGroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  nodeIds: z.array(z.string().min(1)).min(1)
});

export const PonchiDiagramSchema = z
  .object({
    title: z.string().min(1),
    summary: z.string().min(1),
    longDescription: z.string().min(20),
    width: z.number().positive().default(960),
    height: z.number().positive().default(540),
    // Flow direction for auto-layout: "LR" (left-to-right, default) or "TB" (top-to-bottom).
    direction: z.enum(["LR", "TB"]).default("LR"),
    nodes: z.array(DiagramNodeSchema).min(1),
    arrows: z.array(DiagramArrowSchema).default([]),
    groups: z.array(DiagramGroupSchema).default([])
  })
  .superRefine((diagram, context) => {
    const nodeIds = new Set<string>();

    diagram.nodes.forEach((node, index) => {
      if (nodeIds.has(node.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate node id "${node.id}".`,
          path: ["nodes", index, "id"]
        });
      }
      nodeIds.add(node.id);
    });

    diagram.arrows.forEach((arrow, index) => {
      if (!nodeIds.has(arrow.from)) {
        context.addIssue({
          code: "custom",
          message: `Arrow references unknown source node "${arrow.from}".`,
          path: ["arrows", index, "from"]
        });
      }

      if (!nodeIds.has(arrow.to)) {
        context.addIssue({
          code: "custom",
          message: `Arrow references unknown target node "${arrow.to}".`,
          path: ["arrows", index, "to"]
        });
      }
    });

    diagram.groups.forEach((group, groupIndex) => {
      group.nodeIds.forEach((nodeId, nodeIndex) => {
        if (!nodeIds.has(nodeId)) {
          context.addIssue({
            code: "custom",
            message: `Group references unknown node "${nodeId}".`,
            path: ["groups", groupIndex, "nodeIds", nodeIndex]
          });
        }
      });
    });

    // Coordinates are all-or-nothing: either every node is auto-laid-out (no x/y on any node) or
    // every node is hand-placed (both x and y on every node). A partial mix is ambiguous.
    const placedCount = diagram.nodes.filter((node) => node.x !== undefined && node.y !== undefined).length;
    if (placedCount !== 0 && placedCount !== diagram.nodes.length) {
      diagram.nodes.forEach((node, index) => {
        if (node.x === undefined || node.y === undefined) {
          context.addIssue({
            code: "custom",
            message:
              "Mix of auto-laid-out and hand-placed nodes. Either omit x/y on every node (recommended) or set both x and y on every node.",
            path: ["nodes", index, "x"]
          });
        }
      });
    }
  });

export type PonchiDiagram = z.infer<typeof PonchiDiagramSchema>;
export type PonchiNode = z.infer<typeof DiagramNodeSchema>;
// A node after layout resolution: x/y/w/h are all guaranteed present.
export type PlacedNode = PonchiNode & { x: number; y: number; w: number; h: number };

export const NativeDiagramFrameSchema = z.object({
  x: z.number().min(0).default(0.75),
  y: z.number().min(0).default(1.55),
  w: z.number().positive().default(11.85),
  h: z.number().positive().default(5.35)
});

export const NativePonchiRenderOptionsSchema = z.object({
  frame: NativeDiagramFrameSchema.default({ x: 0.75, y: 1.55, w: 11.85, h: 5.35 }),
  idPrefix: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,59}$/)
    .default("native-diagram"),
  readingOrderStart: z.number().int().min(0).default(100)
});

export const DiagramIntentRenderOptionsSchema = z.object({
  frame: NativeDiagramFrameSchema.default({ x: 0.45, y: 0.5, w: 12.45, h: 6.55 }),
  idPrefix: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,59}$/)
    .default("diagram-intent"),
  readingOrderStart: z.number().int().min(0).default(100)
});

export type NativeDiagramFrame = z.infer<typeof NativeDiagramFrameSchema>;
export type NativePonchiRenderOptions = z.infer<typeof NativePonchiRenderOptionsSchema>;
export type DiagramIntentRenderOptions = z.infer<typeof DiagramIntentRenderOptionsSchema>;

const IntentTextBlockSchema = z.object({
  label: z.string().min(1),
  sublabel: z.string().optional()
});

const IntentPlaneSchema = z.object({
  label: z.string().min(1),
  items: z.array(z.string().min(1)).min(1).max(8)
});

export const AccessPlaneMapIntentSchema = z.object({
  kind: z.literal("access-plane-map"),
  title: z.string().min(1),
  subtitle: z.string().min(1),
  summary: z.string().min(1),
  longDescription: z.string().min(20),
  controlPlane: IntentPlaneSchema,
  managementPlane: IntentPlaneSchema,
  dataPlane: IntentPlaneSchema,
  userAccess: IntentTextBlockSchema,
  appAccess: IntentTextBlockSchema,
  privilegedAccess: IntentTextBlockSchema,
  blockedEscalationLabel: z.string().min(1).default("blocked upward escalation paths"),
  designMessage: z.string().min(1),
  includeTitle: z.boolean().default(true)
});

export const ClosedPrivilegedPathIntentSchema = z.object({
  kind: z.literal("closed-privileged-path"),
  title: z.string().min(1),
  subtitle: z.string().min(1),
  summary: z.string().min(1),
  longDescription: z.string().min(20),
  avoid: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    sources: z.array(IntentTextBlockSchema).min(2).max(6),
    target: IntentTextBlockSchema
  }),
  approved: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    steps: z.array(IntentTextBlockSchema).min(3).max(6),
    denyLabel: z.string().min(1)
  }),
  designMessage: z.string().min(1),
  includeTitle: z.boolean().default(true)
});

const IntentLevelSchema = z.object({
  label: z.string().min(1),
  description: z.string().optional()
});

const IntentRelationshipNodeSchema = z.object({
  label: z.string().min(1),
  sublabel: z.string().optional(),
  relationship: z.string().optional()
});

export const LifecycleIntentSchema = z.object({
  kind: z.literal("lifecycle"),
  title: z.string().min(1),
  subtitle: z.string().min(1),
  summary: z.string().min(1),
  longDescription: z.string().min(20),
  stages: z.array(IntentTextBlockSchema).min(3).max(6),
  loopLabel: z.string().min(1).default("continuous improvement loop"),
  designMessage: z.string().min(1),
  includeTitle: z.boolean().default(true)
});

export const MaturityLadderIntentSchema = z.object({
  kind: z.literal("maturity-ladder"),
  title: z.string().min(1),
  subtitle: z.string().min(1),
  summary: z.string().min(1),
  longDescription: z.string().min(20),
  levels: z.array(IntentLevelSchema).min(3).max(5),
  axisLabel: z.string().min(1).default("maturity"),
  designMessage: z.string().min(1),
  includeTitle: z.boolean().default(true)
});

export const BeforeAfterIntentSchema = z.object({
  kind: z.literal("before-after"),
  title: z.string().min(1),
  subtitle: z.string().min(1),
  summary: z.string().min(1),
  longDescription: z.string().min(20),
  before: z.object({
    title: z.string().min(1),
    points: z.array(z.string().min(1)).min(1).max(6)
  }),
  after: z.object({
    title: z.string().min(1),
    points: z.array(z.string().min(1)).min(1).max(6)
  }),
  transitionLabel: z.string().min(1).default("transform"),
  designMessage: z.string().min(1),
  includeTitle: z.boolean().default(true)
});

export const RelationshipMapIntentSchema = z.object({
  kind: z.literal("relationship-map"),
  title: z.string().min(1),
  subtitle: z.string().min(1),
  summary: z.string().min(1),
  longDescription: z.string().min(20),
  center: IntentTextBlockSchema,
  nodes: z.array(IntentRelationshipNodeSchema).min(3).max(6),
  designMessage: z.string().min(1),
  includeTitle: z.boolean().default(true)
});

export const DiagramIntentSchema = z.discriminatedUnion("kind", [
  AccessPlaneMapIntentSchema,
  ClosedPrivilegedPathIntentSchema,
  LifecycleIntentSchema,
  MaturityLadderIntentSchema,
  BeforeAfterIntentSchema,
  RelationshipMapIntentSchema
]);
export type AccessPlaneMapIntent = z.infer<typeof AccessPlaneMapIntentSchema>;
export type ClosedPrivilegedPathIntent = z.infer<typeof ClosedPrivilegedPathIntentSchema>;
export type LifecycleIntent = z.infer<typeof LifecycleIntentSchema>;
export type MaturityLadderIntent = z.infer<typeof MaturityLadderIntentSchema>;
export type BeforeAfterIntent = z.infer<typeof BeforeAfterIntentSchema>;
export type RelationshipMapIntent = z.infer<typeof RelationshipMapIntentSchema>;
export type DiagramIntent = z.infer<typeof DiagramIntentSchema>;

export type NativeDiagramShapeElement = {
  id: string;
  type: "shape";
  shape: "rect" | "roundRect" | "ellipse" | "line";
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  fillOpacity?: number;
  line?: {
    color?: string;
    width?: number;
    dash?: "solid" | "dash" | "dashDot";
    beginArrowType?: "none" | "arrow" | "diamond" | "oval" | "stealth" | "triangle";
    endArrowType?: "none" | "arrow" | "diamond" | "oval" | "stealth" | "triangle";
  };
  radius?: number;
  decorative: boolean;
  altText?: string;
  readingOrder: number;
};

export type NativeDiagramTextElement = {
  id: string;
  type: "text";
  role: "body" | "caption";
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  color: string;
  contrastBackground?: string;
  bold: boolean;
  align: "left" | "center";
  valign: "top" | "middle";
  decorative: boolean;
  altText?: string;
  readingOrder: number;
};

export type NativeDiagramElement = NativeDiagramShapeElement | NativeDiagramTextElement;

export const SchematicKindSchema = z.enum([
  "table",
  "tree",
  "flow",
  "vertical-flow",
  "cycle",
  "before-after",
  "map",
  "puzzle",
  "correlation",
  "matrix",
  "venn",
  "cross",
  "set",
  "contrast",
  "scale-contrast",
  "grow",
  "layer",
  "triangle",
  "step",
  "gantt",
  "ranking",
  "list",
  "list-horizontal",
  "list-enumeration",
  "mockup"
]);
export const SchematicToneSchema = z.enum(["minimal", "cool", "luxury", "report"]).default("minimal");

export const SchematicDiagramSchema = z.object({
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
});

export type SchematicDiagram = z.infer<typeof SchematicDiagramSchema>;
export type SchematicKind = z.infer<typeof SchematicKindSchema>;
export type SchematicTone = z.infer<typeof SchematicToneSchema>;
export const SCHEMATIC_KINDS = SchematicKindSchema.options;

export type SchematicKindCatalogEntry = {
  labelJa: string;
  labelEn: string;
  description: string;
  suggestedItemCount: string;
  secondaryItems?: string;
  axis?: string;
};

export const SCHEMATIC_KIND_CATALOG = {
  table: { labelJa: "表", labelEn: "Table", description: "Two-column comparison or structured attribute table.", suggestedItemCount: "2-6 rows", secondaryItems: "Right-side column values." },
  tree: { labelJa: "ツリー", labelEn: "Tree", description: "Hierarchy with a root concept and child branches.", suggestedItemCount: "1 root + 2-5 children" },
  flow: { labelJa: "横フロー", labelEn: "Horizontal flow", description: "Left-to-right process, handoff, or customer journey.", suggestedItemCount: "3-5 steps" },
  "vertical-flow": { labelJa: "縦フロー", labelEn: "Vertical flow", description: "Top-to-bottom sequence for procedures or escalation paths.", suggestedItemCount: "3-5 steps" },
  cycle: { labelJa: "サイクル", labelEn: "Cycle", description: "Repeating loop with directional relationships.", suggestedItemCount: "3-6 steps" },
  "before-after": { labelJa: "前後比較", labelEn: "Before/after", description: "Current state versus target state with a central transition.", suggestedItemCount: "1 header + 2-4 points per side", secondaryItems: "After-side header and points." },
  map: { labelJa: "マップ", labelEn: "Map", description: "Spatial control map or conceptual territory with numbered locations.", suggestedItemCount: "3-5 locations", secondaryItems: "Optional legend heading." },
  puzzle: { labelJa: "パズル/ハニカム", labelEn: "Puzzle/honeycomb", description: "Interlocking modules that form one capability set.", suggestedItemCount: "3-7 modules" },
  correlation: { labelJa: "相関図/概念図", labelEn: "Correlation map", description: "Central concept with related surrounding ideas and optional relationship labels.", suggestedItemCount: "1 center + 2-6 related nodes", secondaryItems: "Optional edge labels." },
  matrix: { labelJa: "マトリクス", labelEn: "Matrix", description: "2x2 positioning map for prioritization or segmentation.", suggestedItemCount: "4 quadrants", axis: "axisX and axisY label the matrix axes." },
  venn: { labelJa: "ベン図", labelEn: "Venn", description: "Overlap among two or three sets with an intersection message.", suggestedItemCount: "2-3 sets", secondaryItems: "Intersection label." },
  cross: { labelJa: "数式", labelEn: "Equation", description: "Inputs combined into a result using a simple plus/equal grammar.", suggestedItemCount: "2-3 inputs", secondaryItems: "Result label." },
  set: { labelJa: "グループ/集合", labelEn: "Set groups", description: "Grouped containers with optional member pills.", suggestedItemCount: "2-3 groups", secondaryItems: "Members distributed across groups." },
  contrast: { labelJa: "項目比較", labelEn: "Contrast", description: "Side-by-side option comparison with aligned rows and a center VS badge.", suggestedItemCount: "1 header + 2-4 points per side", secondaryItems: "Right-side header and points." },
  "scale-contrast": { labelJa: "規模比較", labelEn: "Scale comparison", description: "Relative-size bubbles based on parsed numeric values.", suggestedItemCount: "2-4 items", secondaryItems: "Optional numeric values per item.", axis: "Numeric values can be embedded in labels or secondaryItems." },
  grow: { labelJa: "規模分析", labelEn: "TAM/SAM/SOM growth", description: "Concentric market-size or scope analysis.", suggestedItemCount: "3 rings", secondaryItems: "Optional notes for each ring." },
  layer: { labelJa: "レイヤー構造", labelEn: "Layer stack", description: "Stacked architecture, governance, or responsibility layers.", suggestedItemCount: "3-5 layers", secondaryItems: "Optional right-side layer notes." },
  triangle: { labelJa: "トライアングル", labelEn: "Triangle pyramid", description: "Pyramid levels showing foundation to apex.", suggestedItemCount: "3-4 levels" },
  step: { labelJa: "階段/ステップ", labelEn: "Stair step", description: "Ascending maturity, roadmap, or progression steps.", suggestedItemCount: "3-5 steps" },
  gantt: { labelJa: "ガントチャート", labelEn: "Gantt chart", description: "Simple task-by-period schedule with safe staggered bars.", suggestedItemCount: "3-6 tasks", secondaryItems: "Period labels." },
  ranking: { labelJa: "ランキング", labelEn: "Ranking", description: "Ordered list with rank badges and value bars.", suggestedItemCount: "3-6 ranked items", secondaryItems: "Optional numeric values per item." },
  list: { labelJa: "箇条書き縦", labelEn: "Vertical list", description: "Readable vertical list with badges.", suggestedItemCount: "3-6 points" },
  "list-horizontal": { labelJa: "箇条書き横", labelEn: "Horizontal list", description: "Horizontal card list for three or four key points.", suggestedItemCount: "3-4 points" },
  "list-enumeration": { labelJa: "箇条書き羅列", labelEn: "Enumeration", description: "Numbered vertical list for ordered checkpoints.", suggestedItemCount: "3-6 points" },
  mockup: { labelJa: "モックアップ", labelEn: "Mockup", description: "Window/card mockup for product, portal, or dashboard concepts.", suggestedItemCount: "2-4 feature bullets" }
} satisfies Record<SchematicKind, SchematicKindCatalogEntry>;

export type SchematicStyleProfile = "minimal" | "stylish" | "report" | "presentation" | "technical";
export type SchematicStylePreset = {
  tone: SchematicTone;
  primaryKinds: readonly SchematicKind[];
  kinds: readonly SchematicKind[];
  note: string;
};

export type SchematicModeTemplate = {
  styleProfile: SchematicStyleProfile;
  kind: SchematicKind;
  tone: SchematicTone;
  titleJa: string;
  summary: string;
  longDescription: string;
  items: readonly string[];
  secondaryItems?: readonly string[];
  axisX?: string;
  axisY?: string;
  usage: string;
};

type BaseSchematicModeTemplate = Omit<SchematicModeTemplate, "styleProfile" | "kind" | "tone" | "usage">;

const COMPLETE_SCHEMATIC_SET = [
  "table",
  "tree",
  "flow",
  "vertical-flow",
  "cycle",
  "before-after",
  "map",
  "puzzle",
  "correlation",
  "matrix",
  "venn",
  "cross",
  "set",
  "contrast",
  "scale-contrast",
  "grow",
  "layer",
  "triangle",
  "step",
  "gantt",
  "ranking",
  "list",
  "list-horizontal",
  "list-enumeration",
  "mockup"
] as const satisfies readonly SchematicKind[];

export const SCHEMATIC_STYLE_PRESETS = {
  minimal: {
    tone: "minimal",
    primaryKinds: ["table", "flow", "list", "list-horizontal", "before-after", "matrix", "step"],
    kinds: COMPLETE_SCHEMATIC_SET,
    note: "Whitespace-first layouts with restrained accents for crisp internal and general-purpose decks."
  },
  stylish: {
    tone: "luxury",
    primaryKinds: ["cycle", "puzzle", "correlation", "venn", "triangle", "grow", "mockup"],
    kinds: COMPLETE_SCHEMATIC_SET,
    note: "More atmospheric, editorial compositions with bolder focal objects and layered surfaces."
  },
  report: {
    tone: "report",
    primaryKinds: ["table", "matrix", "contrast", "scale-contrast", "gantt", "ranking", "layer"],
    kinds: COMPLETE_SCHEMATIC_SET,
    note: "Evidence-forward patterns for structured comparisons, schedules, rankings, and explanatory reports."
  },
  presentation: {
    tone: "minimal",
    primaryKinds: ["flow", "cycle", "before-after", "step", "list-horizontal", "map", "venn"],
    kinds: COMPLETE_SCHEMATIC_SET,
    note: "Glanceable patterns for live explanation with few labels and clear motion or contrast."
  },
  technical: {
    tone: "cool",
    primaryKinds: ["tree", "vertical-flow", "correlation", "map", "layer", "matrix", "gantt", "mockup"],
    kinds: COMPLETE_SCHEMATIC_SET,
    note: "Dark, high-contrast technical patterns for architecture, control-plane, and process explanation."
  }
} satisfies Record<SchematicStyleProfile, SchematicStylePreset>;

const BASE_SCHEMATIC_TEMPLATES: Record<SchematicKind, BaseSchematicModeTemplate> = {
  table: {
    titleJa: "判断材料を一枚でそろえる",
    summary: "判断材料をそろえる表",
    longDescription: "主要な観点と確認事項を二列で整理し、論点の抜け漏れを減らす表形式の図解です。",
    items: ["観点", "品質", "速度", "再利用", "安全性"],
    secondaryItems: ["確認事項", "lintで検証", "finalizeで短縮", "assetsを検索", "safe SVGのみ"]
  },
  tree: {
    titleJa: "構造を階層でほどく",
    summary: "階層を整理するツリー",
    longDescription: "中心テーマから構成要素へ枝分かれさせ、複雑な情報を上位下位の関係で理解しやすくする図解です。",
    items: ["PPT作成", "構成", "図解", "資産", "検証", "出力"]
  },
  flow: {
    titleJa: "作成から検証までを一直線で進める",
    summary: "横方向の作業フロー",
    longDescription: "左から右へ進む作業や判断の流れを短いステップで示し、次の行動を迷わせない図解です。",
    items: ["brief", "template", "schematic", "lint", "render"]
  },
  "vertical-flow": {
    titleJa: "承認の流れを上から下へ迷わせない",
    summary: "縦方向の承認フロー",
    longDescription: "上から下へ流れる手順、承認、エスカレーションを、読み順どおりに追える図解です。",
    items: ["申請", "レビュー", "承認", "配布", "改善"]
  },
  cycle: {
    titleJa: "改善の循環を途切れなく回す",
    summary: "継続改善サイクル",
    longDescription: "繰り返し発生する活動を循環として示し、単発ではなく継続的に改善する関係を伝える図解です。",
    items: ["計画", "作成", "確認", "修正", "公開", "学習"]
  },
  "before-after": {
    titleJa: "現状と改善後の差分を一目で伝える",
    summary: "Before/After 比較",
    longDescription: "現在の課題と改善後の状態を左右に置き、中央の遷移で変化の意味を説明する図解です。",
    items: ["Before", "手作業で配置", "改行が不安定", "修正ループが長い", "再利用しづらい"],
    secondaryItems: ["After", "プリセットを選択", "自動fit", "finalizeで短縮", "サンプルを再利用"]
  },
  map: {
    titleJa: "制御ポイントを地図のように把握する",
    summary: "制御ポイントマップ",
    longDescription: "複数の重要地点を空間的に配置し、どこを確認・制御するかを直感的に把握するための図解です。",
    items: ["入力", "生成", "検証", "公開", "改善"],
    secondaryItems: ["主要ポイント"]
  },
  puzzle: {
    titleJa: "構成要素を一体の仕組みに見せる",
    summary: "ハニカム型の構成要素",
    longDescription: "複数の機能や観点が連動して一つの価値を作ることを、ハニカム状のまとまりで示す図解です。",
    items: ["テンプレート", "配色", "余白", "アイコン", "図解", "検証", "出力"]
  },
  correlation: {
    titleJa: "中心概念と周辺要素の関係を描く",
    summary: "中心概念の相関図",
    longDescription: "中心となる概念と周辺要素の関係を放射状に整理し、全体像と関連性を一度に説明する図解です。",
    items: ["高品質なDeckSpec", "テンプレート", "アイコン", "図解", "lint", "render"],
    secondaryItems: ["選択", "装飾", "構造化", "検査", "出力"]
  },
  matrix: {
    titleJa: "優先度を二軸で判断する",
    summary: "二軸の優先度マトリクス",
    longDescription: "二つの評価軸で施策や論点を配置し、優先順位や位置づけを判断しやすくする図解です。",
    items: ["Quick win", "Strategic", "Defer", "Maintain"],
    axisX: "実装容易性",
    axisY: "効果"
  },
  venn: {
    titleJa: "重なりから価値を説明する",
    summary: "重なりを示すベン図",
    longDescription: "二つまたは三つの領域の重なりを示し、共通価値や交差領域を説明する図解です。",
    items: ["Design", "Automation", "Accessibility"],
    secondaryItems: ["信頼できるスライド"]
  },
  cross: {
    titleJa: "構成要素を成果へつなげる",
    summary: "要素を足し合わせる数式図",
    longDescription: "複数の入力や条件が組み合わさって成果へつながることを、数式のように簡潔に示す図解です。",
    items: ["構成", "図解", "検証"],
    secondaryItems: ["美しいPPTX"]
  },
  set: {
    titleJa: "要素をまとまりごとに整理する",
    summary: "グループ別の集合図",
    longDescription: "関連する要素をグループに分け、どの要素がどのまとまりに属するかを整理する図解です。",
    items: ["Planning", "Visual", "Quality"],
    secondaryItems: ["brief", "story", "icons", "schematic", "lint", "render"]
  },
  contrast: {
    titleJa: "二つの選択肢の違いを際立たせる",
    summary: "二案比較",
    longDescription: "二つの選択肢や状態を左右に並べ、差分と判断材料を強調する比較図です。",
    items: ["Freehand", "自由度が高い", "崩れやすい", "再現性が低い"],
    secondaryItems: ["Preset", "短時間で作れる", "崩れにくい", "再利用しやすい"]
  },
  "scale-contrast": {
    titleJa: "数値差を面積で直感化する",
    summary: "規模比較",
    longDescription: "複数の数値差を円の面積で表し、大小関係を直感的に伝える図解です。",
    items: ["Manual 80", "Preset 45", "Finalize 25", "Sample 15"],
    secondaryItems: ["80", "45", "25", "15"]
  },
  grow: {
    titleJa: "市場や対象範囲を段階で絞る",
    summary: "TAM/SAM/SOM 型の規模分析",
    longDescription: "全体から到達可能範囲、初期対象へと段階的に絞り込む考え方を同心円で示す図解です。",
    items: ["TAM", "SAM", "SOM"],
    secondaryItems: ["全体市場", "到達可能市場", "初期対象"]
  },
  layer: {
    titleJa: "役割をレイヤーで積み上げる",
    summary: "積層レイヤー構造",
    longDescription: "上位から下位、または体験から基盤までの役割を層として積み上げる図解です。",
    items: ["Experience", "Workflow", "Validation", "Rendering", "Assets"],
    secondaryItems: ["UI", "Agent", "Core", "PPTX", "SVG"]
  },
  triangle: {
    titleJa: "基盤から成果までを積み上げる",
    summary: "ピラミッド型の階層",
    longDescription: "下層の基盤から上層の成果へ段階的に積み上がる関係を示す図解です。",
    items: ["Outcome", "Visual grammar", "DeckSpec rules", "Accessible tokens"]
  },
  step: {
    titleJa: "成熟度を段階的に上げる",
    summary: "成熟度の階段図",
    longDescription: "導入から展開までの成長段階を階段状に示し、進むべき順序を明確にする図解です。",
    items: ["導入", "標準化", "自動化", "最適化", "展開"]
  },
  gantt: {
    titleJa: "作業と期間を同じ面で見る",
    summary: "簡易ガントチャート",
    longDescription: "タスクと期間を同じ表面に並べ、進行計画や担当タイミングを把握しやすくする図解です。",
    items: ["設計", "実装", "サンプル", "検証", "公開"],
    secondaryItems: ["W1", "W2", "W3", "W4"]
  },
  ranking: {
    titleJa: "優先順位と差を同時に見せる",
    summary: "ランキング図",
    longDescription: "順位だけでなく数値差も棒で示し、優先順位の意味を伝えやすくする図解です。",
    items: ["Flow 95", "Matrix 80", "Layer 70", "Gantt 52", "Venn 35"],
    secondaryItems: ["95", "80", "70", "52", "35"]
  },
  list: {
    titleJa: "重要項目を縦に読みやすく並べる",
    summary: "縦型リスト",
    longDescription: "複数の要点を縦方向に並べ、読み順と視線移動を安定させる図解です。",
    items: ["1スライド1メッセージ", "十分な余白", "可視ラベル", "高コントラスト", "出典管理"]
  },
  "list-horizontal": {
    titleJa: "三つから四つの要点を横並びで見せる",
    summary: "横型リスト",
    longDescription: "少数の重要ポイントを横並びカードで配置し、同列の観点として比較しやすくする図解です。",
    items: ["低彩度カラー", "8ptグリッド", "アイコン活用", "可読性優先"]
  },
  "list-enumeration": {
    titleJa: "手順とチェックを番号で示す",
    summary: "番号付きリスト",
    longDescription: "順番のある手順やチェック項目を番号付きで示し、抜け漏れなく追えるようにする図解です。",
    items: ["rulesを読む", "型を選ぶ", "DeckSpecを書く", "finalizeする", "公開する"]
  },
  mockup: {
    titleJa: "画面イメージを簡潔に共有する",
    summary: "UIモックアップ",
    longDescription: "アプリやポータルの雰囲気を簡潔な画面風カードとして示し、概念を共有しやすくする図解です。",
    items: ["Templates", "Assets", "Schematics", "Finalize"]
  }
};

const SCHEMATIC_STYLE_TEMPLATE_USAGE: Record<SchematicStyleProfile, string> = {
  minimal: "余白を広く取り、情報を削ぎ落として静かに見せるモード向けテンプレート。",
  stylish: "濃色背景と強い焦点を使い、印象に残るビジュアルとして見せるモード向けテンプレート。",
  report: "説明責任、比較、証跡、表形式の読みやすさを優先するモード向けテンプレート。",
  presentation: "登壇時に一目で追える大きな流れと対比を優先するモード向けテンプレート。",
  technical: "構造、制御点、依存関係、レイヤーを読み解きやすくするモード向けテンプレート。"
};

function buildSchematicModeTemplates(styleProfile: SchematicStyleProfile): Record<SchematicKind, SchematicModeTemplate> {
  const preset = SCHEMATIC_STYLE_PRESETS[styleProfile];
  const templates = {} as Record<SchematicKind, SchematicModeTemplate>;
  for (const kind of COMPLETE_SCHEMATIC_SET) {
    const base = BASE_SCHEMATIC_TEMPLATES[kind];
    templates[kind] = {
      styleProfile,
      kind,
      tone: preset.tone,
      titleJa: base.titleJa,
      summary: base.summary,
      longDescription: `${base.longDescription} ${SCHEMATIC_STYLE_TEMPLATE_USAGE[styleProfile]}`,
      items: base.items,
      secondaryItems: base.secondaryItems,
      axisX: base.axisX,
      axisY: base.axisY,
      usage: SCHEMATIC_STYLE_TEMPLATE_USAGE[styleProfile]
    };
  }

  return templates;
}

export const SCHEMATIC_MODE_TEMPLATES = {
  minimal: buildSchematicModeTemplates("minimal"),
  stylish: buildSchematicModeTemplates("stylish"),
  report: buildSchematicModeTemplates("report"),
  presentation: buildSchematicModeTemplates("presentation"),
  technical: buildSchematicModeTemplates("technical")
} satisfies Record<SchematicStyleProfile, Record<SchematicKind, SchematicModeTemplate>>;

function isSchematicStyleProfile(value: string | undefined): value is SchematicStyleProfile {
  return value === "minimal" || value === "stylish" || value === "report" || value === "presentation" || value === "technical";
}

export function schematicPresetForStyleProfile(styleProfile: string | undefined = "minimal"): SchematicStylePreset & { styleProfile: SchematicStyleProfile } {
  const resolved = isSchematicStyleProfile(styleProfile) ? styleProfile : "minimal";
  return { styleProfile: resolved, ...SCHEMATIC_STYLE_PRESETS[resolved] };
}

export function schematicToneForStyleProfile(styleProfile: string | undefined = "minimal"): SchematicTone {
  return schematicPresetForStyleProfile(styleProfile).tone;
}

export function schematicKindsForStyleProfile(styleProfile: string | undefined = "minimal"): readonly SchematicKind[] {
  return schematicPresetForStyleProfile(styleProfile).kinds;
}

export function schematicTemplatesForStyleProfile(styleProfile: string | undefined = "minimal"): Record<SchematicKind, SchematicModeTemplate> {
  return SCHEMATIC_MODE_TEMPLATES[schematicPresetForStyleProfile(styleProfile).styleProfile];
}

export function schematicTemplateForStyleProfile(styleProfile: string | undefined, kind: SchematicKind): SchematicModeTemplate {
  return schematicTemplatesForStyleProfile(styleProfile)[kind];
}

type SchematicPalette = {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  muted: string;
  accent: string;
  accentSoft: string;
  line: string;
};

const SCHEMATIC_PALETTES: Record<z.infer<typeof SchematicToneSchema>, SchematicPalette> = {
  minimal: {
    background: "#fbfaf7",
    surface: "#ffffff",
    surfaceAlt: "#f3f1ea",
    text: "#1f2933",
    muted: "#65707b",
    accent: "#315f9f",
    accentSoft: "#dfe8f5",
    line: "#d8d3c8"
  },
  cool: {
    background: "#0b1020",
    surface: "#151c2f",
    surfaceAlt: "#1c263c",
    text: "#f8fafc",
    muted: "#c6d0df",
    accent: "#2dd4bf",
    accentSoft: "#143a42",
    line: "#2a3751"
  },
  luxury: {
    background: "#14110d",
    surface: "#211b14",
    surfaceAlt: "#2b241b",
    text: "#f8f1e4",
    muted: "#d1bea4",
    accent: "#c8a15a",
    accentSoft: "#3b3020",
    line: "#4a3d2b"
  },
  report: {
    background: "#fbfaf7",
    surface: "#ffffff",
    surfaceAlt: "#f1eee7",
    text: "#24211d",
    muted: "#5f5a52",
    accent: "#8f3d35",
    accentSoft: "#f2ded9",
    line: "#d8d3c8"
  }
};

const NODE_COLORS: Record<PonchiDiagram["nodes"][number]["kind"], { fill: string; stroke: string; accent: string }> = {
  actor: { fill: "#eef2ff", stroke: "#c7d2fe", accent: "#4f46e5" },
  system: { fill: "#eff6ff", stroke: "#bfdbfe", accent: "#2563eb" },
  process: { fill: "#ffffff", stroke: "#d8dee9", accent: "#0f766e" },
  data: { fill: "#ecfdf5", stroke: "#bbf7d0", accent: "#059669" },
  note: { fill: "#fffbeb", stroke: "#fde68a", accent: "#b45309" },
  cloud: { fill: "#f5f3ff", stroke: "#ddd6fe", accent: "#7c3aed" }
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const FULL_WIDTH_LABEL_PATTERN = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\u30FC\u30FB\uFF01-\uFF60\uFFE0-\uFFE6]/u;
const LABEL_TOKEN_PATTERN = /[A-Za-z0-9]+(?:[._+#%@/'’-][A-Za-z0-9]+)*|[\u30A0-\u30FF\u31F0-\u31FF\uFF66-\uFF9F\u30FC\u30FB]+|\s+|[\s\S]/gu;
const HAN_LABEL_PATTERN = /\p{Script=Han}/u;
const NO_BREAK_BEFORE_LABEL_PATTERN = /^[、。，．・,.!?！？:：;；)\]\}）」』】〉》〕｝ー%％/／]$/u;
const NO_BREAK_AFTER_LABEL_PATTERN = /^[（「『【〔｛(\[\{〈《]$/u;

function labelUnits(value: string): number {
  return Array.from(value).reduce((sum, char) => {
    if (/\s/.test(char)) {
      return sum + 0.35;
    }

    if (FULL_WIDTH_LABEL_PATTERN.test(char)) {
      return sum + 1;
    }

    return sum + 0.58;
  }, 0);
}

function labelWidth(value: string, fontSize: number): number {
  return labelUnits(value) * fontSize;
}

function clipLabelToWidth(value: string, maxWidth: number, fontSize: number): string {
  if (labelWidth(value, fontSize) <= maxWidth) {
    return value;
  }

  const ellipsis = "…";
  let clipped = "";
  for (const char of Array.from(value)) {
    if (labelWidth(`${clipped}${char}${ellipsis}`, fontSize) > maxWidth) {
      break;
    }
    clipped += char;
  }

  return clipped ? `${clipped}${ellipsis}` : ellipsis;
}

function hardWrapOverwideLine(value: string, maxWidth: number, fontSize: number, maxLines: number): string[] {
  if (labelWidth(value, fontSize) <= maxWidth) {
    return [value];
  }

  // Preserve unbroken Latin identifiers by clipping them instead of creating unreadable mid-word
  // fragments. CJK/mixed labels can still be split by grapheme as a last-resort overflow guard.
  if (!FULL_WIDTH_LABEL_PATTERN.test(value) && !/\s/.test(value)) {
    return [clipLabelToWidth(value, maxWidth, fontSize)];
  }

  const lines: string[] = [];
  let line = "";
  for (const char of Array.from(value)) {
    const candidate = `${line}${char}`;
    if (!line || labelWidth(candidate, fontSize) <= maxWidth) {
      line = candidate;
      continue;
    }

    lines.push(line);
    line = char;
    if (lines.length === maxLines) {
      break;
    }
  }

  if (line && lines.length < maxLines) {
    lines.push(line);
  }

  if (lines.length === maxLines && labelWidth(lines[lines.length - 1], fontSize) > maxWidth) {
    lines[lines.length - 1] = clipLabelToWidth(lines[lines.length - 1], maxWidth, fontSize);
  }

  return lines;
}

function enforceLabelLineWidths(lines: string[], maxWidth: number, fontSize: number, maxLines: number): string[] {
  const fitted: string[] = [];
  for (const line of lines) {
    const remaining = maxLines - fitted.length;
    if (remaining <= 0) {
      break;
    }

    fitted.push(...hardWrapOverwideLine(line, maxWidth, fontSize, remaining));
  }

  if (fitted.length > maxLines) {
    return fitted.slice(0, maxLines);
  }

  return fitted;
}

function wrapLabel(value: string, maxChars = 14): string[] {
  const text = value.trim();
  if (text.length <= maxChars) {
    return [text];
  }

  // Word-aware wrapping for space-separated (Latin) labels so words are never split mid-word.
  if (/\s/.test(text)) {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      if (!line) {
        line = word;
      } else if ((line + " " + word).length <= maxChars) {
        line += ` ${word}`;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) {
      lines.push(line);
    }
    return lines.slice(0, 3);
  }

  // CJK labels have no spaces; fall back to a fixed character count per line.
  const lines: string[] = [];
  for (let index = 0; index < text.length; index += maxChars) {
    lines.push(text.slice(index, index + maxChars));
  }
  return lines.slice(0, 3);
}

function wrapLabelToWidth(value: string, maxWidth: number, fontSize: number, maxLines: number, truncate = false): string[] {
  const text = value.trim();
  if (!text) {
    return [];
  }

  if (labelWidth(text, fontSize) <= maxWidth) {
    return [text];
  }

  const tokens = text.match(LABEL_TOKEN_PATTERN) ?? [text];
  const lines: string[] = [];
  let line = "";
  const lineLimit = truncate ? maxLines : Number.MAX_SAFE_INTEGER;

  for (const token of tokens) {
    if (/^\s+$/.test(token)) {
      if (line && !line.endsWith(" ")) {
        line += " ";
      }
      continue;
    }

    const candidate = `${line}${token}`;
    if (!line || labelWidth(candidate.trimEnd(), fontSize) <= maxWidth) {
      if (!line && labelWidth(token, fontSize) > maxWidth) {
        lines.push(...hardWrapOverwideLine(token, maxWidth, fontSize, lineLimit - lines.length));
        line = "";
      } else {
        line = candidate;
      }
      continue;
    }

    const trimmed = line.trimEnd();
    const left = trimmed.slice(-1);
    const right = token[0] ?? "";
    const tokenStartsWithNoBreak = NO_BREAK_BEFORE_LABEL_PATTERN.test(right);
    const lineEndsWithNoBreak = NO_BREAK_AFTER_LABEL_PATTERN.test(left);
    const splitsKanjiCompound = HAN_LABEL_PATTERN.test(left) && HAN_LABEL_PATTERN.test(right);
    if (trimmed && !tokenStartsWithNoBreak && !lineEndsWithNoBreak && !splitsKanjiCompound) {
      lines.push(trimmed);
      line = token;
    } else {
      line = candidate;
    }
  }

  if (line.trim()) {
    lines.push(line.trim());
  }

  return enforceLabelLineWidths(lines, maxWidth, fontSize, lineLimit);
}

function fitLabel(value: string, maxWidth: number, options: { preferredSize: number; minimumSize: number; maxLines: number }): { lines: string[]; size: number } {
  for (let size = options.preferredSize; size >= options.minimumSize; size -= 0.5) {
    const lines = wrapLabelToWidth(value, maxWidth, size, options.maxLines);
    if (lines.length <= options.maxLines && lines.every((line) => labelWidth(line, size) <= maxWidth)) {
      return { lines, size };
    }
  }

  return {
    lines: enforceLabelLineWidths(wrapLabelToWidth(value, maxWidth, options.minimumSize, options.maxLines, true), maxWidth, options.minimumSize, options.maxLines),
    size: options.minimumSize
  };
}

function textBlock(lines: string[], x: number, y: number, options: { size?: number; color: string; weight?: number; anchor?: "start" | "middle" }): string {
  const size = options.size ?? 16;
  const anchor = options.anchor ?? "start";
  return lines
    .map((line, index) => `<text x="${x}" y="${y + index * (size * 1.35)}" text-anchor="${anchor}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${options.weight ?? 500}" fill="${options.color}">${escapeXml(line)}</text>`)
    .join("");
}

function roundedRect(x: number, y: number, w: number, h: number, rx: number, fill: string, stroke: string): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" />`;
}

function flowSchematic(diagram: SchematicDiagram, palette: SchematicPalette): string {
  const count = Math.min(diagram.items.length, 5);
  const gap = 24;
  const cardW = (diagram.width - 96 - gap * (count - 1)) / count;
  const y = 210;
  return diagram.items
    .slice(0, count)
    .map((item, index) => {
      const x = 48 + index * (cardW + gap);
      const arrow = index < count - 1 ? `<path d="M${x + cardW + 8} ${y + 48}h${gap - 16}m-8-8 8 8-8 8" fill="none" stroke="${palette.accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />` : "";
      return [
        roundedRect(x, y, cardW, 96, 18, palette.surface, palette.line),
        `<circle cx="${x + 34}" cy="${y + 34}" r="14" fill="${palette.accentSoft}" stroke="${palette.accent}" />`,
        `<text x="${x + 34}" y="${y + 39}" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="${palette.accent}">${index + 1}</text>`,
        textBlock(wrapLabel(item, 12), x + 60, y + 36, { color: palette.text, size: 15, weight: 700 }),
        arrow
      ].join("");
    })
    .join("");
}

function verticalFlowSchematic(diagram: SchematicDiagram, palette: SchematicPalette): string {
  const count = Math.min(diagram.items.length, 5);
  const cardH = 62;
  const gap = 18;
  const startY = 120;
  const x = 190;
  const w = diagram.width - 380;
  return diagram.items
    .slice(0, count)
    .map((item, index) => {
      const y = startY + index * (cardH + gap);
      const arrow = index < count - 1 ? `<path d="M${diagram.width / 2} ${y + cardH + 4}v${gap - 8}m-7-7 7 7 7-7" fill="none" stroke="${palette.accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />` : "";
      return [
        roundedRect(x, y, w, cardH, 16, palette.surface, palette.line),
        `<rect x="${x}" y="${y}" width="7" height="${cardH}" rx="3.5" fill="${palette.accent}" />`,
        textBlock(wrapLabel(item, 26), x + 32, y + 26, { color: palette.text, size: 16, weight: 700 }),
        arrow
      ].join("");
    })
    .join("");
}

function tableSchematic(diagram: SchematicDiagram, palette: SchematicPalette): string {
  const rows = Math.min(Math.max(diagram.items.length, diagram.secondaryItems.length), 5);
  const x = 72;
  const y = 126;
  const w = diagram.width - 144;
  const rowH = 58;
  const colW = w / 2;
  const header = [
    roundedRect(x, y, w, rowH, 18, palette.accentSoft, palette.accent),
    textBlock([diagram.items[0] ?? "Before"], x + 24, y + 36, { color: palette.text, size: 15, weight: 700 }),
    textBlock([diagram.secondaryItems[0] ?? "After"], x + colW + 24, y + 36, { color: palette.text, size: 15, weight: 700 }),
    `<path d="M${x + colW} ${y}v${rowH * (rows + 1)}" stroke="${palette.line}" />`
  ].join("");
  const body = Array.from({ length: rows }).map((_, index) => {
    const rowY = y + rowH * (index + 1);
    return [
      `<rect x="${x}" y="${rowY}" width="${w}" height="${rowH}" fill="${index % 2 === 0 ? palette.surface : palette.surfaceAlt}" stroke="${palette.line}" />`,
      textBlock(wrapLabel(diagram.items[index + 1] ?? diagram.items[index] ?? "", 26), x + 24, rowY + 34, { color: palette.text, size: 14, weight: 500 }),
      textBlock(wrapLabel(diagram.secondaryItems[index + 1] ?? diagram.secondaryItems[index] ?? "", 26), x + colW + 24, rowY + 34, { color: palette.muted, size: 14, weight: 500 })
    ].join("");
  });
  return [header, ...body].join("");
}

function treeSchematic(diagram: SchematicDiagram, palette: SchematicPalette): string {
  const rootX = diagram.width / 2 - 110;
  const rootY = 120;
  const children = diagram.items.slice(1, 6);
  const childW = 150;
  const gap = 20;
  const totalW = children.length * childW + Math.max(0, children.length - 1) * gap;
  const childStartX = diagram.width / 2 - totalW / 2;
  const childY = 315;
  return [
    roundedRect(rootX, rootY, 220, 72, 20, palette.accentSoft, palette.accent),
    textBlock(wrapLabel(diagram.items[0] ?? diagram.title, 14), diagram.width / 2, rootY + 34, { color: palette.text, size: 16, weight: 700, anchor: "middle" }),
    `<path d="M${diagram.width / 2} ${rootY + 72}v70" stroke="${palette.line}" stroke-width="2" />`,
    ...children.map((item, index) => {
      const x = childStartX + index * (childW + gap);
      const cx = x + childW / 2;
      return [
        `<path d="M${diagram.width / 2} ${rootY + 142}H${cx}V${childY}" fill="none" stroke="${palette.line}" stroke-width="2" />`,
        roundedRect(x, childY, childW, 82, 18, palette.surface, palette.line),
        textBlock(wrapLabel(item, 10), cx, childY + 34, { color: palette.text, size: 14, weight: 700, anchor: "middle" })
      ].join("");
    })
  ].join("");
}

function listSchematic(diagram: SchematicDiagram, palette: SchematicPalette, horizontal = false, enumeration = false): string {
  const items = diagram.items.slice(0, horizontal ? 4 : 6);
  if (horizontal) {
    const gap = 18;
    const w = (diagram.width - 96 - gap * (items.length - 1)) / items.length;
    return items
      .map((item, index) => {
        const x = 48 + index * (w + gap);
        return [
          roundedRect(x, 205, w, 138, 22, palette.surface, palette.line),
          `<circle cx="${x + w / 2}" cy="184" r="18" fill="${palette.accent}" />`,
          `<text x="${x + w / 2}" y="190" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="${palette.background}">${index + 1}</text>`,
          textBlock(wrapLabel(item, 11), x + w / 2, 255, { color: palette.text, size: 15, weight: 700, anchor: "middle" })
        ].join("");
      })
      .join("");
  }

  return items
    .map((item, index) => {
      const y = 128 + index * 62;
      return [
        roundedRect(96, y, diagram.width - 192, 48, 14, palette.surface, palette.line),
        `<circle cx="124" cy="${y + 24}" r="12" fill="${palette.accentSoft}" stroke="${palette.accent}" />`,
        `<text x="124" y="${y + 29}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="${palette.accent}">${enumeration ? index + 1 : "✓"}</text>`,
        textBlock(wrapLabel(item, 42), 154, y + 30, { color: palette.text, size: 15, weight: 600 })
      ].join("");
    })
    .join("");
}

function mockupSchematic(diagram: SchematicDiagram, palette: SchematicPalette): string {
  const x = 170;
  const y = 116;
  const w = diagram.width - 340;
  const h = 310;
  const bullets = diagram.items.slice(0, 4);
  return [
    roundedRect(x, y, w, h, 28, palette.surface, palette.line),
    `<rect x="${x}" y="${y}" width="${w}" height="46" rx="28" fill="${palette.surfaceAlt}" />`,
    `<circle cx="${x + 28}" cy="${y + 23}" r="5" fill="${palette.accent}" /><circle cx="${x + 46}" cy="${y + 23}" r="5" fill="${palette.line}" /><circle cx="${x + 64}" cy="${y + 23}" r="5" fill="${palette.line}" />`,
    roundedRect(x + 42, y + 82, w - 84, 64, 18, palette.accentSoft, palette.accent),
    ...bullets.map((item, index) => {
      const rowY = y + 178 + index * 38;
      return [
        `<circle cx="${x + 58}" cy="${rowY}" r="7" fill="${palette.accent}" />`,
        `<rect x="${x + 78}" y="${rowY - 7}" width="${w - 150 - index * 18}" height="14" rx="7" fill="${palette.surfaceAlt}" />`,
        textBlock([item], x + w - 40, rowY + 5, { color: palette.muted, size: 11, weight: 600, anchor: "middle" })
      ].join("");
    })
  ].join("");
}

function fittedTextBlock(
  value: string,
  x: number,
  cy: number,
  maxWidth: number,
  options: { color: string; weight?: number; preferredSize?: number; minimumSize?: number; maxLines?: number; anchor?: "start" | "middle" }
): string {
  const preferredSize = options.preferredSize ?? 15;
  const minimumSize = options.minimumSize ?? 10;
  const maxLines = options.maxLines ?? 2;
  const fitted = fitLabel(value, maxWidth, { preferredSize, minimumSize, maxLines });
  const lineHeight = fitted.size * 1.32;
  const firstBaseline = cy - ((fitted.lines.length - 1) * lineHeight) / 2 + fitted.size * 0.34;
  return textBlock(fitted.lines, x, firstBaseline, { color: options.color, size: fitted.size, weight: options.weight, anchor: options.anchor });
}

function parseSchematicValue(value: string | undefined, fallback: number): number {
  const match = value?.match(/-?\d+(?:[,.]\d+)*/);
  if (!match) {
    return fallback;
  }

  const parsed = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hexPolygonPoints(cx: number, cy: number, radius: number): string {
  return Array.from({ length: 6 })
    .map((_, index) => {
      const angle = (Math.PI / 180) * (60 * index + 30);
      return `${(cx + Math.cos(angle) * radius).toFixed(1)},${(cy + Math.sin(angle) * radius).toFixed(1)}`;
    })
    .join(" ");
}

function mixHex(a: string, b: string, t: number): string {
  const toRgb = (value: string): [number, number, number] | undefined => {
    const normalized = value.replace("#", "");
    const hex = normalized.length === 3 ? normalized.split("").map((char) => char + char).join("") : normalized;
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
      return undefined;
    }

    return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)) as [number, number, number];
  };
  const left = toRgb(a);
  const right = toRgb(b);
  if (!left || !right) {
    return a;
  }

  const clamped = Math.max(0, Math.min(1, t));
  const mixed = left.map((channel, index) => Math.round(channel + (right[index] - channel) * clamped));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function cycleSchematic(diagram: SchematicDiagram, palette: SchematicPalette): string {
  const items = diagram.items.slice(0, 6);
  const count = items.length;
  const cx = diagram.width / 2;
  const cy = 302;
  const orbit = count <= 4 ? 142 : 162;
  const nodeR = count <= 4 ? 58 : 50;
  const centers = items.map((_, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
    return { x: cx + Math.cos(angle) * orbit, y: cy + Math.sin(angle) * orbit };
  });
  const links =
    count > 1
      ? centers
          .map((from, index) => {
            const to = centers[(index + 1) % count];
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const length = Math.hypot(dx, dy) || 1;
            const dir = { x: dx / length, y: dy / length };
            const start = { x: from.x + dir.x * nodeR, y: from.y + dir.y * nodeR };
            const end = { x: to.x - dir.x * (nodeR + 8), y: to.y - dir.y * (nodeR + 8) };
            return `<path d="M${start.x.toFixed(1)} ${start.y.toFixed(1)}L${end.x.toFixed(1)} ${end.y.toFixed(1)}" fill="none" stroke="${palette.accent}" stroke-width="2.5" stroke-linecap="round" />${arrowHead(end, dir, palette.accent, 9)}`;
          })
          .join("")
      : "";
  const nodes = centers
    .map((center, index) =>
      [
        `<circle cx="${center.x.toFixed(1)}" cy="${center.y.toFixed(1)}" r="${nodeR}" fill="${index === 0 ? palette.accentSoft : palette.surface}" stroke="${palette.line}" stroke-width="1.5" />`,
        `<circle cx="${(center.x - nodeR + 18).toFixed(1)}" cy="${(center.y - nodeR + 18).toFixed(1)}" r="13" fill="${palette.accent}" />`,
        `<text x="${(center.x - nodeR + 18).toFixed(1)}" y="${(center.y - nodeR + 23).toFixed(1)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="${palette.background}">${index + 1}</text>`,
        fittedTextBlock(items[index], center.x, center.y + 6, nodeR * 1.55, { color: palette.text, weight: 700, preferredSize: 14, minimumSize: 9, maxLines: 3, anchor: "middle" })
      ].join("")
    )
    .join("");
  return [links, nodes].join("");
}

function beforeAfterSchematic(diagram: SchematicDiagram, palette: SchematicPalette): string {
  const x = 64;
  const y = 134;
  const gap = 54;
  const panelW = (diagram.width - x * 2 - gap) / 2;
  const panelH = 284;
  const leftRows = diagram.items.slice(1, 5);
  const rightRows = diagram.secondaryItems.slice(1, 5);
  const renderPanel = (panelX: number, title: string, rows: string[], accent: boolean): string => [
    roundedRect(panelX, y, panelW, panelH, 26, accent ? palette.accentSoft : palette.surface, palette.line),
    `<rect x="${panelX}" y="${y}" width="${panelW}" height="58" rx="26" fill="${accent ? palette.accent : palette.surfaceAlt}" />`,
    fittedTextBlock(title, panelX + panelW / 2, y + 33, panelW - 52, { color: accent ? palette.background : palette.text, weight: 700, preferredSize: 17, minimumSize: 11, maxLines: 1, anchor: "middle" }),
    ...rows.map((row, index) => {
      const rowY = y + 86 + index * 44;
      return [
        `<circle cx="${panelX + 30}" cy="${rowY}" r="9" fill="${accent ? palette.accent : palette.accentSoft}" stroke="${palette.accent}" />`,
        fittedTextBlock(row, panelX + 50, rowY + 1, panelW - 74, { color: accent ? palette.text : palette.muted, weight: 600, preferredSize: 13, minimumSize: 9, maxLines: 2, anchor: "start" })
      ].join("");
    })
  ].join("");
  const midX = diagram.width / 2;
  return [
    renderPanel(x, diagram.items[0] ?? "Before", leftRows, false),
    renderPanel(x + panelW + gap, diagram.secondaryItems[0] ?? "After", rightRows.length ? rightRows : diagram.items.slice(1, 5), true),
    `<circle cx="${midX}" cy="${y + panelH / 2}" r="28" fill="${palette.accent}" stroke="${palette.background}" stroke-width="4" />`,
    `<path d="M${midX - 10} ${y + panelH / 2 - 10}l12 10-12 10M${midX + 4} ${y + panelH / 2 - 10}l12 10-12 10" fill="none" stroke="${palette.background}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />`
  ].join("");
}

function mapSchematic(diagram: SchematicDiagram, palette: SchematicPalette): string {
  const items = diagram.items.slice(0, 5);
  const board = { x: 54, y: 124, w: 548, h: 308 };
  const legend = { x: 638, y: 126, w: 270, h: 302 };
  const positions = [
    { x: 0.22, y: 0.34 },
    { x: 0.52, y: 0.22 },
    { x: 0.75, y: 0.46 },
    { x: 0.40, y: 0.68 },
    { x: 0.68, y: 0.78 }
  ];
  const grid = Array.from({ length: 4 })
    .map((_, index) => {
      const gx = board.x + ((index + 1) * board.w) / 5;
      const gy = board.y + ((index + 1) * board.h) / 5;
      return `<path d="M${gx.toFixed(1)} ${board.y}v${board.h}M${board.x} ${gy.toFixed(1)}h${board.w}" stroke="${palette.line}" stroke-width="1" opacity="0.55" />`;
    })
    .join("");
  return [
    roundedRect(board.x, board.y, board.w, board.h, 28, palette.surface, palette.line),
    `<path d="M${board.x + 32} ${board.y + 232}c90-66 142-36 210-92 74-61 145-42 248 20" fill="none" stroke="${palette.accentSoft}" stroke-width="54" stroke-linecap="round" opacity="0.85" />`,
    grid,
    ...items.map((item, index) => {
      const pos = positions[index];
      const px = board.x + pos.x * board.w;
      const py = board.y + pos.y * board.h;
      return [
        `<path d="M${px.toFixed(1)} ${py.toFixed(1)}c0-18 14-32 32-32s32 14 32 32c0 24-32 56-32 56s-32-32-32-56z" fill="${palette.accent}" stroke="${palette.background}" stroke-width="3" transform="translate(-32 -32)" />`,
        `<text x="${px.toFixed(1)}" y="${(py - 35).toFixed(1)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="${palette.background}">${index + 1}</text>`,
        `<circle cx="${px.toFixed(1)}" cy="${(py + 24).toFixed(1)}" r="5" fill="${palette.accent}" opacity="0.28" />`,
        fittedTextBlock(item, px, py + 46, 120, { color: palette.text, weight: 700, preferredSize: 11, minimumSize: 8, maxLines: 2, anchor: "middle" })
      ].join("");
    }),
    roundedRect(legend.x, legend.y, legend.w, legend.h, 22, palette.surface, palette.line),
    fittedTextBlock(diagram.secondaryItems[0] ?? "Key points", legend.x + 24, legend.y + 32, legend.w - 48, { color: palette.text, weight: 700, preferredSize: 16, minimumSize: 10, maxLines: 1, anchor: "start" }),
    ...items.map((item, index) => {
      const rowY = legend.y + 72 + index * 42;
      return [
        `<circle cx="${legend.x + 26}" cy="${rowY}" r="12" fill="${palette.accentSoft}" stroke="${palette.accent}" />`,
        `<text x="${legend.x + 26}" y="${rowY + 4}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="${palette.accent}">${index + 1}</text>`,
        fittedTextBlock(item, legend.x + 48, rowY + 1, legend.w - 68, { color: palette.muted, weight: 600, preferredSize: 12, minimumSize: 8, maxLines: 2, anchor: "start" })
      ].join("");
    })
  ].join("");
}

function puzzleSchematic(diagram: SchematicDiagram, palette: SchematicPalette): string {
  const items = diagram.items.slice(0, 7);
  const count = items.length;
  const cx = diagram.width / 2;
  const cy = 292;
  const radius = count <= 3 ? 76 : 62;
  const positions =
    count <= 3
      ? items.map((_, index) => ({ x: cx + (index - (count - 1) / 2) * radius * 1.82, y: cy }))
      : [{ x: cx, y: cy }, ...items.slice(1).map((_, index) => {
          const angle = (Math.PI / 180) * (30 + index * 60);
          return { x: cx + Math.cos(angle) * radius * 1.72, y: cy + Math.sin(angle) * radius * 1.72 };
        })];
  return positions
    .map((position, index) => [
      `<polygon points="${hexPolygonPoints(position.x, position.y, radius)}" fill="${index === 0 ? palette.accentSoft : palette.surface}" stroke="${index === 0 ? palette.accent : palette.line}" stroke-width="2" />`,
      `<circle cx="${(position.x - radius * 0.42).toFixed(1)}" cy="${(position.y - radius * 0.32).toFixed(1)}" r="12" fill="${palette.accent}" />`,
      `<text x="${(position.x - radius * 0.42).toFixed(1)}" y="${(position.y - radius * 0.32 + 4).toFixed(1)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="${palette.background}">${index + 1}</text>`,
      fittedTextBlock(items[index], position.x, position.y + 8, radius * 1.25, { color: palette.text, weight: 700, preferredSize: 13, minimumSize: 8, maxLines: 3, anchor: "middle" })
    ].join(""))
    .join("");
}

function correlationSchematic(diagram: SchematicDiagram, palette: SchematicPalette): string {
  const center = diagram.items[0] ?? diagram.title;
  const leaves = diagram.items.slice(1, 7);
  const cx = diagram.width / 2;
  const cy = 292;
  const card = { w: 154, h: 70 };
  const radius = 210;
  const points = leaves.map((_, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / leaves.length;
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * 136 };
  });
  return [
    ...points.map((point, index) => {
      const mx = (cx + point.x) / 2;
      const my = (cy + point.y) / 2;
      const label = diagram.secondaryItems[index];
      return [
        `<path d="M${cx.toFixed(1)} ${cy.toFixed(1)}L${point.x.toFixed(1)} ${point.y.toFixed(1)}" stroke="${palette.line}" stroke-width="2" />`,
        label ? `<rect x="${(mx - 38).toFixed(1)}" y="${(my - 14).toFixed(1)}" width="76" height="24" rx="12" fill="${palette.background}" stroke="${palette.line}" />${fittedTextBlock(label, mx, my + 1, 64, { color: palette.muted, weight: 600, preferredSize: 11, minimumSize: 10, maxLines: 1, anchor: "middle" })}` : ""
      ].join("");
    }),
    ...points.map((point, index) => [
      roundedRect(point.x - card.w / 2, point.y - card.h / 2, card.w, card.h, 18, palette.surface, palette.line),
      fittedTextBlock(leaves[index], point.x, point.y + 2, card.w - 28, { color: palette.text, weight: 700, preferredSize: 13, minimumSize: 8, maxLines: 2, anchor: "middle" })
    ].join("")),
    roundedRect(cx - 116, cy - 46, 232, 92, 24, palette.accentSoft, palette.accent),
    fittedTextBlock(center, cx, cy + 3, 184, { color: palette.text, weight: 800, preferredSize: 16, minimumSize: 10, maxLines: 2, anchor: "middle" })
  ].join("");
}

function matrixSchematic(diagram: SchematicDiagram, palette: SchematicPalette): string {
  const x = 172;
  const y = 132;
  const w = 620;
  const h = 286;
  const cellW = w / 2;
  const cellH = h / 2;
  const cells = [
    { label: diagram.items[0] ?? "A", x, y, fill: palette.surface },
    { label: diagram.items[1] ?? "B", x: x + cellW, y, fill: palette.accentSoft },
    { label: diagram.items[2] ?? "C", x, y: y + cellH, fill: palette.surfaceAlt },
    { label: diagram.items[3] ?? "D", x: x + cellW, y: y + cellH, fill: palette.surface }
  ];
  return [
    `<path d="M${x - 28} ${y + h}v-${h - 10}m-8 8 8-8 8 8M${x} ${y + h + 28}h${w - 10}m-8-8 8 8-8 8" fill="none" stroke="${palette.accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />`,
    `<text x="${x - 58}" y="${y + h / 2}" transform="rotate(-90 ${x - 58} ${y + h / 2})" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="${palette.muted}">${escapeXml(diagram.axisY ?? "Impact")}</text>`,
    fittedTextBlock(diagram.axisX ?? "Maturity", x + w / 2, y + h + 54, w - 80, { color: palette.muted, weight: 700, preferredSize: 13, minimumSize: 9, maxLines: 1, anchor: "middle" }),
    roundedRect(x, y, w, h, 22, palette.surface, palette.line),
    ...cells.map((cell) => [
      `<rect x="${cell.x}" y="${cell.y}" width="${cellW}" height="${cellH}" fill="${cell.fill}" stroke="${palette.line}" />`,
      fittedTextBlock(cell.label, cell.x + cellW / 2, cell.y + cellH / 2, cellW - 56, { color: palette.text, weight: 700, preferredSize: 17, minimumSize: 10, maxLines: 2, anchor: "middle" })
    ].join(""))
  ].join("");
}

function vennSchematic(diagram: SchematicDiagram, palette: SchematicPalette): string {
  const items = diagram.items.slice(0, Math.min(3, Math.max(2, diagram.items.length)));
  const cx = diagram.width / 2;
  const cy = 286;
  const r = items.length === 3 ? 118 : 136;
  const circles =
    items.length === 3
      ? [
          { x: cx - 90, y: cy - 18 },
          { x: cx + 90, y: cy - 18 },
          { x: cx, y: cy + 96 }
        ]
      : [
          { x: cx - 86, y: cy },
          { x: cx + 86, y: cy }
        ];
  return [
    ...circles.map((circle, index) => `<circle cx="${circle.x}" cy="${circle.y}" r="${r}" fill="${index === 0 ? palette.accent : index === 1 ? palette.accentSoft : palette.surfaceAlt}" fill-opacity="0.42" stroke="${palette.accent}" stroke-width="2" />`),
    ...circles.map((circle, index) => fittedTextBlock(items[index] ?? `Set ${index + 1}`, circle.x, circle.y - (items.length === 3 && index === 2 ? -36 : 28), r * 1.1, { color: palette.text, weight: 700, preferredSize: 15, minimumSize: 9, maxLines: 2, anchor: "middle" })),
    roundedRect(cx - 90, cy - 18, 180, 46, 18, palette.surface, palette.line),
    fittedTextBlock(diagram.secondaryItems[0] ?? "Common value", cx, cy + 7, 150, { color: palette.text, weight: 800, preferredSize: 14, minimumSize: 9, maxLines: 1, anchor: "middle" })
  ].join("");
}

function crossSchematic(diagram: SchematicDiagram, palette: SchematicPalette): string {
  const operands = diagram.items.slice(0, 3);
  const result = diagram.secondaryItems[0] ?? diagram.items[3] ?? "Result";
  const gap = 30;
  const signW = 26;
  const resultW = 190;
  const operandW = Math.min(160, (diagram.width - 132 - resultW - signW - gap * (operands.length + 1)) / operands.length);
  const y = 238;
  const startX = (diagram.width - (operandW * operands.length + gap * (operands.length + 1) + signW * operands.length + resultW)) / 2;
  const parts = operands.flatMap((item, index) => {
    const boxX = startX + index * (operandW + gap + signW);
    return [
      roundedRect(boxX, y, operandW, 92, 22, palette.surface, palette.line),
      fittedTextBlock(item, boxX + operandW / 2, y + 47, operandW - 28, { color: palette.text, weight: 700, preferredSize: 15, minimumSize: 9, maxLines: 2, anchor: "middle" }),
      `<text x="${boxX + operandW + gap / 2}" y="${y + 56}" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="${palette.accent}">${index === operands.length - 1 ? "=" : "+"}</text>`
    ];
  });
  const resultX = startX + operands.length * (operandW + gap + signW);
  return [
    ...parts,
    roundedRect(resultX, y, resultW, 92, 22, palette.accentSoft, palette.accent),
    fittedTextBlock(result, resultX + resultW / 2, y + 47, resultW - 32, { color: palette.text, weight: 800, preferredSize: 16, minimumSize: 9, maxLines: 2, anchor: "middle" })
  ].join("");
}

function setSchematic(diagram: SchematicDiagram, palette: SchematicPalette): string {
  const groups = diagram.items.slice(0, Math.min(3, diagram.items.length));
  const members = diagram.secondaryItems.length ? diagram.secondaryItems : diagram.items.slice(groups.length);
  const gap = 22;
  const x = 64;
  const y = 134;
  const w = (diagram.width - x * 2 - gap * (groups.length - 1)) / groups.length;
  const h = 282;
  return groups
    .map((group, groupIndex) => {
      const panelX = x + groupIndex * (w + gap);
      const groupMembers = members.filter((_, index) => index % groups.length === groupIndex).slice(0, 3);
      return [
        roundedRect(panelX, y, w, h, 26, groupIndex === 0 ? palette.accentSoft : palette.surface, palette.line),
        `<circle cx="${panelX + w / 2}" cy="${y + 58}" r="34" fill="${palette.accent}" opacity="${groupIndex === 0 ? "1" : "0.85"}" />`,
        fittedTextBlock(group, panelX + w / 2, y + 118, w - 42, { color: palette.text, weight: 800, preferredSize: 16, minimumSize: 10, maxLines: 2, anchor: "middle" }),
        ...groupMembers.map((member, index) => {
          const rowY = y + 164 + index * 42;
          return [
            `<rect x="${panelX + 26}" y="${rowY}" width="${w - 52}" height="28" rx="14" fill="${palette.surfaceAlt}" stroke="${palette.line}" />`,
            fittedTextBlock(member, panelX + w / 2, rowY + 15, w - 74, { color: palette.muted, weight: 600, preferredSize: 11, minimumSize: 8, maxLines: 1, anchor: "middle" })
          ].join("");
        })
      ].join("");
    })
    .join("");
}

function contrastSchematic(diagram: SchematicDiagram, palette: SchematicPalette): string {
  const leftTitle = diagram.items[0] ?? "Option A";
  const rightTitle = diagram.secondaryItems[0] ?? "Option B";
  const leftRows = diagram.items.slice(1, 5);
  const rightRows = (diagram.secondaryItems.length > 1 ? diagram.secondaryItems.slice(1, 5) : diagram.items.slice(1, 5)).slice(0, 4);
  const x = 70;
  const y = 136;
  const w = 355;
  const h = 278;
  const rightX = diagram.width - x - w;
  const panel = (panelX: number, title: string, rows: string[], accent: boolean): string => [
    roundedRect(panelX, y, w, h, 24, accent ? palette.accentSoft : palette.surface, palette.line),
    `<rect x="${panelX}" y="${y}" width="${w}" height="52" rx="24" fill="${accent ? palette.accent : palette.surfaceAlt}" />`,
    fittedTextBlock(title, panelX + w / 2, y + 31, w - 42, { color: accent ? palette.background : palette.text, weight: 800, preferredSize: 16, minimumSize: 10, maxLines: 1, anchor: "middle" }),
    ...rows.map((row, index) => {
      const rowY = y + 82 + index * 45;
      return [
        `<path d="M${panelX + 26} ${rowY + 14}h${w - 52}" stroke="${palette.line}" opacity="0.65" />`,
        fittedTextBlock(row, panelX + 32, rowY + 3, w - 64, { color: palette.text, weight: 600, preferredSize: 12, minimumSize: 8, maxLines: 2, anchor: "start" })
      ].join("");
    })
  ].join("");
  const midX = diagram.width / 2;
  return [
    panel(x, leftTitle, leftRows, false),
    panel(rightX, rightTitle, rightRows, true),
    `<circle cx="${midX}" cy="${y + h / 2}" r="34" fill="${palette.background}" stroke="${palette.accent}" stroke-width="3" />`,
    `<text x="${midX}" y="${y + h / 2 + 9}" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="800" fill="${palette.accent}">VS</text>`
  ].join("");
}

function scaleContrastSchematic(diagram: SchematicDiagram, palette: SchematicPalette): string {
  const items = diagram.items.slice(0, 4);
  const values = items.map((item, index) => Math.max(0, parseSchematicValue(diagram.secondaryItems[index] ?? item, (items.length - index) * 25)));
  const max = Math.max(...values, 1);
  const y = 296;
  const gap = 30;
  const slotW = (diagram.width - 112 - gap * (items.length - 1)) / items.length;
  return items
    .map((item, index) => {
      const cx = 56 + slotW / 2 + index * (slotW + gap);
      const r = 34 + Math.sqrt(values[index] / max) * 78;
      return [
        `<circle cx="${cx}" cy="${y}" r="${r.toFixed(1)}" fill="${index === 0 ? palette.accent : palette.accentSoft}" fill-opacity="${index === 0 ? "0.88" : "0.72"}" stroke="${palette.accent}" stroke-width="2" />`,
        `<text x="${cx}" y="${y + 7}" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="800" fill="${index === 0 ? palette.background : palette.text}">${escapeXml(String(values[index]))}</text>`,
        fittedTextBlock(item.replace(/-?\d+(?:[,.]\d+)*/, "").trim() || item, cx, y + r + 34, slotW - 20, { color: palette.text, weight: 700, preferredSize: 13, minimumSize: 8, maxLines: 2, anchor: "middle" })
      ].join("");
    })
    .join("");
}

function growSchematic(diagram: SchematicDiagram, palette: SchematicPalette): string {
  const labels = [diagram.items[0] ?? "TAM", diagram.items[1] ?? "SAM", diagram.items[2] ?? "SOM"];
  const cx = 368;
  const cy = 292;
  const radii = [148, 104, 62];
  return [
    ...radii.map((radius, index) => `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${mixHex(palette.accentSoft, palette.surface, index * 0.28)}" stroke="${palette.accent}" stroke-width="${index === 2 ? 2.5 : 1.5}" />`),
    ...labels.map((label, index) => fittedTextBlock(label, cx, cy - radii[index] + 34 + index * 58, radii[index] * 1.45, { color: palette.text, weight: 800, preferredSize: 15, minimumSize: 9, maxLines: 1, anchor: "middle" })),
    roundedRect(604, 142, 286, 276, 24, palette.surface, palette.line),
    ...labels.map((label, index) => {
      const rowY = 186 + index * 72;
      return [
        `<circle cx="638" cy="${rowY}" r="${14 - index * 2}" fill="${index === 2 ? palette.accent : palette.accentSoft}" stroke="${palette.accent}" />`,
        fittedTextBlock(label, 664, rowY + 1, 194, { color: palette.text, weight: 700, preferredSize: 14, minimumSize: 9, maxLines: 2, anchor: "start" }),
        diagram.secondaryItems[index] ? fittedTextBlock(diagram.secondaryItems[index], 664, rowY + 30, 194, { color: palette.muted, weight: 500, preferredSize: 11, minimumSize: 10, maxLines: 1, anchor: "start" }) : ""
      ].join("");
    })
  ].join("");
}

function layerSchematic(diagram: SchematicDiagram, palette: SchematicPalette): string {
  const items = diagram.items.slice(0, 5);
  const x = 112;
  const y = 128;
  const w = diagram.width - 224;
  const totalH = 296;
  const bandH = totalH / items.length;
  return items
    .map((item, index) => {
      const bandY = y + index * bandH;
      return [
        roundedRect(x + index * 16, bandY, w - index * 32, bandH - 8, 18, index === 0 ? palette.accentSoft : index % 2 ? palette.surfaceAlt : palette.surface, palette.line),
        `<circle cx="${x + index * 16 + 30}" cy="${bandY + bandH / 2 - 4}" r="14" fill="${palette.accent}" />`,
        `<text x="${x + index * 16 + 30}" y="${bandY + bandH / 2 + 1}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="800" fill="${palette.background}">${index + 1}</text>`,
        fittedTextBlock(item, x + index * 16 + 58, bandY + bandH / 2 - 4, w - index * 32 - 210, { color: palette.text, weight: 800, preferredSize: 15, minimumSize: 9, maxLines: 1, anchor: "start" }),
        diagram.secondaryItems[index] ? fittedTextBlock(diagram.secondaryItems[index], x + w - index * 16 - 132, bandY + bandH / 2 - 4, 120, { color: palette.muted, weight: 600, preferredSize: 11, minimumSize: 10, maxLines: 2, anchor: "middle" }) : ""
      ].join("");
    })
    .join("");
}

function triangleSchematic(diagram: SchematicDiagram, palette: SchematicPalette): string {
  const items = diagram.items.slice(0, 4);
  const levels = items.length;
  const cx = diagram.width / 2;
  const y = 128;
  const totalH = 300;
  const levelH = totalH / levels;
  const minW = 170;
  const maxW = 620;
  return items
    .map((item, index) => {
      const topW = minW + ((maxW - minW) * index) / levels;
      const bottomW = minW + ((maxW - minW) * (index + 1)) / levels;
      const topY = y + index * levelH;
      const bottomY = topY + levelH - 8;
      const fill = index === 0 ? palette.accent : mixHex(palette.accentSoft, palette.surface, index / Math.max(1, levels - 1));
      return [
        `<path d="M${(cx - topW / 2).toFixed(1)} ${topY.toFixed(1)}H${(cx + topW / 2).toFixed(1)}L${(cx + bottomW / 2).toFixed(1)} ${bottomY.toFixed(1)}H${(cx - bottomW / 2).toFixed(1)}Z" fill="${fill}" stroke="${palette.line}" />`,
        fittedTextBlock(item, cx, topY + levelH / 2 - 1, bottomW - 84, { color: index === 0 ? palette.background : palette.text, weight: 800, preferredSize: 15, minimumSize: 9, maxLines: 1, anchor: "middle" })
      ].join("");
    })
    .join("");
}

function stepSchematic(diagram: SchematicDiagram, palette: SchematicPalette): string {
  const items = diagram.items.slice(0, 5);
  const gap = 16;
  const x = 86;
  const baseY = 424;
  const maxH = 278;
  const w = (diagram.width - x * 2 - gap * (items.length - 1)) / items.length;
  return items
    .map((item, index) => {
      const h = 86 + (maxH - 86) * ((index + 1) / items.length);
      const barX = x + index * (w + gap);
      const barY = baseY - h;
      const connector = index < items.length - 1 ? `<path d="M${barX + w} ${barY}h${gap}v${-(maxH - h) / items.length}" fill="none" stroke="${palette.accent}" stroke-width="2" stroke-linecap="round" />` : "";
      return [
        roundedRect(barX, barY, w, h, 20, index === items.length - 1 ? palette.accentSoft : palette.surface, palette.line),
        `<circle cx="${barX + 28}" cy="${barY + 28}" r="14" fill="${palette.accent}" />`,
        `<text x="${barX + 28}" y="${barY + 33}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="800" fill="${palette.background}">${index + 1}</text>`,
        fittedTextBlock(item, barX + w / 2, barY + h / 2 + 12, w - 28, { color: palette.text, weight: 800, preferredSize: 14, minimumSize: 8, maxLines: 3, anchor: "middle" }),
        connector
      ].join("");
    })
    .join("");
}

function ganttSchematic(diagram: SchematicDiagram, palette: SchematicPalette): string {
  const tasks = diagram.items.slice(0, 6);
  const periods = (diagram.secondaryItems.length ? diagram.secondaryItems : ["1", "2", "3", "4"]).slice(0, 5);
  const x = 216;
  const y = 130;
  const chartW = 680;
  const rowH = 42;
  const headerH = 36;
  const periodW = chartW / periods.length;
  return [
    roundedRect(64, y, 138, headerH + rowH * tasks.length, 18, palette.surface, palette.line),
    roundedRect(x, y, chartW, headerH + rowH * tasks.length, 18, palette.surface, palette.line),
    ...periods.map((period, index) => [
      `<rect x="${x + index * periodW}" y="${y}" width="${periodW}" height="${headerH}" fill="${index % 2 ? palette.surfaceAlt : palette.accentSoft}" stroke="${palette.line}" />`,
      fittedTextBlock(period, x + index * periodW + periodW / 2, y + 21, periodW - 18, { color: palette.text, weight: 800, preferredSize: 11, minimumSize: 8, maxLines: 1, anchor: "middle" })
    ].join("")),
    ...tasks.map((task, index) => {
      const rowY = y + headerH + index * rowH;
      const start = Math.min(index, Math.max(0, periods.length - 1));
      const duration = Math.min(index % 2 === 0 ? 2 : 1, periods.length - start);
      return [
        `<rect x="64" y="${rowY}" width="138" height="${rowH}" fill="${index % 2 ? palette.surfaceAlt : palette.surface}" stroke="${palette.line}" />`,
        fittedTextBlock(task, 78, rowY + rowH / 2 + 1, 112, { color: palette.text, weight: 600, preferredSize: 11, minimumSize: 8, maxLines: 2, anchor: "start" }),
        `<rect x="${x}" y="${rowY}" width="${chartW}" height="${rowH}" fill="${index % 2 ? palette.surfaceAlt : palette.surface}" stroke="${palette.line}" opacity="0.74" />`,
        `<rect x="${x + start * periodW + 10}" y="${rowY + 10}" width="${periodW * duration - 20}" height="22" rx="11" fill="${index === tasks.length - 1 ? palette.accent : palette.accentSoft}" stroke="${palette.accent}" />`
      ].join("");
    })
  ].join("");
}

function rankingSchematic(diagram: SchematicDiagram, palette: SchematicPalette): string {
  const items = diagram.items.slice(0, 6);
  const values = items.map((item, index) => parseSchematicValue(diagram.secondaryItems[index] ?? item, (items.length - index) * 10));
  const max = Math.max(...values, 1);
  const x = 78;
  const y = 124;
  const rowH = 48;
  const barX = 370;
  const barMaxW = 438;
  return items
    .map((item, index) => {
      const rowY = y + index * rowH;
      const barW = Math.max(52, (values[index] / max) * barMaxW);
      return [
        roundedRect(x, rowY, diagram.width - 156, 38, 18, index < 3 ? palette.accentSoft : palette.surface, palette.line),
        `<circle cx="${x + 24}" cy="${rowY + 19}" r="16" fill="${index < 3 ? palette.accent : palette.surfaceAlt}" stroke="${palette.accent}" />`,
        `<text x="${x + 24}" y="${rowY + 25}" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="800" fill="${index < 3 ? palette.background : palette.accent}">${index + 1}</text>`,
        fittedTextBlock(item.replace(/-?\d+(?:[,.]\d+)*/, "").trim() || item, x + 54, rowY + 20, 270, { color: palette.text, weight: 700, preferredSize: 13, minimumSize: 8, maxLines: 1, anchor: "start" }),
        `<rect x="${barX}" y="${rowY + 10}" width="${barW.toFixed(1)}" height="18" rx="9" fill="${index === 0 ? palette.accent : palette.accentSoft}" stroke="${palette.accent}" />`,
        `<text x="${barX + barW + 16}" y="${rowY + 25}" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="${palette.muted}">${escapeXml(String(values[index]))}</text>`
      ].join("");
    })
    .join("");
}

const SCHEMATIC_RENDERERS: Record<SchematicKind, (diagram: SchematicDiagram, palette: SchematicPalette) => string> = {
  table: tableSchematic,
  tree: treeSchematic,
  flow: flowSchematic,
  "vertical-flow": verticalFlowSchematic,
  cycle: cycleSchematic,
  "before-after": beforeAfterSchematic,
  map: mapSchematic,
  puzzle: puzzleSchematic,
  correlation: correlationSchematic,
  matrix: matrixSchematic,
  venn: vennSchematic,
  cross: crossSchematic,
  set: setSchematic,
  contrast: contrastSchematic,
  "scale-contrast": scaleContrastSchematic,
  grow: growSchematic,
  layer: layerSchematic,
  triangle: triangleSchematic,
  step: stepSchematic,
  gantt: ganttSchematic,
  ranking: rankingSchematic,
  list: (diagram, palette) => listSchematic(diagram, palette),
  "list-horizontal": (diagram, palette) => listSchematic(diagram, palette, true),
  "list-enumeration": (diagram, palette) => listSchematic(diagram, palette, false, true),
  mockup: mockupSchematic
};

export function renderSchematicDiagram(input: unknown): { svg: string; summary: string; longDescription: string } {
  const diagram = SchematicDiagramSchema.parse(input);
  const palette = SCHEMATIC_PALETTES[diagram.tone];
  const render = SCHEMATIC_RENDERERS[diagram.kind] ?? ((d: SchematicDiagram, p: SchematicPalette) => listSchematic(d, p));
  const body = render(diagram, palette);

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${diagram.width} ${diagram.height}" role="img">`,
    `<title>${escapeXml(diagram.title)}</title>`,
    `<desc>${escapeXml(diagram.longDescription)}</desc>`,
    `<rect width="${diagram.width}" height="${diagram.height}" fill="${palette.background}" />`,
    textBlock(wrapLabel(diagram.title, 28), 48, 58, { color: palette.text, size: 24, weight: 700 }),
    `<rect x="48" y="84" width="70" height="4" rx="2" fill="${palette.accent}" />`,
    body,
    "</svg>"
  ].join("");

  return {
    svg,
    summary: diagram.summary,
    longDescription: diagram.longDescription
  };
}


function centerOf(node: PlacedNode): { x: number; y: number } {
  return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
}

type Point = { x: number; y: number };
type NativeRect = { x: number; y: number; w: number; h: number };
type ConnectorOptions = {
  color: string;
  dashed: boolean;
  bidirectional: boolean;
  orthogonal: boolean;
  label?: string;
  bypass?: { axis: "over" | "side"; gutter: number };
};
type ConnectorRoute = { points: Point[]; startDir: Point; endDir: Point };

// Inline, PowerPoint-safe icon glyphs (stroke paths) drawn centered in a 24x24 box.
function nodeIconGlyph(kind: PonchiNode["kind"], cx: number, cy: number, color: string): string {
  const s = `stroke="${color}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  const g = (body: string): string => `<g transform="translate(${cx - 12} ${cy - 12})">${body}</g>`;
  switch (kind) {
    case "actor":
      return g(`<circle cx="12" cy="8" r="3.4" ${s} /><path d="M5.5 19c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" ${s} />`);
    case "system":
      return g(`<rect x="4" y="5" width="16" height="5" rx="1.6" ${s} /><rect x="4" y="13" width="16" height="5" rx="1.6" ${s} /><circle cx="7.5" cy="7.5" r="0.9" fill="${color}" /><circle cx="7.5" cy="15.5" r="0.9" fill="${color}" />`);
    case "data":
      return g(`<ellipse cx="12" cy="6.5" rx="7" ry="2.8" ${s} /><path d="M5 6.5v11c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-11" ${s} /><path d="M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8" ${s} />`);
    case "cloud":
      return g(`<path d="M7 17h10a3.4 3.4 0 0 0 .3-6.8A5 5 0 0 0 7.6 9.4 3.8 3.8 0 0 0 7 17z" ${s} />`);
    case "note":
      return g(`<path d="M6 4h8l4 4v12H6z" ${s} /><path d="M14 4v4h4" ${s} /><path d="M9 12h6M9 15h6" ${s} />`);
    default:
      return g(`<circle cx="12" cy="12" r="7.5" ${s} /><path d="M12 4.5v2M12 17.5v2M4.5 12h2M17.5 12h2" ${s} />`);
  }
}

// Point on the border of a node rectangle along the ray from its center toward (tx, ty).
function edgePoint(node: PlacedNode, tx: number, ty: number): Point {
  const c = centerOf(node);
  const dx = tx - c.x;
  const dy = ty - c.y;
  if (dx === 0 && dy === 0) {
    return c;
  }

  const scale = Math.min(
    dx !== 0 ? node.w / 2 / Math.abs(dx) : Number.POSITIVE_INFINITY,
    dy !== 0 ? node.h / 2 / Math.abs(dy) : Number.POSITIVE_INFINITY
  );
  return { x: c.x + dx * scale, y: c.y + dy * scale };
}

function arrowHead(tip: Point, dir: Point, color: string, size = 11): string {
  const base = { x: tip.x - dir.x * size, y: tip.y - dir.y * size };
  const px = -dir.y;
  const py = dir.x;
  const half = size * 0.55;
  const a = `${(base.x + px * half).toFixed(1)} ${(base.y + py * half).toFixed(1)}`;
  const b = `${(base.x - px * half).toFixed(1)} ${(base.y - py * half).toFixed(1)}`;
  return `<polygon points="${tip.x.toFixed(1)} ${tip.y.toFixed(1)} ${a} ${b}" fill="${color}" />`;
}

function connectorRoute(from: PlacedNode, to: PlacedNode, options: ConnectorOptions): ConnectorRoute {
  const a = centerOf(from);
  const b = centerOf(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);

  let start: Point;
  let end: Point;
  let endDir: Point;
  let startDir: Point;
  let points: Point[];

  if (options.bypass && options.bypass.axis === "over") {
    // Route over the top (or bottom) gutter: exit the from-edge nearest the gutter and enter the
    // matching to-edge, so the arrow clears every node stacked between the two ranks.
    const gutter = options.bypass.gutter;
    const sy = gutter <= from.y ? from.y : from.y + from.h;
    const ey = gutter <= to.y ? to.y : to.y + to.h;
    start = { x: a.x, y: sy };
    end = { x: b.x, y: ey };
    points = [start, { x: start.x, y: gutter }, { x: end.x, y: gutter }, end];
    endDir = { x: 0, y: gutter <= to.y ? 1 : -1 };
    startDir = { x: 0, y: gutter <= from.y ? -1 : 1 };
  } else if (options.bypass) {
    // Route through a side gutter (left/right of the node band) for top-to-bottom skip arrows.
    const gutter = options.bypass.gutter;
    const sx = gutter >= from.x + from.w ? from.x + from.w : from.x;
    const ex = gutter >= to.x + to.w ? to.x + to.w : to.x;
    start = { x: sx, y: a.y };
    end = { x: ex, y: b.y };
    points = [start, { x: gutter, y: start.y }, { x: gutter, y: end.y }, end];
    endDir = { x: gutter >= to.x + to.w ? -1 : 1, y: 0 };
    startDir = { x: gutter >= from.x + from.w ? 1 : -1, y: 0 };
  } else if (options.orthogonal && horizontal) {
    const sx = dx >= 0 ? from.x + from.w : from.x;
    const ex = dx >= 0 ? to.x : to.x + to.w;
    start = { x: sx, y: a.y };
    end = { x: ex, y: b.y };
    const midX = (sx + ex) / 2;
    points = [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
    endDir = { x: Math.sign(ex - midX) || (dx >= 0 ? 1 : -1), y: 0 };
    startDir = { x: dx >= 0 ? -1 : 1, y: 0 };
  } else if (options.orthogonal) {
    const sy = dy >= 0 ? from.y + from.h : from.y;
    const ey = dy >= 0 ? to.y : to.y + to.h;
    start = { x: a.x, y: sy };
    end = { x: b.x, y: ey };
    const midY = (sy + ey) / 2;
    points = [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
    endDir = { x: 0, y: Math.sign(ey - midY) || (dy >= 0 ? 1 : -1) };
    startDir = { x: 0, y: dy >= 0 ? -1 : 1 };
  } else {
    start = edgePoint(from, b.x, b.y);
    end = edgePoint(to, a.x, a.y);
    const len = Math.hypot(end.x - start.x, end.y - start.y) || 1;
    endDir = { x: (end.x - start.x) / len, y: (end.y - start.y) / len };
    startDir = { x: -endDir.x, y: -endDir.y };
    points = [start, end];
  }

  return { points, startDir, endDir };
}

function svgPathFromPoints(points: Point[]): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
}

// Build an orthogonal (elbow) or straight connector that starts and ends on the node borders, with
// an explicit arrowhead (PowerPoint renders SVG markers unreliably, so we draw the head as a polygon).
// When `bypass` is set the connector detours through a clear gutter so a skip-rank arrow visibly
// routes around the nodes it would otherwise pass straight through.
function connector(from: PlacedNode, to: PlacedNode, options: ConnectorOptions): string {
  const route = connectorRoute(from, to, options);
  const start = route.points[0];
  const end = route.points[route.points.length - 1];
  const dash = options.dashed ? ` stroke-dasharray="7 5"` : "";
  const strokeWidth = 2.4;

  const parts = [
    `<path d="${svgPathFromPoints(route.points)}" fill="none" stroke="${options.color}" stroke-width="${strokeWidth}"${dash} stroke-linejoin="round" stroke-linecap="round" />`,
    arrowHead(end, route.endDir, options.color)
  ];
  if (options.bidirectional) {
    parts.push(arrowHead(start, route.startDir, options.color));
  }

  if (options.label) {
    const placement = connectorLabelPlacement(route.points, [], { x: 0, y: 0, w: Number.MAX_SAFE_INTEGER, h: Number.MAX_SAFE_INTEGER });
    const lx = placement.anchor.x;
    const ly = placement.anchor.y;
    const chipW = Math.min(220, options.label.length * 9 + 20);
    parts.push(
      `<rect x="${(lx - chipW / 2).toFixed(1)}" y="${(ly - 13).toFixed(1)}" width="${chipW}" height="22" rx="11" fill="#ffffff" stroke="${options.color}" stroke-opacity="0.35" />`,
      `<text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="600" fill="#334155">${escapeXml(options.label)}</text>`
    );
  }

  return parts.join("");
}

function ponchiNode(node: PlacedNode): string {
  const palette = NODE_COLORS[node.kind];
  const accent = node.accent ?? palette.accent;
  const c = centerOf(node);
  const icon = node.icon ?? node.kind;
  const hasIcon = icon !== "none";
  const textMaxWidth = Math.max(48, node.w - 32);
  const labelFit = fitLabel(node.label, textMaxWidth, {
    preferredSize: 15,
    minimumSize: 11,
    maxLines: node.sublabel ? 2 : 3
  });
  const sublabelFit = node.sublabel
    ? fitLabel(node.sublabel, textMaxWidth, {
        preferredSize: 12,
        minimumSize: 9,
        maxLines: 2
      })
    : undefined;
  const labelLines = labelFit.lines;
  const sublabelLines = sublabelFit?.lines ?? [];
  const iconTop = node.y + 18;
  const labelLineHeight = labelFit.size * 1.22;
  const sublabelLineHeight = (sublabelFit?.size ?? 12) * 1.2;
  const textBlockHeight = Math.max(0, (labelLines.length - 1) * labelLineHeight) + (sublabelLines.length ? labelFit.size + sublabelLines.length * sublabelLineHeight : labelFit.size);
  const preferredStartY = hasIcon ? node.y + 44 : c.y - textBlockHeight / 2 + labelFit.size * 0.75;
  const labelStartY = Math.min(Math.max(node.y + 24, preferredStartY), node.y + node.h - textBlockHeight + labelFit.size * 0.75 - 10);

  const parts = [
    // Soft shadow for depth (offset translucent rect; opacity renders reliably in PowerPoint).
    `<rect x="${node.x + 2}" y="${node.y + 4}" width="${node.w}" height="${node.h}" rx="16" fill="#0f172a" fill-opacity="0.06" />`,
    `<rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="16" fill="${palette.fill}" stroke="${node.emphasis ? accent : palette.stroke}" stroke-width="${node.emphasis ? 2.4 : 1.4}" />`,
    `<rect x="${node.x}" y="${node.y}" width="${node.w}" height="6" rx="3" fill="${accent}" />`
  ];

  if (hasIcon) {
    parts.push(nodeIconGlyph(icon as PonchiNode["kind"], c.x, iconTop + 6, accent));
  }

  labelLines.forEach((line, index) => {
    parts.push(
      `<text x="${c.x}" y="${(labelStartY + index * labelLineHeight).toFixed(1)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${labelFit.size}" font-weight="700" fill="#0f172a">${escapeXml(line)}</text>`
    );
  });
  sublabelLines.forEach((line, index) => {
    parts.push(
      `<text x="${c.x}" y="${(labelStartY + labelLines.length * labelLineHeight + index * sublabelLineHeight + 2).toFixed(1)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${sublabelFit?.size ?? 12}" font-weight="500" fill="#52606d">${escapeXml(line)}</text>`
    );
  });

  return parts.join("");
}

// ---------------------------------------------------------------------------
// Automatic layered layout. When nodes omit x/y, the engine places them so that
// arrows always connect cleanly border-to-border, even for branching (non-linear)
// graphs. This removes the need for agents to compute coordinates by hand (the
// source of dangling/penetrating arrows when a layout is not a simple row).
// ---------------------------------------------------------------------------
const AUTO_NODE_W = 176;
const AUTO_NODE_H = 92;
const AUTO_COL_GAP = 104;
const AUTO_ROW_GAP = 46;
const AUTO_MARGIN = 60;

// Longest-path layering from the arrow graph: sources sit at rank 0 and every target is pushed at
// least one rank past its deepest source. Cycles are bounded by the node count so this terminates.
function diagramRanks(diagram: PonchiDiagram): Map<string, number> {
  const rank = new Map<string, number>();
  for (const node of diagram.nodes) {
    rank.set(node.id, 0);
  }

  const edges = diagram.arrows.filter((arrow) => arrow.from !== arrow.to && rank.has(arrow.from) && rank.has(arrow.to));
  for (let iteration = 0; iteration < diagram.nodes.length; iteration += 1) {
    let changed = false;
    for (const edge of edges) {
      const source = rank.get(edge.from) ?? 0;
      const target = rank.get(edge.to) ?? 0;
      if (target < source + 1) {
        rank.set(edge.to, source + 1);
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }

  // Explicit layer hints win over the derived layering.
  for (const node of diagram.nodes) {
    if (typeof node.layer === "number") {
      rank.set(node.id, node.layer);
    }
  }

  return rank;
}

function placeRanks(ranks: PonchiNode[][], rowsMode: boolean): { nodes: PlacedNode[]; width: number; height: number } {
  const w = AUTO_NODE_W;
  const h = AUTO_NODE_H;
  const rankCount = ranks.length;
  const maxInRank = Math.max(1, ...ranks.map((rank) => rank.length));
  const placed: PlacedNode[] = [];

  if (rowsMode) {
    // Each rank is a row; nodes spread horizontally, ranks stack downward.
    const contentW = maxInRank * w + (maxInRank - 1) * AUTO_COL_GAP;
    const contentH = rankCount * h + (rankCount - 1) * AUTO_ROW_GAP;
    ranks.forEach((rank, rankIndex) => {
      const y = AUTO_MARGIN + rankIndex * (h + AUTO_ROW_GAP);
      const rowW = rank.length * w + (rank.length - 1) * AUTO_COL_GAP;
      const startX = AUTO_MARGIN + (contentW - rowW) / 2;
      rank.forEach((node, columnIndex) => {
        placed.push({ ...node, x: startX + columnIndex * (w + AUTO_COL_GAP), y, w, h });
      });
    });
    return { nodes: placed, width: contentW + 2 * AUTO_MARGIN, height: contentH + 2 * AUTO_MARGIN };
  }

  // Each rank is a column; nodes stack downward, ranks march rightward.
  const contentW = rankCount * w + (rankCount - 1) * AUTO_COL_GAP;
  const contentH = maxInRank * h + (maxInRank - 1) * AUTO_ROW_GAP;
  ranks.forEach((rank, rankIndex) => {
    const x = AUTO_MARGIN + rankIndex * (w + AUTO_COL_GAP);
    const colH = rank.length * h + (rank.length - 1) * AUTO_ROW_GAP;
    const startY = AUTO_MARGIN + (contentH - colH) / 2;
    rank.forEach((node, rowIndex) => {
      placed.push({ ...node, x, y: startY + rowIndex * (h + AUTO_ROW_GAP), w, h });
    });
  });
  return { nodes: placed, width: contentW + 2 * AUTO_MARGIN, height: contentH + 2 * AUTO_MARGIN };
}

function autoLayout(diagram: PonchiDiagram): { nodes: PlacedNode[]; width: number; height: number } {
  const orderIndex = new Map(diagram.nodes.map((node, index) => [node.id, index]));
  const orderWithinRank = (rank: PonchiNode[]): PonchiNode[] =>
    [...rank].sort((a, b) => {
      const laneCompare = (a.lane ?? "").localeCompare(b.lane ?? "");
      return laneCompare !== 0 ? laneCompare : (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0);
    });

  const hasArrows = diagram.arrows.some((arrow) => arrow.from !== arrow.to);
  if (!hasArrows) {
    // No connections: arrange in a near-square grid so a bag of cards reads cleanly.
    const columns = Math.max(1, Math.round(Math.sqrt(diagram.nodes.length)));
    const rows: PonchiNode[][] = [];
    for (let index = 0; index < diagram.nodes.length; index += columns) {
      rows.push(diagram.nodes.slice(index, index + columns));
    }
    return placeRanks(rows, true);
  }

  const rankOf = diagramRanks(diagram);
  const byRank = new Map<number, PonchiNode[]>();
  for (const node of diagram.nodes) {
    const value = rankOf.get(node.id) ?? 0;
    const bucket = byRank.get(value) ?? [];
    bucket.push(node);
    byRank.set(value, bucket);
  }

  const ranks = [...byRank.keys()].sort((a, b) => a - b).map((key) => orderWithinRank(byRank.get(key) ?? []));
  return placeRanks(ranks, diagram.direction === "TB");
}

// Resolve every node to absolute coordinates: hand-placed coordinates pass through unchanged,
// otherwise the auto-layout assigns them and reports the canvas size needed to frame the result.
function resolveLayout(diagram: PonchiDiagram): { nodes: PlacedNode[]; width: number; height: number } {
  const allPlaced = diagram.nodes.every((node) => node.x !== undefined && node.y !== undefined);
  if (allPlaced) {
    return {
      nodes: diagram.nodes.map((node) => ({ ...node, x: node.x ?? 0, y: node.y ?? 0, w: node.w, h: node.h })),
      width: diagram.width,
      height: diagram.height
    };
  }
  return autoLayout(diagram);
}

// Decide whether an arrow needs to detour around intermediate nodes, and through which gutter. A
// direct orthogonal elbow can pass straight through a node that sits between the two ranks (a
// skip-rank arrow); when that happens we route the connector through a clear gutter (over/under for
// left-to-right flows, to the side for top-to-bottom flows) so the connection stays legible. The
// gutter side is chosen to avoid the from/to node's own neighbours, so the detour never re-enters a
// node it just left.
function bypassFor(
  from: PlacedNode,
  to: PlacedNode,
  nodes: PlacedNode[],
  direction: "LR" | "TB",
  canvasWidth: number,
  canvasHeight: number
): { axis: "over" | "side"; gutter: number } | undefined {
  const horizontal = direction !== "TB";
  const fromCx = from.x + from.w / 2;
  const fromCy = from.y + from.h / 2;
  const toCx = to.x + to.w / 2;
  const toCy = to.y + to.h / 2;
  const tolerance = 2;
  const others = nodes.filter((node) => node.id !== from.id && node.id !== to.id);

  // A node "crosses" the elbow when its centre sits between the endpoints on the primary axis and it
  // covers either endpoint's lane on the cross axis (the elbow's two straight runs sit on those lanes).
  const crossingNodes = others.filter((node) => {
    const nodeCx = node.x + node.w / 2;
    const nodeCy = node.y + node.h / 2;
    if (horizontal) {
      const betweenX = nodeCx > Math.min(fromCx, toCx) + tolerance && nodeCx < Math.max(fromCx, toCx) - tolerance;
      const coversLane = (node.y < fromCy && node.y + node.h > fromCy) || (node.y < toCy && node.y + node.h > toCy);
      return betweenX && coversLane;
    }
    const betweenY = nodeCy > Math.min(fromCy, toCy) + tolerance && nodeCy < Math.max(fromCy, toCy) - tolerance;
    const coversLane = (node.x < fromCx && node.x + node.w > fromCx) || (node.x < toCx && node.x + node.w > toCx);
    return betweenY && coversLane;
  });

  if (crossingNodes.length === 0) {
    return undefined;
  }

  // Does `node` have a neighbour in the given direction that an exit toward that gutter would cross?
  const neighbour = (node: PlacedNode, side: "up" | "down" | "left" | "right"): boolean =>
    others.some((other) => {
      if (side === "up" || side === "down") {
        const xOverlap = other.x < node.x + node.w - tolerance && other.x + other.w > node.x + tolerance;
        if (!xOverlap) {
          return false;
        }
        return side === "up" ? other.y + other.h <= node.y + tolerance : other.y >= node.y + node.h - tolerance;
      }
      const yOverlap = other.y < node.y + node.h - tolerance && other.y + other.h > node.y + tolerance;
      if (!yOverlap) {
        return false;
      }
      return side === "left" ? other.x + other.w <= node.x + tolerance : other.x >= node.x + node.w - tolerance;
    });

  if (horizontal) {
    const overClear = !neighbour(from, "up") && !neighbour(to, "up");
    const underClear = !neighbour(from, "down") && !neighbour(to, "down");
    const spread = [from, to, ...crossingNodes];
    const overGutter = Math.min(...spread.map((node) => node.y)) - AUTO_ROW_GAP * 0.55;
    const underGutter = Math.max(...spread.map((node) => node.y + node.h)) + AUTO_ROW_GAP * 0.55;
    const overFits = overGutter >= 12;
    const underFits = underGutter <= canvasHeight - 12;
    const preferOver = overClear || (!underClear && fromCy <= canvasHeight / 2);
    if (preferOver && overFits) {
      return { axis: "over", gutter: overGutter };
    }
    if (underClear && underFits) {
      return { axis: "over", gutter: underGutter };
    }
    if (overClear && overFits) {
      return { axis: "over", gutter: overGutter };
    }
    return { axis: "over", gutter: preferOver ? Math.max(12, overGutter) : Math.min(canvasHeight - 12, underGutter) };
  }

  const rightClear = !neighbour(from, "right") && !neighbour(to, "right");
  const leftClear = !neighbour(from, "left") && !neighbour(to, "left");
  const spread = [from, to, ...crossingNodes];
  const rightGutter = Math.max(...spread.map((node) => node.x + node.w)) + AUTO_COL_GAP * 0.5;
  const leftGutter = Math.min(...spread.map((node) => node.x)) - AUTO_COL_GAP * 0.5;
  const rightFits = rightGutter <= canvasWidth - 12;
  const leftFits = leftGutter >= 12;
  const preferRight = rightClear || (!leftClear && fromCx <= canvasWidth / 2);
  if (preferRight && rightFits) {
    return { axis: "side", gutter: rightGutter };
  }
  if (leftClear && leftFits) {
    return { axis: "side", gutter: leftGutter };
  }
  if (rightClear && rightFits) {
    return { axis: "side", gutter: rightGutter };
  }
  return { axis: "side", gutter: preferRight ? Math.min(canvasWidth - 12, rightGutter) : Math.max(12, leftGutter) };
}

export function renderPonchiDiagram(input: unknown): { svg: string; summary: string; longDescription: string } {
  const diagram = PonchiDiagramSchema.parse(input);
  const layout = resolveLayout(diagram);
  const placedNodes = layout.nodes;
  const layoutWidth = layout.width;
  const layoutHeight = layout.height;
  const canvasWidth = diagram.width;
  const canvasHeight = diagram.height;
  const nodesById = new Map(placedNodes.map((node) => [node.id, node]));

  const groups = diagram.groups
    .map((group) => {
      const groupedNodes = group.nodeIds.map((id) => nodesById.get(id)).filter((node): node is PlacedNode => Boolean(node));
      if (groupedNodes.length === 0) {
        return "";
      }

      const minX = Math.min(...groupedNodes.map((node) => node.x)) - 20;
      const minY = Math.min(...groupedNodes.map((node) => node.y)) - 38;
      const maxX = Math.max(...groupedNodes.map((node) => node.x + node.w)) + 20;
      const maxY = Math.max(...groupedNodes.map((node) => node.y + node.h)) + 20;

      return [
        `<rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" rx="20" fill="#f8fafc" fill-opacity="0.7" stroke="#cbd5e1" stroke-dasharray="2 6" stroke-linecap="round" />`,
        `<text x="${minX + 18}" y="${minY + 24}" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#64748b">${escapeXml(group.label)}</text>`
      ].join("");
    })
    .join("");

  const arrows = diagram.arrows
    .map((arrow) => {
      const from = nodesById.get(arrow.from);
      const to = nodesById.get(arrow.to);
      if (!from || !to) {
        return "";
      }

      return connector(from, to, {
        color: "#475569",
        dashed: arrow.dashed,
        bidirectional: arrow.bidirectional,
        orthogonal: arrow.style === "orthogonal",
        label: arrow.label,
        bypass: arrow.style === "orthogonal" ? bypassFor(from, to, placedNodes, diagram.direction, layoutWidth, layoutHeight) : undefined
      });
    })
    .join("");

  const nodes = placedNodes.map((node) => ponchiNode(node)).join("");
  const scale = Math.min(canvasWidth / layoutWidth, canvasHeight / layoutHeight);
  const contentWidth = layoutWidth * scale;
  const contentHeight = layoutHeight * scale;
  const originX = (canvasWidth - contentWidth) / 2;
  const originY = (canvasHeight - contentHeight) / 2;
  const content =
    Math.abs(scale - 1) < 0.001 && Math.abs(originX) < 0.001 && Math.abs(originY) < 0.001
      ? [groups, arrows, nodes].join("")
      : `<g transform="translate(${originX.toFixed(1)} ${originY.toFixed(1)}) scale(${scale.toFixed(4)})">${[groups, arrows, nodes].join("")}</g>`;

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasWidth} ${canvasHeight}" role="img">`,
    `<title>${escapeXml(diagram.title)}</title>`,
    `<desc>${escapeXml(diagram.longDescription)}</desc>`,
    `<rect width="${canvasWidth}" height="${canvasHeight}" fill="#ffffff" />`,
    content,
    "</svg>"
  ].join("");

  return {
    svg,
    summary: diagram.summary,
    longDescription: diagram.longDescription
  };
}

function inches(value: number): number {
  return Number(value.toFixed(3));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function transformPoint(point: Point, origin: Point, scale: number): Point {
  return {
    x: origin.x + point.x * scale,
    y: origin.y + point.y * scale
  };
}

function transformRect(node: { x: number; y: number; w: number; h: number }, origin: Point, scale: number): NativeRect {
  return {
    x: inches(origin.x + node.x * scale),
    y: inches(origin.y + node.y * scale),
    w: inches(node.w * scale),
    h: inches(node.h * scale)
  };
}

function nativeTextFit(value: string, widthInches: number, options: { preferredSize: number; minimumSize: number; maxLines: number }): { text: string; size: number; lineCount: number } {
  const maxWidthPoints = Math.max(24, widthInches * 72 - 10);
  const fitted = fitLabel(value, maxWidthPoints, options);
  return {
    text: fitted.lines.join("\n"),
    size: fitted.size,
    lineCount: fitted.lines.length
  };
}

function nativeTextHeight(lineCount: number, fontSize: number): number {
  return inches(Math.max(0.18, (lineCount * fontSize * 1.2) / 72));
}

function nativeShape(
  id: string,
  shape: NativeDiagramShapeElement["shape"],
  rect: NativeRect,
  options: {
    fill?: string;
    fillOpacity?: number;
    line?: NativeDiagramShapeElement["line"];
    radius?: number;
    decorative?: boolean;
    altText?: string;
    readingOrder: number;
  }
): NativeDiagramShapeElement {
  return {
    id,
    type: "shape",
    shape,
    x: inches(rect.x),
    y: inches(rect.y),
    w: inches(Math.max(0.001, rect.w)),
    h: inches(Math.max(0, rect.h)),
    fill: options.fill ?? "none",
    fillOpacity: options.fillOpacity,
    line: options.line,
    radius: options.radius,
    decorative: options.decorative ?? true,
    altText: options.altText,
    readingOrder: options.readingOrder
  };
}

function nativeText(
  id: string,
  text: string,
  rect: NativeRect,
  options: {
    fontSize: number;
    color: string;
    contrastBackground?: string;
    bold?: boolean;
    align?: "left" | "center";
    valign?: "top" | "middle";
    role?: "body" | "caption";
    altText?: string;
    readingOrder: number;
  }
): NativeDiagramTextElement {
  return {
    id,
    type: "text",
    role: options.role ?? "caption",
    text,
    x: inches(rect.x),
    y: inches(rect.y),
    w: inches(rect.w),
    h: inches(rect.h),
    fontSize: Number(options.fontSize.toFixed(1)),
    color: options.color,
    contrastBackground: options.contrastBackground,
    bold: options.bold ?? false,
    align: options.align ?? "center",
    valign: options.valign ?? "middle",
    decorative: false,
    altText: options.altText,
    readingOrder: options.readingOrder
  };
}

function nativeLineSegment(
  id: string,
  start: Point,
  end: Point,
  options: {
    color: string;
    dashed: boolean;
    arrowAtStart: boolean;
    arrowAtEnd: boolean;
    readingOrder: number;
  }
): NativeDiagramShapeElement | undefined {
  if (Math.hypot(end.x - start.x, end.y - start.y) < 0.01) {
    return undefined;
  }

  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const w = Math.max(0.001, Math.abs(end.x - start.x));
  const h = Math.max(0, Math.abs(end.y - start.y));
  const normalizedStartMatchesOriginalStart = Math.abs(start.x - x) < 0.001 && Math.abs(start.y - y) < 0.001;
  const line: NativeDiagramShapeElement["line"] = {
    color: options.color,
    width: 1.4,
    dash: options.dashed ? "dash" : "solid"
  };

  if (options.arrowAtStart) {
    if (normalizedStartMatchesOriginalStart) {
      line.beginArrowType = "triangle";
    } else {
      line.endArrowType = "triangle";
    }
  }

  if (options.arrowAtEnd) {
    if (normalizedStartMatchesOriginalStart) {
      line.endArrowType = "triangle";
    } else {
      line.beginArrowType = "triangle";
    }
  }

  return nativeShape(id, "line", { x, y, w, h }, { fill: "none", line, decorative: true, readingOrder: options.readingOrder });
}

function constrainVerticalLabelWidth(anchor: Point, maxWidth: number, avoidRects: NativeRect[], frame: NativeRect): number {
  const labelHalfHeight = 0.13;
  const padding = 0.06;
  let constrained = Math.min(maxWidth, 2 * Math.max(0, Math.min(anchor.x - frame.x, frame.x + frame.w - anchor.x) - padding));

  for (const rect of avoidRects) {
    const overlapsLabelBand = rect.y < anchor.y + labelHalfHeight + padding && rect.y + rect.h > anchor.y - labelHalfHeight - padding;
    if (!overlapsLabelBand) {
      continue;
    }

    if (anchor.x >= rect.x + rect.w) {
      constrained = Math.min(constrained, 2 * Math.max(0, anchor.x - (rect.x + rect.w) - padding));
    } else if (anchor.x <= rect.x) {
      constrained = Math.min(constrained, 2 * Math.max(0, rect.x - anchor.x - padding));
    } else {
      constrained = Math.min(constrained, 0);
    }
  }

  return Math.max(0.45, constrained);
}

function connectorLabelPlacement(points: Point[], avoidRects: NativeRect[], frame: NativeRect): { anchor: Point; maxWidth: number } {
  const cleanPoints = points.filter((point, index) => {
    const previous = points[index - 1];
    return !previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= 0.01;
  });
  type Run = { start: Point; end: Point; orientation: "horizontal" | "vertical"; length: number };
  const runs: Run[] = [];
  let current: Run | undefined;

  const pushCurrent = () => {
    if (current && current.length >= 0.01) {
      runs.push(current);
    }
  };

  for (let index = 0; index < cleanPoints.length - 1; index += 1) {
    const start = cleanPoints[index];
    const end = cleanPoints[index + 1];
    const orientation = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y) ? "horizontal" : "vertical";
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (
      current &&
      current.orientation === orientation &&
      ((orientation === "horizontal" && Math.abs(current.end.y - start.y) < 0.01) ||
        (orientation === "vertical" && Math.abs(current.end.x - start.x) < 0.01))
    ) {
      current = { ...current, end, length: current.length + length };
      continue;
    }

    pushCurrent();
    current = { start, end, orientation, length };
  }
  pushCurrent();

  const best = runs.sort((a, b) => b.length - a.length)[0] ?? {
    start: cleanPoints[0],
    end: cleanPoints[cleanPoints.length - 1],
    orientation: "horizontal" as const,
    length: Math.hypot(cleanPoints[cleanPoints.length - 1].x - cleanPoints[0].x, cleanPoints[cleanPoints.length - 1].y - cleanPoints[0].y)
  };

  const anchor = {
    x: (best.start.x + best.end.x) / 2,
    y: (best.start.y + best.end.y) / 2
  };
  const maxWidth = best.orientation === "horizontal" ? Math.max(0.45, best.length - 0.12) : constrainVerticalLabelWidth(anchor, 1.8, avoidRects, frame);

  return { anchor, maxWidth };
}

function nativeIdPart(value: string, index: number): string {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${sanitized || "item"}-${index}`;
}

function nativeNodeElements(node: PlacedNode, nodeIndex: number, rect: NativeRect, idPrefix: string, readingOrder: () => number): NativeDiagramElement[] {
  const palette = NODE_COLORS[node.kind];
  const accent = node.accent ?? palette.accent;
  const safeNodeId = nativeIdPart(node.id, nodeIndex);
  const padding = Math.min(0.18, rect.w * 0.08);
  const contentWidth = Math.max(0.2, rect.w - padding * 2);
  const label = nativeTextFit(node.label, contentWidth, {
    preferredSize: rect.w >= 1.9 ? 13 : 12,
    minimumSize: 10,
    maxLines: node.sublabel ? 2 : 3
  });
  const sublabel = node.sublabel
    ? nativeTextFit(node.sublabel, contentWidth, {
        preferredSize: 10.5,
        minimumSize: 8.5,
        maxLines: 2
      })
    : undefined;
  const labelHeight = nativeTextHeight(label.lineCount, label.size);
  const sublabelHeight = sublabel ? nativeTextHeight(sublabel.lineCount, sublabel.size) : 0;
  const gap = sublabel ? 0.03 : 0;
  const totalTextHeight = labelHeight + gap + sublabelHeight;
  const textTop = rect.y + Math.max(0.08, (rect.h - totalTextHeight) / 2 + 0.03);
  const kindDotSize = Math.min(0.14, Math.max(0.08, rect.h * 0.12));

  const elements: NativeDiagramElement[] = [
    nativeShape(
      `${idPrefix}-node-${safeNodeId}-shadow`,
      "roundRect",
      { x: rect.x + 0.025, y: rect.y + 0.04, w: rect.w, h: rect.h },
      { fill: "#0F172A", fillOpacity: 0.07, line: { color: "#0F172A", width: 0.1 }, radius: 0.08, decorative: true, readingOrder: readingOrder() }
    ),
    nativeShape(`${idPrefix}-node-${safeNodeId}`, "roundRect", rect, {
      fill: palette.fill,
      line: { color: node.emphasis ? accent : palette.stroke, width: node.emphasis ? 1.6 : 1 },
      radius: 0.08,
      decorative: true,
      readingOrder: readingOrder()
    }),
    nativeShape(
      `${idPrefix}-accent-${safeNodeId}`,
      "rect",
      { x: rect.x + 0.08, y: rect.y + 0.06, w: Math.max(0.1, rect.w - 0.16), h: Math.min(0.07, rect.h * 0.08) },
      { fill: accent, line: { color: accent, width: 0.1 }, decorative: true, readingOrder: readingOrder() }
    ),
    nativeShape(
      `${idPrefix}-kind-${safeNodeId}`,
      "ellipse",
      { x: rect.x + 0.12, y: rect.y + 0.12, w: kindDotSize, h: kindDotSize },
      { fill: accent, line: { color: accent, width: 0.1 }, decorative: true, readingOrder: readingOrder() }
    ),
    nativeText(
      `${idPrefix}-label-${safeNodeId}`,
      label.text,
      { x: rect.x + padding, y: textTop, w: contentWidth, h: labelHeight },
      { fontSize: label.size, color: "#0F172A", contrastBackground: palette.fill, bold: true, readingOrder: readingOrder() }
    )
  ];

  if (sublabel) {
    elements.push(
      nativeText(
        `${idPrefix}-sublabel-${safeNodeId}`,
        sublabel.text,
        { x: rect.x + padding, y: textTop + labelHeight + gap, w: contentWidth, h: sublabelHeight },
        { fontSize: sublabel.size, color: "#52606D", contrastBackground: palette.fill, bold: false, readingOrder: readingOrder() }
      )
    );
  }

  return elements;
}

export function renderNativePonchiDiagram(
  input: unknown,
  optionsInput: unknown = {}
): { elements: NativeDiagramElement[]; summary: string; longDescription: string; warnings: string[] } {
  const diagram = PonchiDiagramSchema.parse(input);
  const options = NativePonchiRenderOptionsSchema.parse(optionsInput);
  const layout = resolveLayout(diagram);
  const placedNodes = layout.nodes;
  const canvasWidth = layout.width;
  const canvasHeight = layout.height;
  const scale = Math.min(options.frame.w / canvasWidth, options.frame.h / canvasHeight);
  const contentWidth = canvasWidth * scale;
  const contentHeight = canvasHeight * scale;
  const origin = {
    x: options.frame.x + (options.frame.w - contentWidth) / 2,
    y: options.frame.y + (options.frame.h - contentHeight) / 2
  };
  const nodeRects = new Map(placedNodes.map((node) => [node.id, transformRect(node, origin, scale)]));
  const nodesById = new Map(placedNodes.map((node) => [node.id, node]));
  const elements: NativeDiagramElement[] = [];
  const connectorLabels: Array<{ arrowIndex: number; label: string; anchor: Point; maxWidth: number }> = [];
  const warnings: string[] = [];
  let order = options.readingOrderStart;
  const nextOrder = () => order++;

  elements.push(
    nativeShape(`${options.idPrefix}-panel`, "roundRect", options.frame, {
      fill: "#FFFFFF",
      line: { color: "#D9DEE8", width: 1 },
      radius: 0.08,
      decorative: true,
      readingOrder: nextOrder()
    })
  );

  for (const group of diagram.groups) {
    const groupedNodes = group.nodeIds.map((id) => nodeRects.get(id)).filter((node): node is NativeRect => Boolean(node));
    if (groupedNodes.length === 0) {
      continue;
    }

    const minX = Math.max(options.frame.x + 0.08, Math.min(...groupedNodes.map((node) => node.x)) - 0.2);
    const minY = Math.max(options.frame.y + 0.08, Math.min(...groupedNodes.map((node) => node.y)) - 0.34);
    const maxX = Math.min(options.frame.x + options.frame.w - 0.08, Math.max(...groupedNodes.map((node) => node.x + node.w)) + 0.2);
    const maxY = Math.min(options.frame.y + options.frame.h - 0.08, Math.max(...groupedNodes.map((node) => node.y + node.h)) + 0.18);
    const safeGroupId = nativeIdPart(group.id, diagram.groups.indexOf(group));
    elements.push(
      nativeShape(
        `${options.idPrefix}-group-${safeGroupId}`,
        "roundRect",
        { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
        {
          fill: "#F8FAFC",
          fillOpacity: 0.75,
          line: { color: "#CBD5E1", width: 1, dash: "dash" },
          radius: 0.08,
          decorative: true,
          readingOrder: nextOrder()
        }
      ),
      nativeText(
        `${options.idPrefix}-group-label-${safeGroupId}`,
        group.label,
        { x: minX + 0.16, y: minY + 0.08, w: Math.max(0.6, maxX - minX - 0.32), h: 0.22 },
        { fontSize: 10.5, color: "#64748B", contrastBackground: "#F8FAFC", bold: true, align: "left", valign: "top", readingOrder: nextOrder() }
      )
    );
  }

  for (const [arrowIndex, arrow] of diagram.arrows.entries()) {
    const from = nodesById.get(arrow.from);
    const to = nodesById.get(arrow.to);
    if (!from || !to) {
      continue;
    }

    const route = connectorRoute(from, to, {
      color: "#475569",
      dashed: arrow.dashed,
      bidirectional: arrow.bidirectional,
      orthogonal: true,
      label: arrow.label,
      bypass: bypassFor(from, to, placedNodes, diagram.direction, canvasWidth, canvasHeight)
    });
    const points = route.points.map((point) => transformPoint(point, origin, scale));
    for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex += 1) {
      const line = nativeLineSegment(`${options.idPrefix}-connector-${arrowIndex}-${segmentIndex}`, points[segmentIndex], points[segmentIndex + 1], {
        color: "#475569",
        dashed: arrow.dashed,
        arrowAtStart: arrow.bidirectional && segmentIndex === 0,
        arrowAtEnd: segmentIndex === points.length - 2,
        readingOrder: nextOrder()
      });
      if (line) {
        elements.push(line);
      }
    }

    if (arrow.label) {
      const placement = connectorLabelPlacement(points, Array.from(nodeRects.values()), options.frame);
      connectorLabels.push({ arrowIndex, label: arrow.label, anchor: placement.anchor, maxWidth: placement.maxWidth });
    }
  }

  for (const [nodeIndex, node] of placedNodes.entries()) {
    const rect = nodeRects.get(node.id);
    if (!rect) {
      continue;
    }
    if (rect.w < 1.2 || rect.h < 0.62) {
      warnings.push(`Node "${node.id}" is compact (${rect.w.toFixed(2)}x${rect.h.toFixed(2)} in). Split the diagram or use a larger frame if labels feel dense.`);
    }
    elements.push(...nativeNodeElements(node, nodeIndex, rect, options.idPrefix, nextOrder));
  }

  for (const connectorLabel of connectorLabels) {
    const labelBoxWidth = Math.min(1.8, Math.max(0.45, connectorLabel.maxWidth), Math.max(0.52, (labelUnits(connectorLabel.label) * 9.5) / 72 + 0.22));
    const labelTextWidth = labelBoxWidth - 0.12;
    const label = nativeTextFit(connectorLabel.label, labelTextWidth, { preferredSize: 9.5, minimumSize: 8.5, maxLines: 1 });
    const anchorX = clamp(connectorLabel.anchor.x, options.frame.x + labelBoxWidth / 2, options.frame.x + options.frame.w - labelBoxWidth / 2);
    const anchorY = clamp(connectorLabel.anchor.y, options.frame.y + 0.13, options.frame.y + options.frame.h - 0.13);
    elements.push(
      nativeShape(
        `${options.idPrefix}-connector-label-bg-${connectorLabel.arrowIndex}`,
        "roundRect",
        { x: anchorX - labelBoxWidth / 2, y: anchorY - 0.13, w: labelBoxWidth, h: 0.26 },
        { fill: "#FFFFFF", line: { color: "#CBD5E1", width: 0.8 }, radius: 0.08, decorative: true, readingOrder: nextOrder() }
      ),
      nativeText(
        `${options.idPrefix}-connector-label-${connectorLabel.arrowIndex}`,
        label.text,
        { x: anchorX - labelTextWidth / 2, y: anchorY - 0.09, w: labelTextWidth, h: 0.18 },
        { fontSize: label.size, color: "#334155", contrastBackground: "#FFFFFF", bold: true, readingOrder: nextOrder() }
      )
    );
  }

  return {
    elements,
    summary: diagram.summary,
    longDescription: diagram.longDescription,
    warnings
  };
}

type IntentRenderContext = {
  frame: NativeRect;
  idPrefix: string;
  elements: NativeDiagramElement[];
  nextOrder: () => number;
  x: (value: number) => number;
  y: (value: number) => number;
  w: (value: number) => number;
  h: (value: number) => number;
  rect: (rect: NativeRect) => NativeRect;
  point: (point: Point) => Point;
  font: (pixelSize: number) => number;
};

function createIntentContext(options: DiagramIntentRenderOptions): IntentRenderContext {
  let order = options.readingOrderStart;
  const xScale = options.frame.w / 1600;
  const yScale = options.frame.h / 900;
  const fontScale = Math.min(options.frame.w / 13.333, options.frame.h / 7.5);
  return {
    frame: options.frame,
    idPrefix: options.idPrefix,
    elements: [],
    nextOrder: () => order++,
    x: (value) => inches(options.frame.x + value * xScale),
    y: (value) => inches(options.frame.y + value * yScale),
    w: (value) => inches(value * xScale),
    h: (value) => inches(value * yScale),
    rect: (rect) => ({
      x: inches(options.frame.x + rect.x * xScale),
      y: inches(options.frame.y + rect.y * yScale),
      w: inches(rect.w * xScale),
      h: inches(rect.h * yScale)
    }),
    point: (point) => ({
      x: inches(options.frame.x + point.x * xScale),
      y: inches(options.frame.y + point.y * yScale)
    }),
    font: (pixelSize) => Number(Math.max(8.5, pixelSize * 0.52 * fontScale).toFixed(1))
  };
}

function intentShape(
  context: IntentRenderContext,
  id: string,
  shape: NativeDiagramShapeElement["shape"],
  rect: NativeRect,
  options: {
    fill?: string;
    fillOpacity?: number;
    line?: NativeDiagramShapeElement["line"];
    radius?: number;
  } = {}
): void {
  context.elements.push(
    nativeShape(`${context.idPrefix}-${id}`, shape, context.rect(rect), {
      fill: options.fill ?? "none",
      fillOpacity: options.fillOpacity,
      line: options.line,
      radius: options.radius ?? 0.08,
      decorative: true,
      altText: "generated diagram intent shape",
      readingOrder: context.nextOrder()
    })
  );
}

function intentText(
  context: IntentRenderContext,
  id: string,
  text: string,
  rect: NativeRect,
  options: {
    fontSize: number;
    color: string;
    background: string;
    bold?: boolean;
    align?: "left" | "center";
    valign?: "top" | "middle";
    role?: "body" | "caption";
  }
): void {
  context.elements.push(
    nativeText(`${context.idPrefix}-${id}`, text, context.rect(rect), {
      fontSize: context.font(options.fontSize),
      color: options.color,
      contrastBackground: options.background,
      bold: options.bold,
      align: options.align,
      valign: options.valign,
      role: options.role,
      altText: "generated diagram intent text",
      readingOrder: context.nextOrder()
    })
  );
}

function intentLine(
  context: IntentRenderContext,
  id: string,
  start: Point,
  end: Point,
  options: {
    color: string;
    width?: number;
    dashed?: boolean;
    arrowAtEnd?: boolean;
    arrowAtStart?: boolean;
  }
): void {
  const a = context.point(start);
  const b = context.point(end);
  if (Math.hypot(a.x - b.x, a.y - b.y) < 0.01) {
    return;
  }
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const normalizedStartMatchesOriginalStart = Math.abs(a.x - x) < 0.001 && Math.abs(a.y - y) < 0.001;
  const line: NativeDiagramShapeElement["line"] = {
    color: options.color,
    width: options.width ?? 1.4,
    dash: options.dashed ? "dash" : "solid"
  };

  if (options.arrowAtEnd) {
    if (normalizedStartMatchesOriginalStart) {
      line.endArrowType = "triangle";
    } else {
      line.beginArrowType = "triangle";
    }
  }
  if (options.arrowAtStart) {
    if (normalizedStartMatchesOriginalStart) {
      line.beginArrowType = "triangle";
    } else {
      line.endArrowType = "triangle";
    }
  }

  context.elements.push(
    nativeShape(
      `${context.idPrefix}-${id}`,
      "line",
      { x, y, w: Math.max(0.001, Math.abs(a.x - b.x)), h: Math.max(0, Math.abs(a.y - b.y)) },
      { fill: "none", line, decorative: true, altText: "generated diagram intent connector", readingOrder: context.nextOrder() }
    )
  );
}

function intentOrthogonalArrow(
  context: IntentRenderContext,
  id: string,
  start: Point,
  end: Point,
  options: {
    color: string;
    width?: number;
    dashed?: boolean;
  }
): void {
  const midX = (start.x + end.x) / 2;
  const points = [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  const segments = points
    .slice(0, -1)
    .map((point, index) => ({ start: point, end: points[index + 1] }))
    .filter((segment) => Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y) >= 0.01);
  segments.forEach((segment, index) => {
    intentLine(context, `${id}-${index}`, segment.start, segment.end, { ...options, arrowAtEnd: index === segments.length - 1 });
  });
}

function intentCross(context: IntentRenderContext, id: string, center: Point, size: number, color = "#B33A2E"): void {
  const half = size / 2;
  intentLine(context, `${id}-horizontal`, { x: center.x - half, y: center.y }, { x: center.x + half, y: center.y }, { color, width: 2.4 });
  intentLine(context, `${id}-vertical`, { x: center.x, y: center.y - half }, { x: center.x, y: center.y + half }, { color, width: 2.4 });
}

function intentBlockLabel(block: z.infer<typeof IntentTextBlockSchema>): string {
  return block.sublabel ? `${block.label}\n${block.sublabel}` : block.label;
}

function planeText(plane: z.infer<typeof IntentPlaneSchema>): string {
  return `${plane.label}\n${plane.items.join(" / ")}`;
}

function addPlaneCard(
  context: IntentRenderContext,
  id: string,
  rect: NativeRect,
  fill: string,
  line: string,
  title: string,
  subtitle: string,
  titleColor = "#17202A",
  subtitleColor = "#4F5D66"
): void {
  intentShape(context, `${id}-card`, "roundRect", rect, { fill, line: { color: line, width: 1.2 }, radius: 0.08 });
  const hasSubtitle = subtitle.trim().length > 0;
  intentText(context, `${id}-title`, title, { x: rect.x + 24, y: hasSubtitle ? rect.y + 26 : rect.y + rect.h / 2 - 17, w: rect.w - 48, h: 34 }, {
    fontSize: 24,
    color: titleColor,
    background: fill,
    bold: true,
    align: "center"
  });
  if (hasSubtitle) {
    intentText(context, `${id}-subtitle`, subtitle, { x: rect.x + 24, y: rect.y + 62, w: rect.w - 48, h: rect.h - 72 }, {
      fontSize: 17,
      color: subtitleColor,
      background: fill,
      bold: true,
      align: "center"
    });
  }
}

function addAccessPlaneMap(context: IntentRenderContext, intent: AccessPlaneMapIntent): void {
  intentShape(context, "background", "rect", { x: 0, y: 0, w: 1600, h: 900 }, { fill: "#F4F7F8", line: { color: "#F4F7F8", width: 0.1 } });
  if (intent.includeTitle) {
    intentText(context, "title", intent.title, { x: 70, y: 36, w: 1120, h: 54 }, { fontSize: 48, color: "#17202A", background: "#F4F7F8", bold: true, align: "left", role: "body" });
    intentText(context, "subtitle", intent.subtitle, { x: 72, y: 92, w: 1320, h: 36 }, { fontSize: 24, color: "#4F5D66", background: "#F4F7F8", bold: true, align: "left" });
  }

  addPlaneCard(context, "control", { x: 250, y: 165, w: 1100, h: 104 }, "#17202A", "#17202A", intent.controlPlane.label, intent.controlPlane.items.join(" / "), "#FFFFFF", "#DCE8EA");
  addPlaneCard(context, "management", { x: 120, y: 340, w: 570, h: 120 }, "#DDF4EF", "#70C5B8", intent.managementPlane.label, intent.managementPlane.items.join(" / "));
  addPlaneCard(context, "data", { x: 910, y: 340, w: 570, h: 120 }, "#FFF4E0", "#D1A848", intent.dataPlane.label, intent.dataPlane.items.join(" / "));

  addPlaneCard(context, "user", { x: 120, y: 585, w: 300, h: 86 }, "#FFFFFF", "#AAB7C2", intent.userAccess.label, intent.userAccess.sublabel ?? "");
  addPlaneCard(context, "app", { x: 510, y: 585, w: 300, h: 86 }, "#FFFFFF", "#AAB7C2", intent.appAccess.label, intent.appAccess.sublabel ?? "");
  addPlaneCard(context, "privileged", { x: 1115, y: 575, w: 330, h: 106 }, "#FBEAEA", "#B33A2E", intent.privilegedAccess.label, intent.privilegedAccess.sublabel ?? "", "#9D2F25");

  intentLine(context, "control-to-management", { x: 800, y: 270 }, { x: 800, y: 330 }, { color: "#0B6B78", width: 2.2, arrowAtEnd: true });
  intentOrthogonalArrow(context, "management-to-user", { x: 405, y: 465 }, { x: 290, y: 578 }, { color: "#60707A", width: 1.3 });
  intentOrthogonalArrow(context, "data-to-privileged", { x: 1195, y: 465 }, { x: 1268, y: 566 }, { color: "#60707A", width: 1.3 });
  intentLine(context, "app-to-privileged", { x: 815, y: 628 }, { x: 1100, y: 628 }, { color: "#B33A2E", width: 4.8, arrowAtEnd: true });
  intentLine(context, "app-up-1", { x: 660, y: 575 }, { x: 660, y: 500 }, { color: "#B33A2E", width: 1.7, dashed: true });
  intentLine(context, "app-up-2", { x: 660, y: 500 }, { x: 770, y: 500 }, { color: "#B33A2E", width: 1.7, dashed: true });
  intentLine(context, "app-up-3", { x: 770, y: 500 }, { x: 770, y: 278 }, { color: "#B33A2E", width: 1.7, dashed: true, arrowAtEnd: true });
  intentLine(context, "priv-up-1", { x: 1280, y: 565 }, { x: 1280, y: 500 }, { color: "#B33A2E", width: 1.7, dashed: true });
  intentLine(context, "priv-up-2", { x: 1280, y: 500 }, { x: 970, y: 500 }, { color: "#B33A2E", width: 1.7, dashed: true });
  intentLine(context, "priv-up-3", { x: 970, y: 500 }, { x: 970, y: 274 }, { color: "#B33A2E", width: 1.7, dashed: true, arrowAtEnd: true });

  intentShape(context, "blocked-label-bg", "roundRect", { x: 580, y: 718, w: 440, h: 56 }, { fill: "#FBEAEA", line: { color: "#E6AAA5", width: 1 }, radius: 0.08 });
  intentText(context, "blocked-label", intent.blockedEscalationLabel, { x: 610, y: 732, w: 380, h: 28 }, { fontSize: 18, color: "#8D2F28", background: "#FBEAEA", bold: true });
  intentCross(context, "blocked-x-app", { x: 740, y: 685 }, 52);
  intentCross(context, "blocked-x-privileged", { x: 860, y: 685 }, 52);

  intentShape(context, "message-bg", "roundRect", { x: 215, y: 805, w: 1170, h: 50 }, { fill: "#EAF7FA", line: { color: "#88CAD4", width: 1 }, radius: 0.08 });
  intentText(context, "message", intent.designMessage, { x: 245, y: 816, w: 1110, h: 28 }, { fontSize: 18, color: "#17202A", background: "#EAF7FA", bold: true });
}

function addClosedPathSource(context: IntentRenderContext, id: string, block: z.infer<typeof IntentTextBlockSchema>, rect: NativeRect): void {
  intentShape(context, `${id}-card`, "roundRect", rect, { fill: "#FBEAEA", line: { color: "#E6AAA5", width: 1 }, radius: 0.08 });
  intentText(context, `${id}-text`, intentBlockLabel(block), { x: rect.x + 14, y: rect.y + 13, w: rect.w - 28, h: rect.h - 22 }, {
    fontSize: 16,
    color: "#4F5D66",
    background: "#FBEAEA",
    bold: true
  });
}

function addClosedPathStep(context: IntentRenderContext, id: string, block: z.infer<typeof IntentTextBlockSchema>, rect: NativeRect, fill = "#DDF4EF", line = "#70C5B8", textColor = "#4F5D66"): void {
  intentShape(context, `${id}-card`, "roundRect", rect, { fill, line: { color: line, width: 1 }, radius: 0.08 });
  intentText(context, `${id}-text`, intentBlockLabel(block), { x: rect.x + 4, y: rect.y + 14, w: rect.w - 8, h: rect.h - 22 }, {
    fontSize: 15,
    color: textColor,
    background: fill,
    bold: true
  });
}

function addClosedPrivilegedPath(context: IntentRenderContext, intent: ClosedPrivilegedPathIntent): void {
  intentShape(context, "background", "rect", { x: 0, y: 0, w: 1600, h: 900 }, { fill: "#F4F7F8", line: { color: "#F4F7F8", width: 0.1 } });
  if (intent.includeTitle) {
    intentText(context, "title", intent.title, { x: 70, y: 36, w: 1120, h: 54 }, { fontSize: 48, color: "#17202A", background: "#F4F7F8", bold: true, align: "left", role: "body" });
    intentText(context, "subtitle", intent.subtitle, { x: 72, y: 92, w: 1320, h: 36 }, { fontSize: 24, color: "#4F5D66", background: "#F4F7F8", bold: true, align: "left" });
  }

  intentShape(context, "avoid-panel", "roundRect", { x: 80, y: 175, w: 635, h: 560 }, { fill: "#FFFFFF", line: { color: "#E6AAA5", width: 1.3 }, radius: 0.08 });
  intentText(context, "avoid-title", intent.avoid.title, { x: 120, y: 210, w: 540, h: 36 }, { fontSize: 24, color: "#A93A2E", background: "#FFFFFF", bold: true, align: "left" });
  intentText(context, "avoid-description", intent.avoid.description, { x: 125, y: 258, w: 530, h: 52 }, { fontSize: 17, color: "#4F5D66", background: "#FFFFFF", bold: true, align: "left" });
  intentShape(context, "avoid-target", "roundRect", { x: 270, y: 430, w: 220, h: 86 }, { fill: "#17202A", line: { color: "#17202A", width: 1 }, radius: 0.08 });
  intentText(context, "avoid-target-text", intentBlockLabel(intent.avoid.target), { x: 292, y: 452, w: 176, h: 42 }, { fontSize: 18, color: "#FFFFFF", background: "#17202A", bold: true });

  const sourceRects = [
    { x: 130, y: 330, w: 180, h: 72 },
    { x: 130, y: 510, w: 180, h: 72 },
    { x: 445, y: 330, w: 200, h: 72 },
    { x: 445, y: 510, w: 200, h: 72 },
    { x: 130, y: 620, w: 180, h: 66 },
    { x: 465, y: 620, w: 180, h: 66 }
  ];
  intent.avoid.sources.forEach((source, index) => addClosedPathSource(context, `avoid-source-${index}`, source, sourceRects[index]));
  const sourceAnchors = [
    { x: 310, y: 366 },
    { x: 310, y: 546 },
    { x: 445, y: 366 },
    { x: 445, y: 546 },
    { x: 310, y: 653 },
    { x: 465, y: 653 }
  ];
  intent.avoid.sources.forEach((_, index) => {
    const anchor = sourceAnchors[index];
    if (!anchor) {
      return;
    }
    intentOrthogonalArrow(context, `avoid-path-${index}`, anchor, { x: 380, y: index % 2 === 0 ? 430 : 516 }, { color: "#B33A2E", width: 1.8, dashed: true });
  });
  intentCross(context, "avoid-x", { x: 380, y: 662 }, 78);

  intentShape(context, "approved-panel", "roundRect", { x: 885, y: 175, w: 635, h: 560 }, { fill: "#FFFFFF", line: { color: "#70C5B8", width: 1.3 }, radius: 0.08 });
  intentText(context, "approved-title", intent.approved.title, { x: 930, y: 210, w: 540, h: 36 }, { fontSize: 24, color: "#2E7D58", background: "#FFFFFF", bold: true, align: "left" });
  intentText(context, "approved-description", intent.approved.description, { x: 930, y: 258, w: 520, h: 52 }, { fontSize: 17, color: "#4F5D66", background: "#FFFFFF", bold: true, align: "left" });

  const stepRects = [
    { x: 930, y: 350, w: 150, h: 78 },
    { x: 1090, y: 350, w: 150, h: 78 },
    { x: 1250, y: 350, w: 150, h: 78 },
    { x: 930, y: 495, w: 150, h: 78 },
    { x: 1090, y: 495, w: 150, h: 78 },
    { x: 1250, y: 495, w: 150, h: 78 },
  ];
  intent.approved.steps.forEach((step, index) => {
    const isAdmin = /admin|管理|interface|ポータル|管理面/i.test(`${step.label} ${step.sublabel ?? ""}`);
    addClosedPathStep(context, `approved-step-${index}`, step, stepRects[index], isAdmin ? "#17202A" : index === 3 ? "#FFF4E0" : "#DDF4EF", isAdmin ? "#17202A" : index === 3 ? "#D1A848" : "#70C5B8", isAdmin ? "#FFFFFF" : "#4F5D66");
  });
  if (intent.approved.steps.length > 1) {
    intentLine(context, "approved-0-1", { x: 1082, y: 389 }, { x: 1088, y: 389 }, { color: "#0B6B78", width: 2.2, arrowAtEnd: true });
  }
  if (intent.approved.steps.length > 2) {
    intentLine(context, "approved-1-2", { x: 1242, y: 389 }, { x: 1248, y: 389 }, { color: "#0B6B78", width: 2.2, arrowAtEnd: true });
  }
  if (intent.approved.steps.length > 3) {
    intentLine(context, "approved-2-3a", { x: 1325, y: 432 }, { x: 1325, y: 460 }, { color: "#0B6B78", width: 2.2 });
    intentLine(context, "approved-2-3b", { x: 1325, y: 460 }, { x: 1005, y: 460 }, { color: "#0B6B78", width: 2.2 });
    intentLine(context, "approved-2-3c", { x: 1005, y: 460 }, { x: 1005, y: 490 }, { color: "#0B6B78", width: 2.2, arrowAtEnd: true });
  }
  if (intent.approved.steps.length > 4) {
    intentLine(context, "approved-3-4", { x: 1082, y: 534 }, { x: 1088, y: 534 }, { color: "#0B6B78", width: 2.2, arrowAtEnd: true });
  }
  if (intent.approved.steps.length > 5) {
    intentLine(context, "approved-4-5", { x: 1242, y: 534 }, { x: 1248, y: 534 }, { color: "#0B6B78", width: 2.2, arrowAtEnd: true });
  }
  intentShape(context, "deny-bg", "roundRect", { x: 930, y: 625, w: 450, h: 56 }, { fill: "#FBEAEA", line: { color: "#E6AAA5", width: 1 }, radius: 0.08 });
  intentText(context, "deny-label", intent.approved.denyLabel, { x: 960, y: 640, w: 390, h: 26 }, { fontSize: 18, color: "#8D2F28", background: "#FBEAEA", bold: true });

  intentShape(context, "message-bg", "roundRect", { x: 240, y: 805, w: 1120, h: 50 }, { fill: "#EAF7FA", line: { color: "#88CAD4", width: 1 }, radius: 0.08 });
  intentText(context, "message", intent.designMessage, { x: 270, y: 816, w: 1060, h: 28 }, { fontSize: 18, color: "#17202A", background: "#EAF7FA", bold: true });
}

const INTENT_STAGE_PALETTE = [
  { fill: "#E8F1FF", line: "#5B8DEF", badge: "#2F5FBF" },
  { fill: "#DDF4EF", line: "#70C5B8", badge: "#2E8B7A" },
  { fill: "#FFF4E0", line: "#D1A848", badge: "#B07D1E" },
  { fill: "#F3E9FB", line: "#A87FD1", badge: "#7A4FB0" },
  { fill: "#FBEAEA", line: "#E0857C", badge: "#B33A2E" },
  { fill: "#E6F6FA", line: "#73C0D0", badge: "#2E7E8E" }
];

function addIntentBackdrop(context: IntentRenderContext, includeTitle: boolean, title: string, subtitle: string): void {
  intentShape(context, "background", "rect", { x: 0, y: 0, w: 1600, h: 900 }, { fill: "#F4F7F8", line: { color: "#F4F7F8", width: 0.1 } });
  if (includeTitle) {
    intentText(context, "title", title, { x: 70, y: 36, w: 1120, h: 54 }, { fontSize: 48, color: "#17202A", background: "#F4F7F8", bold: true, align: "left", role: "body" });
    intentText(context, "subtitle", subtitle, { x: 72, y: 92, w: 1320, h: 36 }, { fontSize: 24, color: "#4F5D66", background: "#F4F7F8", bold: true, align: "left" });
  }
}

function addIntentMessage(context: IntentRenderContext, message: string, x = 215, w = 1170): void {
  intentShape(context, "message-bg", "roundRect", { x, y: 805, w, h: 50 }, { fill: "#EAF7FA", line: { color: "#88CAD4", width: 1 }, radius: 0.08 });
  intentText(context, "message", message, { x: x + 30, y: 816, w: w - 60, h: 28 }, { fontSize: 18, color: "#17202A", background: "#EAF7FA", bold: true });
}

function addLifecycle(context: IntentRenderContext, intent: LifecycleIntent): void {
  addIntentBackdrop(context, intent.includeTitle, intent.title, intent.subtitle);

  const count = intent.stages.length;
  const left = 90;
  const right = 1510;
  const gap = 40;
  const cardW = (right - left - gap * (count - 1)) / count;
  const cardY = 300;
  const cardH = 184;
  const centers: number[] = [];

  intent.stages.forEach((stage, index) => {
    const x = left + index * (cardW + gap);
    const cx = x + cardW / 2;
    centers.push(cx);
    const tone = INTENT_STAGE_PALETTE[index % INTENT_STAGE_PALETTE.length];
    intentShape(context, `stage-${index}-card`, "roundRect", { x, y: cardY, w: cardW, h: cardH }, { fill: tone.fill, line: { color: tone.line, width: 1.4 }, radius: 0.09 });
    intentShape(context, `stage-${index}-badge`, "ellipse", { x: cx - 26, y: cardY + 18, w: 52, h: 52 }, { fill: tone.badge, line: { color: tone.badge, width: 1 } });
    intentText(context, `stage-${index}-num`, String(index + 1), { x: cx - 26, y: cardY + 25, w: 52, h: 38 }, { fontSize: 24, color: "#FFFFFF", background: tone.badge, bold: true, align: "center" });
    intentText(context, `stage-${index}-label`, stage.label, { x: x + 12, y: cardY + 84, w: cardW - 24, h: 44 }, { fontSize: 21, color: "#17202A", background: tone.fill, bold: true, align: "center" });
    if (stage.sublabel) {
      intentText(context, `stage-${index}-sub`, stage.sublabel, { x: x + 12, y: cardY + 130, w: cardW - 24, h: 46 }, { fontSize: 15, color: "#4F5D66", background: tone.fill, bold: true, align: "center" });
    }
  });

  for (let index = 0; index < count - 1; index += 1) {
    const startX = left + index * (cardW + gap) + cardW;
    const endX = left + (index + 1) * (cardW + gap);
    intentLine(context, `flow-${index}`, { x: startX + 4, y: cardY + cardH / 2 }, { x: endX - 4, y: cardY + cardH / 2 }, { color: "#0B6B78", width: 2.6, arrowAtEnd: true });
  }

  const loopY = 612;
  const firstCx = centers[0];
  const lastCx = centers[count - 1];
  intentLine(context, "loop-down", { x: lastCx, y: cardY + cardH }, { x: lastCx, y: loopY }, { color: "#2E8B7A", width: 2.4 });
  intentLine(context, "loop-across", { x: lastCx, y: loopY }, { x: firstCx, y: loopY }, { color: "#2E8B7A", width: 2.4 });
  intentLine(context, "loop-up", { x: firstCx, y: loopY }, { x: firstCx, y: cardY + cardH + 4 }, { color: "#2E8B7A", width: 2.4, arrowAtEnd: true });

  const loopBoxW = 360;
  intentShape(context, "loop-label-bg", "roundRect", { x: 800 - loopBoxW / 2, y: loopY - 28, w: loopBoxW, h: 50 }, { fill: "#DDF4EF", line: { color: "#70C5B8", width: 1 }, radius: 0.09 });
  intentText(context, "loop-label", intent.loopLabel, { x: 800 - loopBoxW / 2 + 20, y: loopY - 17, w: loopBoxW - 40, h: 28 }, { fontSize: 18, color: "#2E7D58", background: "#DDF4EF", bold: true, align: "center" });

  addIntentMessage(context, intent.designMessage);
}

function addMaturityLadder(context: IntentRenderContext, intent: MaturityLadderIntent): void {
  addIntentBackdrop(context, intent.includeTitle, intent.title, intent.subtitle);

  const count = intent.levels.length;
  const left = 150;
  const rightEdge = 1470;
  const gap = 34;
  const blockW = (rightEdge - left - gap * (count - 1)) / count;
  const blockH = 120;
  const lowestTop = 650;
  const highestTop = 250;
  const stepY = count > 1 ? (lowestTop - highestTop) / (count - 1) : 0;
  const tops: number[] = [];
  const lefts: number[] = [];

  intentLine(context, "axis", { x: 96, y: 786 }, { x: 96, y: 224 }, { color: "#60707A", width: 2.4, arrowAtEnd: true });
  intentText(context, "axis-label", intent.axisLabel, { x: 44, y: 188, w: 260, h: 30 }, { fontSize: 18, color: "#4F5D66", background: "#F4F7F8", bold: true, align: "left" });
  intentLine(context, "ground", { x: 110, y: 788 }, { x: 1500, y: 788 }, { color: "#C7D2D6", width: 1.6 });

  intent.levels.forEach((level, index) => {
    const x = left + index * (blockW + gap);
    const topY = lowestTop - index * stepY;
    tops.push(topY);
    lefts.push(x);
    const tone = INTENT_STAGE_PALETTE[index % INTENT_STAGE_PALETTE.length];
    intentShape(context, `level-${index}-card`, "roundRect", { x, y: topY, w: blockW, h: blockH }, { fill: tone.fill, line: { color: tone.line, width: 1.4 }, radius: 0.09 });
    intentShape(context, `level-${index}-badge`, "roundRect", { x: x + 14, y: topY + 14, w: 92, h: 34 }, { fill: tone.badge, line: { color: tone.badge, width: 1 }, radius: 0.12 });
    intentText(context, `level-${index}-badge-text`, `Lv.${index + 1}`, { x: x + 14, y: topY + 18, w: 92, h: 26 }, { fontSize: 15, color: "#FFFFFF", background: tone.badge, bold: true, align: "center" });
    intentText(context, `level-${index}-label`, level.label, { x: x + 12, y: topY + 52, w: blockW - 24, h: 32 }, { fontSize: 19, color: "#17202A", background: tone.fill, bold: true, align: "left" });
    if (level.description) {
      intentText(context, `level-${index}-desc`, level.description, { x: x + 12, y: topY + 84, w: blockW - 24, h: 30 }, { fontSize: 13, color: "#4F5D66", background: tone.fill, bold: true, align: "left" });
    }
  });

  for (let index = 1; index < count; index += 1) {
    const prevRight = { x: lefts[index - 1] + blockW, y: tops[index - 1] + blockH / 2 };
    const curLeft = { x: lefts[index], y: tops[index] + blockH / 2 };
    intentOrthogonalArrow(context, `rise-${index}`, prevRight, curLeft, { color: "#0B6B78", width: 2.2 });
  }

  addIntentMessage(context, intent.designMessage);
}

function addBeforeAfterPanel(
  context: IntentRenderContext,
  idPrefix: string,
  rect: NativeRect,
  barFill: string,
  barLine: string,
  titleColor: string,
  title: string,
  points: string[]
): void {
  intentShape(context, `${idPrefix}-panel`, "roundRect", rect, { fill: "#FFFFFF", line: { color: barLine, width: 1.4 }, radius: 0.08 });
  intentShape(context, `${idPrefix}-bar`, "roundRect", { x: rect.x + 24, y: rect.y + 24, w: rect.w - 48, h: 58 }, { fill: barFill, line: { color: barLine, width: 1 }, radius: 0.1 });
  intentText(context, `${idPrefix}-title`, title, { x: rect.x + 40, y: rect.y + 38, w: rect.w - 80, h: 32 }, { fontSize: 23, color: titleColor, background: barFill, bold: true, align: "center" });

  const startY = rect.y + 108;
  const availableH = rect.y + rect.h - 24 - startY;
  const rowH = Math.min(88, availableH / points.length);
  points.forEach((point, index) => {
    const rowY = startY + index * rowH;
    intentShape(context, `${idPrefix}-dot-${index}`, "ellipse", { x: rect.x + 30, y: rowY + 10, w: 14, h: 14 }, { fill: barLine, line: { color: barLine, width: 1 } });
    intentText(context, `${idPrefix}-point-${index}`, point, { x: rect.x + 58, y: rowY, w: rect.w - 86, h: rowH - 12 }, { fontSize: 17, color: "#2B3A42", background: "#FFFFFF", bold: true, align: "left", valign: "middle" });
  });
}

function addBeforeAfter(context: IntentRenderContext, intent: BeforeAfterIntent): void {
  addIntentBackdrop(context, intent.includeTitle, intent.title, intent.subtitle);

  addBeforeAfterPanel(context, "before", { x: 90, y: 180, w: 618, h: 556 }, "#FBEAEA", "#D98B82", "#A93A2E", intent.before.title, intent.before.points);
  addBeforeAfterPanel(context, "after", { x: 892, y: 180, w: 618, h: 556 }, "#DDF4EF", "#70C5B8", "#2E7D58", intent.after.title, intent.after.points);

  intentShape(context, "transition-bg", "roundRect", { x: 716, y: 392, w: 168, h: 56 }, { fill: "#E8F1FF", line: { color: "#5B8DEF", width: 1.2 }, radius: 0.12 });
  intentText(context, "transition-label", intent.transitionLabel, { x: 726, y: 404, w: 148, h: 32 }, { fontSize: 17, color: "#2F5FBF", background: "#E8F1FF", bold: true, align: "center" });
  intentLine(context, "transition-arrow", { x: 724, y: 486 }, { x: 876, y: 486 }, { color: "#2F5FBF", width: 9, arrowAtEnd: true });

  addIntentMessage(context, intent.designMessage);
}

function addRelationshipMap(context: IntentRenderContext, intent: RelationshipMapIntent): void {
  addIntentBackdrop(context, intent.includeTitle, intent.title, intent.subtitle);

  const hubRect = { x: 620, y: 398, w: 360, h: 154 };
  const hubCenter = { x: hubRect.x + hubRect.w / 2, y: hubRect.y + hubRect.h / 2 };
  intentShape(context, "hub-card", "roundRect", hubRect, { fill: "#17202A", line: { color: "#17202A", width: 1.4 }, radius: 0.1 });
  intentText(context, "hub-label", intent.center.label, { x: hubRect.x + 24, y: intent.center.sublabel ? hubRect.y + 38 : hubRect.y + hubRect.h / 2 - 20, w: hubRect.w - 48, h: 40 }, { fontSize: 24, color: "#FFFFFF", background: "#17202A", bold: true, align: "center" });
  if (intent.center.sublabel) {
    intentText(context, "hub-sub", intent.center.sublabel, { x: hubRect.x + 24, y: hubRect.y + 86, w: hubRect.w - 48, h: 44 }, { fontSize: 16, color: "#DCE8EA", background: "#17202A", bold: true, align: "center" });
  }

  const leftCount = Math.ceil(intent.nodes.length / 2);
  const columnTop = 210;
  const columnBottom = 740;
  const nodeW = 300;

  intent.nodes.forEach((node, index) => {
    const isLeft = index < leftCount;
    const sideIndex = isLeft ? index : index - leftCount;
    const sideTotal = isLeft ? leftCount : intent.nodes.length - leftCount;
    const slotH = (columnBottom - columnTop) / sideTotal;
    const nodeH = Math.min(118, slotH - 22);
    const nodeY = columnTop + sideIndex * slotH + (slotH - nodeH) / 2;
    const nodeX = isLeft ? 110 : 1190;
    const tone = INTENT_STAGE_PALETTE[index % INTENT_STAGE_PALETTE.length];
    intentShape(context, `node-${index}-card`, "roundRect", { x: nodeX, y: nodeY, w: nodeW, h: nodeH }, { fill: tone.fill, line: { color: tone.line, width: 1.4 }, radius: 0.09 });
    const hasSub = Boolean(node.sublabel);
    const hasRel = Boolean(node.relationship);
    intentText(context, `node-${index}-label`, node.label, { x: nodeX + 16, y: nodeY + 12, w: nodeW - 32, h: 32 }, { fontSize: 18, color: "#17202A", background: tone.fill, bold: true, align: "center" });
    if (hasSub) {
      intentText(context, `node-${index}-sub`, node.sublabel as string, { x: nodeX + 16, y: nodeY + 44, w: nodeW - 32, h: 28 }, { fontSize: 14, color: "#4F5D66", background: tone.fill, bold: true, align: "center" });
    }
    if (hasRel) {
      intentText(context, `node-${index}-rel`, `↔ ${node.relationship}`, { x: nodeX + 16, y: nodeY + nodeH - 30, w: nodeW - 32, h: 24 }, { fontSize: 13, color: "#2F5FBF", background: tone.fill, bold: true, align: "center" });
    }

    const nodeAnchor = { x: isLeft ? nodeX + nodeW : nodeX, y: nodeY + nodeH / 2 };
    const hubAnchor = { x: isLeft ? hubRect.x : hubRect.x + hubRect.w, y: hubCenter.y };
    intentOrthogonalArrow(context, `link-${index}`, nodeAnchor, hubAnchor, { color: "#60707A", width: 1.6 });
  });

  addIntentMessage(context, intent.designMessage);
}


export function renderDiagramIntent(
  input: unknown,
  optionsInput: unknown = {}
): { elements: NativeDiagramElement[]; summary: string; longDescription: string; warnings: string[] } {
  const intent = DiagramIntentSchema.parse(input);
  const options = DiagramIntentRenderOptionsSchema.parse(optionsInput);
  const context = createIntentContext(options);

  if (intent.kind === "access-plane-map") {
    addAccessPlaneMap(context, intent);
  } else if (intent.kind === "closed-privileged-path") {
    addClosedPrivilegedPath(context, intent);
  } else if (intent.kind === "lifecycle") {
    addLifecycle(context, intent);
  } else if (intent.kind === "maturity-ladder") {
    addMaturityLadder(context, intent);
  } else if (intent.kind === "before-after") {
    addBeforeAfter(context, intent);
  } else {
    addRelationshipMap(context, intent);
  }

  return {
    elements: context.elements,
    summary: intent.summary,
    longDescription: intent.longDescription,
    warnings: []
  };
}
