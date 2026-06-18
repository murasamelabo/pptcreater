# Changelog

## Unreleased

- Added a render-blocking `diagram.visible-labels-missing` lint rule so meaningful diagrams cannot be boxes/connectors only; SVG diagrams now need visible labels/callouts instead of relying only on alt text or notes.

## v0.1.1 - 2026-06-17

- Calibrated `report-formal` layout polishing so dense report decks do not rely on unreadably small text.
- Normalized rounded-card accent bars so vertical bars are inset and rounded instead of flush square strips.
- Expanded text boxes when a readable font size requires more vertical room, rather than shrinking below practical floors.
- Added hard-wrap safeguards for long mixed Japanese/English technical labels while avoiding arbitrary identifier corruption.
- Adjusted reference slide spacing for large-title templates.
- Made Studio previews clip text closer to the slide canvas and avoid browser-only arbitrary word breaks.
- Added CI for build/test validation and documented release-tag based installation/update workflow.
