<script lang="ts">
  // Listing Studio is a hub: it routes to the real creative tools that ship today. No fake
  // "generate" here — each card links to a tool that actually does the work end to end.
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import { Wand, Image as ImageIcon, WandSparkles, Clapperboard, ArrowRight } from "lucide-svelte";

  type StudioTool = {
    href: string;
    title: string;
    blurb: string;
    icon: typeof ImageIcon;
    accent: "teal" | "gold";
  };

  const tools: StudioTool[] = [
    {
      href: "/tools/listing-builder",
      title: "Listing Builder",
      blurb: "Compose a full listing — SEO title, tags, description, and a product photo — in one guided flow.",
      icon: WandSparkles,
      accent: "teal",
    },
    {
      href: "/tools/image-studio",
      title: "AI Image Studio",
      blurb: "Turn a short description into real product mockups and lifestyle photos ready for your gallery.",
      icon: ImageIcon,
      accent: "teal",
    },
    {
      href: "/tools/video-generator",
      title: "Slideshow Maker",
      blurb: "Spin your photos into a short, scroll-stopping listing video — the format Etsy now surfaces in search.",
      icon: Clapperboard,
      accent: "gold",
    },
  ];
</script>

<ToolPageLayout
  title="Listing Studio"
  description="Your creative workbench for Etsy. Everything you need to turn a product into a finished, ranked listing — copy, photos, and video — lives here."
  icon={Wand}
>
  <div class="animate-fade-in">
    <p class="section-kicker mb-1">Pick a workspace</p>
    <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-5">Three tools, one finished listing</h2>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
      {#each tools as t}
        <a
          href={t.href}
          class={`hover-lift group relative flex flex-col p-5 rounded-xl border border-border bg-white shadow-sm card-accent ${t.accent === "gold" ? "card-accent-gold" : ""}`}
        >
          <span
            class={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 mb-4 ${t.accent === "gold" ? "bg-orange/10 text-orange" : "bg-teal/10 text-teal"}`}
          >
            <t.icon size={20} />
          </span>
          <p class="text-[0.9375rem] font-semibold text-text-primary group-hover:text-teal transition-colors">{t.title}</p>
          <p class="text-[0.8125rem] text-text-secondary leading-relaxed mt-1.5 flex-1">{t.blurb}</p>
          <span class="inline-flex items-center gap-1 text-xs font-semibold text-teal mt-4">
            Open
            <ArrowRight size={13} class="group-hover:translate-x-0.5 transition-transform" />
          </span>
        </a>
      {/each}
    </div>

    <p class="field-hint mt-6">Tip: build the listing copy first, then generate matching photos and a video so everything is on-brand.</p>
  </div>
</ToolPageLayout>
