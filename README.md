# BrowserBoost

BrowserBoost is a local browser extension that reduces CPU load on heavy web
applications by cutting rendering work that provides no real benefit to the
user — without changing what you actually read or interact with.

**First target: long ChatGPT conversations.**

## Why

Long ChatGPT conversations can make Firefox's CPU usage climb well past what
the visible content should require. Profiling a real session showed the
browser's main thread busy 67% of the time during generation, with over 70%
of that DOM-related work coming from a single source: an infinitely-looping
CSS animation on the "thinking" indicator, kept alive even when the message
containing it is scrolled out of view. Rendering the actual code and text
was, by comparison, a small fraction of the cost.

BrowserBoost targets exactly that kind of waste.

## What it does

- **Off-screen message compaction** — messages far from the viewport are
  skipped from layout/paint (`content-visibility: hidden`) while you scroll,
  and restored the instant they come back into view. Nothing is deleted;
  it's purely a rendering optimization.
- **Infinite-animation cutoff** — any CSS animation that loops forever
  (loading indicators, streaming cursors) is detected structurally and
  stopped, replaced by a static, still-visible equivalent. No dependency on
  ChatGPT's internal class names, which can change on any deploy.
- **Code block collapsing** — long code blocks are collapsed once streaming
  settles, with a manual "show" button. Nothing is rendered by default that
  you haven't asked to see.
- **Mutation cleanup** — observers are unregistered as soon as a message is
  removed or regenerated, so nothing accumulates over a long session.

## Guarantees

- 100% local — no network requests of its own
- No tracking, no analytics, no data collection
- Minimal permissions — runs only on supported sites
- Never alters conversation content, only how it's rendered

## Supported sites

- ChatGPT (chatgpt.com, chat.openai.com)

## Settings

Toggle from the in-page toolbar, or configure thresholds directly:

| Setting                    | Default | Purpose                                        |
| -------------------------- | ------- | ---------------------------------------------- |
| `minMessagesBeforeCompact` | 10      | Messages before off-screen compaction kicks in |
| `viewportBufferScreens`    | 1.5     | How many screens above/below stay rendered     |
| `codeBlockThresholdPx`     | 300     | Height above which code blocks auto-collapse   |
| `killAnimations`           | true    | Stop infinitely-looping CSS animations         |
