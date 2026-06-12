"use client";
import React, { useState } from "react";
import ToolPageLayout from "@/components/tools/ToolPageLayout";
import { Copy, Check, Sparkles } from "lucide-react";

const MOCK_DESCRIPTION = `✨ PERSONALIZED NAME NECKLACE - CUSTOM GOLD JEWELRY ✨

Make every day special with our stunning personalized name necklace. Handcrafted with love, this dainty piece is the perfect way to keep your name or a loved one's close to your heart.

🎁 PERFECT GIFT FOR:
• Birthday gifts for her
• Bridesmaid proposal gifts
• Mother's Day
• Anniversary celebrations
• Christmas & Valentine's Day

📐 PRODUCT DETAILS:
• Material: 18K Gold Plated / Sterling Silver / Rose Gold
• Chain Length: 16" - 20" (adjustable)
• Pendant Size: Custom based on name length
• Closure: Lobster clasp
• Packaging: Gift-ready box included

💎 QUALITY GUARANTEE:
• Hypoallergenic & tarnish-resistant
• Nickel-free and lead-free
• 30-day money-back guarantee
• Handmade with premium materials

📦 SHIPPING & PROCESSING:
• Processing time: 1-3 business days
• Standard shipping: 5-10 business days
• Express shipping available at checkout

⭐ HOW TO ORDER:
1. Select your preferred material
2. Choose your chain length
3. Enter the custom name in the personalization box
4. Add to cart and checkout!

💬 NEED HELP?
Feel free to message us with any questions about customization, sizing, or bulk orders. We're happy to help!

Tags: personalized necklace, custom name jewelry, birthday gift, bridesmaid gift, mothers day, dainty necklace, gold necklace, minimalist jewelry`;

export default function DescriptionGeneratorPage() {
  const [productInfo, setProductInfo] = useState("");
  const [hasGenerated, setHasGenerated] = useState(false);
  const [copied, setCopied] = useState(false);
  const handleGenerate = (e: React.FormEvent) => { e.preventDefault(); if (productInfo.trim()) setHasGenerated(true); };
  const copyDesc = () => { navigator.clipboard.writeText(MOCK_DESCRIPTION); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <ToolPageLayout title="Description Generator" description="Generate compelling, SEO-friendly Etsy listing descriptions. Describe your product and get a ready-to-paste description with all the right keywords.">
      <form onSubmit={handleGenerate} className="mb-8">
        <label className="text-xs font-semibold uppercase tracking-wider text-text-primary mb-1.5 flex items-center gap-1">Product details <span className="text-danger text-xs font-normal">(required)</span></label>
        <textarea value={productInfo} onChange={e => setProductInfo(e.target.value)} placeholder="Describe your product: what it is, materials, colors, sizes, who it's for, what makes it special..." rows={4} className="w-full px-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:border-teal focus:ring-1 focus:ring-teal/20 bg-white resize-none" />
        <button type="submit" className="mt-3 px-8 py-2.5 rounded-lg text-sm font-semibold text-white flex items-center gap-2 hover:opacity-90" style={{ background: "var(--navy)" }}><Sparkles size={14} /> Generate Description</button>
      </form>
      {hasGenerated && (
        <div className="animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-text-primary">Generated Description</h3>
            <button onClick={copyDesc} className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-sm font-medium text-text-secondary hover:bg-bg-page transition-colors">
              {copied ? <><Check size={14} className="text-success" /> Copied!</> : <><Copy size={14} /> Copy Description</>}
            </button>
          </div>
          <div className="card p-6">
            <pre className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed font-sans">{MOCK_DESCRIPTION}</pre>
          </div>
        </div>
      )}
    </ToolPageLayout>
  );
}
