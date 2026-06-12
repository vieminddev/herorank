"use client";
import React, { useState } from "react";
import ToolPageLayout from "@/components/tools/ToolPageLayout";
import { Upload, Sparkles, Image as ImageIcon } from "lucide-react";

export default function ListingStudioPage() {
  const [uploaded, setUploaded] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handleUpload = () => setUploaded(true);
  const handleGenerate = () => { setGenerating(true); setTimeout(() => { setGenerating(false); setGenerated(true); }, 2000); };

  return (
    <ToolPageLayout title="Listing Studio" description="Upload product photos and let AI create a complete Etsy listing — title, tags, description, and more — in seconds.">
      <div className="card p-6 mb-6">
        <h3 className="text-base font-bold text-text-primary mb-4">Upload Product Photos</h3>
        <div onClick={handleUpload} className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-teal hover:bg-teal/5 transition-all">
          <Upload size={40} className="mx-auto text-text-muted mb-3" />
          <p className="text-sm text-text-primary font-medium">Upload product images</p>
          <p className="text-xs text-text-muted mt-1">We&apos;ll analyze your product and generate a full listing.</p>
        </div>
        {uploaded && (
          <div className="mt-4 animate-fade-in">
            <div className="flex gap-3 pb-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-24 h-24 rounded-lg bg-gradient-to-br from-bg-page to-border flex items-center justify-center flex-shrink-0 border border-border">
                  <ImageIcon size={20} className="text-text-muted" />
                </div>
              ))}
            </div>
            <button onClick={handleGenerate} disabled={generating} className="mt-4 px-8 py-2.5 rounded-lg text-sm font-semibold text-white flex items-center gap-2 hover:opacity-90 disabled:opacity-50" style={{ background: "var(--navy)" }}>
              {generating ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Analyzing...</> : <><Sparkles size={14} /> Generate Listing</>}
            </button>
          </div>
        )}
      </div>
      {generated && (
        <div className="space-y-4 animate-fade-in">
          <div className="card p-6">
            <h3 className="text-sm font-bold text-text-primary mb-2">Generated Title</h3>
            <p className="text-base text-text-primary font-medium">Handmade Gold Necklace • Personalized Name Pendant • Birthday Gift for Her • Dainty Minimalist Jewelry</p>
          </div>
          <div className="card p-6">
            <h3 className="text-sm font-bold text-text-primary mb-2">Generated Tags</h3>
            <div className="flex flex-wrap gap-2">
              {["personalized necklace", "custom name jewelry", "birthday gift", "bridesmaid gift", "dainty necklace", "gold pendant", "minimalist jewelry", "gift for her", "handmade jewelry", "name necklace", "custom gift", "mothers day", "anniversary gift"].map(tag => (
                <span key={tag} className="px-3 py-1 bg-bg-page rounded-full text-xs font-medium text-text-primary border border-border">{tag}</span>
              ))}
            </div>
          </div>
          <div className="card p-6">
            <h3 className="text-sm font-bold text-text-primary mb-2">Generated Description</h3>
            <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">{`✨ Handmade Personalized Name Necklace ✨

Make every moment special with our dainty gold name necklace. Each piece is handcrafted to perfection and makes the ideal gift for birthdays, bridesmaids, and every celebration in between.

🎁 Perfect for: Birthday gifts, bridesmaid proposals, Mother's Day, anniversaries
📐 Material: 18K Gold Plated Sterling Silver
📦 Free gift-ready packaging included`}</p>
          </div>
        </div>
      )}
    </ToolPageLayout>
  );
}
