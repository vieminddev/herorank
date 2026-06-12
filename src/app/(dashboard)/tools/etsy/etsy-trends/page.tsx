"use client";
import React, { useState } from "react";
import ToolPageLayout from "@/components/tools/ToolPageLayout";
import { Search, TrendingUp, TrendingDown, Minus } from "lucide-react";

const MOCK_TRENDS = [
  { keyword: "personalized gifts", searches: 142000, trend: "up", change: "+12%", category: "Jewelry" },
  { keyword: "cottagecore decor", searches: 98000, trend: "up", change: "+28%", category: "Home & Living" },
  { keyword: "digital planner", searches: 87000, trend: "up", change: "+45%", category: "Digital Downloads" },
  { keyword: "custom pet portrait", searches: 76000, trend: "up", change: "+18%", category: "Art" },
  { keyword: "beaded bracelets", searches: 65000, trend: "stable", change: "+2%", category: "Jewelry" },
  { keyword: "vintage clothing", searches: 54000, trend: "down", change: "-5%", category: "Clothing" },
  { keyword: "resin art", searches: 48000, trend: "up", change: "+22%", category: "Art" },
  { keyword: "baby shower favors", searches: 42000, trend: "stable", change: "+1%", category: "Party Supplies" },
  { keyword: "macrame wall hanging", searches: 38000, trend: "down", change: "-8%", category: "Home & Living" },
  { keyword: "sticker sheets", searches: 35000, trend: "up", change: "+15%", category: "Stickers" },
  { keyword: "crochet patterns", searches: 32000, trend: "up", change: "+10%", category: "Craft Supplies" },
  { keyword: "wedding invitations", searches: 29000, trend: "stable", change: "+3%", category: "Paper & Party" },
];

export default function EtsyTrendsPage() {
  const [filter, setFilter] = useState("");
  const filtered = MOCK_TRENDS.filter(t => 
    !filter || t.keyword.toLowerCase().includes(filter.toLowerCase()) || t.category.toLowerCase().includes(filter.toLowerCase())
  );
  const trendIcon = (trend: string) => {
    if (trend === "up") return <TrendingUp size={14} className="text-success" />;
    if (trend === "down") return <TrendingDown size={14} className="text-danger" />;
    return <Minus size={14} className="text-text-muted" />;
  };
  return (
    <ToolPageLayout title="Etsy Trends" description="Stay ahead of the curve — see what buyers are searching for right now and spot emerging trends before they peak.">
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input type="text" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by keyword or category..." className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:border-teal bg-white" />
        </div>
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-light bg-bg-page/50">
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Keyword</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Category</th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Monthly Searches</th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Trend</th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Change</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, i) => (
                <tr key={item.keyword} className="border-b border-border-light hover:bg-bg-page/50 transition-colors">
                  <td className="px-4 py-3 text-sm text-text-muted">{i + 1}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-text-primary">{item.keyword}</td>
                  <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 bg-bg-page rounded-full text-text-secondary">{item.category}</span></td>
                  <td className="px-4 py-3 text-sm text-right text-text-primary">{item.searches.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">{trendIcon(item.trend)}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium" style={{ color: item.trend === "up" ? "var(--success)" : item.trend === "down" ? "var(--danger)" : "var(--text-muted)" }}>{item.change}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ToolPageLayout>
  );
}
