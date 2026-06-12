"use client";
import React, { useState } from "react";
import ToolPageLayout from "@/components/tools/ToolPageLayout";
import Badge from "@/components/ui/Badge";
import { Search, Copy, Check } from "lucide-react";

const MOCK_KEYWORDS = [
  { keyword: "personalized necklace", volume: 18200, competition: "high" as const, cpc: "$1.20", trend: "+12%" },
  { keyword: "custom name necklace", volume: 14800, competition: "medium" as const, cpc: "$0.95", trend: "+8%" },
  { keyword: "dainty gold necklace", volume: 12400, competition: "medium" as const, cpc: "$0.85", trend: "+15%" },
  { keyword: "personalized jewelry for women", volume: 9800, competition: "low" as const, cpc: "$0.75", trend: "+22%" },
  { keyword: "name plate necklace", volume: 8200, competition: "low" as const, cpc: "$0.65", trend: "+5%" },
  { keyword: "custom jewelry gift", volume: 7600, competition: "medium" as const, cpc: "$0.90", trend: "+18%" },
  { keyword: "bridesmaid necklace gift", volume: 6400, competition: "low" as const, cpc: "$0.55", trend: "+28%" },
  { keyword: "initial necklace gold", volume: 5800, competition: "low" as const, cpc: "$0.60", trend: "+10%" },
  { keyword: "engraved necklace for mom", volume: 4200, competition: "low" as const, cpc: "$0.50", trend: "+35%" },
  { keyword: "minimalist name jewelry", volume: 3600, competition: "low" as const, cpc: "$0.45", trend: "+42%" },
];

export default function KeywordGeneratorPage() {
  const [seed, setSeed] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedKws, setSelectedKws] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); if (seed.trim()) setHasSearched(true); };
  const toggleKw = (kw: string) => setSelectedKws(prev => prev.includes(kw) ? prev.filter(k => k !== kw) : [...prev, kw]);
  const copyKws = () => { navigator.clipboard.writeText(selectedKws.join(", ")); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <ToolPageLayout title="Keyword Generator" prefix="" description="Find related keywords for any seed term. See search volume, competition, and trends to discover the best keywords for your listings.">
      <form onSubmit={handleSearch} className="mb-8">
        <label className="text-xs font-semibold uppercase tracking-wider text-text-primary mb-1.5 flex items-center gap-1">Seed keyword <span className="text-danger text-xs font-normal">(required)</span></label>
        <div className="flex gap-3">
          <div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" /><input type="text" value={seed} onChange={e => setSeed(e.target.value)} placeholder="e.g. personalized necklace" className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:border-teal bg-white" /></div>
          <button type="submit" className="px-8 py-2.5 rounded-lg text-sm font-semibold text-white hover:opacity-90" style={{ background: "var(--navy)" }}>Search</button>
        </div>
      </form>
      {hasSearched && (
        <div className="animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-text-primary">Related Keywords ({MOCK_KEYWORDS.length})</h3>
            <button onClick={copyKws} disabled={!selectedKws.length} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-all" style={{ background: "var(--navy)" }}>
              {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Selected ({selectedKws.length})</>}
            </button>
          </div>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-border-light bg-bg-page/50">
                  <th className="w-10 px-4 py-3" />
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Keyword</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Volume</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Competition</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">CPC</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Trend</th>
                </tr></thead>
                <tbody>
                  {MOCK_KEYWORDS.map(kw => (
                    <tr key={kw.keyword} className="border-b border-border-light hover:bg-bg-page/50 transition-colors cursor-pointer" onClick={() => toggleKw(kw.keyword)}>
                      <td className="px-4 py-3"><input type="checkbox" checked={selectedKws.includes(kw.keyword)} onChange={() => toggleKw(kw.keyword)} className="w-4 h-4 rounded accent-teal cursor-pointer" /></td>
                      <td className="px-4 py-3 text-sm font-medium text-text-primary">{kw.keyword}</td>
                      <td className="px-4 py-3 text-sm text-right text-text-primary">{kw.volume.toLocaleString()}</td>
                      <td className="px-4 py-3"><Badge level={kw.competition} /></td>
                      <td className="px-4 py-3 text-sm text-right text-text-secondary">{kw.cpc}</td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-success">{kw.trend}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </ToolPageLayout>
  );
}
