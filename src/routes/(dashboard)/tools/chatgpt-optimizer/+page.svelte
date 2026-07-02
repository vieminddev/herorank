<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import ToolEmpty from "$lib/components/ui/ToolEmpty.svelte";
  import Skeleton from "$lib/components/ui/Skeleton.svelte";
  import { Bot, LoaderCircle, CircleAlert, Check, MessageSquare, Copy, Download, RefreshCw } from "lucide-svelte";
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

  // Per-section copy feedback, keyed by section id.
  let copiedKey = $state<string | null>(null);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  async function copyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedKey = key;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => (copiedKey = null), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }

  // Build a plain-text / markdown export of the whole result.
  function resultToMarkdown(r: OptimizerResult): string {
    const lines: string[] = [];
    lines.push(`# AI-readable title\n\n${r.optimizedTitle}\n`);
    lines.push(`## Structured attributes\n`);
    for (const a of r.attributes) lines.push(`- **${a.name}:** ${a.value}`);
    lines.push(`\n## How buyers ask an AI\n`);
    for (const kw of r.conversationalKeywords) lines.push(`- ${kw}`);
    lines.push(`\n## Questions an AI can answer\n`);
    for (const q of r.qa) lines.push(`**Q: ${q.question}**\n\n${q.answer}\n`);
    lines.push(`## AI-readable description\n\n${r.optimizedDescription}\n`);
    lines.push(`## What to add or fix\n`);
    for (const c of r.checklist) lines.push(`- [${c.done ? "x" : " "}] ${c.label}`);
    return lines.join("\n");
  }

  function copyAll() {
    if (result) copyText("all", resultToMarkdown(result));
  }

  function exportMd() {
    if (!result) return;
    const blob = new Blob([resultToMarkdown(result)], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ai-optimized-listing.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  const run = async () => {
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

  const handleSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    run();
  };
</script>

<ToolPageLayout
  title="AI Shopping Optimizer"
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
        {#if loading}<LoaderCircle size={14} class="animate-spin" /> Optimizing…{:else if result}<RefreshCw size={14} /> Regenerate{:else}Optimize for AI{/if}
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

  {#if loading}
    <!-- Skeleton results layout (the call can take up to ~45s). -->
    <div class="space-y-8 animate-fade-in" aria-hidden="true">
      <div>
        <p class="section-kicker mb-2">AI-readable title</p>
        <Skeleton lines={1} width="80%" />
      </div>
      <hr class="rule" />
      <div>
        <p class="section-kicker mb-3">Structured attributes</p>
        <Skeleton lines={5} />
      </div>
      <hr class="rule" />
      <div>
        <p class="section-kicker mb-3">How buyers ask an AI</p>
        <div class="flex flex-wrap gap-2">
          {#each Array(5) as _, i (i)}
            <Skeleton height="1.5rem" width="7rem" rounded="full" />
          {/each}
        </div>
      </div>
      <hr class="rule" />
      <div>
        <p class="section-kicker mb-3">AI-readable description</p>
        <Skeleton lines={4} />
      </div>
    </div>
  {:else if result}
    {@const r = result}
    <div class="animate-fade-in space-y-8">
      <!-- Toolbar -->
      <div class="flex justify-end gap-2 -mb-4">
        <button type="button" onclick={copyAll} class="btn btn-ghost gap-1.5">
          {#if copiedKey === "all"}<Check size={14} class="text-success" /> Copied{:else}<Copy size={14} /> Copy all{/if}
        </button>
        <button type="button" onclick={exportMd} class="btn btn-ghost gap-1.5">
          <Download size={14} /> Export .md
        </button>
      </div>

      <!-- Optimized title -->
      <div>
        <div class="flex items-center justify-between gap-3 mb-1">
          <p class="section-kicker">AI-readable title</p>
          <button type="button" onclick={() => copyText("title", r.optimizedTitle)} class="copy-link shrink-0">
            {#if copiedKey === "title"}<Check size={13} class="text-success" /> Copied{:else}<Copy size={13} /> Copy{/if}
          </button>
        </div>
        <p class="text-base font-medium text-text-primary leading-snug">{r.optimizedTitle}</p>
      </div>

      <hr class="rule" />

      <!-- Structured attributes -->
      <div>
        <div class="flex items-center justify-between gap-3 mb-3">
          <p class="section-kicker">Structured attributes</p>
          <button
            type="button"
            onclick={() => copyText("attrs", r.attributes.map((a) => `${a.name}: ${a.value}`).join("\n"))}
            class="copy-link shrink-0"
          >
            {#if copiedKey === "attrs"}<Check size={13} class="text-success" /> Copied{:else}<Copy size={13} /> Copy{/if}
          </button>
        </div>
        <div class="entry-list">
          {#each r.attributes as attr, i (attr.name + "-" + i)}
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
        <div class="flex items-center justify-between gap-3 mb-1">
          <p class="section-kicker">How buyers ask an AI</p>
          <button
            type="button"
            onclick={() => copyText("kw", r.conversationalKeywords.join("\n"))}
            class="copy-link shrink-0"
          >
            {#if copiedKey === "kw"}<Check size={13} class="text-success" /> Copied{:else}<Copy size={13} /> Copy{/if}
          </button>
        </div>
        <p class="lead text-sm mb-3">Natural-language phrases shoppers type to an assistant.</p>
        <div class="flex flex-wrap gap-2">
          {#each r.conversationalKeywords as kw, i (kw + "-" + i)}
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
        <div class="flex items-center justify-between gap-3 mb-3">
          <p class="section-kicker">Questions an AI can answer for you</p>
          <button
            type="button"
            onclick={() => copyText("qa", r.qa.map((q) => `Q: ${q.question}\nA: ${q.answer}`).join("\n\n"))}
            class="copy-link shrink-0"
          >
            {#if copiedKey === "qa"}<Check size={13} class="text-success" /> Copied{:else}<Copy size={13} /> Copy{/if}
          </button>
        </div>
        <div class="entry-list">
          {#each r.qa as item, i (item.question + "-" + i)}
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
        <div class="flex items-center justify-between gap-3 mb-3">
          <p class="section-kicker">AI-readable description</p>
          <button type="button" onclick={() => copyText("desc", r.optimizedDescription)} class="copy-link shrink-0">
            {#if copiedKey === "desc"}<Check size={13} class="text-success" /> Copied{:else}<Copy size={13} /> Copy{/if}
          </button>
        </div>
        <p class="text-sm text-text-secondary leading-relaxed whitespace-pre-line">{r.optimizedDescription}</p>
      </div>

      <hr class="rule" />

      <!-- Checklist -->
      <div>
        <div class="flex items-center justify-between gap-3 mb-3">
          <p class="section-kicker">What to add or fix</p>
          <button
            type="button"
            onclick={() => copyText("check", r.checklist.map((c) => `[${c.done ? "x" : " "}] ${c.label}`).join("\n"))}
            class="copy-link shrink-0"
          >
            {#if copiedKey === "check"}<Check size={13} class="text-success" /> Copied{:else}<Copy size={13} /> Copy{/if}
          </button>
        </div>
        <ul class="space-y-2.5">
          {#each r.checklist as item, i (item.label + "-" + i)}
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
