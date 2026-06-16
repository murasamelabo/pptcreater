import type { ContentMode, DeckSpec, Locale, Slide, TextElement } from "./schema.js";

export type ContentGuidance = {
  locale: Locale;
  contentMode: ContentMode;
  titleModel: string;
  messageModel: string;
  bodyModel: string;
  rules: string[];
  examples: Array<{
    bad: string;
    good: string;
    why: string;
  }>;
  sources: Array<{
    title: string;
    url?: string;
    notes: string;
  }>;
};

export type ContentReviewIssue = {
  severity: "warning" | "suggestion";
  code: string;
  message: string;
  path: string;
  details?: Record<string, number | string>;
};

export type ContentReviewReport = {
  guidance: ContentGuidance;
  issues: ContentReviewIssue[];
};

type JapaneseTitleStyle = "topic-label" | "action-title";

type ContentProfile = {
  mode: ContentMode;
  titleMaxJa: number;
  titleMaxEnWords: number;
  messageMaxJa: number;
  messageMaxEnWords: number;
  bodyProseMax: number;
  bulletMax: number;
  japaneseTitleStyle: JapaneseTitleStyle;
};

const CONTENT_PROFILES: Record<ContentMode, ContentProfile> = {
  presentation: {
    mode: "presentation",
    titleMaxJa: 24,
    titleMaxEnWords: 12,
    messageMaxJa: 38,
    messageMaxEnWords: 16,
    bodyProseMax: 80,
    bulletMax: 4,
    japaneseTitleStyle: "action-title"
  },
  decision: {
    mode: "decision",
    titleMaxJa: 28,
    titleMaxEnWords: 15,
    messageMaxJa: 45,
    messageMaxEnWords: 18,
    bodyProseMax: 100,
    bulletMax: 5,
    japaneseTitleStyle: "action-title"
  },
  report: {
    mode: "report",
    titleMaxJa: 30,
    titleMaxEnWords: 12,
    messageMaxJa: 50,
    messageMaxEnWords: 22,
    bodyProseMax: 140,
    bulletMax: 5,
    japaneseTitleStyle: "topic-label"
  },
  handout: {
    mode: "handout",
    titleMaxJa: 30,
    titleMaxEnWords: 14,
    messageMaxJa: 50,
    messageMaxEnWords: 22,
    bodyProseMax: 150,
    bulletMax: 5,
    japaneseTitleStyle: "topic-label"
  },
  technical: {
    mode: "technical",
    titleMaxJa: 28,
    titleMaxEnWords: 13,
    messageMaxJa: 48,
    messageMaxEnWords: 20,
    bodyProseMax: 120,
    bulletMax: 5,
    japaneseTitleStyle: "topic-label"
  }
};

const JAPANESE_GENERIC_TITLES = new Set([
  "概要",
  "背景",
  "目的",
  "課題",
  "解決策",
  "まとめ",
  "結論",
  "次の一手",
  "参考",
  "詳細",
  "比較",
  "アーキテクチャ"
]);

const ENGLISH_GENERIC_TITLES = new Set([
  "overview",
  "background",
  "summary",
  "conclusion",
  "next steps",
  "recommendation",
  "analysis",
  "details",
  "architecture",
  "comparison",
  "implementation",
  "references"
]);

const JAPANESE_CLAIM_ENDING = /(?:している|していく|される|できる|になる|である|でない|がある|にある|で始める|を始める|を縮める|を止める|を置く|を推定する|を確認する|を整理する|を説明する|に集中する|です|ます|する|した|ある|いる)$/u;

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function compactJapaneseLength(text: string): number {
  return text.replace(/\s+/g, "").length;
}

function wordCount(text: string): number {
  return normalizeText(text)
    .split(/\s+/)
    .filter(Boolean).length;
}

function sentenceCount(text: string): number {
  return (text.match(/[。.!?！？]/gu) ?? []).length;
}

function lineCount(text: string): number {
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

function primaryTitle(slide: Slide): { text: string; pathSuffix: string } {
  const titleIndex = slide.elements.findIndex((element) => element.type === "text" && element.role === "title");
  const titleElement = slide.elements[titleIndex];
  if (titleElement?.type === "text") {
    return { text: titleElement.text, pathSuffix: `elements.${titleIndex}.text` };
  }

  return { text: slide.title, pathSuffix: "title" };
}

function messageCandidates(slide: Slide): Array<{ element: TextElement; elementIndex: number }> {
  return slide.elements
    .map((element, elementIndex) => ({ element, elementIndex }))
    .filter(
      (entry): entry is { element: TextElement; elementIndex: number } =>
        entry.element.type === "text" && (entry.element.role === "subtitle" || entry.element.role === "callout")
    )
    .sort((a, b) => a.element.y - b.element.y);
}

function isGenericTitle(title: string, locale: Locale): boolean {
  const normalized = normalizeText(title).replace(/[：:]+$/u, "");
  if (locale === "ja-JP") {
    return JAPANESE_GENERIC_TITLES.has(normalized);
  }

  return ENGLISH_GENERIC_TITLES.has(normalized.toLowerCase());
}

function isJapaneseClaimLikeTitle(title: string): boolean {
  const normalized = normalizeText(title).replace(/[。.!?！？]+$/u, "");
  return JAPANESE_CLAIM_ENDING.test(normalized) || /は.+(?:する|した|できる|ある|いる|になる)$/u.test(normalized);
}

function pushIssue(issues: ContentReviewIssue[], issue: ContentReviewIssue): void {
  issues.push(issue);
}

function reviewJapaneseSlide(slide: Slide, slideIndex: number, profile: ContentProfile, issues: ContentReviewIssue[]): void {
  const title = primaryTitle(slide);
  const titleText = normalizeText(title.text);
  const titlePath = `slides.${slideIndex}.${title.pathSuffix}`;
  const titleLength = compactJapaneseLength(titleText);
  const claimLikeTitle = isJapaneseClaimLikeTitle(titleText);
  const messages = messageCandidates(slide);

  if (isGenericTitle(titleText, "ja-JP")) {
    pushIssue(issues, {
      severity: "suggestion",
      code: "content.title-generic",
      message: "Slide title is generic. Use a short topic label that identifies this slide's subject.",
      path: titlePath,
      details: { title: titleText }
    });
  }

  if (titleLength > profile.titleMaxJa) {
    pushIssue(issues, {
      severity: "warning",
      code: "content.title-too-long",
      message:
        profile.japaneseTitleStyle === "topic-label"
          ? "Japanese report/technical slide titles should be short topic labels, not full document-like sentences. Move the claim into a slide message."
          : "Japanese presentation titles should be short enough to read at a glance. Split details into body text or speaker notes.",
      path: titlePath,
      details: { length: titleLength, maximum: profile.titleMaxJa, contentMode: profile.mode }
    });
  }

  if (profile.japaneseTitleStyle === "topic-label" && claimLikeTitle) {
    pushIssue(issues, {
      severity: "suggestion",
      code: "content.ja-title-claim-like",
      message: "For Japanese self-contained materials, keep the title as a concise noun/topic label and put the claim in a separate slide message.",
      path: titlePath,
      details: { title: titleText, contentMode: profile.mode }
    });
  }

  if (profile.japaneseTitleStyle === "topic-label" && messages.length === 0 && (claimLikeTitle || titleLength > profile.titleMaxJa)) {
    pushIssue(issues, {
      severity: "suggestion",
      code: "content.ja-message-missing",
      message: `Add a short slide message (subtitle/callout) under the title: one factual claim in ${profile.messageMaxJa} Japanese characters or fewer.`,
      path: `slides.${slideIndex}`,
      details: { maximum: profile.messageMaxJa, contentMode: profile.mode }
    });
  }

  messages.forEach(({ element, elementIndex }) => {
    const length = compactJapaneseLength(element.text);
    if (length > profile.messageMaxJa) {
      pushIssue(issues, {
        severity: "warning",
        code: "content.message-too-long",
        message: `Japanese slide messages should state one claim in ${profile.messageMaxJa} characters or fewer for this content mode.`,
        path: `slides.${slideIndex}.elements.${elementIndex}.text`,
        details: { length, maximum: profile.messageMaxJa, contentMode: profile.mode }
      });
    }
  });
}

function reviewEnglishSlide(slide: Slide, slideIndex: number, profile: ContentProfile, issues: ContentReviewIssue[]): void {
  const title = primaryTitle(slide);
  const titleText = normalizeText(title.text);
  const titlePath = `slides.${slideIndex}.${title.pathSuffix}`;
  const words = wordCount(titleText);

  if (isGenericTitle(titleText, "en-US")) {
    pushIssue(issues, {
      severity: "warning",
      code: "content.title-generic",
      message: "Slide title is a topic label. Use an action title that states the takeaway of the slide.",
      path: titlePath,
      details: { title: titleText }
    });
  }

  if (words > profile.titleMaxEnWords || lineCount(title.text) > 2) {
    pushIssue(issues, {
      severity: "warning",
      code: "content.title-too-long",
      message: "English slide titles should fit within one to two lines and stay concise for the selected content mode.",
      path: titlePath,
      details: { words, maximum: profile.titleMaxEnWords, contentMode: profile.mode }
    });
  }

  messageCandidates(slide).forEach(({ element, elementIndex }) => {
    const wordsInMessage = wordCount(element.text);
    if (wordsInMessage > profile.messageMaxEnWords) {
      pushIssue(issues, {
        severity: "warning",
        code: "content.message-too-long",
        message: "Supporting slide messages should be concise and move detail to notes.",
        path: `slides.${slideIndex}.elements.${elementIndex}.text`,
        details: { words: wordsInMessage, maximum: profile.messageMaxEnWords, contentMode: profile.mode }
      });
    }
  });
}

function reviewBodyCopy(slide: Slide, slideIndex: number, profile: ContentProfile, issues: ContentReviewIssue[]): void {
  slide.elements.forEach((element, elementIndex) => {
    if (element.type !== "text" || element.role !== "body") {
      return;
    }

    const text = normalizeText(element.text);
    if (text.length > profile.bodyProseMax && sentenceCount(text) >= 2) {
      pushIssue(issues, {
        severity: "suggestion",
        code: "content.body-prose",
        message: "Body text reads like prose. Convert it to 3-5 evidence chunks, a table/schematic, or speaker notes.",
        path: `slides.${slideIndex}.elements.${elementIndex}.text`,
        details: { length: text.length, maximum: profile.bodyProseMax, contentMode: profile.mode }
      });
    }

    const bullets = (element.text.match(/(?:^|\n)\s*(?:[-•・]|[0-9]+[.)])/gu) ?? []).length;
    if (bullets > profile.bulletMax) {
      pushIssue(issues, {
        severity: "suggestion",
        code: "content.too-many-bullets",
        message: "Too many bullets increase cognitive load. Group them into 3-5 chunks, a table, or a flow schematic.",
        path: `slides.${slideIndex}.elements.${elementIndex}.text`,
        details: { bullets, maximum: profile.bulletMax, contentMode: profile.mode }
      });
    }
  });
}

export function getContentGuidance(locale: Locale, contentMode: ContentMode = "presentation"): ContentGuidance {
  const profile = CONTENT_PROFILES[contentMode];
  if (locale === "ja-JP") {
    const topicLabelMode = profile.japaneseTitleStyle === "topic-label";
    return {
      locale,
      contentMode,
      titleModel: topicLabelMode
        ? `スライドタイトル = 主張を入れない短い話題ラベル。体言止め・名詞句を基本にし、${profile.titleMaxJa}字以内を目安にする。`
        : `スライドタイトル = その場で伝える短い主張見出し。${profile.titleMaxJa}字以内を目安にし、細部は本文・notesへ移す。`,
      messageModel: topicLabelMode
        ? `スライドメッセージ = そのスライドで伝えたい事実ベースの主張。1文、${profile.messageMaxJa}字以内、比較対象と差分を入れる。`
        : `補足メッセージ = タイトルを繰り返さず、意味・根拠・次アクションを${profile.messageMaxJa}字以内で補う。`,
      bodyModel: `本文 = メッセージを支える根拠。${profile.bulletMax}個以内のチャンク、表、図解、グラフに分解し、説明文はspeaker notesへ移す。`,
      rules: [
        topicLabelMode
          ? "タイトルに「減少している」「必要である」などの主張を入れず、主張はsubtitle/calloutのメッセージへ分離する。"
          : "プレゼン/意思決定スライドでは、タイトル自体を短い主張にしてもよい。ただし一読で理解できる長さにする。",
        `タイトルは${profile.titleMaxJa}字以内、メッセージは${profile.messageMaxJa}字以内を目安にし、日付・条件・細部は本文や注釈へ移す。`,
        "報告書/技術文書では「タイトル=話題」「メッセージ=主張」を分け、発表資料では「短い主張タイトル」を優先する。",
        `各スライドは1メッセージに絞り、本文は最大${profile.bulletMax}個の根拠チャンクにする。`,
        "長い説明、前提、口頭補足はspeaker notesへ移し、スライド面には読ませる文章を置かない。"
      ],
      examples: [
        {
          bad: "売上減少は３つの要因で説明できる",
          good: "売上減少の3要因",
          why: "タイトルは名詞句にし、主張はメッセージへ分ける。"
        },
        {
          bad: "過去5年間の当社製品の売上数量推移は以下の通りである",
          good: "5年前比で売上数量は10%減少している",
          why: "メッセージは事実ベースの主張を50字以内で述べる。"
        }
      ],
      sources: [
        {
          title: "Future CLIP: スライドタイトルとスライドメッセージの決め方",
          url: "https://sp-jp.fujifilm.com/future-clip/document/vol5.html",
          notes: "日本語の一人歩き資料では、タイトルは主張なしの短い名詞句、メッセージは50字以内の主張文に分ける。"
        }
      ]
    };
  }

  return {
    locale,
    contentMode,
    titleModel: `Slide title = action title: a short, specific sentence that states the takeaway or recommendation, usually within ${profile.titleMaxEnWords} words.`,
    messageModel: `Supporting message = optional concise proof or implication within ${profile.messageMaxEnWords} words; avoid repeating the title.`,
    bodyModel: `Body = evidence that proves the action title. Use up to ${profile.bulletMax} grouped points, a chart/table, or a schematic; move narrative prose to notes.`,
    rules: [
      "Use an action title rather than a topic label for executive or decision decks.",
      "Keep action titles specific, active, and concrete; include the key number or decision when available.",
      `Fit the title in one to two lines, usually no more than ${profile.titleMaxEnWords} words for this content mode.`,
      "Lead answer-first, then support it with 3-5 MECE proof points.",
      "Avoid generic labels such as Overview, Background, Summary, Analysis, and Next Steps unless the slide is a divider."
    ],
    examples: [
      {
        bad: "Q3 Results",
        good: "Q3 revenue exceeded target by 12% despite supply disruption",
        why: "The reader gets the takeaway without reading the chart."
      },
      {
        bad: "Supply Chain Optimization",
        good: "Vendor consolidation can reduce procurement time by 14 days",
        why: "The title states the implication and measurable outcome."
      }
    ],
    sources: [
      {
        title: "Action-title and pyramid-principle presentation practice",
        notes: "English executive decks commonly use answer-first action titles: concise complete-sentence takeaways supported by evidence."
      }
    ]
  };
}

export function reviewDeckContent(
  deck: DeckSpec,
  locale: Locale = deck.locale,
  contentMode: ContentMode = deck.metadata.contentMode ?? "presentation"
): ContentReviewReport {
  const issues: ContentReviewIssue[] = [];
  const profile = CONTENT_PROFILES[contentMode];

  deck.slides.forEach((slide, slideIndex) => {
    if (locale === "ja-JP") {
      reviewJapaneseSlide(slide, slideIndex, profile, issues);
    } else {
      reviewEnglishSlide(slide, slideIndex, profile, issues);
    }

    reviewBodyCopy(slide, slideIndex, profile, issues);
  });

  return {
    guidance: getContentGuidance(locale, contentMode),
    issues
  };
}
