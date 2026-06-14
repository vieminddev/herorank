<script lang="ts">
  import type { Snippet, Component, ComponentType, SvelteComponent } from "svelte";
  type IconComponent = Component<any> | ComponentType<SvelteComponent<any>>;

  let { icon, title, hint, preview }: {
    icon?: IconComponent;
    title: string;
    hint?: string;
    /** Optional ghosted sample of what the output looks like — sells the value before a run. */
    preview?: Snippet;
  } = $props();

  const Icon = $derived(icon);
</script>

<div class="tool-empty animate-fade-in">
  <div class="flex items-start gap-3">
    {#if Icon}
      <span class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style="background: color-mix(in srgb, var(--teal) 9%, white)">
        <Icon size={18} class="text-teal" />
      </span>
    {/if}
    <div>
      <p class="text-[0.9375rem] font-medium text-text-primary">{title}</p>
      {#if hint}<p class="text-sm text-text-secondary mt-0.5 leading-relaxed max-w-md">{hint}</p>{/if}
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
