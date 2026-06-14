# Engineer E2 — Phase 3 FE Wiring (Task #13)

Branch `migrate-sveltekit`. Wave 2. Wired 7 Etsy tool pages to `callTool` + built `EstimatedBadge`.

## Files owned / changed

- **NEW** `src/lib/components/ui/EstimatedBadge.svelte` — small reusable "Estimated" badge.
  Props `tooltip?` (default: "Estimated from public Etsy data — not an official Etsy figure.")
  + `label?` (default "Estimated"; pages pass `label="Est."` for compact inline use). Info
  icon + `title` + `aria-label`. Styled after `.badge` (warning-bg / #b7950b).
- `tools/etsy/listing-analyzer/+page.svelte`
- `tools/etsy/shop-analyzer/+page.svelte`
- `tools/etsy/rank-check/+page.svelte`
- `tools/etsy/niche-finder/+page.svelte`
- `tools/etsy/best-sellers/+page.svelte`
- `tools/etsy/etsy-trends/+page.svelte`
- `tools/etsy/buyer-check/+page.svelte`

## Wiring applied to every page (per spec §6)

- Replaced mock data with `callTool('<tool>', input)` from `$lib/tools-client` (Phase 2 helper, untouched).
- Loading state: button `disabled` + `LoaderCircle` spinner (matches Phase 2 pattern).
- Error banner: inline `CircleAlert` banner from `{error,message}`, `role="alert"`.
- 402 → "Upgrade plan" CTA linking `/pricing`.
- Empty / not-found states per tool.
- `invalidateAll()` after every success → Header credits badge refresh (PM Q4, no Header edit).
- Markup/Tailwind preserved; only added states + EstimatedBadge + honesty copy.

## Response shapes wired (spec §4 — Engineer F's 02_contract_F.md / 04_engineer_F.md did NOT exist at build time, so wired to BA spec shapes)

- `listing-analyzer` → `{ title, shop, price, rating, numRatings, date, url?, scores{title|tags|images|video|description{score,feedback{clarity[],seo[]}}}, stats{estimatedSales, estimatedRevenue, faves} }` — **no `stats.views`**.
- `shop-analyzer` → `{ name,title,rating,numRatings,location,created, stats{monthlySales,monthlyRevenue,monthlyRevenuePerDay?,totalSales,totalRevenue,activeListings,salesPerListing,averagePrice,totalFaves,totalReviews,reviewRate}, tags[], listings[]{id,title,price,grade,scores,sales,revenue,faves}, reviewDistribution[], recentReviews[], about{shipsFrom?,currency?,onVacation?,acceptsCustomRequests?,languages?,age?,announcement?,welcomeMessage?,saleMessage?} }` — **no `stats.percentile`, no `listings[].views`**.
- `rank-check` → `{ currentRank:number|null, bestRank:number|null, bestRankDate:string|null, delta:number|null, keyword, competingListings, rankHistory[]{date,rank} }`.
- `niche-finder` → `{ niches[]{niche,competition,demand,avgPrice,listings,growth} }`.
- `best-sellers` → `{ shops[]{rank,name,country,countryCode,sales,listings,faves,rating,opened} }`; input `{category?, view}`.
- `etsy-trends` → `{ trends[]{keyword,category,demandIndex(0-100),trend,change}, buildingHistory? }`; input `{filter}`.
- `buyer-check` → `{ shopName, shopOpened, totalReviews, avgRating, positivePct, accountAge, riskLevel, reviews[]{product,rating,text,date} }`; input **`{shop}`**.

> If F's actual field names differ (esp. `demandIndex`, `monthlyRevenuePerDay`, `bestRankDate`, `competingListings`, `positivePct`, review item `product`), these are the FE-side names to align. Flagged for QA/F.

## HONESTY FIXES (mandatory — all done)

1. **EstimatedBadge on every estimated number:**
   - listing-analyzer: Estimated Sales + Estimated Revenue StatCards; every score-section header (rule-based audit = estimate).
   - shop-analyzer: Monthly Sales + Monthly Revenue cards; per-listing Sales + Revenue; sidebar Total Sales / Total Revenue / Sales per Listing / Review Rate.
   - rank-check: Current Rank header ("Estimated position").
   - niche-finder: Demand + Growth column headers.
   - best-sellers: page-level "Estimated rankings" note + header badge + Sales column.
   - etsy-trends: toolbar badge + Demand Index column.
   - buyer-check: risk-level badge.
2. **Removed fabricated fields (PM Q7 — not rendered at all):**
   - listing-analyzer: **Views StatCard removed** (grid 4→3 cols).
   - shop-analyzer: **"More sales than X% of Shops" percentile card removed** (grid 3→2 cols); **per-listing Views removed** (stats grid 4→3 cols + "Views" sort option removed). Also removed hardcoded `4200000/30` revenue-per-day magic number → now reads `monthlyRevenuePerDay` from API or shows "estimated".
3. **etsy-trends column rename:** "Monthly Searches" (fabricated absolute volume `searches`) → **"Demand Index (est.)"** rendering `demandIndex/100`.
4. **buyer-check redefined → shop reputation:**
   - Page title "Buyer Check" → **"Shop Reputation Check"**; description rewritten (no "buyer" language).
   - Input "Buyer username" → **"Shop name or URL"**, placeholder `sarah_crafts` → `CaitlynMinimalist`.
   - "Member since" → "Shop opened"; "Account Age" stat → "Shop Age".
   - Avatar/heading use shop name; review rows show `product` (listing within shop) not buyer.
   - `data-testid` renamed `buyer-username`→`shop-input`, `buyer-submit`→`shop-submit` (BA §4.7.1 left this to E; route URL `/buyer-check` kept).

## Verification

- `npm run check`: **0 errors** for all my files. Remaining warnings (a11y: `#` hrefs, label-without-`for`) are **pre-existing** in the original mock markup, preserved unchanged — not regressions from this task.
- Svelte 5 runes throughout (`$state`, `$derived`, `$props`, `$effect`). No Svelte 4 syntax.
- Did NOT touch: package.json, backend, tools-client.ts, Header.svelte. Did not run full build.

## Issues / risks flagged

- **Field-name drift risk:** wired to spec shapes because F's contract files weren't present. The estimated-but-API-derived names listed above are the alignment surface; QA should diff against F's real `etsy-tools.ts` response once mounted. Routes not yet mounted → live calls will 404 until C mounts `etsy-tools.ts`; that is expected, not an FE bug.
- **etsy-trends & best-sellers** auto-load on mount via `$effect` (cache-read tools, no submit form) — they charge credits on page open (best-sellers/etsy-trends = 1 credit per PM Q11). This matches "cache read still charges" (BR-P3-03); if PM wants a manual "Load" gate to avoid charge-on-navigation, that's a follow-up.
- **best-sellers "listings" view** shows a "coming soon" placeholder (spec Q13 allowed deferring to 3.1); shops view is fully wired.
- **rank-check** chart shows "Collecting data" when `rankHistory.length < 2` (honest early state per spec §3.5/§6).
