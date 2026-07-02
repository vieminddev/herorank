<script lang="ts">
  import type { Snippet, Component, ComponentType, SvelteComponent } from "svelte";
  import MascotLogo from "./MascotLogo.svelte";
  type IconComponent = Component<any> | ComponentType<SvelteComponent<any>>;

  let { icon, mascot = false, title, hint, preview, onLoadDemo, children }: {
    icon?: IconComponent;
    /** Show the butterfly mascot instead of the lucide icon — for first-touch / activation states. */
    mascot?: boolean;
    title: string;
    hint?: string;
    /** Optional ghosted sample of what the output looks like — sells the value before a run. */
    preview?: Snippet;
    /** Optional callback to load mock/demo data for interactive preview. */
    onLoadDemo?: () => void;
    children?: Snippet;
  } = $props();

  const Icon = $derived(icon);
</script>

<div class="tool-empty animate-fade-in">
  <div class="flex items-start gap-3">
    {#if mascot}
      <span class="mascot-badge shrink-0 mt-0.5" aria-hidden="true">
        <MascotLogo size={26} animate="always" />
      </span>
    {:else if Icon}
      <span class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style="background: color-mix(in srgb, var(--teal) 9%, white)">
        <Icon size={18} class="text-teal" />
      </span>
    {/if}
    <div>
      <p class="text-[0.9375rem] font-medium text-text-primary">{title}</p>
      {#if hint}<p class="text-sm text-text-secondary mt-0.5 leading-relaxed max-w-md">{hint}</p>{/if}
      
      {#if onLoadDemo}
        <button
          type="button"
          onclick={onLoadDemo}
          class="btn btn-secondary text-xs mt-3 py-1.5 px-4 inline-flex items-center gap-1.5 focus:outline-none"
        >
          <span>🔍 View Interactive Demo</span>
        </button>
      {/if}

      {#if children}
        <div class="mt-4">
          {@render children()}
        </div>
      {/if}
    </div>
  </div>

  {#if preview}
    <div class="tool-empty-preview" aria-hidden="true">
      <span class="tool-empty-tag">Example</span>
      <div class="tool-empty-preview-content">
        {@render preview()}
      </div>
    </div>
  {/if}
</div>

<style>
  .tool-empty { padding: 4px 0; }
  .mascot-badge {
    width: 38px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-lg, 12px);
    color: var(--teal);
    background: radial-gradient(circle, color-mix(in srgb, var(--teal) 11%, transparent) 0%, transparent 72%);
    animation: mascot-badge-float 3.4s ease-in-out infinite;
  }
  @keyframes mascot-badge-float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
  }
  @media (prefers-reduced-motion: reduce) {
    .mascot-badge { animation: none; }
  }
  .tool-empty-preview {
    position: relative;
    margin-top: 22px;
    padding: 18px;
    border: 1px dashed var(--border);
    border-radius: var(--radius-lg);
    opacity: 0.6;
    pointer-events: none;
    user-select: none;
  }
  .tool-empty-preview-content {
    -webkit-mask-image: linear-gradient(to bottom, #000 55%, transparent);
    mask-image: linear-gradient(to bottom, #000 55%, transparent);
  }
  .tool-empty-tag {
    position: absolute;
    top: -9px; left: 14px;
    background: var(--bg-card);
    padding: 0 8px;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
</style>
