<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import { Copy, Check, Sparkles } from "lucide-svelte";

  const MOCK_TITLES = [
    { title: "Personalized Name Necklace • Custom Gold Name Jewelry • Birthday Gift for Her • Dainty Minimalist Pendant", score: 95, chars: 98 },
    { title: "Custom Name Necklace | Personalized Jewelry Gift | Bridesmaid Proposal | Mother's Day Gift for Mom", score: 92, chars: 96 },
    { title: "Dainty Name Necklace - Personalized Gift for Women - Custom Minimalist Jewelry - Christmas Gift Idea", score: 88, chars: 99 },
    { title: "Personalized Jewelry • Custom Name Pendant Necklace • Gift for Her • Birthday Anniversary Wedding", score: 85, chars: 95 },
    { title: "Custom Gold Name Necklace for Women, Personalized Dainty Jewelry, Birthday Gift, Bridesmaid Gift", score: 82, chars: 94 },
  ];

  let description = $state("");
  let hasGenerated = $state(false);
  let copiedIdx = $state<number | null>(null);
  const handleGenerate = (e: Event) => { e.preventDefault(); if (description.trim()) hasGenerated = true; };
  const copyTitle = (title: string, idx: number) => { navigator.clipboard.writeText(title); copiedIdx = idx; setTimeout(() => (copiedIdx = null), 2000); };
</script>

<ToolPageLayout title="Title Generator" description="Generate SEO-optimized Etsy listing titles that rank higher and convert better. Describe your product and let AI do the rest.">
  <form onsubmit={handleGenerate} class="mb-8">
    <label class="text-xs font-semibold uppercase tracking-wider text-text-primary mb-1.5 flex items-center gap-1">Describe your product <span class="text-danger text-xs font-normal">(required)</span></label>
    <textarea bind:value={description} placeholder="e.g. A dainty gold-plated necklace with a custom name pendant, perfect for birthdays and bridesmaid gifts..." rows={3} class="w-full px-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:border-teal focus:ring-1 focus:ring-teal/20 bg-white resize-none"></textarea>
    <button type="submit" class="mt-3 px-8 py-2.5 rounded-lg text-sm font-semibold text-white flex items-center gap-2 hover:opacity-90" style="background: var(--navy)"><Sparkles size={14} /> Generate Titles</button>
  </form>
  {#if hasGenerated}
    <div class="space-y-3 animate-fade-in">
      <h3 class="text-base font-bold text-text-primary">Generated Titles</h3>
      {#each MOCK_TITLES as item, i (i)}
        <div class="card p-4 flex items-start gap-4 hover:border-teal/30 transition-all">
          <div class="flex-1 min-w-0">
            <p class="text-sm text-text-primary font-medium leading-relaxed">{item.title}</p>
            <div class="flex items-center gap-4 mt-2">
              <span class="text-xs text-text-muted">{item.chars} / 140 characters</span>
              <div class="flex items-center gap-1">
                <span class="text-xs font-semibold" style="color: {item.score >= 90 ? 'var(--success)' : item.score >= 80 ? 'var(--warning)' : 'var(--danger)'}">SEO: {item.score}/100</span>
                <div class="w-16 h-1.5 bg-border rounded-full overflow-hidden"><div class="h-full rounded-full" style="width: {item.score}%; background: {item.score >= 90 ? 'var(--success)' : item.score >= 80 ? 'var(--warning)' : 'var(--danger)'}"></div></div>
              </div>
            </div>
          </div>
          <button onclick={() => copyTitle(item.title, i)} class="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-text-secondary hover:bg-bg-page transition-colors">
            {#if copiedIdx === i}<Check size={12} class="text-success" /> Copied{:else}<Copy size={12} /> Copy{/if}
          </button>
        </div>
      {/each}
    </div>
  {/if}
</ToolPageLayout>
