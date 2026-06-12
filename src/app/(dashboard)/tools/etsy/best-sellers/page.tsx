"use client";

import React, { useState } from "react";
import ToolPageLayout from "@/components/tools/ToolPageLayout";
import { Crown, ArrowUpDown } from "lucide-react";

type ViewMode = "shops" | "listings";

const MOCK_SHOPS = [
  { rank: 1, name: "CaitlynMinimalist", country: "United States", countryCode: "us", sales: 3778390, listings: 2744, faves: 510256, rating: 4.83, opened: "11/1/2014" },
  { rank: 2, name: "Beadboat1", country: "United States", countryCode: "us", sales: 2290697, listings: 10197, faves: 98614, rating: 4.85, opened: "8/21/2014" },
  { rank: 3, name: "SilverRainSilver", country: "United Kingdom", countryCode: "gb", sales: 2113037, listings: 6742, faves: 141270, rating: 4.89, opened: "4/7/2015" },
  { rank: 4, name: "PlannerKate1", country: "United States", countryCode: "us", sales: 2077760, listings: 4746, faves: 70237, rating: 4.98, opened: "7/29/2014" },
  { rank: 5, name: "ModParty", country: "United States", countryCode: "us", sales: 2077508, listings: 0, faves: 143171, rating: 4.89, opened: "9/26/2013" },
  { rank: 6, name: "TangledUpInArt", country: "United States", countryCode: "us", sales: 1854230, listings: 1243, faves: 89432, rating: 4.92, opened: "3/15/2016" },
  { rank: 7, name: "LilyDailyDesigns", country: "United States", countryCode: "us", sales: 1723450, listings: 892, faves: 67890, rating: 4.87, opened: "1/10/2015" },
  { rank: 8, name: "CharmHouseDesigns", country: "Canada", countryCode: "ca", sales: 1598200, listings: 3421, faves: 54320, rating: 4.91, opened: "6/22/2017" },
  { rank: 9, name: "RusticRealmCo", country: "United States", countryCode: "us", sales: 1456780, listings: 2156, faves: 78900, rating: 4.86, opened: "11/3/2015" },
  { rank: 10, name: "VintageSoulStore", country: "United Kingdom", countryCode: "gb", sales: 1345600, listings: 5678, faves: 45670, rating: 4.94, opened: "8/14/2016" },
];

export default function BestSellersPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("shops");

  return (
    <ToolPageLayout
      title="Best Sellers"
      description="See what top-performing Etsy shops are doing right and apply proven strategies to your shop."
    >
      <div className="card overflow-hidden">
        {/* Header with toggle */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
            <Crown size={18} className="text-orange" />
            Top {viewMode === "shops" ? "Shops" : "Listings"}
          </h3>
          <div className="flex gap-1 bg-bg-page rounded-lg p-0.5">
            {(["shops", "listings"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-4 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                  viewMode === mode ? "bg-white text-text-primary shadow-sm" : "text-text-muted hover:text-text-primary"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-light bg-bg-page/50">
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  <span className="flex items-center gap-1 cursor-pointer hover:text-text-primary">Rank <ArrowUpDown size={10} /></span>
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  <span className="flex items-center gap-1 cursor-pointer hover:text-text-primary">Shop <ArrowUpDown size={10} /></span>
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  <span className="flex items-center gap-1 justify-end cursor-pointer hover:text-text-primary">Sales <ArrowUpDown size={10} /></span>
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  <span className="flex items-center gap-1 justify-end cursor-pointer hover:text-text-primary">Listings <ArrowUpDown size={10} /></span>
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  <span className="flex items-center gap-1 justify-end cursor-pointer hover:text-text-primary">Faves <ArrowUpDown size={10} /></span>
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  <span className="flex items-center gap-1 justify-end cursor-pointer hover:text-text-primary">Rating <ArrowUpDown size={10} /></span>
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  <span className="flex items-center gap-1 justify-end cursor-pointer hover:text-text-primary">Opened <ArrowUpDown size={10} /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {MOCK_SHOPS.map((shop) => (
                <tr key={shop.rank} className="border-b border-border-light hover:bg-bg-page/50 transition-colors cursor-pointer">
                  <td className="px-4 py-3 text-sm font-semibold text-text-primary">{shop.rank}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal/20 to-teal/10 flex items-center justify-center text-xs font-bold text-teal flex-shrink-0">
                        {shop.name.substring(0, 2)}
                      </div>
                      <div>
                        <span className="text-sm font-semibold text-text-primary hover:text-teal transition-colors">
                          {shop.name}
                        </span>
                        <div className="text-[10px] text-text-muted">
                          {shop.country} <span className="uppercase">{shop.countryCode}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-primary text-right font-medium">
                    {shop.sales.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-primary text-right">
                    {shop.listings.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-primary text-right">
                    {shop.faves.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-primary text-right">{shop.rating}</td>
                  <td className="px-4 py-3 text-sm text-text-muted text-right">{shop.opened}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ToolPageLayout>
  );
}
