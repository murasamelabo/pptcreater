export type SlideQualityDimensionId = "D1" | "D2" | "D3" | "D4" | "D5" | "D6" | "D7" | "D8" | "D9";

export type SlidePurposeProfileId = "P1" | "P2" | "P3" | "P4" | "P5";

export type SlideAntiPatternId = "A1" | "A2" | "A3" | "A4" | "A5" | "A6";

export type DeckStoryAxisId = "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7";

export type SlideQualityDimension = {
  id: SlideQualityDimensionId;
  labelJa: string;
  labelEn: string;
  defaultWeight: number;
  creationRuleJa: string;
  creationRuleEn: string;
};

export type SlidePurposeProfile = {
  id: SlidePurposeProfileId;
  labelJa: string;
  labelEn: string;
  informationTarget: "Low" | "Med" | "Med-High" | "High" | "Low-Med";
  decorationTarget: "Low" | "Med" | "Low-Med";
  passLine: number;
  weights: Record<SlideQualityDimensionId, number>;
};

export type SlideAntiPattern = {
  id: SlideAntiPatternId;
  labelJa: string;
  labelEn: string;
  symptomJa: string;
  symptomEn: string;
  fixJa: string;
  fixEn: string;
};

export type DeckStoryAxis = {
  id: DeckStoryAxisId;
  labelJa: string;
  labelEn: string;
  checkJa: string;
  checkEn: string;
};

export const SLIDE_PURPOSE_PROFILE_IDS = ["P1", "P2", "P3", "P4", "P5"] as const;

export const SLIDE_QUALITY_DIMENSIONS: SlideQualityDimension[] = [
  {
    id: "D1",
    labelJa: "メッセージ・目的適合",
    labelEn: "Message and purpose fit",
    defaultWeight: 18,
    creationRuleJa: "1スライド1メッセージ。タイトルは分類名ではなく要点/結論を語り、聴き手の関心・意思決定に必要な情報だけを残す。",
    creationRuleEn: "Use one message per slide. Make the title state the takeaway rather than a topic label, and keep only information needed by the audience."
  },
  {
    id: "D2",
    labelJa: "構成・情報設計",
    labelEn: "Structure and information design",
    defaultWeight: 14,
    creationRuleJa: "文章を置く前に、並列・順序・因果・対比などの情報構造と視線の流れを決め、見せる文字に要点化する。",
    creationRuleEn: "Before placing copy, decide the information structure and reading path, then turn prose into show-text."
  },
  {
    id: "D3",
    labelJa: "レイアウト",
    labelEn: "Layout",
    defaultWeight: 14,
    creationRuleJa: "仮想グリッド、左揃え、近接、反復、十分な余白で四角い領域として整える。端ギリギリや微妙なズレを避ける。",
    creationRuleEn: "Use grid, left alignment, proximity, repetition, and generous whitespace so elements sit in clean rectangular regions."
  },
  {
    id: "D4",
    labelJa: "文字・可読性",
    labelEn: "Typography and legibility",
    defaultWeight: 12,
    creationRuleJa: "ゴシック体を基本に、行間0.5-1文字分、短い行長、文節を割らない改行、十分な文字サイズで読む負担を下げる。",
    creationRuleEn: "Use readable sans typography, line spacing around 0.5-1 character height, short line length, clean breaks, and sufficient size."
  },
  {
    id: "D5",
    labelJa: "メリハリ・視覚階層",
    labelEn: "Contrast and visual hierarchy",
    defaultWeight: 12,
    creationRuleJa: "ジャンプ率、太さ、配置、余白、色で first-look/second-look/final-read を設計し、強調は少数に絞る。",
    creationRuleEn: "Design first-look, second-look, and final-read with size, weight, position, whitespace, and limited emphasis."
  },
  {
    id: "D6",
    labelJa: "配色",
    labelEn: "Color",
    defaultWeight: 10,
    creationRuleJa: "無彩色以外は2-3色まで。ベース70:メイン25:アクセント5を目安に、色には意味を持たせ一貫して使う。",
    creationRuleEn: "Limit non-neutral colors to 2-3. Aim for 70:25:5 base/main/accent balance and use colors consistently by meaning."
  },
  {
    id: "D7",
    labelJa: "図表の質",
    labelEn: "Charts, diagrams, and tables",
    defaultWeight: 8,
    creationRuleJa: "棒=量、折れ線=推移、円=1割合だけ。主役を強め、軸・罫線・凡例など脇役を弱め、凡例は直接ラベル化する。",
    creationRuleEn: "Use bars for quantities, lines for trends, pies only for one share. Strengthen the visual hero and weaken axes, gridlines, and separate legends."
  },
  {
    id: "D8",
    labelJa: "ノイズ・装飾の適正",
    labelEn: "Noise and decoration fit",
    defaultWeight: 8,
    creationRuleJa: "既定テンプレ感、過剰な影/3D/グラデ、素材テイストのばらつきを避け、目的に対して装飾が過不足ない状態にする。",
    creationRuleEn: "Avoid default-template feel, heavy shadows/3D/gradients, and mixed asset styles; tune decoration to the deck purpose."
  },
  {
    id: "D9",
    labelJa: "アクセシビリティ・UD",
    labelEn: "Accessibility and universal design",
    defaultWeight: 4,
    creationRuleJa: "十分なコントラスト、色だけに依存しない区別、説明的なaltText/読み順、UDフォント候補で誰でも読める状態にする。",
    creationRuleEn: "Ensure contrast, non-color-only distinction, descriptive alt text/reading order, and accessible typography choices."
  }
];

export const SLIDE_PURPOSE_PROFILES: Record<SlidePurposeProfileId, SlidePurposeProfile> = {
  P1: {
    id: "P1",
    labelJa: "社内報告・情報共有",
    labelEn: "Internal report and information sharing",
    informationTarget: "Med",
    decorationTarget: "Low-Med",
    passLine: 70,
    weights: { D1: 18, D2: 16, D3: 14, D4: 12, D5: 10, D6: 10, D7: 8, D8: 8, D9: 4 }
  },
  P2: {
    id: "P2",
    labelJa: "営業・提案",
    labelEn: "Sales and proposal",
    informationTarget: "Med-High",
    decorationTarget: "Med",
    passLine: 75,
    weights: { D1: 20, D2: 16, D3: 12, D4: 10, D5: 14, D6: 10, D7: 8, D8: 8, D9: 2 }
  },
  P3: {
    id: "P3",
    labelJa: "登壇投影",
    labelEn: "Live presentation",
    informationTarget: "Low",
    decorationTarget: "Med",
    passLine: 72,
    weights: { D1: 20, D2: 12, D3: 12, D4: 16, D5: 14, D6: 8, D7: 6, D8: 6, D9: 6 }
  },
  P4: {
    id: "P4",
    labelJa: "読ませる配布資料",
    labelEn: "Read-heavy handout",
    informationTarget: "High",
    decorationTarget: "Low",
    passLine: 72,
    weights: { D1: 12, D2: 18, D3: 14, D4: 16, D5: 8, D6: 8, D7: 10, D8: 8, D9: 6 }
  },
  P5: {
    id: "P5",
    labelJa: "経営会議・意思決定",
    labelEn: "Executive meeting and decision-making",
    informationTarget: "Low-Med",
    decorationTarget: "Low",
    passLine: 78,
    weights: { D1: 22, D2: 16, D3: 12, D4: 10, D5: 14, D6: 6, D7: 12, D8: 4, D9: 4 }
  }
};

export const SLIDE_ANTI_PATTERNS: SlideAntiPattern[] = [
  { id: "A1", labelJa: "スカスカ", labelEn: "Sparse", symptomJa: "情報が少なく主張が弱い", symptomEn: "Too little substance or a weak claim", fixJa: "骨太なメッセージと根拠を作り直す", fixEn: "Rebuild the slide around a stronger message and evidence" },
  { id: "A2", labelJa: "文字文字", labelEn: "Text-wall", symptomJa: "文章で埋まり、読ませる文字が主役", symptomEn: "Prose dominates the slide", fixJa: "箇条書き、見出し、強弱、図解へ分解する", fixEn: "Break prose into bullets, headings, hierarchy, and visuals" },
  { id: "A3", labelJa: "写真頼り", labelEn: "Photo-reliant", symptomJa: "全面写真に頼り、要点や根拠が弱い", symptomEn: "The image carries the slide without enough message/evidence", fixJa: "写真は文脈に絞り、隣にメッセージと根拠を置く", fixEn: "Use photos as context and pair them with message and evidence" },
  { id: "A4", labelJa: "サバサバ", labelEn: "Too plain", symptomJa: "明確だが味気なく、引き込みが弱い", symptomEn: "Clear but flat and unengaging", fixJa: "目的に応じて色、数字、アイコン、余白で少し魅せる", fixEn: "Add purposeful color, numeric emphasis, icons, or rhythm" },
  { id: "A5", labelJa: "ミチミチ", labelEn: "Over-dense", symptomJa: "詰め込み過ぎて一目で要点が掴めない", symptomEn: "Too dense to grasp quickly", fixJa: "減らす。減らせない場合は仕切りと余白で区画化する", fixEn: "Reduce content or divide it with structure and whitespace" },
  { id: "A6", labelJa: "ゴテゴテ", labelEn: "Over-decorated", symptomJa: "装飾が内容を上回る", symptomEn: "Decoration overwhelms the content", fixJa: "影・立体・グラデを削り、素材テイストを統一する", fixEn: "Remove heavy effects and unify asset style" }
];

export const DECK_STORY_AXES: DeckStoryAxis[] = [
  { id: "S1", labelJa: "ストーリーの背骨", labelEn: "One-deck-one-story", checkJa: "全体が一つの主張・結論へ収束するか。", checkEn: "Does the deck converge on one central claim or conclusion?" },
  { id: "S2", labelJa: "道標・全体構造", labelEn: "Signposting", checkJa: "表紙、目次、章扉、本編、まとめで現在地が分かるか。", checkEn: "Do cover, agenda, sections, body, and summary make location clear?" },
  { id: "S3", labelJa: "論理の流れ", labelEn: "Logical flow", checkJa: "隣接スライドの接続が自然で、飛躍・重複・出戻りがないか。", checkEn: "Do adjacent slides connect naturally without leaps, repetition, or backtracking?" },
  { id: "S4", labelJa: "導入と結び", labelEn: "Opening and closing", checkJa: "冒頭で目的・要点、末尾で結論・次アクションを示すか。", checkEn: "Does the opening summarize purpose and the ending land conclusion/next action?" },
  { id: "S5", labelJa: "全体の一貫性", labelEn: "Global consistency", checkJa: "テンプレ、配色、フォント、見出し様式、図解トーンが揃うか。", checkEn: "Are template, color, type, headings, and diagram tone consistent?" },
  { id: "S6", labelJa: "リズム・緩急", labelEn: "Rhythm and pacing", checkJa: "情報密度に緩急があり、単調さや過密が連続しないか。", checkEn: "Does density vary with breathing room rather than repeated flat or crowded slides?" },
  { id: "S7", labelJa: "全体の目的適合", labelEn: "Overall purpose fit", checkJa: "情報量×装飾量・枚数・所要時間が目的に合うか。", checkEn: "Do information, decoration, length, and time fit the purpose?" }
];

export function formatSlideQualityStandard(locale: "ja-JP" | "en-US" = "ja-JP"): string[] {
  const isJapanese = locale === "ja-JP";
  const dimensionRules = SLIDE_QUALITY_DIMENSIONS.map((dimension) =>
    `${dimension.id} ${isJapanese ? dimension.labelJa : dimension.labelEn}: ${isJapanese ? dimension.creationRuleJa : dimension.creationRuleEn}`
  );
  const profiles = Object.values(SLIDE_PURPOSE_PROFILES).map((profile) =>
    `${profile.id} ${isJapanese ? profile.labelJa : profile.labelEn}: info=${profile.informationTarget}, decoration=${profile.decorationTarget}, pass=${profile.passLine}`
  );
  const antiPatterns = SLIDE_ANTI_PATTERNS.map((pattern) =>
    `${pattern.id} ${isJapanese ? pattern.labelJa : pattern.labelEn}: ${isJapanese ? pattern.symptomJa : pattern.symptomEn} -> ${isJapanese ? pattern.fixJa : pattern.fixEn}`
  );
  const storyAxes = DECK_STORY_AXES.map((axis) => `${axis.id} ${isJapanese ? axis.labelJa : axis.labelEn}: ${isJapanese ? axis.checkJa : axis.checkEn}`);

  return [
    isJapanese
      ? "C:\\ppptevaluater由来の品質基準を使う: 9次元(D1-D9)、目的別P1-P5、アンチパターンA1-A6、デック物語S1-S7で作成・評価する。"
      : "Use the C:\\ppptevaluater-derived quality standard: D1-D9 dimensions, P1-P5 purpose profiles, A1-A6 anti-patterns, and S1-S7 deck-story axes.",
    ...dimensionRules,
    isJapanese ? `目的別プロファイル: ${profiles.join(" / ")}` : `Purpose profiles: ${profiles.join(" / ")}`,
    isJapanese ? `避けるアンチパターン: ${antiPatterns.join(" / ")}` : `Avoid anti-patterns: ${antiPatterns.join(" / ")}`,
    isJapanese ? `デック全体の確認: ${storyAxes.join(" / ")}` : `Deck-story checks: ${storyAxes.join(" / ")}`
  ];
}