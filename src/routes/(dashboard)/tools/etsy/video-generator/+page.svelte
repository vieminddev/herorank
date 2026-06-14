<script lang="ts">
  // Phase 4: video-generator is DEFERRED (BA §4.3 / BR-P4-VIDEO-01 / PM decision).
  // The previous mock promised a "Download MP4" it could never produce — that is worse than
  // an honest "Coming soon". There is NO render backend, NO R2, NO credits charged here.
  // We keep the upload/settings UI visible but disabled so the feature is "previewable",
  // and capture interest via an honest waitlist form.
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import { Upload, Image as ImageIcon, Sparkles, LoaderCircle, Check, CircleAlert, Mail } from "lucide-svelte";
  import { joinVideoWaitlist } from "$lib/tools-client";
  import { page } from "$app/state";

  // Prefill with the signed-in user's email when available (dashboard layout data).
  let email = $state(page.data?.user?.email ?? "");
  let submitting = $state(false);
  let joined = $state(false);
  let error = $state<string | null>(null);

  const emailValid = $derived(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()));

  const handleWaitlist = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!emailValid || submitting || joined) return;
    submitting = true;
    error = null;

    const res = await joinVideoWaitlist(email.trim());
    if (res.ok) {
      joined = true;
    } else {
      error = res.message;
    }
    submitting = false;
  };
</script>

<ToolPageLayout title="Video Maker" description="Build Etsy-ready slideshow videos from your product photos. In the works — join the waitlist to be first.">
  <!-- Coming soon — quiet editorial note + honest waitlist -->
  <div class="animate-fade-in mb-12">
    <div class="flex items-center gap-2 mb-2">
      <Sparkles size={16} class="text-teal shrink-0" />
      <p class="section-kicker !text-teal font-semibold">In the works</p>
    </div>
    <h2 class="text-lg font-semibold tracking-tight text-text-primary mb-2">Not live yet — and we'd rather say so</h2>
    <p class="text-sm text-text-secondary leading-relaxed max-w-xl">
      We're building a real slideshow-to-MP4 renderer for your listing photos. It isn't ready yet. Rather than ship a fake preview that promises a download it can't make, we'll tell you straight — and let you know the moment it works.
    </p>

    <!-- Waitlist form (honest interest capture — no render runs, no credits charged). -->
    {#if joined}
      <div class="mt-6 flex items-center gap-2 py-3 text-sm text-text-primary" role="status">
        <Check size={17} class="text-success flex-shrink-0" />
        You're on the list. We'll email you the moment Video Maker goes live.
      </div>
    {:else}
      <form onsubmit={handleWaitlist} class="mt-6 max-w-md">
        <label class="field-label" for="waitlist-email">Tell me when it's ready</label>
        <div class="flex flex-col sm:flex-row gap-3">
          <div class="relative flex-1">
            <Mail size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              id="waitlist-email"
              type="email"
              bind:value={email}
              placeholder="you@example.com"
              class="field !pl-10"
              data-testid="waitlist-email"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !emailValid}
            class="btn btn-primary shrink-0"
            data-testid="waitlist-submit"
          >
            {#if submitting}<LoaderCircle size={14} class="animate-spin" /> Joining…{:else}Join waitlist{/if}
          </button>
        </div>
        {#if error}
          <div class="mt-3 flex items-start gap-2 text-sm text-danger" role="alert">
            <CircleAlert size={16} class="flex-shrink-0 mt-0.5" /> {error}
          </div>
        {/if}
      </form>
    {/if}
  </div>

  <!-- A quiet look at what's coming: visible but disabled. No upload, no generate, no Download MP4. -->
  <div class="opacity-55 pointer-events-none select-none" aria-hidden="true">
    <p class="section-kicker mb-5">A peek at what's coming</p>

    <section class="mb-8">
      <p class="field-label">Your product photos</p>
      <div class="border border-dashed border-border rounded-md px-6 py-10 text-center">
        <Upload size={28} class="mx-auto text-text-muted mb-2.5" />
        <p class="text-sm text-text-primary font-medium">Add up to 10 photos</p>
        <p class="field-hint !mt-1">PNG, JPG, or WEBP, up to 10MB each.</p>
      </div>
      <div class="mt-4 flex gap-2.5 overflow-x-auto pb-1">
        {#each [1, 2, 3, 4] as i (i)}
          <div class="w-20 h-20 rounded-md bg-bg-page flex items-center justify-center flex-shrink-0 border border-border">
            <ImageIcon size={18} class="text-text-muted" />
          </div>
        {/each}
      </div>
    </section>

    <hr class="rule" />

    <section class="pt-8">
      <p class="field-label">Video settings</p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <span class="field-hint !mt-0 block mb-1.5">Seconds per slide</span>
          <div class="field">3 seconds</div>
        </div>
        <div>
          <span class="field-hint !mt-0 block mb-1.5">Transition</span>
          <div class="field">Fade</div>
        </div>
        <div>
          <span class="field-hint !mt-0 block mb-1.5">Aspect ratio</span>
          <div class="field">1:1 (Square)</div>
        </div>
      </div>
    </section>
  </div>
</ToolPageLayout>
