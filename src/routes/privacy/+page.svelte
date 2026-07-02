<script lang="ts">
  import { Sprout, ShieldCheck, Lock, Eye, Trash2, ArrowRight, Info } from "lucide-svelte";
  import MarketingNav from "$lib/components/marketing/MarketingNav.svelte";
  import MarketingFooter from "$lib/components/marketing/MarketingFooter.svelte";
</script>


<svelte:head>
  <title>Privacy Policy — VieRank</title>
  <meta name="description" content="Privacy Policy for VieRank. Understand how we collect, protect, and manage your Etsy shop data and account information." />
</svelte:head>

<div class="lp min-h-screen bg-[#f7f9f8] text-text-primary overflow-hidden">
  <MarketingNav />

  <!-- Header Section -->
  <section class="relative overflow-hidden pt-20 pb-16 bg-white border-b border-border">
    <div class="absolute inset-0 grid-overlay opacity-[0.2]" aria-hidden="true"></div>
    <div class="relative max-w-3xl mx-auto px-6 text-center">
      <span class="inline-flex items-center gap-1.5 badge-estimated !bg-teal/5 !border-teal/15 !text-teal mb-4 px-3 py-1 rounded-full text-xs font-semibold">
        <ShieldCheck size={13} /> Secure & Transparent
      </span>
      <h1 class="text-3xl md:text-4xl font-bold mb-3 tracking-tight text-text-primary">Privacy Policy</h1>
      <p class="text-text-secondary text-sm max-w-xl mx-auto">
        Effective Date: June 14, 2026. Your privacy and shop compliance are our absolute priority.
      </p>
    </div>
  </section>

  <!-- Policy Content Section -->
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
          <Eye size={16} class="text-teal" /> 1. Information We Collect
        </h2>
        <p>
          To provide listing optimization and search analysis tools, we collect and process specific information:
        </p>
        <ul class="list-disc pl-6 space-y-2">
          <li>
            <strong>Account Information:</strong> When you register, we collect your email address and credentials securely.
          </li>
          <li>
            <strong>OAuth Tokens:</strong> When you connect your Etsy shop, we store official, temporary OAuth tokens to read and update your shop catalog under your approval.
          </li>
          <li>
            <strong>Etsy Catalog Data:</strong> We access listing titles, descriptions, categories, tags, images, and prices to calculate optimization suggestions.
          </li>
          <li>
            <strong>Market & Calibration Data:</strong> We retrieve public, shop-level counters (such as sales and review counts) to calibrate our estimates and to build aggregate trend and sales-velocity history. We store these public shop-level metrics over time to power analytics features; we never save individual buyer transactions or personal buyer information.
          </li>
        </ul>
      </div>

      <!-- Section 2 -->
      <div class="space-y-4">
        <h2 class="text-lg font-bold text-text-primary flex items-center gap-2">
          <Lock size={16} class="text-teal" /> 2. How We Store & Secure Your Data
        </h2>
        <p>
          We employ strict security practices to keep your credentials and Etsy authorization tokens safe:
        </p>
        <ul class="list-disc pl-6 space-y-2">
          <li>
            <strong>Minimal, Read-Only by Default:</strong> We request read-only access by default. Write access — to save listing edits or create drafts — is optional and only requested if you explicitly opt in, and is used only for changes you trigger. We never request permission to edit your billing, financial, or payout data.
          </li>
          <li>
            <strong>Token Encryption:</strong> Etsy OAuth refresh tokens are encrypted at rest using AES-256 before being stored in our database.
          </li>
          <li>
            <strong>No Selling of Data:</strong> We do not sell, rent, or trade your personal or shop data to third-party advertising companies. Your data is used exclusively to power the VieRank suite.
          </li>
          <li>
            <strong>Data Roles:</strong> When you connect Etsy, you are the data controller and VieRank acts as the data processor for the shop content we access on your behalf. We process it solely to provide the services you request, in accordance with this Policy and applicable privacy laws.
          </li>
          <li>
            <strong>Caching &amp; Retention:</strong> We cache Etsy data only as long as reasonably necessary to run the Service, and refresh it in line with Etsy's freshness requirements — listing content within 6 hours, and other Etsy content within 24 hours. Aggregated market metrics we derive are retained to power analytics features and are pruned under our retention schedule.
          </li>
        </ul>
      </div>

      <!-- Section 3 -->
      <div class="space-y-4">
        <h2 class="text-lg font-bold text-text-primary flex items-center gap-2">
          <Trash2 size={16} class="text-teal" /> 3. Your Control Over Your Data
        </h2>
        <p>
          You retain full control over your shop access and account data at all times:
        </p>
        <ul class="list-disc pl-6 space-y-2">
          <li>
            <strong>Disconnect Anytime:</strong> You can disconnect your shop at any point under the **Settings > Connections** panel in your dashboard. Disconnecting instantly revokes the OAuth token and deletes local shop cache metadata.
          </li>
          <li>
            <strong>Etsy Direct Revocation:</strong> You can also revoke VieRank's access to your Etsy data at any time by visiting <a href="https://www.etsy.com/your/apps" class="text-teal font-semibold" target="_blank" rel="noopener noreferrer">etsy.com/your/apps</a>.
          </li>
          <li>
            <strong>Data Erasure (Account Deletion):</strong> You may request the full deletion of your account and all associated tokens and metadata. We commit to executing data erasure requests within 7 business days.
          </li>
        </ul>
      </div>

      <!-- Section 4 -->
      <div class="space-y-4">
        <h2 class="text-lg font-bold text-text-primary flex items-center gap-2">
          <Sprout size={16} class="text-teal" /> 4. GDPR & CCPA Compliance
        </h2>
        <p>
          Depending on your location, you may have specific rights regarding your personal data under the European Union General Data Protection Regulation (GDPR) and the California Consumer Privacy Act (CCPA). This includes the right to access, rectify, delete, or restrict processing of your personal information.
        </p>
        <p>
          To exercise any of these rights, please contact our support team at <span class="font-bold text-text-primary">support@vierank.com</span>.
        </p>
      </div>

      <!-- Section 5 -->
      <div class="space-y-4">
        <h2 class="text-lg font-bold text-text-primary flex items-center gap-2">
          <ShieldCheck size={16} class="text-teal" /> 5. Third-Party Service Providers
        </h2>
        <p>
          VieRank relies on a small set of trusted processors to run the Service. They only receive the
          data needed for their function, and never your Etsy OAuth tokens:
        </p>
        <ul class="list-disc pl-6 space-y-2">
          <li>
            <strong>AI / model provider:</strong> when you use a generation or analysis tool (titles, tags,
            descriptions, the VieRank Assistant), the text you submit — and for image/video tools, your
            prompts and any reference images — is sent to our AI provider to produce the result. It is used
            only to generate your output, not to train models on your behalf.
          </li>
          <li>
            <strong>Payments — Stripe:</strong> billing and card processing. Your full card details go
            directly to Stripe and are never stored on our servers.
          </li>
          <li>
            <strong>Email — Resend:</strong> transactional emails (verification, password reset, alerts).
          </li>
          <li>
            <strong>Sign-in with Google (optional):</strong> if you choose Google login, Google confirms
            your identity; we receive only your email and basic profile.
          </li>
          <li>
            <strong>Infrastructure — Cloudflare:</strong> hosting, database, and storage. Data is processed
            on Cloudflare's edge network.
          </li>
        </ul>
        <p>
          We do not sell your data, and we require every provider to handle it under appropriate
          confidentiality and data-protection terms.
        </p>
      </div>

      <!-- Contact -->
      <div class="space-y-4 pt-6 border-t border-border-light">
        <h2 class="text-sm font-bold text-text-primary">Contact Us</h2>
        <p class="text-xs text-text-secondary leading-relaxed">
          If you have questions regarding this Privacy Policy, your shop credentials, or security practices, please get in touch with us at:<br />
          Email: <span class="text-teal font-semibold">support@vierank.com</span>
        </p>
      </div>
    </div>
  </section>

  <MarketingFooter />
</div>
