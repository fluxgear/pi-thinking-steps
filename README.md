# Pi Thinking Steps Extension

Professional three-mode thinking rendering for Pi's TUI.

## Features

- `collapsed` mode: one compact line showing the current active thinking step
- `summary` mode: one summarized line per derived thinking step
- `expanded` mode: full step detail with connected pipe-based flow styling
- semantic Unicode icons for common reasoning roles
- subtle active pulse in collapsed mode while thinking is still streaming
- no italics in the thinking UI
- persistent mode indicator in the footer
- `Alt+T` cycles the three thinking modes
- `/thinking-steps` selects an exact mode

## Usage

Run directly:

```bash
pi -e ./thinking-steps/index.ts
```

Or install the folder as a Pi extension package.

### Controls

- `Alt+T` → cycle `collapsed → summary → expanded`
- `/thinking-steps` → choose a mode interactively
- `/thinking-steps collapsed`
- `/thinking-steps summary`
- `/thinking-steps expanded`

## Technical note

Pi currently exposes only a minimal public hook for built-in thinking rendering (`setHiddenThinkingLabel`).
This extension therefore patches Pi's internal `AssistantMessageComponent` at runtime so it can replace the default italic reasoning block with a structured terminal-native renderer.

That means the extension is intentionally scoped to Pi's current internal TUI implementation and should be kept in sync with upstream Pi releases.

## Development

```bash
cd thinking-steps
npm install
npm test
```
