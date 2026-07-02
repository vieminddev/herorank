<script lang="ts">
  /**
   * Public guide: disconnecting an Etsy shop. Marketing shell (no auth) so it's visible to
   * everyone incl. Etsy reviewers. Screenshot in /static/guide/ (real app, shop name anonymized).
   */
  import {
    Unlink, MousePointerClick, ShieldCheck, CheckCircle2,
    Info, ArrowRight, ArrowLeft, Plug, ExternalLink,
  } from "lucide-svelte";

  const steps = [
    {
      n: 1, icon: Plug, title: "Open Connect Shop",
      body: "In the left sidebar, under <strong>My Shop</strong>, click <strong>Connect Shop</strong>. Your connected shop(s) are listed there.",
      img: null, alt: "",
    },
    {
      n: 2, icon: MousePointerClick, title: "Click “Disconnect” on the shop",
      body: "Find the shop you want to remove and click its <strong>Disconnect</strong> button (on the right of the shop card).",
      img: "/guide/disconnect-shop.png", alt: "A connected shop card with the Disconnect button",
    },
    {
      n: 3, icon: ShieldCheck, title: "Confirm",
      body: "A confirmation appears — <em>“Disconnect [shop]? VieRank will lose read access to this shop.”</em> Click <strong>OK</strong> to proceed.",
      img: null, alt: "",
    },
    {
      n: 4, icon: CheckCircle2, title: "Done — access revoked",
      body: "VieRank immediately deletes the stored access for that shop and stops syncing it. The shop disappears from your list. If it was your <strong>default</strong> and you have other shops connected, another becomes the default automatically.",
      img: null, alt: "",
    },
  ];
</script>

<svelte:head>
  <title>Disconnect your Etsy shop — VieRank Docs</title>
  <meta name="description" content="How to disconnect (unlink) your Etsy shop from VieRank and revoke access at any time." />
</svelte:head>

<!-- Header -->
<section class="relative overflow-hidden pt-16 pb-12 bg-white border-b border-border">
  <div class="absolute inset-0 grid-overlay opacity-[0.2]" aria-hidden="true"></div>
  <div class="relative max-w-3xl mx-auto px-6">
    <a href="/docs" class="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-teal transition-colors mb-5">
      <ArrowLeft size={13} /> Documentation
    </a>
    <span class="inline-flex items-center gap-1.5 mb-3 px-3 py-1 rounded-full text-xs font-semibold bg-teal/5 border border-teal/15 text-teal">
      <Unlink size={13} /> Reversible · Revoke anytime
    </span>
    <h1 class="text-3xl md:text-4xl font-bold mb-3 tracking-tight text-text-primary">Disconnect your Etsy shop</h1>
    <p class="text-text-secondary text-sm max-w-xl leading-relaxed">
      You're in control — unlink any shop from VieRank in two clicks. Access is revoked immediately.
    </p>
  </div>
</section>

<section class="max-w-3xl mx-auto px-6 py-12 space-y-6">
  <!-- Intro -->
  <div class="p-5 rounded-xl border border-teal/20 bg-teal/5 flex items-start gap-3">
    <Unlink size={18} class="text-teal flex-shrink-0 mt-0.5" />
    <p class="text-sm text-text-secondary leading-relaxed">
      Disconnecting deletes the access VieRank stored for that shop and stops all syncing. It takes
      seconds and you can <strong class="text-text-primary">reconnect anytime</strong>.
    </p>
  </div>

  <!-- Steps -->
  {#each steps as s (s.n)}
    <section class="p-5 sm:p-6 bg-white border border-border rounded-xl shadow-sm">
      <div class="flex items-center gap-3">
        <span class="w-8 h-8 rounded-full bg-teal text-white text-sm font-bold flex items-center justify-center flex-shrink-0">{s.n}</span>
        <h2 class="text-base font-bold text-text-primary flex items-center gap-2">
          <s.icon size={17} class="text-teal" /> {s.title}
        </h2>
      </div>
      <p class="text-sm text-text-secondary leading-relaxed mt-3">{@html s.body}</p>

      {#if s.img}
        <figure class="mt-4 rounded-lg border border-border-light overflow-hidden shadow-sm">
          <img src={s.img} alt={s.alt} loading="lazy" class="w-full block" />
        </figure>
      {/if}
    </section>
  {/each}

  <!-- What happens -->
  <section class="p-5 sm:p-6 bg-white border border-border rounded-xl shadow-sm">
    <h2 class="text-base font-bold text-text-primary flex items-center gap-2">
      <Info size={17} class="text-teal" /> What happens when you disconnect
    </h2>
    <ul class="mt-3 space-y-2.5 text-sm text-text-secondary leading-relaxed">
      <li class="flex items-start gap-2.5">
        <CheckCircle2 size={16} class="text-success flex-shrink-0 mt-0.5" />
        <span><strong class="text-text-primary">Access is revoked immediately.</strong> VieRank deletes the stored access &amp; refresh tokens for that shop.</span>
      </li>
      <li class="flex items-start gap-2.5">
        <CheckCircle2 size={16} class="text-success flex-shrink-0 mt-0.5" />
        <span><strong class="text-text-primary">Syncing stops.</strong> We no longer read that shop's data; sales/audit pages for it stop updating.</span>
      </li>
      <li class="flex items-start gap-2.5">
        <Info size={16} class="text-text-muted flex-shrink-0 mt-0.5" />
        <span><strong class="text-text-primary">Aggregate averages stay anonymized.</strong> Only anonymized, per-category rates were ever stored — never your raw transactions.</span>
      </li>
      <li class="flex items-start gap-2.5">
        <Plug size={16} class="text-text-muted flex-shrink-0 mt-0.5" />
        <span><strong class="text-text-primary">Reconnect anytime.</strong> Link the shop again whenever you like from Connect Shop.</span>
      </li>
    </ul>
  </section>

  <!-- Revoke at Etsy too -->
  <section class="p-5 sm:p-6 bg-white border border-border rounded-xl shadow-sm">
    <h2 class="text-base font-bold text-text-primary flex items-center gap-2">
      <ShieldCheck size={17} class="text-teal" /> Prefer to revoke from Etsy directly?
    </h2>
    <p class="text-sm text-text-secondary leading-relaxed mt-3">
      You can also revoke VieRank at the source from your Etsy account:
      <strong class="text-text-primary">Etsy.com → Account settings → Apps &amp; services</strong>, then remove VieRank.
      Either method fully cuts off access.
    </p>
    <a href="https://www.etsy.com/your/account/security" target="_blank" rel="noopener"
       class="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-teal hover:underline">
      Open Etsy account settings <ExternalLink size={14} />
    </a>
  </section>

  <!-- CTA -->
  <div class="flex flex-wrap items-center gap-3 pt-1">
    <a href="/settings/connections" class="btn btn-primary inline-flex items-center gap-2 !py-2.5 !px-5 text-sm font-bold">
      Go to Connect Shop <ArrowRight size={16} />
    </a>
    <a href="/docs/connect-shop" class="text-sm font-semibold text-teal hover:underline">How to connect a shop</a>
  </div>
</section>
