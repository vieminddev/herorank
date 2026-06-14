<script lang="ts">
  import { Sprout, FileText, BadgeInfo, Scale, ShieldAlert, ArrowRight, Info } from "lucide-svelte";
</script>

<svelte:head>
  <title>Terms of Service — VieRank</title>
  <meta name="description" content="Terms of Service for VieRank. Read the rules and guidelines governing the use of our Etsy shop listing assistant." />
</svelte:head>

<div class="lp min-h-screen bg-[#f7f9f8] text-text-primary overflow-hidden">
  <!-- Navigation Header -->
  <nav class="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-border">
    <div class="max-w-5xl mx-auto flex items-center justify-between px-6 py-3">
      <a href="/" class="flex items-center gap-2.5 group">
        <span class="w-9 h-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105" style="background: var(--teal)">
          <Sprout size={18} class="text-white" />
        </span>
        <span class="text-xl font-semibold tracking-tight">VieRank</span>
      </a>
      <div class="flex items-center gap-2">
        <a href="/pricing" class="px-3 py-2 text-sm font-medium text-text-secondary hover:text-teal transition-colors">Pricing</a>
        <a href="/auth/login" class="px-3 py-2 text-sm font-medium text-text-secondary hover:text-teal transition-colors">Log in</a>
        <a href="/auth/signup" class="btn btn-primary btn-glow !py-2 !px-5 text-sm">Start free</a>
      </div>
    </div>
  </nav>

  <!-- Header Section -->
  <section class="relative overflow-hidden pt-20 pb-16 bg-white border-b border-border">
    <div class="absolute inset-0 grid-overlay opacity-[0.2]" aria-hidden="true"></div>
    <div class="relative max-w-3xl mx-auto px-6 text-center">
      <span class="inline-flex items-center gap-1.5 badge-estimated !bg-teal/5 !border-teal/15 !text-teal mb-4 px-3 py-1 rounded-full text-xs font-semibold">
        <Scale size={13} /> Legal Agreements
      </span>
      <h1 class="text-3xl md:text-4xl font-bold mb-3 tracking-tight text-text-primary">Terms of Service</h1>
      <p class="text-text-secondary text-sm max-w-xl mx-auto">
        Effective Date: June 14, 2026. Please read these terms carefully before connecting your Etsy shop.
      </p>
    </div>
  </section>

  <!-- Terms Content Section -->
  <section class="py-16 px-6 max-w-3xl mx-auto relative z-10">
    <!-- Mandatory Etsy Disclaimer -->
    <div class="p-5 bg-teal/5 border border-teal/15 rounded-2xl mb-10 text-xs text-text-secondary leading-relaxed flex items-start gap-3.5">
      <Info size={16} class="text-teal shrink-0 mt-0.5" />
      <div>
        <p class="font-bold text-teal-dark uppercase tracking-wider mb-1">Etsy API Disclosure & Disclaimer</p>
        <p>
          The term "Etsy" is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy.
        </p>
      </div>
    </div>

    <div class="space-y-12 text-sm text-text-secondary leading-relaxed">
      <!-- Section 1 -->
      <div class="space-y-4">
        <h2 class="text-lg font-bold text-text-primary flex items-center gap-2">
          <FileText size={16} class="text-teal" /> 1. Acceptance of Terms
        </h2>
        <p>
          By creating an account or connecting an Etsy shop to VieRank ("the Service"), you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree, you must not use or authorize the Service.
        </p>
      </div>

      <!-- Section 2 -->
      <div class="space-y-4">
        <h2 class="text-lg font-bold text-text-primary flex items-center gap-2">
          <BadgeInfo size={16} class="text-teal" /> 2. Connection to Etsy & API Use
        </h2>
        <p>
          VieRank provides optimization checklists and metrics calculations. Our connection to your Etsy shop relies on Etsy OAuth v3:
        </p>
        <ul class="list-disc pl-6 space-y-2">
          <li>
            <strong>OAuth Consent:</strong> You explicitly grant VieRank permission to read and modify listings and shop details. You may disconnect or revoke this access at any time.
          </li>
          <li>
            <strong>Compliance with Etsy Seller Policy:</strong> You remain solely responsible for the content of your listings, including complying with Etsy's policies on handmade goods, prohibited items, and intellectual property.
          </li>
          <li>
            <strong>No Endorsement:</strong> You acknowledge that VieRank is an independent integration partner and is not affiliated with, endorsed by, or certified by Etsy, Inc.
          </li>
        </ul>
      </div>

      <!-- Section 3 -->
      <div class="space-y-4">
        <h2 class="text-lg font-bold text-text-primary flex items-center gap-2">
          <Scale size={16} class="text-teal" /> 3. Billing, Plans, & Credits
        </h2>
        <p>
          VieRank operates on a subscription and credit balance system:
        </p>
        <ul class="list-disc pl-6 space-y-2">
          <li>
            <strong>Credit Deductions:</strong> Each tool call (e.g. analysis, AI generation) deducts a set amount of credits from your balance, as shown in our pricing details.
          </li>
          <li>
            <strong>Credits Expiration:</strong> Subscriptions grant a fresh pool of monthly credits at the start of each billing cycle. Unused monthly credits do not roll over to the next cycle.
          </li>
          <li>
            <strong>Non-Refundable:</strong> Except as provided by law or explicitly stated, subscriptions and credit purchases are non-refundable. You can cancel your subscription at any time, and it will remain active until the end of the current billing period.
          </li>
        </ul>
      </div>

      <!-- Section 4 -->
      <div class="space-y-4">
        <h2 class="text-lg font-bold text-text-primary flex items-center gap-2">
          <ShieldAlert size={16} class="text-teal" /> 4. Disclaimer of Warranties & Limitation of Liability
        </h2>
        <p>
          VieRank provides estimates (such as search volume, niche competition, and sales estimations) using public signal analysis and category reviews.
        </p>
        <p class="font-semibold text-text-primary">
          We provide the Service "as is" and "as available". We do not guarantee listing sales increases, specific search position results, or uninterrupted API connection. We are not liable for any suspension, penalties, or damages applied to your Etsy shop by Etsy, Inc.
        </p>
      </div>

      <!-- Section 5 -->
      <div class="space-y-4 pt-6 border-t border-border-light">
        <h2 class="text-sm font-bold text-text-primary">Changes to Terms</h2>
        <p class="text-xs text-text-secondary leading-relaxed">
          We reserve the right to modify these terms at any time. We will notify you of major changes via email or direct alerts in your dashboard. Continuing to use VieRank after modifications take effect means you accept the updated terms.<br />
          For any legal or terms inquiries, reach out to us at: <span class="text-teal font-semibold">legal@vierank.com</span>
        </p>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="border-t border-border py-12 px-6 bg-white relative z-20">
    <div class="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
      <div class="flex items-center gap-2.5">
        <span class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: var(--teal)">
          <Sprout size={15} class="text-white" />
        </span>
        <span class="text-lg font-semibold tracking-tight">VieRank</span>
      </div>
      <div class="flex items-center gap-6 text-sm text-text-muted font-medium">
        <a href="/pricing" class="hover:text-text-primary transition-colors">Pricing</a>
        <a href="/auth/login" class="hover:text-text-primary transition-colors">Log in</a>
        <a href="/privacy" class="hover:text-text-primary transition-colors">Privacy</a>
        <a href="/terms" class="text-teal hover:text-teal-dark transition-colors">Terms</a>
      </div>
      <p class="text-xs text-text-muted font-medium">© 2026 VieRank. The term "Etsy" is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy.</p>
    </div>
  </footer>
</div>
