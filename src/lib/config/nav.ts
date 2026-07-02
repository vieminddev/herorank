/**
 * Single source of truth for the dashboard navigation.
 *
 * Both the dashboard sidebar (`(dashboard)/+layout.svelte`) and the per-tool header
 * breadcrumb (`ToolPageLayout.svelte`) read from this — so a tool's group label is
 * always derived from the same place it lives in the sidebar (no per-page prop, no
 * drifting regex).
 */
import {
  Store, WandSparkles, Activity, Search, Layers, LayoutDashboard,
  Bell, History, ClipboardCheck, MessageSquareHeart, Plug,
  Type, Tag, AlignLeft, ListChecks, Image, Sparkles, FileText,
  PencilLine, Bot, TrendingUp, FlaskConical, Columns3, Calculator,
  Megaphone, Eye, Target, Crown, ChartLine, Tags, CalendarDays,
  ShieldCheck, Wand, Video, Compass, Flame, Film,
} from "lucide-svelte";
import type { Component, ComponentType, SvelteComponent } from "svelte";

export type NavIcon = Component<any> | ComponentType<SvelteComponent<any>>;
export interface NavItem { label: string; href: string; icon: NavIcon; desc: string; }
export interface NavCategory { key: string; heading: string; icon: NavIcon; items: NavItem[]; }

export const NAV: NavCategory[] = [
  {
    key: "myshop",
    heading: "My Shop",
    icon: Store,
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, desc: "Overview of your shop and SEO progress" },
      { label: "Sales Overview", href: "/tools/my-shop", icon: Store, desc: "See your real sales, orders & bestsellers" },
      { label: "Shop Audit", href: "/tools/shop-audit", icon: ClipboardCheck, desc: "Score every listing in your shop, worst-first" },
      { label: "Review Requests", href: "/tools/review-requests", icon: MessageSquareHeart, desc: "Draft thank-you + review invites for buyers" },
      { label: "Alerts", href: "/notifications", icon: Bell, desc: "SEO alerts and shop notifications" },
      { label: "History", href: "/history", icon: History, desc: "Audit trail of your SEO runs and changes" },
      { label: "Connect Shop", href: "/settings/connections", icon: Plug, desc: "Connect and manage your Etsy shop" },
    ],
  },
  {
    key: "research",
    heading: "Research",
    icon: Search,
    items: [
      { label: "Niche Finder", href: "/tools/niche-finder", icon: Target, desc: "Find low-competition product ideas" },
      { label: "Etsy Trends", href: "/tools/etsy-trends", icon: ChartLine, desc: "See what Etsy buyers are searching for" },
      { label: "Whitespace Finder", href: "/tools/whitespace-finder", icon: Compass, desc: "High-demand, low-competition openings" },
      { label: "Best Sellers", href: "/tools/best-sellers", icon: Crown, desc: "Top shops by lifetime sales" },
      { label: "Selling Now", href: "/tools/selling-now", icon: Flame, desc: "Shops accelerating in REAL sales now" },
      { label: "Seasonal Calendar", href: "/tools/seasonal-calendar", icon: CalendarDays, desc: "Seasonal keywords by month" },
      { label: "Competitor Research", href: "/tools/shop-analyzer", icon: Store, desc: "Deeply analyze a competitor's shop" },
      { label: "Watchlist", href: "/tools/watchlist", icon: Eye, desc: "Save shops to keep an eye on" },
      { label: "Reputation Check", href: "/tools/buyer-check", icon: ShieldCheck, desc: "A shop's review history and risk signals" },
    ],
  },
  {
    key: "keywords",
    heading: "Keywords",
    icon: Tags,
    items: [
      { label: "Keyword Finder", href: "/tools/keyword-generator", icon: Search, desc: "Generate keyword ideas with demand" },
      { label: "Bulk Keywords", href: "/tools/keyword-bulk", icon: Layers, desc: "Research many keywords at once" },
      { label: "Keyword Lists", href: "/tools/keyword-lists", icon: ListChecks, desc: "Save and organize your keywords" },
      { label: "Tag Gap", href: "/tools/tag-gap", icon: Tags, desc: "Tags top listings use that you don't" },
    ],
  },
  {
    key: "create",
    heading: "Create",
    icon: WandSparkles,
    items: [
      { label: "Listing Builder", href: "/tools/listing-builder", icon: WandSparkles, desc: "Draft a full listing in one flow" },
      { label: "Title Generator", href: "/tools/title-generator", icon: Type, desc: "SEO-friendly titles for your listings" },
      { label: "Tag Generator", href: "/tools/tag-generator", icon: Tag, desc: "13 ready-to-use tags per listing" },
      { label: "Description Writer", href: "/tools/description-generator", icon: AlignLeft, desc: "Keyword-rich listing descriptions" },
      { label: "AI Image Studio", href: "/tools/image-studio", icon: Image, desc: "Generate product photos in shot types" },
      { label: "AI Video Studio", href: "/tools/video-studio", icon: Film, desc: "AI-generated product videos" },
      { label: "Slideshow Maker", href: "/tools/video-generator", icon: Video, desc: "Turn your photos into a listing video" },
      { label: "Listing Studio", href: "/tools/listing-studio", icon: Wand, desc: "All Create tools in one place" },
      { label: "VieRank Assistant", href: "/tools/assistant", icon: Sparkles, desc: "Ask the AI any Etsy SEO question" },
    ],
  },
  {
    key: "optimize",
    heading: "Optimize & Track",
    icon: Activity,
    items: [
      { label: "Listing Optimizer", href: "/tools/listing-analyzer", icon: FileText, desc: "Audit a listing and what to fix" },
      { label: "Listing Editor", href: "/tools/listing-editor", icon: PencilLine, desc: "Edit your listing and push to Etsy" },
      { label: "AI Shopping Optimizer", href: "/tools/chatgpt-optimizer", icon: Bot, desc: "Optimize for AI shopping assistants" },
      { label: "Compare Listings", href: "/tools/compare", icon: Columns3, desc: "Put 2–4 listings side by side" },
      { label: "Search Position", href: "/tools/rank-check", icon: TrendingUp, desc: "Check a listing's rank once, on demand" },
      { label: "Rank Tracker", href: "/tools/rank-tracker", icon: Activity, desc: "Track listings daily, auto-charted (paid)" },
      { label: "Title Experiment", href: "/tools/title-experiment", icon: FlaskConical, desc: "Measure a title change's rank impact" },
    ],
  },
  {
    key: "calculators",
    heading: "Calculators",
    icon: Calculator,
    items: [
      { label: "Profit Calculator", href: "/tools/profit-calculator", icon: Calculator, desc: "What you keep after every Etsy fee" },
      { label: "Ads ROI Calculator", href: "/tools/ads-calculator", icon: Megaphone, desc: "Whether Etsy Ads pay for themselves" },
    ],
  },
];

/** The category heading (My Shop / Create / Optimize / Research / More) a path lives in. */
export function groupHeadingForPath(pathname: string): string {
  const cat = NAV.find((c) => c.items.some((i) => i.href === pathname));
  if (cat) return cat.heading;
  // Settings sub-pages (e.g. the extension token page) live under the My Shop area,
  // alongside Connect Shop — keep their breadcrumb consistent with it.
  if (pathname.startsWith("/settings")) return "My Shop";
  return "Tools";
}
