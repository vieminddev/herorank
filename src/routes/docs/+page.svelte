<script lang="ts">
  import { BookOpen, Plug, Unlink, ShieldCheck, ArrowRight } from "lucide-svelte";

  const guides = [
    {
      href: "/docs/connect-shop",
      icon: Plug,
      title: "Connect your Etsy shop (OAuth)",
      desc: "Step-by-step: link your shop with VieRank using Etsy's secure OAuth. Read-only by default, write optional, reversible — about a minute.",
    },
    {
      href: "/docs/disconnect-shop",
      icon: Unlink,
      title: "Disconnect your Etsy shop",
      desc: "Unlink a shop in two clicks. Access is revoked immediately, and you can reconnect anytime — or revoke from Etsy directly.",
    },
  ];
</script>

<svelte:head>
  <title>Documentation — VieRank</title>
  <meta name="description" content="VieRank documentation — guides for connecting your Etsy shop, data usage, and getting started." />
</svelte:head>

<!-- Header -->
<section class="relative overflow-hidden pt-16 pb-12 bg-white border-b border-border">
  <div class="absolute inset-0 grid-overlay opacity-[0.2]" aria-hidden="true"></div>
  <div class="relative max-w-3xl mx-auto px-6">
    <span class="inline-flex items-center gap-1.5 mb-3 px-3 py-1 rounded-full text-xs font-semibold bg-teal/5 border border-teal/15 text-teal">
      <BookOpen size={13} /> Documentation
    </span>
    <h1 class="text-3xl md:text-4xl font-bold mb-3 tracking-tight text-text-primary">VieRank documentation</h1>
    <p class="text-text-secondary text-sm max-w-xl leading-relaxed">
      Guides for getting started with VieRank — how we connect to your Etsy shop, what data we use, and how to make the most of the tools.
    </p>
  </div>
</section>

<!-- Guides -->
<section class="max-w-3xl mx-auto px-6 py-12">
  <div class="grid gap-4">
    {#each guides as g (g.href)}
      <a href={g.href} class="group block p-5 sm:p-6 bg-white border border-border rounded-xl shadow-sm hover:shadow-md hover:border-teal/40 transition-all">
        <div class="flex items-start gap-4">
          <span class="w-11 h-11 rounded-xl bg-teal/5 text-teal flex items-center justify-center shrink-0 border border-teal/10">
            <g.icon size={20} />
          </span>
          <div class="flex-1 min-w-0">
            <h2 class="text-base font-bold text-text-primary flex items-center gap-1.5">
              {g.title}
              <ArrowRight size={15} class="text-teal opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all" />
            </h2>
            <p class="text-sm text-text-secondary leading-relaxed mt-1">{g.desc}</p>
          </div>
        </div>
      </a>
    {/each}
  </div>

  <!-- Trust note -->
  <div class="mt-8 p-5 rounded-xl border border-teal/20 bg-teal/5 flex items-start gap-3">
    <ShieldCheck size={18} class="text-teal flex-shrink-0 mt-0.5" />
    <p class="text-sm text-text-secondary leading-relaxed">
      VieRank connects to Etsy via official OAuth — <strong class="text-text-primary">read-only by default</strong>.
      Write access is optional (only for edits/drafts you trigger) and we never share your raw sales. See the
      <a href="/privacy" class="text-teal font-semibold hover:underline">Privacy Policy</a> for details.
    </p>
  </div>
</section>
