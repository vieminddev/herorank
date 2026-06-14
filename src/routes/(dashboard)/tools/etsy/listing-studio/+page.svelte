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

<ToolPageLayout title="Listing Studio" description="Turn your product photos into a complete listing draft — title, tags, and description — ready to refine.">
  {#snippet controls()}
    <label class="field-label" for="ls-upload">Your product photos</label>
    <div
      id="ls-upload"
      onclick={handleUpload}
      onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") handleUpload(); }}
      role="button"
      tabindex="0"
      class="border border-dashed border-border rounded-md px-6 py-8 text-center cursor-pointer hover:border-teal transition-colors"
    >
      <Upload size={28} class="mx-auto text-text-muted mb-2.5" />
      <p class="text-sm text-text-primary font-medium">Add your product images</p>
    </div>
    <p class="field-hint">We read the photos and draft a full listing — title, tags, and description.</p>
    {#if uploaded}
      <div class="mt-4 animate-fade-in">
        <div class="flex gap-2.5 pb-1 overflow-x-auto">
          {#each [1, 2, 3] as i (i)}
            <div class="w-16 h-16 rounded-md bg-bg-page flex items-center justify-center flex-shrink-0 border border-border">
              <ImageIcon size={18} class="text-text-muted" />
            </div>
          {/each}
        </div>
        <button type="button" onclick={handleGenerate} disabled={generating} class="btn btn-primary w-full justify-center mt-4">
          {#if generating}<span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> Reading photos…{:else}<Sparkles size={14} /> Draft the listing{/if}
        </button>
      </div>
    {/if}
  {/snippet}

  {#if generated}
    <div class="animate-fade-in">
      <p class="section-kicker mb-1">Your draft</p>
      <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-1">A listing to refine</h2>
      <p class="lead text-sm mb-6">Read it over, tweak what doesn't sound like you, then paste it in.</p>

      <div class="space-y-7">
        <section>
          <p class="field-label !mb-1.5">Title</p>
          <p class="text-[0.9375rem] text-text-primary leading-relaxed">Handmade Gold Necklace • Personalized Name Pendant • Birthday Gift for Her • Dainty Minimalist Jewelry</p>
        </section>
        <hr class="rule" />
        <section>
          <p class="field-label !mb-2.5">Tags</p>
          <div class="flex flex-wrap gap-2">
            {#each TAGS as tag (tag)}
              <span class="px-2.5 py-1 bg-bg-page rounded-full text-xs font-medium text-text-primary border border-border">{tag}</span>
            {/each}
          </div>
        </section>
        <hr class="rule" />
        <section>
          <p class="field-label !mb-1.5">Description</p>
          <p class="text-sm text-text-secondary leading-relaxed whitespace-pre-line">{GENERATED_DESCRIPTION}</p>
        </section>
      </div>
    </div>
  {:else}
    <div class="resting animate-fade-in">
      <p class="text-sm text-text-secondary">Your listing draft will appear here.</p>
      <p class="text-[0.8125rem]">Add your product photos on the left to get started.</p>
    </div>
  {/if}
</ToolPageLayout>
