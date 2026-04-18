# Pi Thinking Steps

Terminal-native thinking-step rendering for Pi.

This extension replaces Pi's default hidden/italic reasoning block with a structured thinking view designed for real terminal use:

- compact when you want signal only
- expanded when you want full detail
- stable keyboard and command controls
- width-aware rendering with ANSI-safe wrapping
- clearer formatting for headings, lists, code spans, and emphasis markers

## Why this exists

Pi's built-in reasoning display is intentionally minimal. This extension makes provider thinking easier to scan by turning raw reasoning text into derived steps with summaries, semantic icons, and consistent rendering across three modes.

## Modes

### `collapsed`
One compact line showing the current active thinking step.

Best when you want to keep the interface quiet but still see what the model is doing.

### `summary`
One summarized line per derived thinking step.

Best for fast review of the model's reasoning flow.

### `expanded`
Full step detail with connected terminal flow styling.

Best when you want the complete thinking text, but rendered more cleanly than raw transcript output.

## Features

- three stable modes: `collapsed`, `summary`, `expanded`
- semantic Unicode icons for common reasoning roles
- active pulse in collapsed mode while thinking is still streaming
- persistent footer status indicator
- no italics in the thinking UI
- markdown-inspired rendering for headings, lists, code spans, and emphasis markers
- multiline list continuation handling for more natural step boundaries
- sanitization of model-origin control sequences before rendering
- reversible, reference-counted patch lifecycle for Pi internals

## Controls

| Action | Control |
|---|---|
| Cycle modes | `Alt+T` |
| Choose a mode interactively | `/thinking-steps` |
| Set collapsed mode | `/thinking-steps collapsed` |
| Set summary mode | `/thinking-steps summary` |
| Set expanded mode | `/thinking-steps expanded` |

## Quick start

Run it directly from the repo root:

```bash
pi -e ./index.ts
```

Or install this folder as a Pi extension package and load it through your Pi extension setup.

## What the output looks like

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

## Rendering behavior

The extension is intentionally terminal-first.

It aims to preserve meaning while improving readability:

- headings stay attached to the body they introduce
- list items become distinct steps when that improves scanning
- blank-line continuation paragraphs stay attached to the correct list item
- raw markdown markers like backticks and emphasis are normalized for display
- hostile or accidental control sequences from model output are stripped before rendering

## Technical approach

Pi currently exposes only a minimal public hook for built-in thinking rendering (`setHiddenThinkingLabel`).

Because of that, this extension patches Pi's internal `AssistantMessageComponent` at runtime and swaps in a custom renderer for visible thinking blocks.

That patching layer is:

- isolated to `internal-patch.ts`
- reversible on cleanup
- reference-counted
- guarded by compatibility checks
- covered by integration and regression tests

## Compatibility note

This project intentionally depends on Pi's current internal TUI implementation.

That means:

- upstream Pi internal changes can break the patch layer
- keeping this extension in sync with Pi releases matters
- the test suite is part of the maintenance contract, not an optional extra

## Development

From the repo root:

```bash
npm install
npm test
```

Typecheck only:

```bash
npm run build
```

## Project layout

- `index.ts` — extension entry point, commands, shortcut, lifecycle hooks
- `internal-patch.ts` — Pi runtime patching and cleanup
- `parse.ts` — thinking-step splitting, summaries, role inference, mode parsing
- `render.ts` — collapsed / summary / expanded terminal rendering
- `state.ts` — shared mode, active-thinking state, patch lifecycle state
- `types.ts` — shared contracts
- `test/thinking-steps.test.ts` — unit and integration coverage

## Current version

`v0.9.4`
