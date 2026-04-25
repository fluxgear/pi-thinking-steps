# Pi Thinking Steps

<p align="center">
  <strong>A clean, terminal-native thinking view for Pi.</strong><br />
  Make provider reasoning easier to follow without changing what it says.
</p>

<p align="center">
  <a href="https://github.com/fluxgear/pi-thinking-steps/tags"><img alt="version" src="https://img.shields.io/badge/version-1.0.1-4f46e5" /></a>
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-16a34a" /></a>
  <img alt="typescript" src="https://img.shields.io/badge/TypeScript-Strict-3178c6" />
  <img alt="terminal" src="https://img.shields.io/badge/UI-terminal--native-f59e0b" />
</p>

---

## Overview

Pi already exposes provider thinking. Pi Thinking Steps turns that raw stream into something more readable, more structured, and easier to scan in a real terminal.

It stays intentionally conservative:

- no invented reasoning
- no synthetic structure that changes meaning
- no web-style decoration
- no break from Pi's terminal workflow

The result is simple: clearer thinking output, with the original intent preserved.

---

## What you get

- **Three focused modes** — `collapsed`, `summary`, `expanded`
- **Terminal-first rendering** — built for width constraints, ANSI safety, and live output
- **Faithful parsing** — deterministic step derivation and restrained summarization
- **Markdown-aware display** — headings, bullets, ordered lists, code spans, emphasis
- **Scoped persistence** — session, project, and global defaults
- **Patch safety** — isolated, reversible, reference-counted runtime patching
- **Regression coverage** — parser, renderer, lifecycle, and compatibility tests

---

## The three modes

| Mode | Purpose |
|---|---|
| `collapsed` | One compact live line for the active step |
| `summary` | One summarized line per derived step |
| `expanded` | Full step detail with structured terminal flow |

### `collapsed`
Use it when you want minimal visual noise while the model is still thinking.

### `summary`
Use it when you want the reasoning flow at a glance.

### `expanded`
Use it when you want the full text, but in a cleaner terminal presentation than the raw transcript.

---

## Control surface

| Action | Control |
|---|---|
| Cycle thinking view | `Alt+T` |
| Choose a mode interactively | `/thinking-steps` |
| Set session mode | `/thinking-steps collapsed` / `summary` / `expanded` |
| Save a project default | `/thinking-steps project <mode>` |
| Save a global default | `/thinking-steps global <mode>` |
| Clear a project default | `/thinking-steps project clear` |
| Clear a global default | `/thinking-steps global clear` |

---

## Persistence

Mode restoration follows this order:

1. session history
2. project default from `.pi/thinking-steps.json`
3. global default from `~/.pi/agent/state/thinking-steps.json`
4. built-in default `summary`

Use plain `/thinking-steps <mode>` when the choice should stay local to the current session. Use `project` or `global` when you want future sessions to inherit that choice automatically.

---

## Example output

### Summary

```text
┆ Thinking Steps · Summary
│ ● ◫ Inspect the current renderer implementation.
│ ● ↔ Compare how visibility toggling works.
  ● ✓ Verify the refresh path after mode changes.
```

### Expanded

```text
┆ Thinking Steps · Expanded
│ ● ◫ Inspect the current renderer implementation.
│   Inspect the current renderer implementation.
│ ● ↔ Compare how visibility toggling works.
│   Compare how visibility toggling works.
  ● ✓ Verify the refresh path after mode changes.
    Verify the refresh path after mode changes.
```

Timeline nodes represent reasoning steps that have already been observed in the provider stream. The extension does not invent pending or future steps; while streaming, the currently active observed step is highlighted, and after streaming ends the observed steps are rendered as completed timeline nodes.

### Collapsed

```text
│ Thinking ✓ Verify the refresh path after mode changes. ·
```

---

## Rendering behavior

Pi Thinking Steps is designed to improve readability without changing meaning.

### Parsing and step derivation

The parser uses deterministic rules to keep step boundaries believable and stable.

Examples:

- standalone markdown headings stay attached to the body they introduce
- list items split into separate steps when that improves scanability
- blank-line continuation paragraphs stay attached to the correct list item
- standalone concluding prose after a list stays separate from the final list item
- redacted reasoning remains clearly marked as provider-hidden

### Display formatting

The renderer normalizes markdown-like content for terminal display:

- headings render as headings instead of raw `#` clutter
- unordered list items render with clean bullets
- ordered and lettered list markers are preserved
- backticks render as code-styled inline text
- emphasis markers render cleanly instead of leaking raw `*...*` / `_..._`
- raw control sequences from model output are stripped before rendering

### Terminal-first constraints

This extension is built for a real terminal, not a browser UI.

That means:

- width-aware wrapping matters
- ANSI-safe rendering matters
- over-decoration is avoided
- output should stay readable in narrower layouts

---

## Technical approach

Pi currently exposes only a minimal public hook for built-in thinking rendering: `setHiddenThinkingLabel`.

Because of that limitation, Pi Thinking Steps patches Pi's internal `AssistantMessageComponent` at runtime and replaces the default visible thinking rendering path with a custom renderer.

That patch layer is:

- **isolated** — patching lives in `internal-patch.ts`
- **reversible** — cleanup restores original methods
- **reference-counted** — multiple retain/release paths are handled safely
- **guarded** — compatibility checks fail loudly when Pi internals drift
- **tested** — integration and regression coverage protects the patch lifecycle

---

## Compatibility

This extension intentionally depends on Pi's current internal TUI implementation.

Today, the patch relies on these internal modules in `@mariozechner/pi-coding-agent`:

- `dist/modes/interactive/components/assistant-message.js`
- `dist/modes/interactive/theme/theme.js`

That means:

- upstream Pi internal changes can break the patch layer
- Pi upgrades should be treated as deliberate compatibility work
- the pinned Pi package versions and `package-lock.json` matter
- `npm test` is part of the maintenance contract, not an optional extra

If Pi changes its internal renderer shape, this extension may need updates even if the public CLI still works normally.

---

## Quick start

For a one-off test from the repository root:

```bash
npm install
pi -e ./index.ts
```

For normal use with `/reload`, install the repository as a Pi package once:

```bash
pi install /absolute/path/to/pi-thinking-steps
```

For this checkout, that is:

```bash
pi install /Users/roach/pi-thinking-steps
```

Then restart Pi or run `/reload`. The command is `/thinking-steps`.

The package entry point is already configured in `package.json`:

```json
"pi": {
  "extensions": ["./index.ts"]
}
```

---

## Development

Install dependencies:

```bash
npm install
```

Run the full validation suite:

```bash
npm test
```

Typecheck only:

```bash
npm run build
```

---

## Project structure

- `index.ts` — extension entry point, commands, shortcut, lifecycle hooks
- `internal-patch.ts` — Pi runtime patching and cleanup
- `parse.ts` — thinking-step splitting, summaries, role inference, mode parsing
- `persistence.ts` — project/global mode preference storage
- `render.ts` — collapsed, summary, and expanded terminal rendering
- `state.ts` — shared mode, active-thinking state, patch lifecycle state
- `types.ts` — shared contracts
- `test/thinking-steps.test.ts` — unit and integration coverage

---

## Design principles

1. **Readable over flashy**
   - The goal is clarity, not decoration.

2. **Faithful over clever**
   - The renderer should not invent meaning the source text does not support.

3. **Terminal-native over web-like**
   - The output should feel right in a terminal first.

4. **Small surface area**
   - Parsing, rendering, state, and patching stay deliberately separated.

5. **Strict validation**
   - Changes should be backed by tests, especially around patch lifecycle and compatibility.

---

## Versioning

For the canonical package version, see [`package.json`](./package.json).
For release points, use the repository tags.

---

## License

This project is released under the [MIT License](./LICENSE).
