<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import { Bot, LoaderCircle, CircleAlert, Check, MessageSquare } from "lucide-svelte";
  import { callTool } from "$lib/tools-client";
  import { invalidateAll } from "$app/navigation";

  // Response shape from POST /api/tools/chatgpt-optimizer (outputSchema in chatgptOptimizer.ts).
  interface OptimizerResult {
    optimizedTitle: string;
    attributes: { name: string; value: string }[];
    conversationalKeywords: string[];
    qa: { question: string; answer: string }[];
    optimizedDescription: string;
    checklist: { label: string; done: boolean }[];
  }

  let listing = $state("");
  let loading = $state(false);
  let error = $state<string | null>(null);
  let needsUpgrade = $state(false);
  let result = $state<OptimizerResult | null>(null);

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (listing.trim().length < 10 || loading) return;
    loading = true;
    error = null;
    needsUpgrade = false;

    const res = await callTool<OptimizerResult>("chatgpt-optimizer", {
      listing: listing.trim(),
    });

    if (res.ok) {
      result = res.data;
      await invalidateAll(); // refresh Header credits badge
    } else if (res.status === 402) {
      needsUpgrade = true;
      error = res.message;
    } else {
      error = res.message;
    }
    loading = false;
  };
</script>

<ToolPageLayout
  title="AI Shopping Optimizer"
  prefix="Etsy"
  description="Shoppers increasingly ask AI assistants what to buy. This rewrites your listing into the structured, factual shape an AI needs to understand it — and recommend it."
  icon={Bot}
  credits={2}
>
  {#snippet controls()}
    <form onsubmit={handleSubmit}>
      <label for="cg-listing" class="field-label">Paste your listing</label>
      <textarea
        id="cg-listing"
        bind:value={listing}
        placeholder="Paste your current title and description here…"
        rows={10}
        class="field resize-none"
        maxlength={6000}
      ></textarea>
      <p class="field-hint">Title + description together is ideal. We restructure it for AI shopping assistants.</p>
      <button
        type="submit"
        disabled={loading || listing.trim().length < 10}
        class="btn btn-primary w-full justify-center mt-4"
      >
        {#if loading}<LoaderCircle size={14} class="animate-spin" /> Optimizing…{:else}Optimize for AI{/if}
      </button>
    </form>
  {/snippet}

  {#if error}
    <div class="mb-7 flex items-start gap-3 animate-fade-in" role="alert">
      <CircleAlert size={18} class="text-danger flex-shrink-0 mt-0.5" />
      <div class="flex-1">
        <p class="text-sm text-text-primary">{error}</p>
        {#if needsUpgrade}
          <a href="/pricing" class="copy-link mt-2 !text-teal">Upgrade your plan →</a>
        {/if}
      </div>
    </div>
  {/if}

  {#if result}
    <div class="animate-fade-in space-y-8">
      <!-- Optimized title -->
      <div>
        <p class="section-kicker mb-1">AI-readable title</p>
        <p class="text-base font-medium text-text-primary leading-snug">{result.optimizedTitle}</p>
      </div>

      <hr class="rule" />

      <!-- Structured attributes -->
      <div>
        <p class="section-kicker mb-3">Structured attributes</p>
        <div class="entry-list">
          {#each result.attributes as attr (attr.name)}
            <div class="entry flex items-baseline justify-between gap-4 py-2.5">
              <span class="text-sm text-text-secondary shrink-0">{attr.name}</span>
              <span class="text-sm text-text-primary text-right">{attr.value}</span>
            </div>
          {/each}
        </div>
      </div>

      <hr class="rule" />

      <!-- Conversational keywords -->
      <div>
        <p class="section-kicker mb-1">How buyers ask an AI</p>
        <p class="lead text-sm mb-3">Natural-language phrases shoppers type to an assistant.</p>
        <div class="flex flex-wrap gap-2">
          {#each result.conversationalKeywords as kw}
            <span class="badge badge-nodata inline-flex items-center gap-1.5">
              <MessageSquare size={11} class="text-teal" />
              {kw}
            </span>
          {/each}
        </div>
      </div>

      <hr class="rule" />

      <!-- Buyer Q&A -->
      <div>
        <p class="section-kicker mb-3">Questions an AI can answer for you</p>
        <div class="entry-list">
          {#each result.qa as item (item.question)}
            <div class="entry !block py-4">
              <p class="text-sm font-medium text-text-primary mb-1">{item.question}</p>
              <p class="text-sm text-text-secondary leading-relaxed">{item.answer}</p>
            </div>
          {/each}
        </div>
      </div>

      <hr class="rule" />

      <!-- AI-readable description -->
      <div>
        <p class="section-kicker mb-3">AI-readable description</p>
        <p class="text-sm text-text-secondary leading-relaxed whitespace-pre-line">{result.optimizedDescription}</p>
      </div>

      <hr class="rule" />

      <!-- Checklist -->
      <div>
        <p class="section-kicker mb-3">What to add or fix</p>
        <ul class="space-y-2.5">
          {#each result.checklist as item}
            <li class="flex items-start gap-2.5 text-sm">
              <span
                class="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 {item.done ? 'bg-success/15' : 'border border-border'}"
              >
                {#if item.done}<Check size={11} class="text-success" />{/if}
              </span>
              <span class={item.done ? "text-text-secondary line-through" : "text-text-primary"}>{item.label}</span>
            </li>
          {/each}
        </ul>
      </div>
    </div>
  {:else if !error}
    <ToolEmpty
      icon={Bot}
      title="Your AI-optimized listing will appear here"
      hint="Paste a listing on the left. We'll turn it into structured attributes, buyer questions, and an AI-readable description."
    />
  {/if}
</ToolPageLayout>
