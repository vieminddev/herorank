"use client";
import React, { useState } from "react";
import ToolPageLayout from "@/components/tools/ToolPageLayout";
import { Search, Star, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";

const MOCK_BUYER = {
  username: "sarah_crafts",
  memberSince: "March 2019",
  totalReviews: 47,
  avgRating: 4.8,
  riskLevel: "low",
  reviews: [
    { shop: "CaitlynMinimalist", rating: 5, text: "Beautiful necklace, arrived quickly!", date: "2 weeks ago" },
    { shop: "BeadBoat1", rating: 5, text: "Perfect beads, great selection!", date: "1 month ago" },
    { shop: "PlannerKate1", rating: 4, text: "Nice stickers but one sheet was missing.", date: "2 months ago" },
    { shop: "HandmadeByAnna", rating: 5, text: "Gorgeous earrings! Will buy again.", date: "3 months ago" },
  ],
};

export default function BuyerCheckPage() {
  const [username, setUsername] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); if (username.trim()) setHasSearched(true); };
  const riskIcon = MOCK_BUYER.riskLevel === "low" ? <ShieldCheck size={20} className="text-success" /> : MOCK_BUYER.riskLevel === "medium" ? <ShieldAlert size={20} className="text-warning" /> : <ShieldX size={20} className="text-danger" />;

  return (
    <ToolPageLayout title="Buyer Check" description="Check any Etsy buyer before fulfilling a custom or high-value order. See review history, risk signals, and account age.">
      <form onSubmit={handleSearch} className="mb-8">
        <label className="text-xs font-semibold uppercase tracking-wider text-text-primary mb-1.5 flex items-center gap-1">Buyer username <span className="text-danger text-xs font-normal">(required)</span></label>
        <div className="flex gap-3">
          <div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" /><input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. sarah_crafts" className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:border-teal bg-white" /></div>
          <button type="submit" className="px-8 py-2.5 rounded-lg text-sm font-semibold text-white hover:opacity-90" style={{ background: "var(--navy)" }}>Check</button>
        </div>
      </form>
      {hasSearched && (
        <div className="animate-fade-in space-y-4">
          <div className="card p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-teal/20 to-teal/10 flex items-center justify-center text-lg font-bold text-teal">{MOCK_BUYER.username.charAt(0).toUpperCase()}</div>
              <div className="flex-1"><h3 className="text-lg font-bold text-text-primary">{MOCK_BUYER.username}</h3><p className="text-xs text-text-muted">Member since {MOCK_BUYER.memberSince}</p></div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg" style={{ background: MOCK_BUYER.riskLevel === "low" ? "var(--success-bg)" : "var(--danger-bg)" }}>
                {riskIcon}<span className="text-sm font-semibold capitalize" style={{ color: MOCK_BUYER.riskLevel === "low" ? "var(--success)" : "var(--danger)" }}>{MOCK_BUYER.riskLevel} Risk</span>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-bg-page rounded-lg"><div className="text-2xl font-bold text-text-primary">{MOCK_BUYER.totalReviews}</div><div className="text-xs text-text-muted">Total Reviews</div></div>
              <div className="text-center p-3 bg-bg-page rounded-lg"><div className="text-2xl font-bold text-text-primary">{MOCK_BUYER.avgRating}</div><div className="text-xs text-text-muted">Avg Rating</div></div>
              <div className="text-center p-3 bg-bg-page rounded-lg"><div className="text-2xl font-bold text-success">92%</div><div className="text-xs text-text-muted">Positive</div></div>
              <div className="text-center p-3 bg-bg-page rounded-lg"><div className="text-2xl font-bold text-text-primary">5y</div><div className="text-xs text-text-muted">Account Age</div></div>
            </div>
          </div>
          <div className="card p-5">
            <h3 className="text-base font-bold text-text-primary mb-4">Recent Reviews</h3>
            <div className="space-y-4">
              {MOCK_BUYER.reviews.map((r, i) => (
                <div key={i} className="pb-4 border-b border-border-light last:border-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-teal">{r.shop}</span>
                    <span className="text-xs text-text-muted">{r.date}</span>
                  </div>
                  <div className="flex gap-0.5 mb-1">{[1,2,3,4,5].map(s => <Star key={s} size={12} className={s <= r.rating ? "text-warning fill-warning" : "text-border"} />)}</div>
                  <p className="text-sm text-text-secondary">{r.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </ToolPageLayout>
  );
}
