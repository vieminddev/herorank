<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import { Upload, Play, Download, Image as ImageIcon } from "lucide-svelte";

  let uploaded = $state(false);
  let generating = $state(false);
  let generated = $state(false);

  const handleUpload = () => { uploaded = true; };
  const handleGenerate = () => {
    generating = true;
    setTimeout(() => { generating = false; generated = true; }, 2000);
  };
</script>

<ToolPageLayout title="Video Generator" description="Build Etsy-ready slideshow videos from product photos. Upload images and we'll create a professional video preview for your listing.">
  <!-- Upload Section -->
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
      <p class="text-sm text-text-primary font-medium">Click to upload or drag & drop</p>
      <p class="text-xs text-text-muted mt-1">PNG, JPG, WEBP up to 10MB each. Maximum 10 images.</p>
    </div>
    {#if uploaded}
      <div class="mt-4 animate-fade-in">
        <div class="flex gap-3 overflow-x-auto pb-2">
          {#each [1, 2, 3, 4] as i (i)}
            <div class="w-24 h-24 rounded-lg bg-gradient-to-br from-bg-page to-border flex items-center justify-center flex-shrink-0 border border-border">
              <ImageIcon size={20} class="text-text-muted" />
            </div>
          {/each}
        </div>
        <p class="text-xs text-text-muted mt-2">4 images uploaded</p>
      </div>
    {/if}
  </div>

  <!-- Settings -->
  {#if uploaded}
    <div class="card p-6 mb-6 animate-fade-in">
      <h3 class="text-base font-bold text-text-primary mb-4">Video Settings</h3>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label class="text-xs font-semibold text-text-secondary mb-1 block">Duration per slide</label>
          <select class="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white">
            <option>2 seconds</option>
            <option>3 seconds</option>
            <option>4 seconds</option>
            <option>5 seconds</option>
          </select>
        </div>
        <div>
          <label class="text-xs font-semibold text-text-secondary mb-1 block">Transition</label>
          <select class="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white">
            <option>Fade</option>
            <option>Slide</option>
            <option>Zoom</option>
            <option>None</option>
          </select>
        </div>
        <div>
          <label class="text-xs font-semibold text-text-secondary mb-1 block">Aspect Ratio</label>
          <select class="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white">
            <option>1:1 (Square)</option>
            <option>16:9 (Landscape)</option>
            <option>9:16 (Portrait)</option>
            <option>4:5 (Instagram)</option>
          </select>
        </div>
      </div>
      <button
        onclick={handleGenerate}
        disabled={generating}
        class="mt-4 px-8 py-2.5 rounded-lg text-sm font-semibold text-white flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
        style="background: var(--navy)"
      >
        {#if generating}
          <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> Generating...
        {:else}
          <Play size={14} /> Generate Video
        {/if}
      </button>
    </div>
  {/if}

  <!-- Result -->
  {#if generated}
    <div class="card p-6 animate-fade-in">
      <h3 class="text-base font-bold text-text-primary mb-4">Your Video</h3>
      <div class="aspect-video bg-navy-dark rounded-xl flex items-center justify-center mb-4">
        <div class="text-center">
          <Play size={48} class="mx-auto text-white/80 mb-2" />
          <p class="text-sm text-white/60">Video Preview</p>
        </div>
      </div>
      <div class="flex gap-3">
        <button class="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white hover:opacity-90" style="background: var(--teal)">
          <Download size={14} /> Download MP4
        </button>
        <button class="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium border border-border text-text-primary hover:bg-bg-page transition-colors">
          <Play size={14} /> Preview
        </button>
      </div>
    </div>
  {/if}
</ToolPageLayout>
