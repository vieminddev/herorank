"use client";
import React, { useState } from "react";
import ToolPageLayout from "@/components/tools/ToolPageLayout";
import { Copy, Check, Sparkles } from "lucide-react";

const MOCK_TITLES = [
  { title: "Personalized Name Necklace • Custom Gold Name Jewelry • Birthday Gift for Her • Dainty Minimalist Pendant", score: 95, chars: 98 },
  { title: "Custom Name Necklace | Personalized Jewelry Gift | Bridesmaid Proposal | Mother's Day Gift for Mom", score: 92, chars: 96 },
  { title: "Dainty Name Necklace - Personalized Gift for Women - Custom Minimalist Jewelry - Christmas Gift Idea", score: 88, chars: 99 },
  { title: "Personalized Jewelry • Custom Name Pendant Necklace • Gift for Her • Birthday Anniversary Wedding", score: 85, chars: 95 },
  { title: "Custom Gold Name Necklace for Women, Personalized Dainty Jewelry, Birthday Gift, Bridesmaid Gift", score: 82, chars: 94 },
];

export default function TitleGeneratorPage() {
  const [description, setDescription] = useState("");
  const [hasGenerated, setHasGenerated] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const handleGenerate = (e: React.FormEvent) => { e.preventDefault(); if (description.trim()) setHasGenerated(true); };
  const copyTitle = (title: string, idx: number) => { navigator.clipboard.writeText(title); setCopiedIdx(idx); setTimeout(() => setCopiedIdx(null), 2000); };

  return (
    <ToolPageLayout title="Title Generator" description="Generate SEO-optimized Etsy listing titles that rank higher and convert better. Describe your product and let AI do the rest.">
      <form onSubmit={handleGenerate} className="mb-8">
        <label className="text-xs font-semibold uppercase tracking-wider text-text-primary mb-1.5 flex items-center gap-1">Describe your product <span className="text-danger text-xs font-normal">(required)</span></label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. A dainty gold-plated necklace with a custom name pendant, perfect for birthdays and bridesmaid gifts..." rows={3} className="w-full px-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:border-teal focus:ring-1 focus:ring-teal/20 bg-white resize-none" />
        <button type="submit" className="mt-3 px-8 py-2.5 rounded-lg text-sm font-semibold text-white flex items-center gap-2 hover:opacity-90" style={{ background: "var(--navy)" }}><Sparkles size={14} /> Generate Titles</button>
      </form>
      {hasGenerated && (
        <div className="space-y-3 animate-fade-in">
          <h3 className="text-base font-bold text-text-primary">Generated Titles</h3>
          {MOCK_TITLES.map((item, i) => (
            <div key={i} className="card p-4 flex items-start gap-4 hover:border-teal/30 transition-all">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary font-medium leading-relaxed">{item.title}</p>
                <div className="flex items-center gap-4 mt-2">
                  <span className="text-xs text-text-muted">{item.chars} / 140 characters</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold" style={{ color: item.score >= 90 ? "var(--success)" : item.score >= 80 ? "var(--warning)" : "var(--danger)" }}>SEO: {item.score}/100</span>
                    <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${item.score}%`, background: item.score >= 90 ? "var(--success)" : item.score >= 80 ? "var(--warning)" : "var(--danger)" }} /></div>
                  </div>
                </div>
              </div>
              <button onClick={() => copyTitle(item.title, i)} className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-text-secondary hover:bg-bg-page transition-colors">
                {copiedIdx === i ? <><Check size={12} className="text-success" /> Copied</> : <><Copy size={12} /> Copy</>}
              </button>
            </div>
          ))}
        </div>
      )}
    </ToolPageLayout>
  );
}
