# Changelog

## 1.0.9 - 2026-05-06

### Fixed

- Prevented CPU saturation during long thinking streams by bounding baseline summarizer candidate scoring to a salient retained subset instead of processing an unbounded candidate list.
- Reduced hot-path allocation in summary similarity scoring by caching token sets per candidate and reusing them during comparisons.
- Preserved summary fidelity for late high-signal failure candidates while limiting generic candidate volume.

### Tests

- Added regressions for small-input failure summary preservation and late salient failure retention after large generic candidate sets.
