"use client";
import React, { useState } from "react";
import Link from "next/link";
import { Layers, Check, X } from "lucide-react";

type BillingPeriod = "monthly" | "yearly";

const PLANS = [
  {
    name: "Side Hustle",
    monthlyPrice: 7.99,
    yearlyPrice: 5.99,
    yearlyBilled: 71.88,
    description: "Perfect for hobbyists and sellers just getting started.",
    features: ["3 linked shops", "25/day on most tools", "Customer Support", "Etsy Trends", "Niche Finder"],
    popular: false,
  },
  {
    name: "Business",
    monthlyPrice: 12.99,
    yearlyPrice: 9.99,
    yearlyBilled: 119.88,
    description: "For growing shops that need more power and flexibility.",
    features: ["10 linked shops", "100/day on most tools", "All tools unlocked", "HeroRank AI", "Customer Support"],
    popular: true,
  },
  {
    name: "Enterprise",
    monthlyPrice: 49.99,
    yearlyPrice: 29.99,
    yearlyBilled: 359.88,
    description: "For teams and power sellers who need maximum capacity.",
    features: ["25 linked shops", "300/day on most tools", "All tools unlocked", "HeroRank AI", "Customer Support"],
    popular: false,
  },
];

const COMPARISON = [
  { feature: "Linked Shops", free: "1", side: "3", business: "10", enterprise: "25" },
  { feature: "Best Sellers", free: true, side: true, business: true, enterprise: true },
  { feature: "Etsy Trends", free: true, side: true, business: true, enterprise: true },
  { feature: "Niche Finder", free: true, side: true, business: true, enterprise: true },
  { feature: "Shop Analyzer", free: "3/day", side: "25/day", business: "100/day", enterprise: "300/day" },
  { feature: "Listing Analyzer", free: "3/day", side: "25/day", business: "100/day", enterprise: "300/day" },
  { feature: "AI Review Summaries", free: true, side: true, business: true, enterprise: true },
  { feature: "Buyer Check", free: "3/day", side: "100/day", business: "100/day", enterprise: "300/day" },
  { feature: "Rank Check", free: "3/day", side: "25/day", business: "100/day", enterprise: "300/day" },
  { feature: "Profit Calculator", free: true, side: true, business: true, enterprise: true },
  { feature: "Tag Generator", free: "3/day", side: "25/day", business: "100/day", enterprise: "300/day" },
  { feature: "Title Generator", free: "3/day", side: "25/day", business: "100/day", enterprise: "300/day" },
  { feature: "Description Generator", free: "3/day", side: "3/day", business: "50/day", enterprise: "100/day" },
  { feature: "Listing Studio", free: "3/day", side: "3/day", business: "75/day", enterprise: "200/day" },
  { feature: "Video Generator", free: "3/day", side: "25/day", business: "300/day", enterprise: "300/day" },
  { feature: "HeroRank AI", free: false, side: false, business: "50/day", enterprise: "100/day" },
  { feature: "Keyword Generator", free: "3/day", side: "25/day", business: "100/day", enterprise: "300/day" },
  { feature: "Support", free: true, side: true, business: true, enterprise: true },
];

const FAQS = [
  { q: "Can I change plans anytime?", a: "Yes! You can upgrade, downgrade, or cancel your subscription at any time. Changes take effect immediately for upgrades, or at the end of your billing period for downgrades and cancellations." },
  { q: "What happens when I hit my daily limit?", a: "You'll see a friendly reminder that you've reached your limit for the day. Your limits reset at midnight Central time. If you consistently need more, consider upgrading to a higher plan." },
  { q: "Is there a free trial?", a: "We offer a generous free tier that lets you use almost all tools with 3 uses per day. This gives you unlimited time to explore HeroRank before deciding to upgrade." },
  { q: "What payment methods do you accept?", a: "We accept all major credit cards (Visa, Mastercard, American Express) through our secure payment processor, Stripe. Your payment information is never stored on our servers." },
  { q: "Can I get a refund?", a: "We want you to love using HeroRank. Because our tools provide instant access to premium data and resources, subscriptions are generally non-refundable. However, if you experience an issue, please reach out within the first 7 days." },
];

export default function PricingPage() {
  const [billing, setBilling] = useState<BillingPeriod>("yearly");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const cellValue = (val: string | boolean) => {
    if (val === true) return <Check size={16} className="text-success mx-auto" />;
    if (val === false) return <X size={16} className="text-border mx-auto" />;
    return <span className="text-sm text-text-primary">{val}</span>;
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-border/50">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange to-orange/80 flex items-center justify-center"><Layers size={18} className="text-white" /></div>
            <span className="text-xl font-bold text-navy">HeroRank</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/auth/login" className="px-4 py-2 text-sm font-medium text-text-primary hover:text-teal transition-colors">Log in</Link>
            <Link href="/auth/signup" className="px-5 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90" style={{ background: "var(--navy)" }}>Start Free</Link>
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="pt-32 pb-12 px-6 text-center">
        <h1 className="text-4xl font-bold text-navy mb-2">Choose your plan</h1>
        <p className="text-text-secondary">Simple pricing for Etsy sellers at every stage. Upgrade, downgrade, or cancel anytime.</p>
        <div className="flex items-center justify-center gap-2 mt-6 bg-bg-page rounded-xl p-1 w-fit mx-auto">
          <button onClick={() => setBilling("monthly")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${billing === "monthly" ? "bg-white shadow-sm text-text-primary" : "text-text-muted"}`}>Monthly</button>
          <button onClick={() => setBilling("yearly")} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${billing === "yearly" ? "bg-white shadow-sm text-text-primary" : "text-text-muted"}`}>
            Yearly <span className="text-[10px] font-semibold text-success bg-success/10 px-1.5 py-0.5 rounded">Save 25%</span>
          </button>
        </div>
      </section>

      {/* Plans */}
      <section className="pb-16 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6" id="pricing-cards">
          {PLANS.map(plan => (
            <div key={plan.name} className={`rounded-2xl p-6 ${plan.popular ? "border-2 border-teal relative shadow-lg" : "border border-border"}`}>
              {plan.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-teal text-white text-xs font-semibold rounded-full">Most Popular</span>}
              <h3 className="text-lg font-bold text-text-primary mb-1">{plan.name}</h3>
              <div className="mb-1">
                {billing === "yearly" && <span className="text-lg text-text-muted line-through mr-2">${plan.monthlyPrice}</span>}
                <span className="text-3xl font-bold text-navy">${billing === "yearly" ? plan.yearlyPrice : plan.monthlyPrice}</span>
                <span className="text-sm text-text-muted">/month</span>
              </div>
              {billing === "yearly" && <p className="text-xs text-text-muted mb-3">${plan.yearlyBilled} billed yearly</p>}
              <p className="text-sm text-text-secondary mb-5">{plan.description}</p>
              <ul className="space-y-2 mb-6">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-text-primary"><Check size={14} className="text-success flex-shrink-0" /> {f}</li>
                ))}
              </ul>
              <Link href="/auth/signup" className={`block w-full py-2.5 rounded-lg text-sm font-semibold text-center transition-all ${plan.popular ? "text-white hover:opacity-90" : "text-navy border-2 border-navy hover:bg-navy/5"}`} style={plan.popular ? { background: "var(--navy)" } : {}}>
                Get {plan.name}
              </Link>
            </div>
          ))}
        </div>
        <p className="text-center text-sm text-text-muted mt-6">
          Not ready to commit? <Link href="/auth/signup" className="text-teal font-semibold hover:underline">Start free</Link> with 3 daily uses per tool.
        </p>
      </section>

      {/* Comparison */}
      <section className="pb-16 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-navy text-center mb-2">Compare plans</h2>
          <p className="text-text-secondary text-center mb-8">HeroRank makes SEO accessible for every Etsy seller, not just big shops or big budgets.</p>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full">
              <thead><tr className="bg-bg-page border-b border-border">
                <th className="text-left px-4 py-3 text-sm font-semibold text-text-primary min-w-[180px]">Feature</th>
                <th className="text-center px-4 py-3 text-sm font-semibold text-text-primary">Free</th>
                <th className="text-center px-4 py-3 text-sm font-semibold text-text-primary">Side Hustle</th>
                <th className="text-center px-4 py-3 text-sm font-semibold text-teal">Business</th>
                <th className="text-center px-4 py-3 text-sm font-semibold text-text-primary">Enterprise</th>
              </tr></thead>
              <tbody>
                {COMPARISON.map(row => (
                  <tr key={row.feature} className="border-b border-border-light hover:bg-bg-page/50">
                    <td className="px-4 py-2.5 text-sm text-text-primary font-medium">{row.feature}</td>
                    <td className="px-4 py-2.5 text-center">{cellValue(row.free)}</td>
                    <td className="px-4 py-2.5 text-center">{cellValue(row.side)}</td>
                    <td className="px-4 py-2.5 text-center bg-teal/5">{cellValue(row.business)}</td>
                    <td className="px-4 py-2.5 text-center">{cellValue(row.enterprise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="pb-20 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-navy text-center mb-8">Questions? Answers.</h2>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div key={i} className="border border-border rounded-xl overflow-hidden">
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full text-left px-5 py-4 text-sm font-semibold text-text-primary flex items-center justify-between hover:bg-bg-page/50 transition-colors">
                  {faq.q}
                  <span className="text-text-muted text-lg">{openFaq === i ? "−" : "+"}</span>
                </button>
                {openFaq === i && <div className="px-5 pb-4 text-sm text-text-secondary leading-relaxed animate-fade-in">{faq.a}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-6 bg-bg-page">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-navy mb-4">Ready to grow your shop?</h2>
          <p className="text-text-secondary mb-6">Join 500,000+ Etsy sellers using HeroRank to get discovered.</p>
          <Link href="/pricing#pricing-cards" className="text-sm text-teal font-semibold hover:underline">Compare plans ↑</Link>
        </div>
      </section>
    </div>
  );
}
