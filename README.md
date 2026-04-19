# Pi Thinking Steps

A polished, terminal-native thinking view for **Pi**.

Pi Thinking Steps turns raw provider reasoning into a cleaner, easier-to-scan interface with three practical display modes:

- **collapsed** — one compact live step
- **summary** — one summarized line per derived step
- **expanded** — full step detail with structured terminal flow

If you use Pi in a real terminal and want model reasoning to be readable instead of noisy, this extension is for you.

---

## Why this exists

Pi already exposes provider thinking, but the default presentation is intentionally minimal. That works for occasional inspection, but it is not ideal when you want to:

- understand what the model is doing right now
- scan a long reasoning trace without losing the thread
- review steps quickly before trusting an answer
- see headings, lists, code spans, and emphasis rendered more cleanly
- keep the UI compact until you need full detail

Pi Thinking Steps improves readability **without changing the meaning of the source text**.

---

## What it does

### `collapsed`
Shows a single compact line for the active thinking step.

Best when you want minimal visual noise while still seeing what the model is actively working on.

### `summary`
Shows one summarized line per derived thinking step.

Best when you want a fast overview of the reasoning flow.

### `expanded`
Shows the full derived steps with body text and connected terminal flow styling.

Best when you want the complete reasoning text, but rendered more cleanly than raw transcript output.

---

## Feature highlights

- three stable modes: `collapsed`, `summary`, `expanded`
- semantic Unicode icons for common reasoning roles
- active pulse in collapsed mode while thinking is still streaming
- persistent footer status indicator
- terminal-first presentation with **no italics**
- markdown-inspired rendering for:
  - headings
  - list items
  - code spans
  - emphasis markers
- multiline list continuation handling for more natural step boundaries
- sanitization of model-origin control sequences before rendering
- reversible, reference-counted patch lifecycle for Pi internals
- integration and regression coverage for parsing, rendering, and patch behavior

---

## Controls

| Action | Control |
|---|---|
| Cycle thinking view | `Alt+T` |
| Choose a mode interactively | `/thinking-steps` |
| Set collapsed mode | `/thinking-steps collapsed` |
| Set summary mode | `/thinking-steps summary` |
| Set expanded mode | `/thinking-steps expanded` |

---

## Quick start

From the repository root:

```bash
pi -e ./index.ts
```

You can also load this repository as a Pi extension package through your normal Pi setup.

The package entry point is already configured in `package.json`:

```json
"pi": {
  "extensions": ["./index.ts"]
}
```

---

## Example output

### Summary mode

```text
┆ Thinking Steps · Summary
├─ ◫ Inspect the current renderer implementation.
├─ ↔ Compare how visibility toggling works.
└─ ✓ Verify the refresh path after mode changes.
```

### Expanded mode

```text
┆ Thinking Steps · Expanded
├─ ◫ Inspect the current renderer implementation.
│  Inspect the current renderer implementation.
├─ ↔ Compare how visibility toggling works.
│  Compare how visibility toggling works.
└─ ✓ Verify the refresh path after mode changes.
   Verify the refresh path after mode changes.
```

### Collapsed mode

```text
│ Thinking ✓ Verify the refresh path after mode changes. ·
```

---

## Rendering behavior

Pi Thinking Steps is intentionally conservative: it tries to improve readability **without inventing new meaning**.

### Parsing and step derivation

It derives steps from provider thinking text using deterministic rules so output stays faithful to the original text.

Examples:

- standalone markdown headings stay attached to the body they introduce
- list items become separate steps when that improves scanability
- blank-line continuation paragraphs stay attached to the correct list item
- redacted reasoning remains clearly marked as provider-hidden

### Display formatting

The renderer normalizes markdown-like content for terminal display:

- headings render as headings instead of raw `#` clutter
- list items render with clean bullets
- backticks render as code-styled inline text
- emphasis markers render cleanly instead of leaking raw `*...*` / `_..._`
- raw control sequences from model output are stripped before rendering

### Terminal-first constraints

This extension is built for a real terminal, not a web UI. That means:

- width-aware line wrapping matters
- ANSI-safe rendering matters
- over-decoration is avoided
- the output should remain useful in narrower layouts

---

## Technical approach

Pi currently exposes only a minimal public hook for built-in thinking rendering (`setHiddenThinkingLabel`).

Because of that limitation, this extension patches Pi's internal `AssistantMessageComponent` at runtime and replaces the default visible thinking rendering path with a custom structured renderer.

That patch layer is designed to be:

- **isolated** — runtime patching lives in `internal-patch.ts`
- **reversible** — cleanup restores original methods
- **reference-counted** — multiple retain/release paths are handled safely
- **guarded** — compatibility checks fail loudly when Pi internals drift
- **tested** — integration and regression tests cover patch lifecycle and rendering edge cases

---

## Compatibility note

This project intentionally depends on Pi's current internal TUI implementation.

That means:

- upstream Pi internal changes can break the patch layer
- keeping this extension in sync with Pi releases matters
- the test suite is part of the maintenance contract, not an optional extra

If Pi changes its internal renderer shape, this extension may need updates even if the public Pi CLI still works normally.

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
- `render.ts` — collapsed / summary / expanded terminal rendering
- `state.ts` — shared mode, active-thinking state, patch lifecycle state
- `types.ts` — shared contracts
- `test/thinking-steps.test.ts` — unit and integration coverage

---

## Design principles

This extension is opinionated about a few things:

1. **Terminal-first over decorative**
   - The goal is readability, not flashy formatting.

2. **Faithful over clever**
   - The renderer should not invent structure the source text does not support.

3. **Small surface area**
   - Parsing, rendering, state, and patching are kept separated on purpose.

4. **Strict validation**
   - Changes should be backed by tests, especially around patch lifecycle and upstream-sensitive behavior.

---

## Versioning

For the canonical package version, see [`package.json`](./package.json).
For release points, use the repository tags.

---

## License

See [`LICENSE`](./LICENSE).
