"use client";

import React, { useState } from "react";
import ToolPageLayout from "@/components/tools/ToolPageLayout";
import Badge from "@/components/ui/Badge";
import { Search, Copy, X, AlertTriangle, Check } from "lucide-react";

// Mock data matching RankHero's tag generator output
const MOCK_TAGS = [
  { tag: "personalized gifts", competition: "high" as const, searchVolume: "high" as const },
  { tag: "custom name necklace", competition: "medium" as const, searchVolume: "high" as const },
  { tag: "handmade jewelry", competition: "high" as const, searchVolume: "high" as const },
  { tag: "birthday gift for her", competition: "medium" as const, searchVolume: "medium" as const },
  { tag: "minimalist necklace", competition: "medium" as const, searchVolume: "medium" as const },
  { tag: "dainty gold necklace", competition: "low" as const, searchVolume: "medium" as const },
  { tag: "name plate necklace", competition: "low" as const, searchVolume: "low" as const },
  { tag: "sterling silver jewelry", competition: "medium" as const, searchVolume: "medium" as const },
  { tag: "bridesmaid gift", competition: "high" as const, searchVolume: "high" as const },
  { tag: "mothers day gift", competition: "high" as const, searchVolume: "medium" as const },
  { tag: "initial necklace", competition: "low" as const, searchVolume: "medium" as const },
  { tag: "anniversary gift wife", competition: "low" as const, searchVolume: "low" as const },
  { tag: "engraved necklace", competition: "medium" as const, searchVolume: "medium" as const },
  { tag: "gold filled jewelry", competition: "low" as const, searchVolume: "low" as const },
  { tag: "custom jewelry", competition: "medium" as const, searchVolume: "high" as const },
];

const MOCK_MATERIALS = [
  { tag: "Sterling Silver", competition: "medium" as const, searchVolume: "high" as const },
  { tag: "Gold Filled", competition: "low" as const, searchVolume: "medium" as const },
  { tag: "14K Gold", competition: "medium" as const, searchVolume: "high" as const },
  { tag: "Rose Gold", competition: "low" as const, searchVolume: "medium" as const },
  { tag: "Stainless Steel", competition: "low" as const, searchVolume: "low" as const },
];

const MOCK_STYLES = [
  { tag: "Minimalist", competition: "medium" as const, searchVolume: "high" as const },
  { tag: "Bohemian", competition: "low" as const, searchVolume: "medium" as const },
  { tag: "Vintage", competition: "medium" as const, searchVolume: "medium" as const },
  { tag: "Modern", competition: "low" as const, searchVolume: "low" as const },
];

const MOCK_TREND = [65, 72, 80, 85, 78, 90, 95, 88, 92, 97, 100, 94];

const LOCATIONS = ["Global", "USA", "UK", "AUS", "CAN", "EU", "IND"];

type TabType = "tags" | "materials" | "styles" | "listings";

export default function TagGeneratorPage() {
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("Global");
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>("tags");
  const [copied, setCopied] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (keyword.trim()) {
      setHasSearched(true);
      setSelectedTags([]);
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : prev.length < 13
        ? [...prev, tag]
        : prev
    );
  };

  const copyTags = () => {
    navigator.clipboard.writeText(selectedTags.join(", "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentData =
    activeTab === "tags"
      ? MOCK_TAGS
      : activeTab === "materials"
      ? MOCK_MATERIALS
      : activeTab === "styles"
      ? MOCK_STYLES
      : [];

  const columnLabel =
    activeTab === "materials"
      ? "Material"
      : activeTab === "styles"
      ? "Style"
      : "Tag";

  return (
    <ToolPageLayout
      title="Tag Generator"
      description="Find high-search, low-competition tags that help your listings stand out. Enter a keyword to see real Etsy tag data."
    >
      {/* Search Input */}
      <form onSubmit={handleSearch} className="mb-8">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-text-primary mb-1.5 flex items-center gap-1">
              Seed keyword
              <span className="text-danger text-xs font-normal">(required)</span>
            </label>
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. personalized necklace"
                className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:border-teal focus:ring-1 focus:ring-teal/20 transition-colors bg-white"
              />
            </div>
          </div>

          <div className="w-full sm:w-36">
            <label className="text-xs font-semibold uppercase tracking-wider text-text-primary mb-1.5 block">
              Location
            </label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:border-teal bg-white appearance-none cursor-pointer"
            >
              {LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full sm:w-auto px-8 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ background: "var(--navy)" }}
            >
              Search
            </button>
          </div>
        </div>
      </form>

      {/* Results */}
      {hasSearched && (
        <div className="animate-fade-in">
          {/* Summary Cards */}
          <div className="card p-5 mb-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">
                  Keyword
                </div>
                <div className="text-sm font-bold text-text-primary">
                  {keyword}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">
                  Location
                </div>
                <div className="text-sm font-bold text-text-primary">
                  {location}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">
                  Competition
                </div>
                <div className="text-sm font-bold text-text-primary">
                  12,847
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">
                  Search Volume
                </div>
                <div className="text-sm font-bold text-text-primary">
                  8,320/mo
                </div>
              </div>
            </div>
          </div>

          {/* Price Range & Trend */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* Price Range */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Bargain
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Midrange
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Premium
                </span>
              </div>
              <div className="relative h-2 rounded-full overflow-hidden bg-gradient-to-r from-success via-warning to-danger" />
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm font-bold text-text-primary">$1.91</span>
                <span className="text-sm font-bold text-text-primary">$21.40</span>
                <span className="text-sm font-bold text-text-primary">$1,260</span>
              </div>
            </div>

            {/* Monthly Trend */}
            <div className="card p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
                Monthly Trend
              </div>
              <div className="flex items-end gap-1 h-16">
                {MOCK_TREND.map((val, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t transition-all hover:opacity-80"
                    style={{
                      height: `${val}%`,
                      background:
                        i === MOCK_TREND.length - 1
                          ? "var(--teal)"
                          : "var(--teal-light)",
                      opacity: 0.3 + (i / MOCK_TREND.length) * 0.7,
                    }}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-text-muted">12mo ago</span>
                <span className="text-[10px] text-text-muted">Now</span>
              </div>
            </div>
          </div>

          {/* Tags Table + Copy Sidebar */}
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Main Table */}
            <div className="flex-1 card overflow-hidden">
              {/* Tabs */}
              <div className="flex border-b border-border">
                {(["tags", "materials", "styles", "listings"] as TabType[]).map(
                  (tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-5 py-3 text-sm font-medium capitalize transition-colors relative ${
                        activeTab === tab
                          ? "text-teal"
                          : "text-text-muted hover:text-text-primary"
                      }`}
                    >
                      {tab}
                      {activeTab === tab && (
                        <div
                          className="absolute bottom-0 left-0 right-0 h-0.5"
                          style={{ background: "var(--teal)" }}
                        />
                      )}
                    </button>
                  )
                )}
              </div>

              {/* Table */}
              {activeTab !== "listings" ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border-light">
                        <th className="w-10 px-4 py-3" />
                        <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                          {columnLabel}
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                          Competition
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                          Search Volume
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentData.map((item) => (
                        <tr
                          key={item.tag}
                          className="border-b border-border-light hover:bg-bg-page/50 transition-colors cursor-pointer"
                          onClick={() => toggleTag(item.tag)}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedTags.includes(item.tag)}
                              onChange={() => toggleTag(item.tag)}
                              className="w-4 h-4 rounded border-border accent-teal cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-text-primary font-medium">
                              {item.tag}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Badge level={item.competition} />
                          </td>
                          <td className="px-4 py-3">
                            <Badge level={item.searchVolume} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-text-muted text-sm">
                  Listings data will be available when connected to the Etsy API.
                </div>
              )}
            </div>

            {/* Copy & Paste Sidebar */}
            <div className="w-full lg:w-64 flex-shrink-0">
              <div className="card p-4 sticky top-20">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-text-primary">
                    Copy & Paste
                  </h4>
                  <span
                    className="text-sm font-bold"
                    style={{
                      color:
                        selectedTags.length >= 13
                          ? "var(--danger)"
                          : "var(--teal)",
                    }}
                  >
                    {selectedTags.length}/13
                  </span>
                </div>

                {/* Selected tags */}
                <div className="min-h-[120px] mb-3 p-3 rounded-lg border border-border-light bg-bg-page">
                  {selectedTags.length === 0 ? (
                    <p className="text-xs text-text-muted text-center pt-6">
                      Select tags from the table
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedTags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-white border border-border"
                        >
                          {tag}
                          <button
                            onClick={() => toggleTag(tag)}
                            className="hover:text-danger transition-colors"
                          >
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedTags([])}
                    className="flex-1 px-3 py-2 rounded-lg text-xs font-medium border border-border text-text-secondary hover:bg-bg-page transition-colors"
                  >
                    Clear
                  </button>
                  <button
                    onClick={copyTags}
                    disabled={selectedTags.length === 0}
                    className="flex-1 px-3 py-2 rounded-lg text-xs font-medium text-white flex items-center justify-center gap-1 transition-all disabled:opacity-40"
                    style={{ background: "var(--navy)" }}
                  >
                    {copied ? (
                      <>
                        <Check size={12} /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={12} /> Copy Tags
                      </>
                    )}
                  </button>
                </div>

                {/* Pro Tip */}
                <div className="mt-4 p-3 rounded-lg bg-warning/5 border border-warning/20">
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      size={14}
                      className="text-warning flex-shrink-0 mt-0.5"
                    />
                    <div>
                      <h5 className="text-xs font-bold text-text-primary mb-1">
                        Pro Tip
                      </h5>
                      <p className="text-[11px] text-text-secondary leading-relaxed">
                        Use all 13 tag slots — every empty slot is a missed
                        opportunity. Mix high and low competition tags for best
                        results.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Overview Section (shown when no search) */}
      {!hasSearched && (
        <div className="mt-12 space-y-8">
          <h3 className="text-xl font-bold text-text-primary">
            Pick the right Etsy tags with real data, not guesswork.
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card p-6">
              <h4 className="text-base font-bold text-text-primary mb-2">
                What it does
              </h4>
              <p className="text-sm text-text-secondary leading-relaxed">
                HeroRank&apos;s Tag Generator helps Etsy sellers prioritize
                high-impact tags and keywords using search volume and competition
                insights — so your listings get in front of the right buyers.
              </p>
            </div>
            <div className="card p-6">
              <h4 className="text-base font-bold text-text-primary mb-2">
                Why it matters
              </h4>
              <p className="text-sm text-text-secondary leading-relaxed">
                Tags are Etsy&apos;s most direct lever for search visibility.
                Picking the wrong ones — or missing high-volume opportunities —
                quietly buries your listing. We remove the guesswork so you can
                focus on selling.
              </p>
            </div>
          </div>

          {/* Features Grid */}
          <div>
            <h3 className="text-xl font-bold text-text-primary mb-4">
              Every signal you need to pick the right tag.
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
              {[
                { title: "Free & no signup", desc: "No credit card. No account required. Start generating tags instantly." },
                { title: "All-in-one analysis", desc: "Tags, materials, and styles for your keyword in one view." },
                { title: "Competition insights", desc: "See exactly how many other listings compete for each tag." },
                { title: "Search volume data", desc: "Discover how many buyers search for each tag every month." },
                { title: "Select & copy in one click", desc: "Tick the tags you want and copy them all at once." },
                { title: "Location-specific insights", desc: "Filter results by country to see regional search data." },
                { title: "Visual price distribution", desc: "Bargain, midrange, and premium pricing for your keyword." },
                { title: "Materials & styles included", desc: "Material and style suggestions with full metrics." },
                { title: "Monthly trend graph", desc: "12 months of search volume on a single chart." },
              ].map((feature) => (
                <div key={feature.title} className="card p-5">
                  <h5 className="text-sm font-bold text-text-primary mb-1.5">
                    {feature.title}
                  </h5>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </ToolPageLayout>
  );
}
