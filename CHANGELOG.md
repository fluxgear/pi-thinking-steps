# Changelog

## 1.0.10 - 2026-05-11

### Fixed

- Isolated thinking patch release ownership and active thinking state across concurrent session scopes.
- Preserved message ownership through patched rendering, including reused message objects and duplicate timestamps.
- Hardened parser/summarizer handling for list continuations, failure vocabulary, plan-change wording, and visible summary metadata.
- Stripped ST-terminated terminal control payloads from rendered thinking text.

### Changed

- Clarified compatibility and workflow documentation for scope-owned cleanup, degraded sessions, tracked changelog handling, and local planning artifacts.
- Centralized persisted preference scope typing in shared contracts.

### Tests

- Added regressions covering scoped patch lifecycle, parser/summarizer edge cases, terminal control sanitization, package metadata contracts, and docs/workflow drift.

## 1.0.9 - 2026-05-06

### Fixed

- Prevented CPU saturation during long thinking streams by bounding baseline summarizer candidate scoring to a salient retained subset instead of processing an unbounded candidate list.
- Reduced hot-path allocation in summary similarity scoring by caching token sets per candidate and reusing them during comparisons.
- Preserved summary fidelity for late high-signal failure candidates while limiting generic candidate volume.

### Tests

- Added regressions for small-input failure summary preservation and late salient failure retention after large generic candidate sets.
