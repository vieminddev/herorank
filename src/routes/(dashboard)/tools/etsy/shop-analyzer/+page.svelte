<script lang="ts">
  import ToolPageLayout from "$lib/components/tools/ToolPageLayout.svelte";
  import StatCard from "$lib/components/ui/StatCard.svelte";
  import ScoreBar from "$lib/components/ui/ScoreBar.svelte";
  import { Search, ExternalLink, Share2, Star } from "lucide-svelte";

  const MOCK_SHOP = {
    name: "CaitlynMinimalist",
    title: "Personalized Jewelry & Custom Gifts for Every Occasion",
    rating: 4.83,
    numRatings: 510256,
    location: "United States",
    created: "11/1/2014",
    avatar: null,
    stats: {
      monthlySales: 315250,
      monthlyRevenue: "$4.2M",
      percentile: 99.8,
      totalSales: 3778390,
      totalRevenue: "$50.3M",
      activeListings: 2744,
      salesPerListing: 1377,
      averagePrice: "$13.32",
      totalFaves: 510256,
      totalReviews: 289432,
      reviewRate: "7.7%",
    },
    tags: [
      { name: "personalized gift", count: 842 },
      { name: "custom necklace", count: 721 },
      { name: "bridesmaid gift", count: 634 },
      { name: "birthday gift", count: 589 },
      { name: "name necklace", count: 523 },
      { name: "mothers day", count: 412 },
      { name: "minimalist", count: 398 },
      { name: "dainty jewelry", count: 356 },
    ],
    listings: [
      {
        id: 1,
        title: "Personalized Name Necklace - Custom Name Jewelry - Gift for Her",
        price: "$12.99",
        grade: "A",
        scores: { title: 95, tags: 88, images: 92, video: 80, description: 90 },
        sales: 45230,
        revenue: "$587K",
        views: 1200000,
        faves: 98400,
      },
      {
        id: 2,
        title: "Custom Birth Flower Necklace - Dainty Floral Pendant",
        price: "$14.99",
        grade: "A",
        scores: { title: 92, tags: 90, images: 85, video: 0, description: 88 },
        sales: 32100,
        revenue: "$481K",
        views: 890000,
        faves: 67200,
      },
      {
        id: 3,
        title: "Engraved Bar Necklace - Personalized Gift for Mom",
        price: "$11.99",
        grade: "B",
        scores: { title: 85, tags: 82, images: 78, video: 0, description: 75 },
        sales: 18900,
        revenue: "$226K",
        views: 560000,
        faves: 34100,
      },
      {
        id: 4,
        title: "Initial Necklace Gold - Letter Pendant Necklace",
        price: "$9.99",
        grade: "B",
        scores: { title: 80, tags: 78, images: 82, video: 60, description: 72 },
        sales: 12400,
        revenue: "$124K",
        views: 340000,
        faves: 21300,
      },
      {
        id: 5,
        title: "Birthstone Necklace - Custom Gemstone Jewelry Gift",
        price: "$16.99",
        grade: "C",
        scores: { title: 72, tags: 65, images: 70, video: 0, description: 68 },
        sales: 8700,
        revenue: "$148K",
        views: 210000,
        faves: 15600,
      },
      {
        id: 6,
        title: "Layered Chain Necklace Set - Minimalist Gold Chains",
        price: "$19.99",
        grade: "C",
        scores: { title: 68, tags: 70, images: 65, video: 0, description: 60 },
        sales: 5200,
        revenue: "$104K",
        views: 145000,
        faves: 9800,
      },
    ],
  };

  type TabType = "overview" | "reviews" | "about";
  type TagView = "tags" | "categories";

  let shopInput = $state("");
  let hasSearched = $state(false);
  let activeTab = $state<TabType>("overview");
  let tagView = $state<TagView>("tags");

  const handleSearch = (e: SubmitEvent) => {
    e.preventDefault();
    if (shopInput.trim()) hasSearched = true;
  };

  const shop = MOCK_SHOP;
  const maxTagCount = Math.max(...shop.tags.map((t) => t.count));

  const tabs: TabType[] = ["overview", "reviews", "about"];
  const tagViews: TagView[] = ["tags", "categories"];

  const shopStats: [string, string][] = [
    ["Total Sales", shop.stats.totalSales.toLocaleString()],
    ["Total Revenue", shop.stats.totalRevenue],
    ["Active Listings", shop.stats.activeListings.toLocaleString()],
    ["Sales per Listing", shop.stats.salesPerListing.toLocaleString()],
    ["Average Price", shop.stats.averagePrice],
    ["Total Faves", shop.stats.totalFaves.toLocaleString()],
    ["Total Reviews", shop.stats.totalReviews.toLocaleString()],
    ["Review Rate", shop.stats.reviewRate],
  ];

  const reviewDistribution = [
    { star: 5, pct: 82 },
    { star: 4, pct: 10 },
    { star: 3, pct: 4 },
    { star: 2, pct: 2 },
    { star: 1, pct: 2 },
  ];

  const recentReviews = [
    { stars: 5, text: "Beautiful necklace! My wife loved it. The personalization was perfect.", date: "2 days ago" },
    { stars: 5, text: "Amazing quality for the price. Fast shipping too!", date: "3 days ago" },
    { stars: 4, text: "Nice piece but took a bit longer than expected to arrive.", date: "5 days ago" },
    { stars: 5, text: "This is my third purchase from this shop. Never disappointed!", date: "1 week ago" },
  ];

  const shopDetails: [string, string][] = [
    ["Shop Location", shop.location],
    ["Ships From", shop.location],
    ["Currency", "USD"],
    ["On Vacation", "No"],
    ["Total Faves", shop.stats.totalFaves.toLocaleString()],
    ["Accepts Custom Requests", "Yes"],
    ["Languages", "English"],
    ["Created", shop.created],
    ["Age", "11 years"],
  ];

  const communication: [string, string][] = [
    ["Shop Announcement", "Welcome to our shop! We specialize in personalized jewelry..."],
    ["Welcome Message", "Thank you for visiting! Feel free to message us..."],
    ["Sale Message", "Thank you for your purchase! Your order is being prepared..."],
  ];
</script>

<ToolPageLayout
  title="Shop Analyzer"
  description="See what's working, what's not, and how to improve any Etsy shop. Enter a shop name to get a full audit of sales, listings, reviews, and more."
>
  <!-- Search -->
  <form onsubmit={handleSearch} class="mb-8">
    <label class="text-xs font-semibold uppercase tracking-wider text-text-primary mb-1.5 flex items-center gap-1">
      Shop name or URL
      <span class="text-danger text-xs font-normal">(required)</span>
    </label>
    <div class="flex gap-3">
      <div class="relative flex-1">
        <Search size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          bind:value={shopInput}
          placeholder="e.g. CaitlynMinimalist"
          class="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:border-teal focus:ring-1 focus:ring-teal/20 bg-white"
        />
      </div>
      <button
        type="submit"
        class="px-8 py-2.5 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all"
        style="background: var(--navy)"
      >
        Search
      </button>
    </div>
  </form>

  {#if hasSearched}
    <div class="animate-fade-in">
      <!-- Shop Header -->
      <div class="card p-6 mb-6">
        <div class="flex flex-col sm:flex-row items-start gap-5">
          <!-- Avatar -->
          <div class="w-20 h-20 rounded-xl bg-gradient-to-br from-teal to-teal-dark flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
            {shop.name.substring(0, 2).toUpperCase()}
          </div>

          <div class="flex-1 min-w-0">
            <h2 class="text-xl font-bold text-text-primary">
              {shop.name}
            </h2>
            <p class="text-sm text-text-secondary mt-0.5">
              {shop.title}
            </p>
            <div class="flex flex-wrap items-center gap-3 mt-2">
              <div class="flex items-center gap-1">
                <Star size={14} class="text-warning fill-warning" />
                <span class="text-sm font-semibold text-text-primary">
                  {shop.rating}
                </span>
                <span class="text-xs text-text-muted">
                  ({shop.numRatings.toLocaleString()})
                </span>
              </div>
              <span class="text-xs text-text-muted">📍 {shop.location}</span>
              <span class="text-xs text-text-muted">📅 {shop.created}</span>
            </div>
          </div>

          <div class="flex items-center gap-2 flex-shrink-0">
            <a
              href="#"
              class="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm font-medium text-text-primary hover:bg-bg-page transition-colors"
            >
              <ExternalLink size={14} /> View on Etsy
            </a>
            <button class="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm font-medium text-text-primary hover:bg-bg-page transition-colors">
              <Share2 size={14} /> Share
            </button>
          </div>
        </div>

        <!-- Tabs -->
        <div class="flex gap-1 mt-5 border-b border-border">
          {#each tabs as tab (tab)}
            <button
              onclick={() => (activeTab = tab)}
              class={`px-4 py-2 text-sm font-medium capitalize transition-colors relative ${
                activeTab === tab
                  ? "text-teal"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {tab}
              {#if activeTab === tab}
                <div class="absolute bottom-0 left-0 right-0 h-0.5 bg-teal"></div>
              {/if}
            </button>
          {/each}
        </div>
      </div>

      <!-- Overview Tab -->
      {#if activeTab === "overview"}
        <!-- Stats Row -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <StatCard
            label="Monthly Sales"
            value={shop.stats.monthlySales.toLocaleString()}
            subtitle={`${Math.round(shop.stats.monthlySales / 30).toLocaleString()} per day`}
          />
          <StatCard
            label="Monthly Revenue"
            value={shop.stats.monthlyRevenue}
            subtitle={`$${Math.round(4200000 / 30).toLocaleString()} per day`}
          />
          <StatCard label="More sales than" value={`${shop.stats.percentile}%`} subtitle="of Shops" />
        </div>

        <!-- Tags + Shop Stats -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <!-- Most Used Tags -->
          <div class="lg:col-span-2 card p-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-base font-bold text-text-primary">
                Most Used Tags
              </h3>
              <div class="flex gap-1 bg-bg-page rounded-lg p-0.5">
                {#each tagViews as v (v)}
                  <button
                    onclick={() => (tagView = v)}
                    class={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                      tagView === v
                        ? "bg-white text-text-primary shadow-sm"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    {v}
                  </button>
                {/each}
              </div>
            </div>
            <div class="space-y-3">
              {#each shop.tags as tag (tag.name)}
                <div class="flex items-center gap-3">
                  <span class="text-sm text-text-primary w-36 truncate flex-shrink-0">
                    {tag.name}
                  </span>
                  <div class="flex-1 h-5 bg-bg-page rounded overflow-hidden">
                    <div
                      class="h-full rounded transition-all"
                      style={`width: ${(tag.count / maxTagCount) * 100}%; background: var(--teal); opacity: 0.7`}
                    ></div>
                  </div>
                  <span class="text-xs font-semibold text-text-muted w-10 text-right flex-shrink-0">
                    {tag.count}
                  </span>
                </div>
              {/each}
            </div>
          </div>

          <!-- Shop Stats Sidebar -->
          <div class="card p-5">
            <h3 class="text-base font-bold text-text-primary mb-4">
              Shop Stats
            </h3>
            <ul class="space-y-3">
              {#each shopStats as [label, value] (label)}
                <li class="flex items-center justify-between text-sm">
                  <span class="text-text-secondary">{label}</span>
                  <span class="font-semibold text-text-primary">
                    {value}
                  </span>
                </li>
              {/each}
            </ul>
          </div>
        </div>

        <!-- Listings -->
        <div class="card p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-base font-bold text-text-primary">
              Listings
            </h3>
            <select class="text-xs px-3 py-1.5 border border-border rounded-lg bg-white text-text-secondary">
              <option>Score</option>
              <option>Sales</option>
              <option>Revenue</option>
              <option>Views</option>
              <option>Faves</option>
              <option>Created</option>
            </select>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each shop.listings as listing (listing.id)}
              <div class="border border-border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                <!-- Image Placeholder + Grade -->
                <div class="relative h-48 bg-gradient-to-br from-bg-page to-border flex items-center justify-center">
                  <span class="text-text-muted text-xs">Product Image</span>
                  <div class={`grade-badge grade-${listing.grade.toLowerCase()}`}>
                    {listing.grade}
                  </div>
                </div>

                <div class="p-3">
                  <h4 class="text-sm font-medium text-text-primary line-clamp-2 mb-2 leading-snug">
                    {listing.title}
                  </h4>
                  <div class="text-base font-bold text-text-primary mb-3">
                    {listing.price}
                  </div>

                  <!-- Score Bars -->
                  <div class="space-y-2">
                    <ScoreBar label="Title" score={listing.scores.title} />
                    <ScoreBar label="Tags" score={listing.scores.tags} />
                    <ScoreBar label="Images" score={listing.scores.images} />
                    <ScoreBar label="Video" score={listing.scores.video} />
                    <ScoreBar label="Description" score={listing.scores.description} />
                  </div>

                  <!-- Stats -->
                  <div class="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-border-light">
                    <div>
                      <div class="text-[10px] text-text-muted uppercase">Sales</div>
                      <div class="text-xs font-semibold text-text-primary">
                        {listing.sales.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div class="text-[10px] text-text-muted uppercase">Revenue</div>
                      <div class="text-xs font-semibold text-text-primary">
                        {listing.revenue}
                      </div>
                    </div>
                    <div>
                      <div class="text-[10px] text-text-muted uppercase">Views</div>
                      <div class="text-xs font-semibold text-text-primary">
                        {listing.views.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div class="text-[10px] text-text-muted uppercase">Faves</div>
                      <div class="text-xs font-semibold text-text-primary">
                        {listing.faves.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            {/each}
          </div>

          <button class="w-full mt-4 py-2.5 text-sm font-medium text-teal hover:bg-bg-page rounded-lg transition-colors border border-border">
            Load more listings
          </button>
        </div>
      {/if}

      <!-- Reviews Tab -->
      {#if activeTab === "reviews"}
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div class="card p-5">
            <h3 class="text-base font-bold text-text-primary mb-4">
              Review Distribution
            </h3>
            <div class="text-center mb-4">
              <div class="text-3xl font-bold text-text-primary">{shop.rating}</div>
              <div class="flex items-center justify-center gap-0.5 mt-1">
                {#each [1, 2, 3, 4, 5] as s (s)}
                  <Star
                    size={16}
                    class={s <= Math.round(shop.rating) ? "text-warning fill-warning" : "text-border"}
                  />
                {/each}
              </div>
              <div class="text-xs text-text-muted mt-1">
                based on the most recent {shop.numRatings.toLocaleString()} reviews
              </div>
            </div>
            {#each reviewDistribution as r (r.star)}
              <div class="flex items-center gap-2 mb-2">
                <span class="text-xs text-text-secondary w-12">{r.star} star</span>
                <div class="flex-1 h-2 bg-bg-page rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full bg-warning"
                    style={`width: ${r.pct}%`}
                  ></div>
                </div>
                <span class="text-xs font-semibold text-text-muted w-8 text-right">
                  {r.pct}%
                </span>
              </div>
            {/each}
          </div>

          <div class="lg:col-span-2 card p-5">
            <h3 class="text-base font-bold text-text-primary mb-4">
              Recent Reviews
            </h3>
            <div class="flex gap-2 mb-4">
              {#each ["All", "Positive", "Neutral", "Negative"] as f (f)}
                <button
                  class="px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-text-secondary hover:bg-bg-page transition-colors"
                >
                  {f}
                </button>
              {/each}
            </div>
            <div class="space-y-4">
              {#each recentReviews as review, i (i)}
                <div class="pb-4 border-b border-border-light last:border-0">
                  <div class="flex items-center gap-2 mb-1">
                    <div class="flex gap-0.5">
                      {#each [1, 2, 3, 4, 5] as s (s)}
                        <Star
                          size={12}
                          class={s <= review.stars ? "text-warning fill-warning" : "text-border"}
                        />
                      {/each}
                    </div>
                    <span class="text-xs text-text-muted">{review.date}</span>
                  </div>
                  <p class="text-sm text-text-secondary">{review.text}</p>
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/if}

      <!-- About Tab -->
      {#if activeTab === "about"}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="card p-5">
            <h3 class="text-base font-bold text-text-primary mb-4">
              Shop Details
            </h3>
            <ul class="space-y-3">
              {#each shopDetails as [label, value] (label)}
                <li class="flex items-center justify-between text-sm border-b border-border-light pb-2 last:border-0">
                  <span class="text-text-secondary">{label}</span>
                  <span class="font-medium text-text-primary">{value}</span>
                </li>
              {/each}
            </ul>
          </div>
          <div class="card p-5">
            <h3 class="text-base font-bold text-text-primary mb-4">
              Communication
            </h3>
            <div class="space-y-4">
              {#each communication as [title, content] (title)}
                <div>
                  <h4 class="text-sm font-semibold text-text-primary mb-1">{title}</h4>
                  <p class="text-xs text-text-secondary bg-bg-page rounded-lg p-3">
                    {content}
                  </p>
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</ToolPageLayout>
