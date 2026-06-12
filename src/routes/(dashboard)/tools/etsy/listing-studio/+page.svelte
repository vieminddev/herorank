<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import { Upload, Sparkles, Image as ImageIcon } from "lucide-svelte";

  let uploaded = $state(false);
  let generated = $state(false);
  let generating = $state(false);

  const handleUpload = () => (uploaded = true);
  const handleGenerate = () => { generating = true; setTimeout(() => { generating = false; generated = true; }, 2000); };

  const TAGS = ["personalized necklace", "custom name jewelry", "birthday gift", "bridesmaid gift", "dainty necklace", "gold pendant", "minimalist jewelry", "gift for her", "handmade jewelry", "name necklace", "custom gift", "mothers day", "anniversary gift"];

  const GENERATED_DESCRIPTION = `✨ Handmade Personalized Name Necklace ✨

Make every moment special with our dainty gold name necklace. Each piece is handcrafted to perfection and makes the ideal gift for birthdays, bridesmaids, and every celebration in between.

🎁 Perfect for: Birthday gifts, bridesmaid proposals, Mother's Day, anniversaries
📐 Material: 18K Gold Plated Sterling Silver
📦 Free gift-ready packaging included`;
</script>

<ToolPageLayout title="Listing Studio" description="Upload product photos and let AI create a complete Etsy listing — title, tags, description, and more — in seconds.">
  <div class="card p-6 mb-6">
    <h3 class="text-base font-bold text-text-primary mb-4">Upload Product Photos</h3>
    <div
      onclick={handleUpload}
      onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") handleUpload(); }}
      role="button"
      tabindex="0"
      class="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-teal hover:bg-teal/5 transition-all"
    >
      <Upload size={40} class="mx-auto text-text-muted mb-3" />
      <p class="text-sm text-text-primary font-medium">Upload product images</p>
      <p class="text-xs text-text-muted mt-1">We&apos;ll analyze your product and generate a full listing.</p>
    </div>
    {#if uploaded}
      <div class="mt-4 animate-fade-in">
        <div class="flex gap-3 pb-2">
          {#each [1, 2, 3] as i (i)}
            <div class="w-24 h-24 rounded-lg bg-gradient-to-br from-bg-page to-border flex items-center justify-center flex-shrink-0 border border-border">
              <ImageIcon size={20} class="text-text-muted" />
            </div>
          {/each}
        </div>
        <button onclick={handleGenerate} disabled={generating} class="mt-4 px-8 py-2.5 rounded-lg text-sm font-semibold text-white flex items-center gap-2 hover:opacity-90 disabled:opacity-50" style="background: var(--navy)">
          {#if generating}<span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> Analyzing...{:else}<Sparkles size={14} /> Generate Listing{/if}
        </button>
      </div>
    {/if}
  </div>
  {#if generated}
    <div class="space-y-4 animate-fade-in">
      <div class="card p-6">
        <h3 class="text-sm font-bold text-text-primary mb-2">Generated Title</h3>
        <p class="text-base text-text-primary font-medium">Handmade Gold Necklace • Personalized Name Pendant • Birthday Gift for Her • Dainty Minimalist Jewelry</p>
      </div>
      <div class="card p-6">
        <h3 class="text-sm font-bold text-text-primary mb-2">Generated Tags</h3>
        <div class="flex flex-wrap gap-2">
          {#each TAGS as tag (tag)}
            <span class="px-3 py-1 bg-bg-page rounded-full text-xs font-medium text-text-primary border border-border">{tag}</span>
          {/each}
        </div>
      </div>
      <div class="card p-6">
        <h3 class="text-sm font-bold text-text-primary mb-2">Generated Description</h3>
        <p class="text-sm text-text-secondary leading-relaxed whitespace-pre-line">{GENERATED_DESCRIPTION}</p>
      </div>
    </div>
  {/if}
</ToolPageLayout>
