# pptcreater Evaluator Criteria

この文書は、pptcreater 開発改善ループにおける `pptcreater Evaluator` が、どの条件で評価を開始し、何を証拠として扱い、どの基準で `PatchRequest` を作るかを定義する。

## 位置づけ

Evaluator は pptcreater 自体の開発ループにおける批評役であり、deck authoring agent ではない。Evaluator の仕事は、User Simulator が生成した実成果物を確認し、ツール・ガイダンス・生成物の問題を開発可能な形へ変換することである。

Evaluator は次のことを行わない。

- repo のコード、docs、agent 定義を直接編集しない。
- DeckSpec をその場で直して「解決済み」としない。
- ループ停止可否を決めない。停止判断は QA Gatekeeper が行う。
- モデルの印象だけで blocking / non-blocking を決めない。

## 評価を開始する条件

Evaluator は、原則として次の入力がそろったときに評価を開始する。

| 入力 | 必須条件 |
| --- | --- |
| WorkItem | 目的、scope、outOfScope、acceptance、maxIterations が明記されている。 |
| ScenarioSpec | 目的、contentMode、requiredExpressions、requiredTools、expectedArtifacts が明記されている。 |
| Deck artifacts | `deck.json`、polished DeckSpec、`.pptx`、review log、finalize log がある。Studio HTML またはスクリーンショットがあるとなおよい。 |
| Tool ledger | User Simulator が実行した CLI / MCP / agent 呼び出し、モデル、生成物パスが記録されている。 |
| Deterministic results | `finalize`、`review`、zip integrity、必要なら build/test の結果が記録されている。 |

入力が不足している場合、Evaluator は評価を完了扱いにせず、`PatchRequest` ではなく `residualRisks` または `blockingIssues` として「証拠不足」を返す。

## 評価を保留する条件

次の場合、Evaluator は品質評価を進めず、先に再実行または追加証跡を求める。

- deck artifact が存在しない、または指定パスから読めない。
- User Simulator が pptcreater CLI / MCP surface を使った証跡がない。
- `finalize` / `review` のログがなく、blocking 状態を確認できない。
- `.pptx` の zip integrity が未確認で、成果物破損の可能性が残っている。
- scenario が WorkItem の acceptance と無関係で、評価しても開発判断に使えない。
- Evaluator にコード編集やDeckSpec修正を求めている。

## 評価軸

Evaluator は次の軸で評価する。各軸は 0-5 点で採点し、3 点未満は原則として `PatchRequest` 候補にする。

| 軸 | 見るもの | 5点 | 3点 | 0-2点 |
| --- | --- | --- | --- | --- |
| `messageFit` | スライドのメッセージ、タイトル、根拠、scenario との一致 | 目的・聴き手・desired action に直結し、1スライド1メッセージになっている | 大枠は合うが、主張が弱い、根拠が薄い、読み手の行動に結びつきにくい | 目的から外れる、文章の寄せ集め、何を判断すべきか不明 |
| `standaloneClarity` | 作成スクリプトやscenarioを読まず、スライドに見えている情報だけで意味が分かるか | 各スライドが、見出し・主張・根拠・視覚情報だけで読み手に伝わり、短縮されすぎた断片がない | おおむね分かるが、いくつかのスライドは話者補足や前後文脈が必要 | ラベルが短すぎる、文が途中で終わる、見えている語だけでは何の話か分からない |
| `visualFit` | レイアウト、視線誘導、密度、表現選択、読みやすさ | 情報構造と視覚表現が一致し、3秒で主張が分かる | 読めるが密度・余白・視線誘導に弱さがある | 重なり、過密、表現ミスマッチ、主要情報が見えない |
| `expressionCraft` | 表現の強さ、シナリオ固有性、視覚的な語り方の幅 | サンプルに見られるように、写真・数値・空間モデル・大胆な同型反復・章扉などを内容に合わせて使い分け、シナリオが変わると見た目の作戦も変わる | 表現は破綻していないが、カード/表/flowの置換に留まり、どのシナリオでも似た見え方になる | ほぼ同じテンプレートの繰り返し、主役不在、表現が内容の温度や文脈を伝えていない |
| `editability` | PowerPoint上で編集できるか、native objects を使っているか | 期待される図解・ラベル・カードが編集可能な native elements | 一部が画像化されているが、実務上の修正は可能 | 技術図・表・ラベルが不必要に flattened SVG / image になっている |
| `accessibility` | contrast、font size、alt text、reading order、低視認性 | lint / review 上も実見上も読みやすく、代替情報がある | 警告はあるが、主要情報は読める | 低コントラスト、極小文字、読順破綻、alt不足が判断を妨げる |
| `toolDiscipline` | requiredTools、figure selection、template、review gate、source handling | ScenarioSpec の requiredTools を使い、ledger と成果物が一致する | 主要ツールは使ったが、一部が手作業・証跡不足 | requiredTools 未使用、review/finalize未実行、手作りscriptで回避 |

## 表現力の評価観点

Evaluator は、提示された実例（FABRIC TOKYO会社紹介、SUPER STUDIO 1on1変化、ENEOSアプリ事業デザイン、STORES Company Slide）を、コピーする対象ではなく評価語彙の参照として扱う。良い表現は装飾量ではなく、内容の見え方を変える設計判断として評価する。

| 観点 | サンプルから抽出した要点 | 評価で見るもの |
| --- | --- | --- |
| `anchoredRealism` | FABRIC TOKYO / STORES のように、写真・現場・プロダクト・人の気配を使い、抽象説明を現実の場面へ接続する | 重要な会社紹介・採用・事例系 deck に、写真/スクリーンショット/製品状態/現場感のある大きな visual があるか。単なるアイコン置換だけで済ませていないか。 |
| `focalProof` | FABRIC TOKYO の「お直し率 -70%」のように、1つの数字や成果を視覚上の主役として扱う | KPI/実績/比較が、表の1セルではなく、視線を止める大きな数値・吹き出し・線・強調として設計されているか。 |
| `spatialModel` | SUPER STUDIO の二軸/矢印/人物配置のように、概念の関係を空間に置き換える | 状況、関係、変化、経験差、プロセスが、文章列ではなく位置・距離・向き・矢印・軸で理解できるか。 |
| `deliberateRepetition` | ENEOS の3ポイントカードのように、同じ型を大胆に反復し、比較/列挙を強く読ませる | カード反復が単調な量産ではなく、点数・ラベル・余白・コントラストで意図的なリズムになっているか。 |
| `deckRhythm` | STORES の写真章扉、詳細情報、顧客事例、制度説明が切り替わるように、deck全体に呼吸がある | 連続スライドがすべて同じ密度・同じ構造になっていないか。章扉、写真主役、データ主役、概念図、詳細説明のリズムがあるか。 |
| `brandMateriality` | 各サンプルが色・余白・書体・写真トーンで固有の空気を持つ | テンプレート色を塗っただけでなく、subject/audienceに合う質感・余白・トーンがあるか。 |

`expressionCraft` が 3 点未満の場合、Evaluator は `visual.expression-craft-low` の PatchRequest を出す。証拠には、少なくとも「同一layoutの支配率」「写真/大きなvisualの有無」「空間モデル/大胆な反復/数値主役の有無」「どのサンプル由来の観点が欠けているか」を含める。

## Deterministic gate の扱い

Evaluator は deterministic gate をモデル判断より優先する。

| Gate | 評価条件 | 失敗時の扱い |
| --- | --- | --- |
| `finalize` | `Blocking errors: 0` である。 | critical または high。render前に修正が必要。 |
| `review` | `Ready to finalize: no blocking issues` または blocking issue 0。 | high。owner と finding code を PatchRequest に含める。 |
| zip integrity | zero-length non-directory entries が `0`。 | critical。PPTX成果物として信用しない。 |
| build/test | code変更がある場合、focused tests と full test が通っている。 | critical または high。開発側へ戻す。 |
| source/reference | 外部URLや公式情報を使う場合、metadata/source/reference slide または hyperlink が確認できる。 | medium 以上。出典不明なら customer-facing deck では high。 |

## PatchRequest にする条件

Evaluator は、次の4点を満たす問題だけを `PatchRequest` として返す。

1. WorkItem または ScenarioSpec の目的・acceptance に影響する。
2. artifact、log、slide number、lint code、tool ledger など具体的な証拠がある。
3. 期待状態を一文で説明できる。
4. 修正候補の範囲を `suggestedScope` として示せる。

単なる好み、代替案、将来改善は `PatchRequest` ではなく `residualRisks` または advisory note として扱う。ただし、表現品質の問題が ScenarioSpec の目的達成を妨げる場合は `PatchRequest` にしてよい。例えば、3秒で主張が分からない、同じ表現が不自然に反復される、情報量と図解形式が合っていない、視線誘導が弱く判断アクションに結びつかない、といった問題は evidence と expected を添えて development loop に戻す。

Evaluator は原則として、作成スクリプト、message-map生成ロジック、Dev Leadの意図説明を読まず、最終出力（PPTX、Studio HTML、polished DeckSpecの可視要素、review/finalizeログ）だけで評価する。`speakerNotes` や `quietInfo` は補助証跡として読んでよいが、スライド単体で意味が分からない問題の免罪にはしない。

次は `standaloneClarity` の PatchRequest 対象にする。

- タイトルやラベルが短縮されすぎて「観点」「対象」「候補」など抽象語だけになっている。
- 文が途中で終わっている、または名詞だけの羅列で主張がない。
- スライドの見出し、本文、図解ラベルを見ても「何を判断/理解すべきか」が分からない。
- 内容理解に作成スクリプト、scenario、speakerNotesへの依存が必要。

## Severity rubric

| Severity | 条件 | 例 |
| --- | --- | --- |
| critical | 成果物が壊れている、renderできない、テスト/ビルドが落ちる、zip破損、重大な誤情報。 | zeroNonDir > 0、finalize abort、公式情報の事実誤認。 |
| high | ループを戻すべき品質・機能問題。acceptance を満たさない。 | requiredTools 未使用、architecture slide が flattened SVG、review blocking issue。 |
| medium | 実用上の品質低下。acceptance は大筋満たすが、再発防止として直す価値が高い。 | 一部の視線誘導が弱い、source traceability が不完全、警告が多い。 |
| low | 仕上げ・明瞭化・保守性の改善。次のiterationへ回してよい。 | 文言の軽微な改善、ledger項目の粒度改善。 |

## 証拠の書き方

`PatchRequest.evidence` は、できるだけ次の形で書く。

- slide番号または artifact path。
- 実行コマンドまたは MCP tool 名。
- lint/review/finalize の finding code と要約。
- tool ledger 上の期待 tool と実際 tool の差分。
- Studio HTML、スクリーンショット、PPTX zip check などの確認結果。

悪い例:

```text
デザインが微妙。
```

良い例:

```text
slide 4 uses a full-slide SVG image for a 5-node architecture diagram; ScenarioSpec.requiredTools includes generate_native_diagram, but tool ledger has no generate_native_diagram call. review log has no blocking issue, so this is a toolDiscipline/editability PatchRequest rather than a finalize blocker.
```

## 出力条件

Evaluator は必ず次のJSON形で返す。

```json
{
  "role": "Evaluator",
  "scenarioId": "...",
  "model": "Opus4.8",
  "scores": {
    "messageFit": 0,
    "standaloneClarity": 0,
    "visualFit": 0,
    "expressionCraft": 0,
    "editability": 0,
    "accessibility": 0,
    "toolDiscipline": 0
  },
  "patchRequests": [
    {
      "severity": "low | medium | high | critical",
      "problem": "...",
      "evidence": "...",
      "expected": "...",
      "suggestedScope": []
    }
  ],
  "residualRisks": []
}
```

## QA Gatekeeper への引き渡し

Evaluator は stop / continue を決めない。QA Gatekeeper に渡すときは、次の状態を明確にする。

- deterministic gate の結果。
- high / critical PatchRequest の有無。
- 証拠不足で評価できなかった項目。
- acceptance を満たしているかどうかの見立て。
- 人間確認が必要な残リスク。
