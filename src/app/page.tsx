"use client";
import React from "react";
import Link from "next/link";
import { Star, ArrowRight, Layers, BarChart3, Target, Tag, Crown, FileText, UserCheck, TrendingUp, Calculator, Type, AlignLeft, Video, Search, Wand2, MessageSquare } from "lucide-react";

const STATS = [
  { value: "500K+", label: "Sellers trust HeroRank" },
  { value: "10M+", label: "Listings optimized" },
  { value: "98%", label: "Customer satisfaction" },
  { value: "127", label: "Countries served" },
];

const TOOLS = [
  { name: "Shop Analyzer", desc: "See exactly what's lifting your shop.", href: "/tools/etsy/shop-analyzer", icon: BarChart3 },
  { name: "Etsy Trends", desc: "Track what's rising before it peaks.", href: "/tools/etsy/etsy-trends", icon: TrendingUp },
  { name: "Niche Finder", desc: "Spot underserved niches with real demand.", href: "/tools/etsy/niche-finder", icon: Target },
  { name: "Tag Generator", desc: "Uncover tags that boost visibility.", href: "/tools/etsy/tag-generator", icon: Tag },
  { name: "Best Sellers", desc: "Break down what the top shops do differently.", href: "/tools/etsy/best-sellers", icon: Crown },
  { name: "Listing Analyzer", desc: "Grade listings with a clear action plan.", href: "/tools/etsy/listing-analyzer", icon: FileText },
  { name: "Buyer Check", desc: "Know who you're selling to upfront.", href: "/tools/etsy/buyer-check", icon: UserCheck },
  { name: "Rank Check", desc: "Track where your listings show up.", href: "/tools/etsy/rank-check", icon: TrendingUp },
  { name: "Calculator", desc: "Know your margins before you list.", href: "/tools/etsy/profit-calculator", icon: Calculator },
  { name: "Title Generator", desc: "Write titles that win clicks fast.", href: "/tools/etsy/title-generator", icon: Type },
  { name: "Description Generator", desc: "Generate descriptions that sell.", href: "/tools/etsy/description-generator", icon: AlignLeft },
  { name: "Video Generator", desc: "Turn product photos into scroll-stopping videos.", href: "/tools/etsy/video-generator", icon: Video },
  { name: "Keyword Generator", desc: "Discover keywords that match buyers.", href: "/tools/keyword-generator", icon: Search },
  { name: "Listing Studio", desc: "Build complete listings from photos.", href: "/tools/etsy/listing-studio", icon: Wand2 },
  { name: "HeroRank AI", desc: "Your Etsy selling assistant.", href: "/tools/rankhero-ai", icon: MessageSquare },
];

const TESTIMONIALS = [
  { name: "Ewa B.", role: "Handmade Jewelry", text: "HeroRank made SEO finally make sense. I finally knew what to work on, and the results followed." },
  { name: "Jake D.", role: "3D Prints", text: "The tag generator alone has been worth every penny." },
  { name: "Tina L.", role: "Digital Products", text: "In your toolkit you need to have a research tool, and HeroRank is wonderful." },
  { name: "Tom L.", role: "Print on Demand", text: "Finally, an SEO tool that doesn't overwhelm me. Simple, effective, and affordable. I actually look forward to optimizing my listings now." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-border/50">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange to-orange/80 flex items-center justify-center">
              <Layers size={18} className="text-white" />
            </div>
            <span className="text-xl font-bold text-navy">HeroRank</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/auth/login" className="px-4 py-2 text-sm font-medium text-text-primary hover:text-teal transition-colors">Log in</Link>
            <Link href="/auth/signup" className="px-5 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all" style={{ background: "var(--navy)" }}>Start Free</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-navy leading-tight mb-6">
            Your Etsy work deserves<br />
            <span className="text-teal">to be discovered.</span>
          </h1>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto mb-8">
            Our creator-friendly SEO hub helps your work stand out, so you can grow your shop with confidence.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link href="/auth/signup" className="px-8 py-3 rounded-lg text-base font-semibold text-white hover:opacity-90 transition-all flex items-center gap-2" style={{ background: "var(--navy)" }}>
              Start Free <ArrowRight size={16} />
            </Link>
            <Link href="/tools/etsy/tag-generator" className="px-8 py-3 rounded-lg text-base font-semibold text-navy border-2 border-navy hover:bg-navy/5 transition-colors">
              Try Tools
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="pb-20 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          {STATS.map(s => (
            <div key={s.label} className="text-center p-6 rounded-xl bg-bg-page border border-border">
              <div className="text-3xl font-bold text-navy mb-1">{s.value}</div>
              <div className="text-sm text-text-muted">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="pb-20 px-6 bg-bg-page">
        <div className="max-w-6xl mx-auto py-16">
          <h2 className="text-3xl font-bold text-navy text-center mb-2">Built to Work Together</h2>
          <p className="text-text-secondary text-center mb-12">More views. More buyers. More time to create.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TOOLS.map(tool => (
              <Link key={tool.name} href={tool.href} className="bg-white rounded-xl p-5 border border-border hover:border-teal/30 hover:shadow-md transition-all group">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-teal/10 flex items-center justify-center group-hover:bg-teal/20 transition-colors">
                    <tool.icon size={16} className="text-teal" />
                  </div>
                  <h3 className="text-sm font-bold text-text-primary">{tool.name}</h3>
                </div>
                <p className="text-xs text-text-secondary">{tool.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {TESTIMONIALS.map(t => (
              <div key={t.name} className="p-6 rounded-xl border border-border bg-white">
                <div className="flex gap-0.5 mb-3">
                  {[1,2,3,4,5].map(s => <Star key={s} size={14} className="text-warning fill-warning" />)}
                </div>
                <p className="text-sm text-text-secondary mb-4 italic">&ldquo;{t.text}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal/20 to-teal/10 flex items-center justify-center text-sm font-bold text-teal">{t.name.charAt(0)}</div>
                  <div>
                    <div className="text-sm font-semibold text-text-primary">{t.name}</div>
                    <div className="text-xs text-text-muted">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="py-20 px-6 bg-bg-page">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-navy mb-2">Priced to grow with your shop</h2>
          <p className="text-text-secondary mb-10">HeroRank makes SEO accessible for every Etsy seller, not just big shops or big budgets.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl p-6 border border-border">
              <h3 className="text-lg font-bold text-text-primary mb-1">Free</h3>
              <div className="text-3xl font-bold text-navy mb-1">$0</div>
              <p className="text-xs text-text-muted mb-4">3 searches/day</p>
              <Link href="/auth/signup" className="block w-full py-2 rounded-lg text-sm font-semibold text-navy border-2 border-navy hover:bg-navy/5 transition-colors text-center">Get started</Link>
            </div>
            <div className="bg-white rounded-xl p-6 border-2 border-teal relative">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-teal text-white text-xs font-semibold rounded-full">Most Popular</span>
              <h3 className="text-lg font-bold text-text-primary mb-1">Business</h3>
              <div className="text-3xl font-bold text-navy mb-1">$9.99<span className="text-sm font-normal text-text-muted">/mo</span></div>
              <p className="text-xs text-text-muted mb-4">All tools unlocked</p>
              <Link href="/auth/signup" className="block w-full py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all text-center" style={{ background: "var(--navy)" }}>Get Business</Link>
            </div>
            <div className="bg-white rounded-xl p-6 border border-border">
              <h3 className="text-lg font-bold text-text-primary mb-1">Enterprise</h3>
              <div className="text-3xl font-bold text-navy mb-1">$29.99<span className="text-sm font-normal text-text-muted">/mo</span></div>
              <p className="text-xs text-text-muted mb-4">Large scale</p>
              <Link href="/auth/signup" className="block w-full py-2 rounded-lg text-sm font-semibold text-navy border-2 border-navy hover:bg-navy/5 transition-colors text-center">Get Enterprise</Link>
            </div>
          </div>
          <Link href="/pricing" className="inline-block mt-6 text-sm text-teal font-semibold hover:underline">Compare all plans →</Link>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-navy mb-4">Ready to stand out?</h2>
          <p className="text-text-secondary mb-8">Join 500,000+ Etsy sellers growing with HeroRank.</p>
          <Link href="/auth/signup" className="inline-flex items-center gap-2 px-8 py-3 rounded-lg text-base font-semibold text-white hover:opacity-90" style={{ background: "var(--navy)" }}>
            Start Free <ArrowRight size={16} />
          </Link>
          <p className="text-xs text-text-muted mt-3">No credit card required</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange to-orange/80 flex items-center justify-center"><Layers size={14} className="text-white" /></div>
            <span className="text-lg font-bold text-navy">HeroRank</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-text-muted">
            <a href="#" className="hover:text-text-primary">About</a>
            <a href="#" className="hover:text-text-primary">Blog</a>
            <a href="#" className="hover:text-text-primary">Terms</a>
            <a href="#" className="hover:text-text-primary">Privacy</a>
            <a href="#" className="hover:text-text-primary">Contact</a>
          </div>
          <p className="text-xs text-text-muted">© 2026 HeroRank. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
