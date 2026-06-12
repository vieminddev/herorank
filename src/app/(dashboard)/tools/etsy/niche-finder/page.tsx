"use client";
import React, { useState } from "react";
import ToolPageLayout from "@/components/tools/ToolPageLayout";
import Badge from "@/components/ui/Badge";
import { Search, Compass } from "lucide-react";

const MOCK_NICHES = [
  { niche: "Personalized Pet Jewelry", competition: "low" as const, demand: "high" as const, avgPrice: "$24.99", listings: 12400, growth: "+32%" },
  { niche: "Digital Budget Planners", competition: "medium" as const, demand: "high" as const, avgPrice: "$8.99", listings: 8900, growth: "+45%" },
  { niche: "Custom Embroidered Hats", competition: "low" as const, demand: "medium" as const, avgPrice: "$29.99", listings: 5600, growth: "+18%" },
  { niche: "Resin Bookmark Sets", competition: "low" as const, demand: "medium" as const, avgPrice: "$15.99", listings: 3200, growth: "+28%" },
  { niche: "Vintage Map Prints", competition: "medium" as const, demand: "medium" as const, avgPrice: "$12.99", listings: 7800, growth: "+8%" },
  { niche: "Handmade Soy Candles", competition: "high" as const, demand: "high" as const, avgPrice: "$18.99", listings: 45000, growth: "+5%" },
  { niche: "Custom Birth Flower Art", competition: "low" as const, demand: "high" as const, avgPrice: "$19.99", listings: 2100, growth: "+52%" },
  { niche: "Macrame Plant Hangers", competition: "medium" as const, demand: "medium" as const, avgPrice: "$22.99", listings: 14500, growth: "-3%" },
];

export default function NicheFinderPage() {
  const [query, setQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); if (query.trim()) setHasSearched(true); };

  return (
    <ToolPageLayout title="Niche Finder" description="Discover low-competition, high-demand niches on Etsy. Find the gaps competitors aren't filling yet.">
      <form onSubmit={handleSearch} className="mb-8">
        <label className="text-xs font-semibold uppercase tracking-wider text-text-primary mb-1.5 flex items-center gap-1">
          Category or keyword <span className="text-danger text-xs font-normal">(required)</span>
        </label>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="e.g. jewelry, home decor, digital downloads" className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:border-teal bg-white" />
          </div>
          <button type="submit" className="px-8 py-2.5 rounded-lg text-sm font-semibold text-white hover:opacity-90" style={{ background: "var(--navy)" }}>Search</button>
        </div>
      </form>
      {hasSearched && (
        <div className="card overflow-hidden animate-fade-in">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Compass size={18} className="text-teal" />
            <h3 className="text-base font-bold text-text-primary">Niche Opportunities</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-border-light bg-bg-page/50">
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Niche</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Competition</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Demand</th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Avg Price</th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Listings</th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Growth</th>
              </tr></thead>
              <tbody>
                {MOCK_NICHES.map(n => (
                  <tr key={n.niche} className="border-b border-border-light hover:bg-bg-page/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-semibold text-text-primary">{n.niche}</td>
                    <td className="px-4 py-3"><Badge level={n.competition} /></td>
                    <td className="px-4 py-3"><Badge level={n.demand === "high" ? "low" : n.demand === "low" ? "high" : "medium"} label={n.demand.charAt(0).toUpperCase() + n.demand.slice(1)} /></td>
                    <td className="px-4 py-3 text-sm text-right text-text-primary">{n.avgPrice}</td>
                    <td className="px-4 py-3 text-sm text-right text-text-primary">{n.listings.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium" style={{ color: n.growth.startsWith("+") ? "var(--success)" : "var(--danger)" }}>{n.growth}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ToolPageLayout>
  );
}
