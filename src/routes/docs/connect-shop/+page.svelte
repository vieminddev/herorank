<script lang="ts">
  /**
   * Public OAuth connect guide. Same content as the in-app guide but in the marketing shell so
   * anyone (incl. Etsy commercial-API reviewers) can read it without an account. Screenshots are
   * the real app captured into /static/guide/.
   */
  import {
    Plug, MousePointerClick, LogIn, CheckCircle2, ShieldCheck,
    Info, CircleAlert, ArrowRight, Lock, ArrowLeft, Eye, PencilLine,
  } from "lucide-svelte";

  const steps = [
    {
      n: 1, icon: Plug, title: "Open Connect Shop",
      body: "In the left sidebar, under <strong>My Shop</strong>, click <strong>Connect Shop</strong>. You'll see the connection wizard with three steps: Etsy Auth → Choose Shop → Initial Sync.",
      img: "/guide/connect-shop.png", alt: "The Connect Shop page with the connection wizard",
    },
    {
      n: 2, icon: MousePointerClick, title: "Choose access, then click “Connect”",
      body: "<strong>Read access</strong> is always granted (it powers your stats, audits and research). You can optionally tick <strong>Write access</strong> — only needed if you want VieRank to save edits and publish drafts for you (Listing Editor & Listing Builder). Then press <strong>Connect your Etsy shop</strong>; VieRank hands you to Etsy's own login page — your Etsy password is never seen or stored by VieRank.",
      img: "/guide/connect-button.png", alt: "The Connect your Etsy shop button",
    },
    {
      n: 3, icon: LogIn, title: "Sign in to Etsy & approve access",
      body: "On <strong>Etsy's secure page</strong>, log in to the Etsy account that owns your shop and click <strong>Allow access</strong>. Etsy shows exactly the permissions you selected — read (transactions, shop, listings) and, if you chose it, write. This happens entirely on Etsy.com.",
      img: null, alt: "",
    },
    {
      n: 4, icon: CheckCircle2, title: "You're connected",
      body: "Etsy sends you straight back to VieRank and your shop is linked — you'll see a “Shop connected” confirmation. If you run more than one Etsy shop, connect each one and pick a <strong>default</strong> shop. VieRank then starts syncing your listings and reviews.",
      img: null, alt: "",
    },
  ];

  const troubles = [
    { q: "“You declined the connection”", a: "You pressed Cancel/Deny on Etsy. Start again and choose <strong>Allow access</strong>." },
    { q: "“The connection link expired”", a: "The secure link is short-lived. Just open Connect Shop and start again from the button." },
    { q: "“We couldn't find a shop on that account”", a: "You signed in with an Etsy account that has no shop. Sign in with the account that owns your Etsy shop." },
    { q: "“We couldn't finish the handshake”", a: "A temporary hiccup with Etsy. Wait a moment and try connecting again." },
  ];
</script>

<svelte:head>
  <title>Connect your Etsy shop (OAuth) — VieRank Docs</title>
  <meta name="description" content="Step-by-step guide to connecting your Etsy shop to VieRank with secure OAuth — read-only by default, with optional write access." />
</svelte:head>

<!-- Header -->
<section class="relative overflow-hidden pt-16 pb-12 bg-white border-b border-border">
  <div class="absolute inset-0 grid-overlay opacity-[0.2]" aria-hidden="true"></div>
  <div class="relative max-w-3xl mx-auto px-6">
    <a href="/docs" class="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-teal transition-colors mb-5">
      <ArrowLeft size={13} /> Documentation
    </a>
    <span class="inline-flex items-center gap-1.5 mb-3 px-3 py-1 rounded-full text-xs font-semibold bg-teal/5 border border-teal/15 text-teal">
      <ShieldCheck size={13} /> Official Etsy OAuth · You choose access
    </span>
    <h1 class="text-3xl md:text-4xl font-bold mb-3 tracking-tight text-text-primary">Connect your Etsy shop</h1>
    <p class="text-text-secondary text-sm max-w-xl leading-relaxed">
      A quick, step-by-step guide to linking your shop with VieRank using Etsy's secure OAuth.
    </p>
  </div>
</section>

<section class="max-w-3xl mx-auto px-6 py-12 space-y-6">
  <!-- Intro -->
  <div class="p-5 rounded-xl border border-teal/20 bg-teal/5 flex items-start gap-3">
    <Lock size={18} class="text-teal flex-shrink-0 mt-0.5" />
    <p class="text-sm text-text-secondary leading-relaxed">
      Connecting uses <strong class="text-text-primary">OAuth</strong> — the same “Sign in with…” flow you've
      used elsewhere. You approve access <strong class="text-text-primary">on Etsy's own website</strong>, so
      VieRank never sees your Etsy password. Access is <strong class="text-text-primary">read-only by default</strong>
      (write is optional, see below) and you can disconnect anytime. It takes about a minute.
    </p>
  </div>

  <!-- Permissions explainer (read vs write) -->
  <section class="p-5 sm:p-6 bg-white border border-border rounded-xl shadow-sm">
    <h2 class="text-base font-bold text-text-primary flex items-center gap-2">
      <ShieldCheck size={17} class="text-teal" /> Permissions you choose
    </h2>
    <div class="mt-3 grid gap-3 sm:grid-cols-2">
      <div class="p-4 rounded-lg border border-teal/30 bg-teal/5">
        <p class="flex items-center gap-1.5 text-sm font-bold text-text-primary">
          <Eye size={15} class="text-teal" /> Read
          <span class="text-[10px] font-bold uppercase tracking-wide text-teal bg-teal/10 px-1.5 py-0.5 rounded">Required</span>
        </p>
        <p class="text-xs text-text-secondary leading-relaxed mt-1.5">
          Read your shop, listings & transactions. Powers all stats, audits, research and SEO tools. <strong class="text-text-primary">VieRank requests this by default.</strong>
        </p>
      </div>
      <div class="p-4 rounded-lg border border-border bg-bg-page/50">
        <p class="flex items-center gap-1.5 text-sm font-bold text-text-primary">
          <PencilLine size={15} class="text-teal" /> Write
          <span class="text-[10px] font-medium text-text-muted">(optional)</span>
        </p>
        <p class="text-xs text-text-secondary leading-relaxed mt-1.5">
          Save edits & publish drafts to your shop. Only needed for <strong class="text-text-primary">Listing Editor</strong> (push edits) and <strong class="text-text-primary">Listing Builder</strong> (create drafts). Skip it and everything else still works.
        </p>
      </div>
    </div>
  </section>

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
      {:else if s.n === 3}
        <div class="mt-4 p-4 rounded-lg border border-dashed border-border bg-bg-page/60 flex items-start gap-3">
          <ShieldCheck size={16} class="text-teal flex-shrink-0 mt-0.5" />
          <p class="text-xs text-text-secondary leading-relaxed">
            This screen is hosted by <strong class="text-text-primary">Etsy</strong>, not VieRank. Look for the
            permissions list (read transactions, shop, and listings) and the <strong class="text-text-primary">Allow access</strong> button.
          </p>
        </div>
      {/if}
    </section>
  {/each}

  <!-- Privacy -->
  <section class="p-5 sm:p-6 bg-white border border-border rounded-xl shadow-sm">
    <h2 class="text-base font-bold text-text-primary flex items-center gap-2">
      <ShieldCheck size={17} class="text-teal" /> What VieRank can (and can't) do
    </h2>
    <ul class="mt-3 space-y-2.5 text-sm text-text-secondary leading-relaxed">
      <li class="flex items-start gap-2.5">
        <CheckCircle2 size={16} class="text-success flex-shrink-0 mt-0.5" />
        <span><strong class="text-text-primary">Reads your shop.</strong> We read your transactions, shop details, and listings to power your stats and audits.</span>
      </li>
      <li class="flex items-start gap-2.5">
        <PencilLine size={16} class="text-text-muted flex-shrink-0 mt-0.5" />
        <span><strong class="text-text-primary">Write is optional.</strong> Only if you tick it — and even then VieRank only saves edits or drafts you explicitly trigger. It never deletes anything.</span>
      </li>
      <li class="flex items-start gap-2.5">
        <Lock size={16} class="text-teal flex-shrink-0 mt-0.5" />
        <span><strong class="text-text-primary">Private.</strong> Your raw sales are never shared. Only anonymized, per-category averages are stored to improve estimates for everyone.</span>
      </li>
      <li class="flex items-start gap-2.5">
        <Plug size={16} class="text-text-muted flex-shrink-0 mt-0.5" />
        <span><strong class="text-text-primary">Reversible.</strong> Disconnect any shop anytime from the Connect Shop page — access is revoked immediately.</span>
      </li>
    </ul>
  </section>

  <!-- Troubleshooting -->
  <section class="p-5 sm:p-6 bg-white border border-border rounded-xl shadow-sm">
    <h2 class="text-base font-bold text-text-primary flex items-center gap-2">
      <Info size={17} class="text-teal" /> Something went wrong?
    </h2>
    <dl class="mt-3 space-y-3">
      {#each troubles as t (t.q)}
        <div>
          <dt class="text-sm font-semibold text-text-primary">{t.q}</dt>
          <dd class="text-sm text-text-secondary leading-relaxed mt-0.5">{@html t.a}</dd>
        </div>
      {/each}
    </dl>
  </section>

  <!-- CTA -->
  <div class="flex flex-wrap items-center gap-3 pt-1">
    <a href="/auth/signup" class="btn btn-primary inline-flex items-center gap-2 !py-2.5 !px-5 text-sm font-bold">
      Start free <ArrowRight size={16} />
    </a>
    <a href="/settings/connections" class="text-sm font-semibold text-teal hover:underline">Already have an account? Connect your shop</a>
  </div>
</section>
