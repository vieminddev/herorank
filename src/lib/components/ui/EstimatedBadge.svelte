<script lang="ts">
  // The honesty marker beside every estimated number (DESIGN.md §5):
  // off-white pill, ink-green text, quiet by design.
  //
  // Two modes (backward compatible):
  //  1. tooltip-only (default) — renders a static pill with a native `title` tooltip.
  //  2. method — when a one-line "how this is estimated" string is given, the pill
  //     becomes an interactive button that reveals a small popover (hover/focus/click)
  //     with the explanation + a "How we estimate →" link to /methodology.
  let {
    label = "Estimated",
    tooltip,
    method,
    learnMore,
  }: {
    label?: string;
    tooltip?: string;
    /** One-line, plain-language explanation of how this value is estimated. */
    method?: string;
    /** Show the "How we estimate →" link in the popover. Defaults to true when `method` is set. */
    learnMore?: boolean;
  } = $props();

  const title = $derived(tooltip ?? "This value is estimated and may not be exact");
  const interactive = $derived(!!method);
  const showLearnMore = $derived(learnMore ?? true);

  let open = $state(false);
  let pinned = $state(false); // click toggles a "pinned" open state (vs hover/focus)

  function show() {
    open = true;
  }
  function hide() {
    if (!pinned) open = false;
  }
  function toggle() {
    pinned = !pinned;
    open = pinned;
  }
  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      open = false;
      pinned = false;
    }
  }
</script>

{#if interactive}
  <span
    class="badge-est-wrap"
    onmouseenter={show}
    onmouseleave={hide}
    onfocusin={show}
    onfocusout={hide}
    onkeydown={onKeydown}
    role="presentation"
  >
    <button
      type="button"
      class="badge-estimated badge-estimated-btn"
      aria-expanded={open}
      aria-label="{label} — how this is estimated"
      onclick={toggle}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      {label}
    </button>

    {#if open}
      <span class="badge-est-popover" role="tooltip">
        <span class="badge-est-popover-head">How this is estimated</span>
        <span class="badge-est-popover-body">{method}</span>
        {#if showLearnMore}
          <a class="badge-est-popover-link" href="/methodology">How we estimate →</a>
        {/if}
      </span>
    {/if}
  </span>
{:else}
  <span class="badge-estimated" {title}>
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
    {label}
  </span>
{/if}

<style>
  .badge-est-wrap {
    position: relative;
    display: inline-flex;
    vertical-align: middle;
  }

  /* Inherit the .badge-estimated pill look, but behave as a button. */
  .badge-estimated-btn {
    cursor: pointer;
    font: inherit;
    line-height: inherit;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .badge-estimated-btn:hover,
  .badge-estimated-btn:focus-visible {
    background: var(--success-bg);
    border-color: var(--success-light);
  }
  .badge-estimated-btn:focus-visible {
    outline: 2px solid var(--teal);
    outline-offset: 2px;
  }

  .badge-est-popover {
    position: absolute;
    z-index: 50;
    top: calc(100% + 6px);
    left: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: max-content;
    max-width: 260px;
    padding: 10px 12px;
    background: #fff;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg, 12px);
    box-shadow: 0 8px 24px -8px rgba(30, 42, 38, 0.22);
    text-align: left;
    white-space: normal;
    animation: badge-est-fade 0.12s ease-out;
  }
  @keyframes badge-est-fade {
    from { opacity: 0; transform: translateY(-2px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .badge-est-popover-head {
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
  }
  .badge-est-popover-body {
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1.4;
    color: var(--text-primary);
  }
  .badge-est-popover-link {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--teal);
    text-decoration: none;
  }
  .badge-est-popover-link:hover {
    text-decoration: underline;
  }
</style>
