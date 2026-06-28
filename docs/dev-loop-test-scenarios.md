# pptcreater Dev-Loop Test Scenarios

この文書は、pptcreater 開発改善ループで User Simulator が使う代表的な `ScenarioSpec` カタログである。各シナリオは、pptcreater を実際に使って deck artifact を作り、Evaluator が `docs/dev-loop-evaluator-criteria.md` に沿って評価できる粒度にしている。

## 使い方

- 1つの WorkItem につき、関連するシナリオを 2-3 個選ぶ。
- 大きめのUI/品質変更では、happy path、adversarial path、regression path を少なくとも1つずつ選ぶ。
- 生成物は `generated/dev-loop-runs/<run-id>/<scenario-id>/` に置く。
- User Simulator は、ScenarioSpec の `requiredTools` を使った証跡を tool ledger に残す。
- Evaluator は、`finalize`、`review`、PPTX zip integrity、tool ledger、Studio HTML またはスクリーンショットを証拠にする。

共通成果物:

```json
["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"]
```

## Scenario Index

| # | Scenario ID | 主な狙い |
| --- | --- | --- |
| 1 | `scenario-ja-report-baseline` | 日本語report deckの通常生成品質 |
| 2 | `scenario-en-presentation-keynote` | 英語presentation deckの簡潔さと視覚密度 |
| 3 | `scenario-technical-native-architecture` | architecture intentがnative diagramへ流れるか |
| 4 | `scenario-security-intent-diagram` | known conceptをintent diagramで保てるか |
| 5 | `scenario-roadmap-gantt-design-pack` | timeline/ganttがdesign-packへ流れるか |
| 6 | `scenario-radar-profile-comparison` | radar表現の軸数、ラベル、可読性 |
| 7 | `scenario-matrix-vendor-comparison` | matrix比較の配置、密度、編集性 |
| 8 | `scenario-before-after-transformation` | before/after図解の明瞭さ |
| 9 | `scenario-structured-text-handout` | text-rich slideが意図的構造として許容されるか |
| 10 | `scenario-dense-table-accessibility` | dense tableの視認性、contrast、font floor |
| 11 | `scenario-source-hyperlink-official` | official source、hyperlink、reference slide |
| 12 | `scenario-template-scaffold-no-overdraw` | scaffold_from_template利用とtemplate overdraw回避 |
| 13 | `scenario-image-aspect-containment` | official image / SVGの縦横比維持 |
| 14 | `scenario-svg-label-overlap-regression` | SVG内部text overlap検知 |
| 15 | `scenario-native-connectors-complexity` | 複雑な手置きconnectorをnative diagramへ逃がすか |
| 16 | `scenario-ja-line-break-regression` | 日本語bad line breakの回避 |
| 17 | `scenario-accessibility-reading-order` | alt text、reading order、低コントラストの検出 |
| 18 | `scenario-icon-visual-scaffold` | icon suggestとvisual scaffoldの利用規律 |
| 19 | `scenario-business-sectioned-deck` | executive summary、section divider、source traceability |
| 20 | `scenario-agent-ledger-discipline` | Deck Director / specialist role ledgerの正確性 |

## Scenarios

### 1. Japanese Report Baseline

日本語の標準report deckを作り、title/message、図解比率、review/finalizeの基本ゲートを確認する。

```json
{
  "id": "scenario-ja-report-baseline",
  "purpose": "社内報告向けに、新しい業務改善施策を5-7枚で説明する",
  "contentMode": "report",
  "requiredExpressions": ["executive-summary", "flow", "table", "structured-text"],
  "requiredTools": ["rules", "recommend_template", "recommend_figure", "generate_schematic", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["messageFit", "visualFit", "accessibility", "toolDiscipline"]
}
```

### 2. English Presentation Keynote

英語presentation modeで、短いassertion titleと大胆な余白が保たれるかを確認する。

```json
{
  "id": "scenario-en-presentation-keynote",
  "purpose": "conference-style product update deck for executives",
  "contentMode": "presentation",
  "requiredExpressions": ["hero-message", "comparison", "step", "closing"],
  "requiredTools": ["rules", "recommend_template", "recommend_figure", "render_design_component", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["messageFit", "visualFit", "accessibility"]
}
```

### 3. Technical Native Architecture

アーキテクチャ説明で `recommend_figure` が `generate_native_diagram` へ流れ、flattened SVGを避けるかを確認する。

```json
{
  "id": "scenario-technical-native-architecture",
  "purpose": "customer-facing technical architecture deck for a cloud security integration",
  "contentMode": "technical",
  "requiredExpressions": ["architecture", "flow", "table", "structured-text"],
  "requiredTools": ["rules", "recommend_figure", "generate_native_diagram", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["editability", "toolDiscipline", "visualFit"]
}
```

### 4. Security Intent Diagram

known conceptを自由配置で崩さず、Diagram Intentで粒度を維持できるかを見る。

```json
{
  "id": "scenario-security-intent-diagram",
  "purpose": "zero trust privileged access pathをbefore/afterとapproved pathで説明する",
  "contentMode": "technical",
  "requiredExpressions": ["closed-privileged-path", "before-after", "risk-callout"],
  "requiredTools": ["rules", "generate_intent_diagram", "recommend_figure", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "intent-input.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["messageFit", "editability", "toolDiscipline"]
}
```

### 5. Roadmap Gantt Design-Pack

timeline/ganttが許可表現として扱われ、手置きlineではなくdesign-packに寄るかを確認する。

```json
{
  "id": "scenario-roadmap-gantt-design-pack",
  "purpose": "90日間の導入ロードマップを意思決定者向けに説明する",
  "contentMode": "decision",
  "requiredExpressions": ["timeline", "gantt", "step", "risk-table"],
  "requiredTools": ["recommend_figure", "list_design_components", "render_design_component", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["visualFit", "editability", "toolDiscipline"]
}
```

### 6. Radar Profile Comparison

4-8軸のscore profileとしてradarを使い、ラベル重なりや小さすぎる文字が出ないかを確認する。

```json
{
  "id": "scenario-radar-profile-comparison",
  "purpose": "3つの候補施設または製品を、6軸スコアで比較する",
  "contentMode": "report",
  "requiredExpressions": ["radar", "comparison", "ranking", "source-note"],
  "requiredTools": ["recommend_figure", "generate_schematic", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["visualFit", "accessibility", "toolDiscipline"]
}
```

### 7. Matrix Vendor Comparison

2x2または比較matrixで、vendor chipsや短いラベルが折り返して崩れないかを確認する。

```json
{
  "id": "scenario-matrix-vendor-comparison",
  "purpose": "4つのベンダーを機能成熟度と運用負荷の2軸で比較する",
  "contentMode": "decision",
  "requiredExpressions": ["matrix", "comparison", "callout"],
  "requiredTools": ["recommend_figure", "render_design_component", "polish", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["visualFit", "accessibility", "editability"]
}
```

### 8. Before-After Transformation

before/after図解で、現状と目標状態の差分が一目で分かるかを確認する。

```json
{
  "id": "scenario-before-after-transformation",
  "purpose": "手作業中心の業務を自動化後の運用へ移行する価値を説明する",
  "contentMode": "decision",
  "requiredExpressions": ["before-after", "flow", "metric-callout"],
  "requiredTools": ["recommend_figure", "generate_intent_diagram", "render_design_component", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["messageFit", "visualFit", "editability"]
}
```

### 9. Structured Text Handout

読むこと自体が目的のtext-rich slideが、ただの文章塊ではなく構造化されているかを確認する。

```json
{
  "id": "scenario-structured-text-handout",
  "purpose": "配布資料として、方針・判断基準・例外条件を自走して読める形でまとめる",
  "contentMode": "handout",
  "requiredExpressions": ["structured-text", "detail", "table", "callout"],
  "requiredTools": ["rules", "review_content", "polish", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["messageFit", "accessibility", "visualFit"]
}
```

### 10. Dense Table Accessibility

denseな比較表でも、font floor、contrast、gridの弱め方が保たれるかを確認する。

```json
{
  "id": "scenario-dense-table-accessibility",
  "purpose": "10項目の要件と5候補の対応状況を一覧表で比較する",
  "contentMode": "report",
  "requiredExpressions": ["table", "structured-text", "legend"],
  "requiredTools": ["recommend_figure", "generate_schematic", "polish", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["accessibility", "visualFit", "messageFit"]
}
```

### 11. Source Hyperlink Official

公式URLを使うdeckで、source traceability、reference slide、hyperlinkが正しく入るかを確認する。

```json
{
  "id": "scenario-source-hyperlink-official",
  "purpose": "公式ページだけを根拠に、サービス候補を比較する顧客向けdeckを作る",
  "contentMode": "report",
  "requiredExpressions": ["comparison", "table", "source-note", "reference-slide"],
  "requiredTools": ["recommend_figure", "finalize", "review", "pptx-zip-check", "source-check"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json", "source-check.txt"],
  "evaluatorFocus": ["toolDiscipline", "messageFit", "accessibility"]
}
```

### 12. Template Scaffold No Overdraw

registered templateのscaffoldを使い、cover/content backgroundを手描きで上書きしないかを確認する。

```json
{
  "id": "scenario-template-scaffold-no-overdraw",
  "purpose": "microsoft-security系テンプレートで、ブランド背景とロゴを保った技術説明deckを作る",
  "contentMode": "technical",
  "requiredExpressions": ["template-scaffold", "architecture", "table", "section-divider"],
  "requiredTools": ["search_templates", "scaffold_from_template", "recommend_figure", "generate_native_diagram", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["visualFit", "toolDiscipline", "accessibility"]
}
```

### 13. Image Aspect Containment

画像やSVGを含むdeckで、非装飾画像が縦横比を保ってcontainされるかを確認する。

```json
{
  "id": "scenario-image-aspect-containment",
  "purpose": "公式スクリーンショットまたは製品画像を含む提案deckを作る",
  "contentMode": "decision",
  "requiredExpressions": ["image", "side-by-side", "caption", "source-note"],
  "requiredTools": ["create_deck_from_message_map", "polish", "finalize", "review", "pptx-zip-check"],
  "expectedArtifacts": ["scenario.json", "message-map.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json", "aspect-check.txt"],
  "evaluatorFocus": ["visualFit", "accessibility", "toolDiscipline"]
}
```

### 14. SVG Label Overlap Regression

SVG内部ラベルが重なるケースを再現し、lint/reviewで検知できるかを確認する。

```json
{
  "id": "scenario-svg-label-overlap-regression",
  "purpose": "ラベル数の多いSVG図解を含むdeckで、SVG内部text overlapを検出する",
  "contentMode": "technical",
  "requiredExpressions": ["svg-diagram", "label-heavy-diagram", "native-fallback"],
  "requiredTools": ["lint", "review", "finalize", "generate_native_diagram"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "lint.txt", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["accessibility", "visualFit", "editability"]
}
```

### 15. Native Connectors Complexity

4本以上の手置きconnectorが出るような複雑flowで、native diagramへ逃がすべき警告が出るかを見る。

```json
{
  "id": "scenario-native-connectors-complexity",
  "purpose": "6ノード以上の処理フローを、手置きconnectorではなくnative diagramで説明する",
  "contentMode": "technical",
  "requiredExpressions": ["flow", "architecture", "native-diagram"],
  "requiredTools": ["recommend_figure", "generate_native_diagram", "lint", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "lint.txt", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["editability", "toolDiscipline", "visualFit"]
}
```

### 16. Japanese Line Break Regression

日本語タイトルや本文で、助詞・括弧・句読点が行頭に孤立しないかを確認する。

```json
{
  "id": "scenario-ja-line-break-regression",
  "purpose": "長めの日本語メッセージを含むreport deckで、bad line breakを回避する",
  "contentMode": "report",
  "requiredExpressions": ["structured-text", "table", "callout"],
  "requiredTools": ["review_content", "polish", "lint", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "lint.txt", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["messageFit", "accessibility", "visualFit"]
}
```

### 17. Accessibility Reading Order

reading order、alt text、contrastBackgroundが実用上問題ないかを確認する。

```json
{
  "id": "scenario-accessibility-reading-order",
  "purpose": "図解、画像、複数カード、脚注を含むdeckでアクセシビリティを検証する",
  "contentMode": "report",
  "requiredExpressions": ["cards", "image", "diagram", "footnote"],
  "requiredTools": ["lint", "review", "polish", "finalize"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "lint.txt", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["accessibility", "visualFit", "editability"]
}
```

### 18. Icon Visual Scaffold

テキスト中心になりがちなslideへ、icon suggestionとvisual scaffoldで軽量な視覚構造を足せるかを確認する。

```json
{
  "id": "scenario-icon-visual-scaffold",
  "purpose": "4つの概念説明slideに、意味のあるiconと右レールscaffoldを入れる",
  "contentMode": "presentation",
  "requiredExpressions": ["visual-scaffold", "icon", "list-horizontal", "concept-card"],
  "requiredTools": ["suggest_icon", "generate_visual_scaffold", "recommend_figure", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["visualFit", "toolDiscipline", "accessibility"]
}
```

### 19. Business Sectioned Deck

business deckとして、Executive Summary、section divider、source traceability、final landingがそろうかを見る。

```json
{
  "id": "scenario-business-sectioned-deck",
  "purpose": "重要会議向けに、PoC承認を得る9-12枚のbusiness deckを作る",
  "contentMode": "decision",
  "requiredExpressions": ["executive-summary", "section-divider", "matrix", "roadmap", "final-landing"],
  "requiredTools": ["plan_business_deck", "generate_section_divider", "recommend_figure", "finalize", "review"],
  "expectedArtifacts": ["scenario.json", "business-plan.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "tool-ledger.json"],
  "evaluatorFocus": ["messageFit", "visualFit", "toolDiscipline"]
}
```

### 20. Agent Ledger Discipline

Deck Directorや専門roleを使った場合、実行していないagentを実行済みと主張しないかを確認する。

```json
{
  "id": "scenario-agent-ledger-discipline",
  "purpose": "Deck Director起点でdeckを作り、role execution ledgerの正確性を検証する",
  "contentMode": "technical",
  "requiredExpressions": ["architecture", "timeline", "structured-text"],
  "requiredTools": ["Deck Director", "recommend_figure", "generate_native_diagram", "review_deck", "finalize_deck"],
  "expectedArtifacts": ["scenario.json", "deck.json", "polished.deck.json", "pptx", "studio.html", "review.txt", "finalize.txt", "role-execution-ledger.json", "tool-ledger.json"],
  "evaluatorFocus": ["toolDiscipline", "messageFit", "editability"]
}
```

## Suggested Scenario Sets

小さなdocs/guidance変更:

- `scenario-agent-ledger-discipline`
- `scenario-ja-report-baseline`
- `scenario-structured-text-handout`

figure selection / diagram変更:

- `scenario-technical-native-architecture`
- `scenario-roadmap-gantt-design-pack`
- `scenario-native-connectors-complexity`

layout / rendering変更:

- `scenario-image-aspect-containment`
- `scenario-svg-label-overlap-regression`
- `scenario-ja-line-break-regression`

customer-facing deck品質変更:

- `scenario-source-hyperlink-official`
- `scenario-business-sectioned-deck`
- `scenario-template-scaffold-no-overdraw`
