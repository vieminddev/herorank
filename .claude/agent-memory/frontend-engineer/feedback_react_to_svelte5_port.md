---
name: react-to-svelte5-port
description: Pitfalls when porting React hooks to Svelte 5 runes — scroll effects, array-mutation-in-render, dangerouslySetInnerHTML, setters-in-array, JSX-helper functions, div-onClick a11y
metadata:
  type: feedback
---

When porting React → Svelte 5 runes, watch these non-mechanical cases (mechanical mappings like useState→$state are in the migration spec):

- **`useEffect(scroll, [messages])` → `$effect`**: a Svelte `$effect` only re-runs on reads it *tracks*. Reference the dependency explicitly inside the body (e.g. a bare `messages;` statement) before the side-effect, or it won't re-run on append.
  **Why:** Svelte tracks reactive reads lexically inside the effect; an external function call (`scrollToBottom()`) reads nothing reactive, so without touching `messages` the effect fires once.

- **React `arr.reverse()` / mutation inside `.map()` during render**: copy first (`[...arr].reverse()`) into a const. The React original "works" only because of render idempotency quirks; porting the mutation verbatim is a latent bug.
  **Why:** Svelte renders differently; in-place mutation of module/const data is non-deterministic across re-renders.

- **`dangerouslySetInnerHTML` → `{@html}`**: it is the same XSS surface. If the injected string contains user input (e.g. a chat message run through a `**bold**` regex), it is unescaped HTML injection. Preserve for parity but flag it — escape user text before the transform, or sanitize.

- **Row-click + inner checkbox both toggling the same state**: React synthetic batching made this fire once; in Svelte add `onclick={(e) => e.stopPropagation()}` on the inner control so the parent handler doesn't double-toggle.

- **`useState` setters stored in a data array → not `bind:`-able**: React `[{ value, setter: setX }].map(...)` with `onChange={f.setter}` has no `bind:value` equivalent (can't bind to a captured setter). Replace with `oninput` + a single `setField(key, value)` switch over the underlying `$state` vars; keep value types identical so derived calcs match.

- **JSX-returning helper functions → inline `{#if}` chains**: helpers like `cellValue(val)` / `trendIcon(t)` that `return <Icon/>` don't translate to a Svelte function. Inline the branches as `{#if}/{:else if}/{:else}` at each call site.

- **`<div onClick>` → add keyboard a11y**: clickable non-button divs (upload dropzones) trip Svelte's a11y compiler warnings. Add `role="button"` + `tabindex="0"` + `onkeydown` (Enter/Space). Visual output unchanged.

**How to apply:** during any React→Svelte port, scan for `useEffect` with DOM side-effects, array mutation in render/map, `dangerouslySetInnerHTML`, nested clickable elements sharing a handler, arrays-of-field-setters, JSX-returning helpers, and clickable non-button elements.
