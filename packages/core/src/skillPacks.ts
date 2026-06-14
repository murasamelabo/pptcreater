import { z } from "zod";

export const SkillPackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  locale: z.enum(["ja-JP", "en-US"]),
  description: z.string().min(1),
  designDirection: z.string().min(1),
  density: z.enum(["low", "medium", "high"]),
  rules: z.array(z.string().min(1)),
  forbidden: z.array(z.string().min(1)).default([]),
  intakeQuestions: z
    .array(
      z.object({
        id: z.string().min(1),
        question: z.string().min(1),
        why: z.string().min(1),
        examples: z.array(z.string().min(1)).default([])
      })
    )
    .optional()
});

export type SkillPack = z.infer<typeof SkillPackSchema>;

export const BUILTIN_SKILL_PACKS: SkillPack[] = [
  {
    id: "slide-briefing-ja",
    name: "Slide Briefing Japanese",
    locale: "ja-JP",
    description: "作成前に目的、聴衆、ボリューム、利用場面をヒアリングし、図解中心のDeckSpecへ落とすための方針。",
    designDirection: "visual-briefing",
    density: "medium",
    rules: [
      "最初に目的、聴衆、利用場面、期待する行動を確認する",
      "3秒で要点が伝わる主張タイトルを作る",
      "各スライドに図、アイコン、データ表現、比較カードのいずれかを入れる",
      "発表用と配布用で情報密度を変える",
      "生成後はlint_deckで読み順、alt text、コントラスト、文字量を確認する"
    ],
    forbidden: ["質問せずに長い本文だけのスライドを作る", "1枚に複数の主張を詰め込む", "意味のない装飾アイコンを置く"],
    intakeQuestions: [
      {
        id: "purpose",
        question: "この資料で聴衆に理解・判断・行動してほしいことは何ですか？",
        why: "1スライド1メッセージと結論タイトルを決めるため。",
        examples: ["意思決定", "提案", "技術共有", "研修", "ピッチ"]
      },
      {
        id: "audience",
        question: "主な聴衆は誰で、前提知識はどの程度ですか？",
        why: "用語、情報密度、図解の粒度を調整するため。",
        examples: ["経営層", "営業担当", "エンジニア", "新入社員", "投資家"]
      },
      {
        id: "delivery",
        question: "発表用、配布用、Web公開用のどれに近いですか？",
        why: "文字量、speaker notes、補足説明の量を決めるため。",
        examples: ["発表補助", "配布資料", "非同期レビュー", "公開スライド"]
      },
      {
        id: "volume",
        question: "希望する枚数、時間、章立てはありますか？",
        why: "1枚あたりの情報量と分割方針を決めるため。",
        examples: ["5枚", "10分", "3章構成", "エグゼクティブサマリのみ"]
      },
      {
        id: "assets",
        question: "使いたいテンプレート、ブランド色、アイコン、ロゴ、図表データはありますか？",
        why: "既存資産をMCPのsearch/register機能で再利用するため。",
        examples: ["Azure構成図", "AWSアイコン", "社内ロゴ", "KPI表"]
      }
    ]
  },
  {
    id: "slide-briefing-en",
    name: "Slide Briefing English",
    locale: "en-US",
    description: "Brief purpose, audience, volume, and delivery context before creating a visual DeckSpec.",
    designDirection: "visual-briefing",
    density: "medium",
    rules: [
      "Clarify purpose, audience, delivery context, and desired action first",
      "Use assertion titles that pass the three-second glance test",
      "Include a diagram, icon, data visual, comparison card, or process visual on each slide",
      "Adjust information density for live presentation versus handout use",
      "Run lint_deck after generation to verify reading order, alt text, contrast, and text density"
    ],
    forbidden: ["creating text-only slides without briefing", "packing multiple claims into one slide", "adding decorative icons without meaning"],
    intakeQuestions: [
      {
        id: "purpose",
        question: "What should the audience understand, decide, or do after this deck?",
        why: "This determines the main message and assertion titles.",
        examples: ["decision", "proposal", "technical sharing", "training", "pitch"]
      },
      {
        id: "audience",
        question: "Who is the primary audience and what do they already know?",
        why: "This controls terminology, density, and diagram granularity.",
        examples: ["executives", "sales", "engineers", "new hires", "investors"]
      },
      {
        id: "delivery",
        question: "Is this for live presentation, handout, async review, or public sharing?",
        why: "This controls text volume, notes, and self-contained explanations.",
        examples: ["live talk", "handout", "async review", "public slides"]
      },
      {
        id: "volume",
        question: "Do you have a target slide count, time limit, or section structure?",
        why: "This controls chunking and the number of visual scenes.",
        examples: ["5 slides", "10 minutes", "3 sections", "executive summary only"]
      },
      {
        id: "assets",
        question: "Are there templates, brand colors, icons, logos, or data sources to reuse?",
        why: "This lets the agent use search/register MCP tools instead of inventing assets.",
        examples: ["Azure diagram", "AWS icons", "company logo", "KPI table"]
      }
    ]
  },
  {
    id: "consulting-ja",
    name: "Consulting Japanese",
    locale: "ja-JP",
    description: "簡潔な結論タイトルと余白を重視する日本語コンサルティング資料向け方針。",
    designDirection: "minimal-consulting",
    density: "medium",
    rules: [
      "各スライドは1つの主張に絞る",
      "タイトルは結論型にする",
      "詳細はspeaker notesへ移す",
      "図表は要点を直接ラベル化する"
    ],
    forbidden: ["意味のない装飾アイコン", "赤/緑だけの状態表現", "小さすぎる注釈"]
  },
  {
    id: "accessibility-strict",
    name: "Accessibility Strict",
    locale: "en-US",
    description: "Strict WCAG-inspired slide checks for public or reusable decks.",
    designDirection: "accessible-minimal",
    density: "low",
    rules: [
      "Require unique slide titles",
      "Require alt text for every non-decorative visual",
      "Keep text contrast at or above WCAG AA thresholds",
      "Avoid color-only meaning",
      "Preserve explicit reading order"
    ],
    forbidden: ["decorative animation", "images of text", "ambiguous link text"]
  }
];

export function listSkillPacks(): SkillPack[] {
  return BUILTIN_SKILL_PACKS.map((skill) => SkillPackSchema.parse(skill));
}

export function getSkillPack(id: string): SkillPack | undefined {
  return listSkillPacks().find((skill) => skill.id === id);
}
