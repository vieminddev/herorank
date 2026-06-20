<script lang="ts">
  // Listing Studio is NOT live yet. The earlier build faked a "generate" with a setTimeout and
  // showed a result it never produced — worse than an honest "Coming soon". No backend, no credits.
  // Its planned scope (compose a full listing visual) is already served by two REAL tools today,
  // so we point there instead of shipping a fake preview.
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import { Wand, Sparkles, Image as ImageIcon, ArrowRight, WandSparkles } from "lucide-svelte";
</script>

<ToolPageLayout
  title="Listing Studio"
  prefix="Etsy"
  description="An all-in-one studio to compose a finished listing visual. In the works — and we'd rather say so than fake it."
  icon={Wand}
>
  <div class="animate-fade-in">
    <div class="flex items-center gap-2 mb-2">
      <Sparkles size={16} class="text-teal shrink-0" />
      <p class="section-kicker !text-teal font-semibold">In the works</p>
    </div>
    <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-2">Not live yet — and we'd rather tell you straight</h2>
    <p class="text-sm text-text-secondary leading-relaxed max-w-xl">Listing Studio will pull your title, tags, description, and product photos into one finished
      composition. It isn't ready yet — so instead of a fake preview, here are the two tools that
      already do this for real today.</p>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-7 max-w-xl">
      <a href="/tools/etsy/image-studio" class="group flex items-start gap-3 p-4 rounded-xl border border-border hover:border-teal/50 transition-colors">
        <span class="w-9 h-9 rounded-lg bg-teal/8 text-teal flex items-center justify-center shrink-0">
          <ImageIcon size={18} />
        </span>
        <div class="min-w-0">
          <p class="text-[0.9375rem] font-medium text-text-primary group-hover:text-teal transition-colors">AI Image Studio</p>
          <p class="entry-meta mt-0.5">Generate real product mockups + lifestyle photos from a description.</p>
        </div>
        <ArrowRight size={15} class="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
      </a>
      <a href="/tools/etsy/listing-builder" class="group flex items-start gap-3 p-4 rounded-xl border border-border hover:border-teal/50 transition-colors">
        <span class="w-9 h-9 rounded-lg bg-teal/8 text-teal flex items-center justify-center shrink-0">
          <WandSparkles size={18} />
        </span>
        <div class="min-w-0">
          <p class="text-[0.9375rem] font-medium text-text-primary group-hover:text-teal transition-colors">Listing Builder</p>
          <p class="entry-meta mt-0.5">Build a full listing — title, tags, description, and a photo — in one flow.</p>
        </div>
        <ArrowRight size={15} class="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
      </a>
    </div>
  </div>
</ToolPageLayout>
