"use client";
import React, { useState } from "react";
import ToolPageLayout from "@/components/tools/ToolPageLayout";
import { Search, TrendingUp, TrendingDown, Minus } from "lucide-react";

export default function RankCheckPage() {
  const [listingUrl, setListingUrl] = useState("");
  const [keyword, setKeyword] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); if (listingUrl.trim() && keyword.trim()) setHasSearched(true); };

  const mockHistory = [
    { date: "Jun 12", rank: 15 }, { date: "Jun 11", rank: 18 }, { date: "Jun 10", rank: 22 },
    { date: "Jun 9", rank: 19 }, { date: "Jun 8", rank: 25 }, { date: "Jun 7", rank: 28 },
    { date: "Jun 6", rank: 32 },
  ];

  return (
    <ToolPageLayout title="Rank Check" description="See where your listing ranks for any keyword on Etsy. Track your position and measure improvement over time.">
      <form onSubmit={handleSearch} className="mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-text-primary mb-1.5 flex items-center gap-1">Listing URL or ID <span className="text-danger text-xs font-normal">(required)</span></label>
            <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" /><input type="text" value={listingUrl} onChange={e => setListingUrl(e.target.value)} placeholder="e.g. 4511075902" className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:border-teal bg-white" /></div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-text-primary mb-1.5 flex items-center gap-1">Keyword <span className="text-danger text-xs font-normal">(required)</span></label>
            <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" /><input type="text" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="e.g. personalized necklace" className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:border-teal bg-white" /></div>
          </div>
        </div>
        <button type="submit" className="mt-3 px-8 py-2.5 rounded-lg text-sm font-semibold text-white hover:opacity-90" style={{ background: "var(--navy)" }}>Check Rank</button>
      </form>
      {hasSearched && (
        <div className="animate-fade-in space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card p-5 text-center"><div className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">Current Rank</div><div className="text-4xl font-bold text-teal">#15</div><div className="flex items-center justify-center gap-1 mt-1 text-xs text-success"><TrendingUp size={12} /> Up 3 spots</div></div>
            <div className="card p-5 text-center"><div className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">Best Rank</div><div className="text-4xl font-bold text-success">#12</div><div className="text-xs text-text-muted mt-1">Jun 5, 2026</div></div>
            <div className="card p-5 text-center"><div className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">Keyword</div><div className="text-lg font-bold text-text-primary">{keyword || "personalized necklace"}</div><div className="text-xs text-text-muted mt-1">12,847 competing listings</div></div>
          </div>
          <div className="card p-5">
            <h3 className="text-base font-bold text-text-primary mb-4">Rank History (7 days)</h3>
            <div className="flex items-end gap-2 h-40">
              {mockHistory.reverse().map((d, i) => {
                const maxRank = 40;
                const height = ((maxRank - d.rank) / maxRank) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] font-semibold text-text-primary">#{d.rank}</span>
                    <div className="w-full rounded-t" style={{ height: `${height}%`, background: "var(--teal)", opacity: 0.5 + (i / mockHistory.length) * 0.5 }} />
                    <span className="text-[10px] text-text-muted">{d.date}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </ToolPageLayout>
  );
}
