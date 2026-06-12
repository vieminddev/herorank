"use client";

import Link from "next/link";
import {
  Crown,
  TrendingUp,
  Compass,
  Store,
  FileText,
  UserCheck,
  BarChart3,
  Calculator,
  Tag,
  Type,
  AlignLeft,
  Wand2,
  Video,
  MessageSquare,
  Search,
  ArrowRight,
} from "lucide-react";

const toolGroups = [
  {
    title: "Brainstorm",
    description: "Research trends and find winning niches",
    tools: [
      { name: "Best Sellers", href: "/tools/etsy/best-sellers", icon: Crown, desc: "Top-performing shops & listings" },
      { name: "Etsy Trends", href: "/tools/etsy/etsy-trends", icon: TrendingUp, desc: "Trending keywords & categories" },
      { name: "Niche Finder", href: "/tools/etsy/niche-finder", icon: Compass, desc: "Low-competition niches" },
    ],
  },
  {
    title: "Analyze",
    description: "Audit shops, listings, and buyers",
    tools: [
      { name: "Shop Analyzer", href: "/tools/etsy/shop-analyzer", icon: Store, desc: "Full shop performance audit" },
      { name: "Listing Analyzer", href: "/tools/etsy/listing-analyzer", icon: FileText, desc: "Score & optimize any listing" },
      { name: "Buyer Check", href: "/tools/etsy/buyer-check", icon: UserCheck, desc: "Check buyer reputation" },
      { name: "Rank Check", href: "/tools/etsy/rank-check", icon: BarChart3, desc: "Track keyword rankings" },
      { name: "Calculator", href: "/tools/etsy/profit-calculator", icon: Calculator, desc: "Calculate Etsy profit margins" },
    ],
  },
  {
    title: "Compose",
    description: "Generate optimized content with AI",
    tools: [
      { name: "Tag Generator", href: "/tools/etsy/tag-generator", icon: Tag, desc: "Data-driven tag suggestions" },
      { name: "Title Generator", href: "/tools/etsy/title-generator", icon: Type, desc: "SEO-optimized titles" },
      { name: "Description Generator", href: "/tools/etsy/description-generator", icon: AlignLeft, desc: "Compelling product descriptions" },
      { name: "Listing Studio", href: "/tools/etsy/listing-studio", icon: Wand2, desc: "Complete listing from photos" },
      { name: "Video Generator", href: "/tools/etsy/video-generator", icon: Video, desc: "Product showcase videos" },
    ],
  },
  {
    title: "Other Tools",
    description: "Advanced research & AI assistant",
    tools: [
      { name: "Keyword Generator", href: "/tools/keyword-generator", icon: Search, desc: "Related keyword research" },
      { name: "HeroRank AI", href: "/tools/rankhero-ai", icon: MessageSquare, desc: "AI-powered Etsy advisor" },
    ],
  },
];

export default function DashboardPage() {
  return (
    <div className="max-w-6xl mx-auto animate-fade-in">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="tool-heading-prefix">Welcome to</h1>
        <h2 className="tool-heading-title">HeroRank.</h2>
        <p
          className="text-base mt-3 max-w-xl"
          style={{ color: "var(--text-secondary)" }}
        >
          Your complete Etsy SEO toolkit. Analyze shops, generate tags, optimize
          listings, and grow your sales with data-driven insights.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <div className="card px-5 py-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">
            Plan
          </div>
          <div className="text-xl font-bold text-text-primary">Business</div>
          <div className="text-xs text-text-muted mt-1">100/day per tool</div>
        </div>
        <div className="card px-5 py-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">
            Linked Shops
          </div>
          <div className="text-xl font-bold text-text-primary">0 / 10</div>
          <div className="text-xs text-text-muted mt-1">
            <a href="#" className="text-teal hover:underline">
              Link a shop →
            </a>
          </div>
        </div>
        <div className="card px-5 py-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">
            Today&apos;s Usage
          </div>
          <div className="text-xl font-bold text-text-primary">0 / 100</div>
          <div className="text-xs text-text-muted mt-1">Resets at midnight</div>
        </div>
      </div>

      {/* Tool Groups */}
      <div className="space-y-10 stagger-children">
        {toolGroups.map((group) => (
          <div key={group.title}>
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-lg font-bold text-text-primary">
                {group.title}
              </h3>
              <span className="text-sm text-text-muted">
                {group.description}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {group.tools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <Link
                    key={tool.href}
                    href={tool.href}
                    className="card px-4 py-4 flex items-start gap-3 group hover:border-teal/30 transition-all"
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
                      style={{
                        background: "var(--bg-page)",
                        color: "var(--teal)",
                      }}
                    >
                      <Icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-text-primary group-hover:text-teal transition-colors">
                          {tool.name}
                        </span>
                        <ArrowRight
                          size={12}
                          className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity"
                        />
                      </div>
                      <p className="text-xs text-text-muted mt-0.5 line-clamp-1">
                        {tool.desc}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
