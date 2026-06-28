# pptcreater Dev-Loop Test Scenarios

この文書は、pptcreater 開発改善ループで User Simulator が使う代表的な `ScenarioSpec` カタログである。各シナリオは、機能単位の狭い回帰テストではなく、実際のユーザーが依頼しそうな「資料作成ユースケース」の粒度で定義する。

各シナリオは、User Simulator が自然なユーザー依頼として pptcreater を使い、Evaluator が `docs/dev-loop-evaluator-criteria.md` に沿って成果物品質とツール利用規律を評価できるようにする。

## 使い方

- 1つの WorkItem につき、関連するシナリオを 2-3 個選ぶ。
- 大きめのUI/品質変更では、happy path、adversarial path、regression path を少なくとも1つずつ選ぶ。
- 生成物は `generated/dev-loop-runs/<run-id>/<scenario-id>/` に置く。
- User Simulator は、`userRequest` に近い自然な依頼文から deck artifact を作る。
- User Simulator は、実行した CLI / MCP / agent 呼び出しを `tool-ledger.json` に残す。
- Evaluator は、`finalize`、`review`、PPTX zip integrity、tool ledger、Studio HTML またはスクリーンショットを証拠にする。
- `requiredExpressions` は実装を縛るためではなく、その資料で自然に期待される表現形式を示す。

共通成果物:

```json
["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"]
```

## Scenario Index

| # | Scenario ID | 想定資料 |
| --- | --- | --- |
| 1 | `scenario-it-security-product-decision-maker` | ITセキュリティ製品紹介資料 |
| 2 | `scenario-github-copilot-tips-tech-talk` | GitHub Copilot便利Tipsの登壇資料 |
| 3 | `scenario-hakone-ryokan-family-choice` | 箱根温泉旅館の家族向け比較資料 |
| 4 | `scenario-startup-investor-seed-pitch` | スタートアップseed投資家向けピッチ |
| 5 | `scenario-enterprise-ai-adoption-executive` | 生成AI導入の役員向け判断資料 |
| 6 | `scenario-saas-qbr-customer-success` | SaaS顧客向けQBR資料 |
| 7 | `scenario-new-hire-onboarding-engineering` | エンジニア新入社員オンボーディング資料 |
| 8 | `scenario-cloud-migration-board-approval` | クラウド移行の経営承認資料 |
| 9 | `scenario-incident-postmortem-technical` | 障害ポストモーテム技術共有資料 |
| 10 | `scenario-npo-fundraising-community` | NPO支援者向け活動紹介・寄付依頼資料 |
| 11 | `scenario-product-roadmap-all-hands` | 全社会議向けプロダクトロードマップ資料 |
| 12 | `scenario-manufacturing-quality-improvement` | 製造品質改善プロジェクト資料 |
| 13 | `scenario-healthcare-service-patient-guide` | 医療/ヘルスケアサービスの利用案内資料 |
| 14 | `scenario-real-estate-area-comparison-family` | 家族向け住み替えエリア比較資料 |
| 15 | `scenario-university-research-conference` | 大学研究発表・学会登壇資料 |
| 16 | `scenario-retail-seasonal-campaign-plan` | 小売の季節キャンペーン企画資料 |
| 17 | `scenario-finance-budget-review-management` | 管理職向け予算レビュー資料 |
| 18 | `scenario-public-sector-policy-briefing` | 自治体/公共向け政策説明資料 |
| 19 | `scenario-mobile-app-launch-marketing` | モバイルアプリローンチ資料 |
| 20 | `scenario-personal-learning-plan-family` | 家族・個人向け学習計画共有資料 |

## Scenarios

### 1. IT Security Product For Decision Makers

```json
{
  "id": "scenario-it-security-product-decision-maker",
  "userRequest": "ITセキュリティ製品の紹介資料を作ってください。ターゲットは決裁者で、概要、製品導入のメリット、ROI、導入事例、導入ステップを説明することが目的です。",
  "audience": "CIO、CISO、情報システム部門長、事業部門の決裁者",
  "purpose": "製品の導入判断を前向きに進めてもらう",
  "contentMode": "decision",
  "suggestedSlideCount": 10,
  "tone": "信頼感があり、過度に技術詳細へ寄りすぎない",
  "mustCover": ["市場/脅威背景", "製品概要", "導入メリット", "ROI", "導入事例", "導入ステップ", "次のアクション"],
  "requiredExpressions": ["executive-summary", "roi-chart", "case-study", "roadmap", "risk-reduction-diagram"],
  "requiredTools": ["plan_business_deck", "recommend_figure", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "business-plan.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["messageFit", "visualFit", "toolDiscipline", "accessibility"]
}
```

### 2. GitHub Copilot Tips Tech Talk

```json
{
  "id": "scenario-github-copilot-tips-tech-talk",
  "userRequest": "イベントで登壇するときの技術資料を作ってください。トピックはGitHub Copilotの便利Tips集です。エンジニア間での発表なので、硬くなりすぎず実践感のある話にしたいです。",
  "audience": "日常的に開発しているソフトウェアエンジニア",
  "purpose": "Copilotを今日からもっと上手く使う具体的な行動を持ち帰ってもらう",
  "contentMode": "presentation",
  "suggestedSlideCount": 12,
  "tone": "カジュアル、実践的、少しユーモアがある",
  "mustCover": ["導入のつかみ", "便利Tips 5-7個", "良いプロンプト例", "失敗例", "チームでの使い方", "まとめ"],
  "requiredExpressions": ["tip-cards", "before-after", "workflow", "demo-script", "closing-takeaways"],
  "requiredTools": ["recommend_template", "recommend_figure", "generate_schematic", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["messageFit", "visualFit", "accessibility"]
}
```

### 3. Hakone Ryokan Family Choice

```json
{
  "id": "scenario-hakone-ryokan-family-choice",
  "userRequest": "箱根の温泉旅館でおすすめをまとめてください。とくに6項目くらいの特徴をまとめて、どの観点で選ぶとどの旅館が最も楽しめるかを、家族で楽しく確認できる資料にしてください。",
  "audience": "週末旅行を相談する家族",
  "purpose": "家族で楽しく比較し、旅行先の候補を2-3件に絞る",
  "contentMode": "report",
  "suggestedSlideCount": 8,
  "tone": "楽しい、会話が生まれる、押し付けすぎない",
  "mustCover": ["候補旅館", "6項目比較", "家族タイプ別おすすめ", "予算感", "アクセス", "予約前チェック"],
  "requiredExpressions": ["radar", "comparison-table", "ranking", "family-discussion", "source-note"],
  "requiredTools": ["recommend_figure", "generate_schematic", "finalize", "review", "source-check"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json", "source-check.txt"],
  "evaluatorFocus": ["messageFit", "visualFit", "accessibility", "toolDiscipline"]
}
```

### 4. Startup Seed Investor Pitch

```json
{
  "id": "scenario-startup-investor-seed-pitch",
  "userRequest": "シード投資家向けのピッチ資料を作ってください。プロダクトの課題、解決策、市場、トラクション、競合、ビジネスモデル、資金使途が伝わるようにしたいです。",
  "audience": "シード投資家、エンジェル投資家、アクセラレーター審査員",
  "purpose": "面談または追加資料依頼につなげる",
  "contentMode": "presentation",
  "suggestedSlideCount": 11,
  "tone": "簡潔、勢いがある、数字とストーリーの両方を見せる",
  "mustCover": ["problem", "solution", "market", "traction", "competition", "business model", "team", "ask"],
  "requiredExpressions": ["problem-solution", "market-map", "traction-chart", "competitive-matrix", "use-of-funds"],
  "requiredTools": ["plan_business_deck", "recommend_figure", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "business-plan.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["messageFit", "visualFit", "toolDiscipline"]
}
```

### 5. Enterprise AI Adoption Executive Briefing

```json
{
  "id": "scenario-enterprise-ai-adoption-executive",
  "userRequest": "企業で生成AIを導入するための役員向け判断資料を作ってください。リスク、期待効果、導入ロードマップ、ガバナンス、初期PoC案を含めてください。",
  "audience": "経営会議、役員、法務・情報システム責任者",
  "purpose": "PoC開始とガバナンス整備の承認を得る",
  "contentMode": "decision",
  "suggestedSlideCount": 10,
  "tone": "現実的、リスクに正直、前に進める",
  "mustCover": ["why now", "expected value", "risk", "governance", "roadmap", "PoC scope", "decision request"],
  "requiredExpressions": ["executive-summary", "risk-matrix", "roadmap", "governance-model", "decision-table"],
  "requiredTools": ["plan_business_deck", "recommend_figure", "render_design_component", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "business-plan.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["messageFit", "visualFit", "accessibility"]
}
```

### 6. SaaS Customer Success QBR

```json
{
  "id": "scenario-saas-qbr-customer-success",
  "userRequest": "SaaSの顧客向けQBR資料を作ってください。利用状況、成果、課題、改善提案、次四半期のアクションを分かりやすくまとめたいです。",
  "audience": "既存顧客の部門長、管理者、CS担当",
  "purpose": "継続利用とアップセルの会話につなげる",
  "contentMode": "report",
  "suggestedSlideCount": 9,
  "tone": "誠実、データドリブン、顧客の成果に寄り添う",
  "mustCover": ["usage summary", "outcomes", "benchmarks", "open issues", "recommendations", "next actions"],
  "requiredExpressions": ["kpi-dashboard", "trend-chart", "benchmark-table", "action-plan"],
  "requiredTools": ["recommend_figure", "generate_schematic", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["messageFit", "visualFit", "accessibility"]
}
```

### 7. Engineering New-Hire Onboarding

```json
{
  "id": "scenario-new-hire-onboarding-engineering",
  "userRequest": "新しく入社したエンジニア向けのオンボーディング資料を作ってください。開発環境、リポジトリ構成、レビュー文化、リリース手順、最初の1週間の進め方を説明したいです。",
  "audience": "新入社員、異動してきたエンジニア、メンター",
  "purpose": "初週に迷わず開発を始められる状態にする",
  "contentMode": "handout",
  "suggestedSlideCount": 10,
  "tone": "親しみやすい、実務的、参照しやすい",
  "mustCover": ["team norms", "dev environment", "repo map", "review flow", "release flow", "first week checklist"],
  "requiredExpressions": ["repo-map", "workflow", "checklist", "structured-text", "timeline"],
  "requiredTools": ["recommend_figure", "generate_native_diagram", "generate_schematic", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["messageFit", "editability", "accessibility"]
}
```

### 8. Cloud Migration Board Approval

```json
{
  "id": "scenario-cloud-migration-board-approval",
  "userRequest": "オンプレ環境からクラウドへ移行する計画を、経営承認向けに説明する資料にしてください。費用、リスク、移行段階、期待効果を含めたいです。",
  "audience": "経営層、IT責任者、財務責任者",
  "purpose": "移行計画と初期予算の承認を得る",
  "contentMode": "decision",
  "suggestedSlideCount": 11,
  "tone": "慎重、具体的、投資対効果が分かる",
  "mustCover": ["current state", "target state", "cost", "risk", "migration phases", "governance", "approval ask"],
  "requiredExpressions": ["before-after", "architecture", "cost-breakdown", "risk-matrix", "gantt"],
  "requiredTools": ["plan_business_deck", "recommend_figure", "generate_native_diagram", "render_design_component", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "business-plan.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["messageFit", "visualFit", "editability", "toolDiscipline"]
}
```

### 9. Technical Incident Postmortem

```json
{
  "id": "scenario-incident-postmortem-technical",
  "userRequest": "大きめのシステム障害について、エンジニア向けのポストモーテム資料を作ってください。時系列、原因、影響範囲、検知、復旧、再発防止策を共有したいです。",
  "audience": "開発チーム、SRE、運用チーム、技術マネージャー",
  "purpose": "責めるためではなく、再発防止に向けて共通理解を作る",
  "contentMode": "technical",
  "suggestedSlideCount": 9,
  "tone": "率直、落ち着いている、学びに集中する",
  "mustCover": ["impact", "timeline", "root cause", "detection", "mitigation", "preventive actions"],
  "requiredExpressions": ["timeline", "architecture", "root-cause-tree", "action-table"],
  "requiredTools": ["recommend_figure", "generate_native_diagram", "render_design_component", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["messageFit", "visualFit", "editability"]
}
```

### 10. NPO Fundraising Community Deck

```json
{
  "id": "scenario-npo-fundraising-community",
  "userRequest": "地域NPOの活動紹介と寄付依頼の資料を作ってください。活動の背景、これまでの成果、支援が必要な理由、寄付で実現できることを温かく伝えたいです。",
  "audience": "地域の支援者、企業CSR担当、個人寄付者",
  "purpose": "共感と寄付・協賛の行動につなげる",
  "contentMode": "presentation",
  "suggestedSlideCount": 8,
  "tone": "温かい、誠実、数字だけでなく人の顔が見える",
  "mustCover": ["mission", "community issue", "activities", "outcomes", "funding need", "how to support"],
  "requiredExpressions": ["story", "impact-metrics", "before-after", "donation-use-table", "photo-or-illustration"],
  "requiredTools": ["recommend_template", "recommend_figure", "generate_visual_scaffold", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["messageFit", "visualFit", "accessibility"]
}
```

### 11. Product Roadmap All-Hands

```json
{
  "id": "scenario-product-roadmap-all-hands",
  "userRequest": "全社会議で共有するプロダクトロードマップ資料を作ってください。今後半年の重点テーマ、なぜそれをやるのか、各チームに期待することを伝えたいです。",
  "audience": "全社員、プロダクト・営業・CS・開発チーム",
  "purpose": "会社全体の優先順位をそろえる",
  "contentMode": "presentation",
  "suggestedSlideCount": 9,
  "tone": "前向き、明快、部門をまたいで分かる",
  "mustCover": ["north star", "customer insights", "themes", "roadmap", "team implications", "risks"],
  "requiredExpressions": ["roadmap", "theme-cards", "customer-voice", "dependency-map"],
  "requiredTools": ["recommend_figure", "render_design_component", "generate_schematic", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["messageFit", "visualFit", "accessibility"]
}
```

### 12. Manufacturing Quality Improvement

```json
{
  "id": "scenario-manufacturing-quality-improvement",
  "userRequest": "製造現場の品質改善プロジェクト資料を作ってください。不良率の現状、原因仮説、改善施策、効果見込み、現場の協力依頼を説明したいです。",
  "audience": "工場長、品質保証、現場リーダー、改善チーム",
  "purpose": "改善施策への合意と現場協力を得る",
  "contentMode": "report",
  "suggestedSlideCount": 9,
  "tone": "現場目線、具体的、責任追及ではなく改善志向",
  "mustCover": ["defect trend", "root causes", "countermeasures", "expected effect", "roles", "timeline"],
  "requiredExpressions": ["trend-chart", "fishbone-or-tree", "before-after", "action-plan", "gantt"],
  "requiredTools": ["recommend_figure", "generate_schematic", "render_design_component", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["messageFit", "visualFit", "accessibility"]
}
```

### 13. Healthcare Service Patient Guide

```json
{
  "id": "scenario-healthcare-service-patient-guide",
  "userRequest": "患者さん向けに、新しいオンライン診療サービスの使い方を説明する資料を作ってください。予約、診察、支払い、注意点をやさしく説明したいです。",
  "audience": "患者、家族、受付スタッフ",
  "purpose": "不安を減らし、迷わずサービスを利用できるようにする",
  "contentMode": "handout",
  "suggestedSlideCount": 7,
  "tone": "やさしい、安心感がある、専門用語を避ける",
  "mustCover": ["what it is", "who it is for", "booking steps", "visit flow", "payment", "important cautions", "support contact"],
  "requiredExpressions": ["step-flow", "checklist", "faq", "visual-scaffold"],
  "requiredTools": ["recommend_figure", "generate_schematic", "generate_visual_scaffold", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["messageFit", "accessibility", "visualFit"]
}
```

### 14. Real Estate Area Comparison For Family

```json
{
  "id": "scenario-real-estate-area-comparison-family",
  "userRequest": "家族で住み替え先を検討するために、候補エリアを比較する資料を作ってください。通勤、学校、治安、買い物、自然、価格感を比べたいです。",
  "audience": "住み替えを検討する家族",
  "purpose": "家族の優先順位を話し合い、候補エリアを絞る",
  "contentMode": "report",
  "suggestedSlideCount": 8,
  "tone": "楽しく、生活イメージが湧く、比較しやすい",
  "mustCover": ["candidate areas", "six criteria", "family priorities", "tradeoffs", "shortlist", "next visits"],
  "requiredExpressions": ["radar", "comparison-table", "ranking", "map-like-overview", "discussion-guide"],
  "requiredTools": ["recommend_figure", "generate_schematic", "finalize", "review", "source-check"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json", "source-check.txt"],
  "evaluatorFocus": ["messageFit", "visualFit", "accessibility"]
}
```

### 15. University Research Conference Talk

```json
{
  "id": "scenario-university-research-conference",
  "userRequest": "大学の研究発表用スライドを作ってください。背景、研究課題、方法、結果、考察、今後の課題を、専門外の人にもある程度伝わるようにしたいです。",
  "audience": "学会参加者、研究者、専門外の聴衆も一部含む",
  "purpose": "研究の意義と結果を正確かつ分かりやすく伝える",
  "contentMode": "technical",
  "suggestedSlideCount": 12,
  "tone": "正確、落ち着いている、図で理解を助ける",
  "mustCover": ["background", "research question", "method", "results", "discussion", "limitations", "future work"],
  "requiredExpressions": ["method-flow", "result-chart", "comparison", "limitations", "takeaway"],
  "requiredTools": ["recommend_figure", "generate_schematic", "finalize", "review", "source-check"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json", "source-check.txt"],
  "evaluatorFocus": ["messageFit", "visualFit", "accessibility"]
}
```

### 16. Retail Seasonal Campaign Plan

```json
{
  "id": "scenario-retail-seasonal-campaign-plan",
  "userRequest": "小売店の季節キャンペーン企画資料を作ってください。ターゲット、商品構成、販促施策、売上目標、スケジュール、店舗オペレーションを説明したいです。",
  "audience": "店舗責任者、販促担当、商品企画、営業企画",
  "purpose": "キャンペーン実行に向けて関係者の認識をそろえる",
  "contentMode": "decision",
  "suggestedSlideCount": 9,
  "tone": "明るい、実行しやすい、現場が動きやすい",
  "mustCover": ["target", "offer", "product mix", "promotion", "sales goal", "schedule", "store operations"],
  "requiredExpressions": ["campaign-calendar", "customer-segment", "sales-funnel", "store-checklist"],
  "requiredTools": ["recommend_figure", "render_design_component", "generate_schematic", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["messageFit", "visualFit", "toolDiscipline"]
}
```

### 17. Finance Budget Review For Managers

```json
{
  "id": "scenario-finance-budget-review-management",
  "userRequest": "管理職向けの予算レビュー資料を作ってください。予算消化、前年差、見込み、コスト増の要因、打ち手を説明したいです。",
  "audience": "部門長、経理、事業責任者",
  "purpose": "現状認識をそろえ、予算修正またはコスト対策を決める",
  "contentMode": "report",
  "suggestedSlideCount": 8,
  "tone": "数字に強く、冷静、判断しやすい",
  "mustCover": ["budget vs actual", "variance", "forecast", "drivers", "risks", "actions"],
  "requiredExpressions": ["variance-chart", "waterfall-or-breakdown", "forecast", "action-table"],
  "requiredTools": ["recommend_figure", "generate_schematic", "polish", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["messageFit", "visualFit", "accessibility"]
}
```

### 18. Public Sector Policy Briefing

```json
{
  "id": "scenario-public-sector-policy-briefing",
  "userRequest": "自治体向けの政策説明資料を作ってください。背景、住民への影響、施策案、費用、スケジュール、合意形成の進め方を説明したいです。",
  "audience": "自治体職員、議員、地域関係者",
  "purpose": "施策の必要性と進め方への理解を得る",
  "contentMode": "report",
  "suggestedSlideCount": 10,
  "tone": "公平、分かりやすい、過度に煽らない",
  "mustCover": ["background", "citizen impact", "policy options", "cost", "timeline", "stakeholder process"],
  "requiredExpressions": ["stakeholder-map", "policy-options-table", "timeline", "impact-summary"],
  "requiredTools": ["recommend_figure", "generate_schematic", "render_design_component", "finalize", "review", "source-check"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json", "source-check.txt"],
  "evaluatorFocus": ["messageFit", "accessibility", "visualFit"]
}
```

### 19. Mobile App Launch Marketing Deck

```json
{
  "id": "scenario-mobile-app-launch-marketing",
  "userRequest": "新しいモバイルアプリのローンチ資料を作ってください。ターゲット、価値提案、主要機能、ローンチ施策、KPI、初月の運用計画をまとめたいです。",
  "audience": "マーケティング、プロダクト、経営層、代理店パートナー",
  "purpose": "ローンチ計画の合意と実行準備を進める",
  "contentMode": "presentation",
  "suggestedSlideCount": 9,
  "tone": "期待感がある、具体的、実行に落ちる",
  "mustCover": ["target user", "value proposition", "features", "launch channels", "KPI", "first-month operations"],
  "requiredExpressions": ["persona", "feature-cards", "launch-funnel", "kpi-dashboard", "roadmap"],
  "requiredTools": ["recommend_template", "recommend_figure", "generate_visual_scaffold", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["messageFit", "visualFit", "toolDiscipline"]
}
```

### 20. Personal Learning Plan For Family

```json
{
  "id": "scenario-personal-learning-plan-family",
  "userRequest": "家族で共有する学習計画の資料を作ってください。子どもの学習目標、週間スケジュール、得意不得意、サポート方法、楽しく続ける工夫をまとめたいです。",
  "audience": "本人、家族、必要なら家庭教師や先生",
  "purpose": "責めずに前向きな学習習慣を作る",
  "contentMode": "handout",
  "suggestedSlideCount": 7,
  "tone": "やさしい、楽しい、続けやすい",
  "mustCover": ["learning goals", "weekly rhythm", "strengths", "support needs", "motivation", "family roles"],
  "requiredExpressions": ["weekly-calendar", "radar", "checklist", "encouragement-cards"],
  "requiredTools": ["recommend_figure", "generate_schematic", "generate_visual_scaffold", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["messageFit", "visualFit", "accessibility"]
}
```

## Suggested Scenario Sets

営業・意思決定資料を改善したい場合:

- `scenario-it-security-product-decision-maker`
- `scenario-enterprise-ai-adoption-executive`
- `scenario-cloud-migration-board-approval`

登壇・説明資料を改善したい場合:

- `scenario-github-copilot-tips-tech-talk`
- `scenario-university-research-conference`
- `scenario-product-roadmap-all-hands`

比較・選定資料を改善したい場合:

- `scenario-hakone-ryokan-family-choice`
- `scenario-real-estate-area-comparison-family`
- `scenario-finance-budget-review-management`

やさしい説明・handout品質を改善したい場合:

- `scenario-healthcare-service-patient-guide`
- `scenario-new-hire-onboarding-engineering`
- `scenario-personal-learning-plan-family`

source / trust / public-facing品質を改善したい場合:

- `scenario-it-security-product-decision-maker`
- `scenario-public-sector-policy-briefing`
- `scenario-npo-fundraising-community`
