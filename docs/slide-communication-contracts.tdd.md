# Slide Communication Contracts TDD Evidence

## Scope

This implementation adds the first slice of the proposed semantic slide-generation architecture. Narrative planning now derives a `SlideCommunicationContract` before selecting a visual grammar, links each `ExpressionPlan` to that contract, and persists the contracts as a planning artifact.

Candidate generation, render-and-rank, image-based beauty scoring, and human-preference calibration are not part of this slice.

## User Journeys

- As a deck reader, I want a responsibility-boundary slide to encode who owns each responsibility, so that a comparison layout communicates the actual boundary instead of only looking comparative.
- As a decision maker, I want an explicit two-axis decision slide to preserve both axes, so that plotted positions and the selected visual grammar can be justified.
- As a downstream evaluator, I want communication contracts persisted beside expression plans, so that later candidate generation and review can test the intended reader understanding.

## TDD Evidence

| Stage | Evidence |
| --- | --- |
| RED | `npm test -- packages/core/src/narrativePlanning.test.ts --reporter=dot` failed 2 tests because `communicationContracts` did not exist. |
| RED commit | `3c0961d test: define slide communication contracts` |
| Initial GREEN | The same focused target passed 13 tests after implementing contract inference and relation-guided grammar selection. |
| Regression found | Full suite exposed an architecture regression: a synthesized structured diagram was routed to `sequential-path`. |
| Regression repair | Explicit `intent.diagram` data now takes precedence over inferred relation and legacy `visualType`. |
| Focused final | `npm test -- packages/core/src/messageDeck.test.ts packages/core/src/narrativePlanning.test.ts --reporter=dot` passed 46 tests. |
| Full final | `npm test -- --reporter=dot` passed 29 files / 438 tests. |
| Build | `npm run build` passed. |
| Diff | `git diff --check` passed. |
| CLI smoke | `from-message-map` generated `slide-communication-contracts.json`; one responsibility contract linked to one `comparison-field` expression plan. |
| GREEN commit | `dae6dc1 Add slide communication contracts` |

## Guaranteed Behaviors

| # | Guarantee | Test or check | Result |
| --- | --- | --- | --- |
| 1 | Responsibility rows produce a `responsibility` contract with entities, comparison axes, a reader test, and protected context. | `narrativePlanning.test.ts` | PASS |
| 2 | Explicit two-axis wording produces a `tradeoff` contract and `decision-surface` grammar. | `narrativePlanning.test.ts` | PASS |
| 3 | Every expression plan references its communication contract. | Unit test and CLI smoke | PASS |
| 4 | Structured diagrams remain spatial or layered even when their previous visual type suggests a sequence. | `messageDeck.test.ts` full regression | PASS |
| 5 | Both CLI planning paths persist `slide-communication-contracts.json`. | Build plus CLI smoke | PASS |

## Known Gaps

- Entity and axis extraction is deterministic and intentionally narrow; it does not yet use a general semantic graph parser.
- `readerTest` is generated as a review contract but is not yet executed against rendered images or human comprehension responses.
- The repository has no coverage script, so an 80% coverage report was not produced. Focused and full test suites were used instead.
- Custom review agents could not access the live diff in their environment; local type diagnostics, focused tests, full tests, build, CLI smoke, and diff checks provide the available verification evidence.

## Expression Candidate Ranking Slice

The second slice generates up to three expression candidates for each communication contract and records separate Accuracy, Clarity, Beauty, and weighted total scores. Accuracy contributes 50%, Clarity 30%, and Beauty 20%. Candidates below the Accuracy gate cannot be selected.

Until candidate DeckSpecs are actually rendered and visually compared, the production selection policy is explicitly `primary-grammar-until-rendered`. This preserves current deck output while exposing scored alternatives for the next implementation slice.

| Stage | Evidence |
| --- | --- |
| RED | `npm test -- packages/core/src/narrativePlanning.test.ts --reporter=dot` failed 2 tests because `expressionCandidateSets` did not exist. |
| RED commit | `e94fdf9 test: define expression candidate ranking` |
| Regression 1 | Focused planning tests found an ecosystem table changed to `comparison-field`; primary-grammar compatibility was restored. |
| Regression 2 | Planning plus message-deck tests found a detail report changed to `table-text-system`; provisional selection was fixed to the existing primary grammar. |
| Focused final | `npm test -- packages/core/src/narrativePlanning.test.ts packages/core/src/messageDeck.test.ts --reporter=dot` passed 46 tests. |
| Full final | `npm test -- --reporter=dot` passed 29 files / 438 tests. |
| Build | `npm run build` passed. |
| CLI smoke | `expression-candidates.json` contained 3 candidates with score ranks 1-3, selected `comparison-field`, Accuracy 100, Clarity 92, Beauty 91, passed Accuracy gate, and matched `ExpressionPlan.selectedCandidateId`. |
| GREEN commit | `deed903 Add ranked expression candidates` |

### Additional Guarantees

| # | Guarantee | Result |
| --- | --- | --- |
| 6 | Each communication contract produces a bounded candidate set with deterministic three-axis scores. | PASS |
| 7 | Accuracy-gate failures remain visible but cannot become the selected production candidate. | PASS |
| 8 | `scoreRank` records score order independently from provisional production selection. | PASS |
| 9 | Existing grammar output remains unchanged until rendered candidate comparison is implemented. | PASS |
| 10 | Both CLI planning paths persist `expression-candidates.json`. | PASS |

## Candidate Deck Materialization Slice

The third slice turns each planning candidate into an isolated one-slide DeckSpec using its candidate grammar. It then runs deterministic deck, visual, and slide-quality reviews and records post-materialization Accuracy, Clarity, Beauty, total score, and review evidence.

The CLI command `materialize-candidates` writes `candidate-summary.json`, one `.deck.json`, and one `.evaluation.json` per candidate. Optional `--render-pptx` and `--render-studio` flags also produce actual PPTX and Studio HTML artifacts.

| Stage | Evidence |
| --- | --- |
| RED | `npm test -- packages/core/src/narrativePlanning.test.ts --reporter=dot` failed because `materializeExpressionCandidateDecks` did not exist. |
| RED commit | `158a275 test: define candidate deck materialization` |
| Focused GREEN | Planning and message-deck tests passed 47 tests. |
| Full GREEN | `npm test -- --reporter=dot` passed 29 files / 439 tests. |
| Core/CLI commit | `f7a5126 Materialize expression candidate decks` |
| DeckSpec smoke | Three candidates produced three distinct layouts: `comparison-field`, `table-text-system`, and `evidence-board`. |
| Render smoke | Three PPTX and three Studio HTML files were generated; all PPTX files had ZIP headers and no render warnings. |
| Render commit | `8c4d06e Render materialized expression candidates` |

### Additional Guarantees

| # | Guarantee | Result |
| --- | --- | --- |
| 11 | Candidate grammar overrides affect only the targeted slide and do not mutate the source Message Map. | PASS |
| 12 | Multi-intent Message Maps require an explicit `slideId` for candidate materialization. | PASS |
| 13 | Candidate review evidence is isolated from cover, closing, and unrelated slides. | PASS |
| 14 | CLI candidate artifacts keep deterministic score-rank filenames and summary links. | PASS |
| 15 | Candidate PPTX and Studio HTML artifacts can be generated in one command. | PASS |

### Remaining Render Boundary

The current pptcreater render API produces PPTX, not PNG slide images. Image-based candidate comparison therefore still requires a snapshot adapter, most likely Studio HTML to PNG through Playwright. Until that adapter exists, `selectionPolicy` remains `primary-grammar-until-rendered`; deterministic DeckSpec reviews and PPTX package checks do not claim to be human visual evaluation.

## Candidate Image Snapshot And Recommendation Slice

The fourth slice adds a Playwright Core adapter that uses an installed Edge, Chrome, or Chromium executable without downloading a browser. It isolates the Studio `.native-canvas`, captures a 1280x720 PNG, and records rendered DOM metrics for text overflow, text/SVG overlap, occupied area, largest meaningful element, and text count.

Full-slide background elements are excluded from occupancy and focal measurements. Studio header, sidebar, and outer article chrome are hidden during capture.

| Stage | Evidence |
| --- | --- |
| Snapshot RED | Focused test failed because `candidateSnapshots.js` did not exist. |
| Snapshot RED commit | `981195e test: define candidate image snapshots` |
| Snapshot GREEN | `candidateSnapshots.ts` added browser discovery, screenshot planning, DOM metrics, and Clarity/Beauty scoring. |
| Snapshot commit | `4ae5580 Capture expression candidate snapshots` |
| First image smoke | Three PNGs were generated, but all occupied/focal ratios were 1 because Studio chrome and full-slide backgrounds polluted metrics. |
| Metric repair | Studio chrome is hidden and elements covering at least 80% of the canvas are excluded from occupancy/focal metrics. |
| Corrected image smoke | Comparison: occupancy 0.7215, focal 0.2379, Clarity 95, Beauty 86. Table: 0.8549 / 0.5276 / 90 / 73. Evidence board: 0.8038 / 0.2619 / 92 / 78. |
| Recommendation RED | Focused test failed because `recommendRenderedCandidate` did not exist. |
| Recommendation RED commit | `a840a6b test: define rendered candidate recommendation` |
| Recommendation GREEN | Accuracy gate and rendered blocking checks run before 50/30/20 Accuracy/Clarity/Beauty ranking. |
| Recommendation commit | `4af6d68 Recommend rendered expression candidates` |
| Full final | `npm test -- --reporter=dot` passed 30 files / 442 tests; build, diagnostics, diff check, and BOM checks passed. |

### Additional Guarantees

| # | Guarantee | Result |
| --- | --- | --- |
| 16 | Studio snapshots contain only the native 16:9 slide canvas. | PASS |
| 17 | Installed Edge/Chrome is used through `playwright-core`; browser download is not required. | PASS |
| 18 | Accuracy-gate failures cannot win even with higher image Beauty. | PASS |
| 19 | Render-blocking candidates cannot be recommended. | PASS |
| 20 | Production selection and rendered recommendation remain separate fields. | PASS |
| 21 | Candidate summary stores PNG path, DOM metrics, image scores, eligibility, ranking, and rejection reasons. | PASS |

The current DOM/image metrics are deterministic proxies. They detect concrete rendered defects and composition differences, but they are not yet calibrated against human pairwise preference data.

## Human Pairwise Benchmark And Calibration Slice

The fifth slice persists immutable candidate features and human A/B judgements, then calibrates Accuracy, Clarity, and Beauty weights by confidence-weighted pairwise agreement.

Benchmark format version `1.0` stores benchmark and source-summary ids, slide id, candidate ids/grammars/snapshot paths, frozen automatic scores, Accuracy-gate state, reviewer id, preference, confidence, dimension, notes, and timestamp. Duplicate comparison ids, unknown candidates, same-candidate comparisons, and duplicate reviewer/pair/dimension judgements are rejected.

| Stage | Evidence |
| --- | --- |
| Benchmark RED | Focused test failed because `candidateBenchmark.js` did not exist. |
| Benchmark RED commit | `5a8b474 test: define pairwise benchmark calibration` |
| Benchmark GREEN | Runtime parsers, immutable comparison recording, confidence-weighted agreement, constrained grid search, and CLI lifecycle commands implemented. |
| Benchmark commit | `8af214a Add pairwise benchmark calibration` |
| Benchmark smoke | `benchmark-init`, three `benchmark-record` calls, and `benchmark-calibrate` completed; benchmark had 3 candidates / 3 comparisons / 3 reviewers. |
| Calibration RED | Corrected focused test showed explicit calibrated weights were ignored. |
| Calibration RED commit | `57f6c0f test: define calibrated recommendation weights` |
| Calibration GREEN | `materialize-candidates --calibration-report` applies weights only for `calibrated` status and records provenance. |
| Calibration commit | `de96381 Apply calibrated candidate weights` |
| Full final | `npm test -- --reporter=dot` passed 31 files / 448 tests; build, diagnostics, diff check, and BOM checks passed. |

### Calibration Rules

- Only `overall` comparisons train combined weights; dimension-specific comparisons remain available for future specialist calibration.
- Confidence 1-5 weights pairwise agreement.
- Accuracy, Clarity, and Beauty weights are non-negative and sum to 1.
- Accuracy weight has a configurable minimum, default 0.3.
- Comparisons containing an Accuracy-gate failure are excluded with evidence.
- Fewer than the configured minimum comparisons produce `insufficient-data` and retain baseline weights.
- Ties in agreement prefer the weight vector closest to baseline, then deterministic Accuracy/Clarity/Beauty ordering.
- Production selection and calibrated rendered recommendation remain separate fields.
