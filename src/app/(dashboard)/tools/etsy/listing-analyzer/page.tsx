"use client";

import React, { useState } from "react";
import ToolPageLayout from "@/components/tools/ToolPageLayout";
import StatCard from "@/components/ui/StatCard";
import ScoreBar from "@/components/ui/ScoreBar";
import { Search, ExternalLink, Star, ChevronDown, ChevronUp, CheckCircle, XCircle, AlertCircle } from "lucide-react";

const MOCK_LISTING = {
  title: 'KIT-836 WEEKLY || "Class Time" - Weekly Kit Planner Stickers',
  shop: "PlannerKate1",
  price: "$3.00",
  rating: 0,
  numRatings: 0,
  date: "May 25, 2026",
  scores: {
    title: { score: 100, feedback: {
      clarity: [
        { status: "good", text: "No heavily repeated words in the title. Great job!" },
        { status: "good", text: "The title length is within the recommended range for clarity and scannability. Good job!" },
        { status: "good", text: "The average word length in the title is 5.8 characters, which is comfortable for reading." },
        { status: "good", text: "The use of capitalization in the title is within a reasonable range." },
        { status: "good", text: "The title uses a consistent delimiter style, enhancing readability." },
        { status: "good", text: "No emoji or decorative symbols detected in the title. Good job!" },
      ],
      seo: [
        { status: "good", text: "The title has a good variety of unique words, enhancing searchability." },
        { status: "good", text: "The title length and word count are within the recommended range for searchability. Good job!" },
        { status: "good", text: 'The title includes 1 tag(s): Planner Stickers. This helps improve searchability.' },
      ],
    }},
    tags: { score: 90, feedback: {
      clarity: [
        { status: "good", text: "Tags are relevant and descriptive." },
        { status: "warning", text: "Consider adding more long-tail keywords for better targeting." },
      ],
      seo: [
        { status: "good", text: "Good mix of broad and specific tags." },
      ],
    }},
    images: { score: 77, feedback: {
      clarity: [
        { status: "good", text: "Multiple product images provided." },
        { status: "warning", text: "Consider adding lifestyle/mockup images to show the product in use." },
        { status: "error", text: "Main image could benefit from better contrast." },
      ],
      seo: [],
    }},
    video: { score: 0, feedback: {
      clarity: [
        { status: "error", text: "No video attached to this listing." },
        { status: "warning", text: "Listings with video receive 40% more views on average." },
      ],
      seo: [],
    }},
    description: { score: 100, feedback: {
      clarity: [
        { status: "good", text: "Description is well-structured with clear sections." },
        { status: "good", text: "Good use of bullet points for readability." },
      ],
      seo: [
        { status: "good", text: "Description includes relevant keywords." },
      ],
    }},
  },
  stats: {
    estimatedSales: 3,
    estimatedRevenue: "$9.00",
    faves: 1,
    views: 60,
  },
};

type ScoreKey = "title" | "tags" | "images" | "video" | "description";

export default function ListingAnalyzerPage() {
  const [listingInput, setListingInput] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [expandedScore, setExpandedScore] = useState<ScoreKey | null>(null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (listingInput.trim()) setHasSearched(true);
  };

  const listing = MOCK_LISTING;

  const statusIcon = (status: string) => {
    if (status === "good") return <CheckCircle size={12} className="text-success flex-shrink-0" />;
    if (status === "warning") return <AlertCircle size={12} className="text-warning flex-shrink-0" />;
    return <XCircle size={12} className="text-danger flex-shrink-0" />;
  };

  return (
    <ToolPageLayout
      title="Listing Analyzer"
      description="Get instant feedback on any Etsy listing and clear fixes to improve visibility. Paste a listing URL or ID to start."
    >
      {/* Search */}
      <form onSubmit={handleSearch} className="mb-8">
        <label className="text-xs font-semibold uppercase tracking-wider text-text-primary mb-1.5 flex items-center gap-1">
          Listing URL or ID
          <span className="text-danger text-xs font-normal">(required)</span>
        </label>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={listingInput}
              onChange={(e) => setListingInput(e.target.value)}
              placeholder="e.g. 4511075902"
              className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:border-teal focus:ring-1 focus:ring-teal/20 bg-white"
            />
          </div>
          <button
            type="submit"
            className="px-8 py-2.5 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-all"
            style={{ background: "var(--navy)" }}
          >
            Analyze
          </button>
        </div>
      </form>

      {hasSearched && (
        <div className="animate-fade-in">
          {/* Listing Header */}
          <div className="card p-6 mb-6">
            <div className="flex flex-col md:flex-row gap-6">
              {/* Image placeholder */}
              <div className="w-full md:w-64 h-64 rounded-lg bg-gradient-to-br from-bg-page to-border flex items-center justify-center flex-shrink-0">
                <span className="text-text-muted text-xs">Product Image</span>
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-text-primary mb-1 leading-snug">
                  {listing.title}
                </h2>
                <a href="#" className="text-sm text-teal hover:underline">
                  {listing.shop}
                </a>

                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <span className="text-lg font-bold text-text-primary">
                    {listing.price}
                  </span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        size={12}
                        className={s <= listing.rating ? "text-warning fill-warning" : "text-border"}
                      />
                    ))}
                    <span className="text-xs text-text-muted">
                      {listing.rating} ({listing.numRatings})
                    </span>
                  </div>
                  <span className="text-xs text-text-muted">📅 {listing.date}</span>
                  <a
                    href="#"
                    className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary border border-border rounded px-2 py-1"
                  >
                    <ExternalLink size={10} /> View on Etsy
                  </a>
                </div>

                {/* Score Summary Bars */}
                <div className="mt-4 space-y-2">
                  {(Object.keys(listing.scores) as ScoreKey[]).map((key) => (
                    <ScoreBar key={key} label={key.charAt(0).toUpperCase() + key.slice(1)} score={listing.scores[key].score} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <StatCard label="Estimated Sales" value={listing.stats.estimatedSales} subtitle="0.2 per day" />
            <StatCard label="Estimated Revenue" value={listing.stats.estimatedRevenue} subtitle="0.53 per day" />
            <StatCard label="Faves" value={listing.stats.faves} subtitle="0.1 per day" />
            <StatCard label="Views" value={listing.stats.views} subtitle="3.5 per day" />
          </div>

          {/* Detailed Score Sections */}
          <div className="space-y-3">
            {(Object.keys(listing.scores) as ScoreKey[]).map((key) => {
              const scoreData = listing.scores[key];
              const isExpanded = expandedScore === key;
              const label = key.charAt(0).toUpperCase() + key.slice(1);

              return (
                <div key={key} className="card overflow-hidden">
                  <button
                    onClick={() => setExpandedScore(isExpanded ? null : key)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-bg-page/50 transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <span className="text-sm font-bold text-text-primary">{label}</span>
                      <div className="flex-1 max-w-md">
                        <div className="score-bar">
                          <div
                            className="score-bar-fill"
                            style={{
                              width: `${scoreData.score}%`,
                              background: scoreData.score >= 70 ? "var(--score-high)" : scoreData.score >= 40 ? "var(--score-medium)" : "var(--score-low)",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className="text-sm font-bold"
                        style={{
                          color: scoreData.score >= 70 ? "var(--score-high)" : scoreData.score >= 40 ? "var(--score-medium)" : "var(--score-low)",
                        }}
                      >
                        {scoreData.score}/100
                      </span>
                      {isExpanded ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-5 animate-fade-in">
                      <div className="border-t border-border-light pt-4">
                        {scoreData.feedback.clarity.length > 0 && (
                          <div className="mb-4">
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-text-primary mb-2 flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-success" />
                              Clarity
                            </h4>
                            <ul className="space-y-1.5">
                              {scoreData.feedback.clarity.map((item, i) => (
                                <li key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                                  {statusIcon(item.status)}
                                  <span>{item.text}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {scoreData.feedback.seo.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-text-primary mb-2 flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-teal" />
                              SEO
                            </h4>
                            <ul className="space-y-1.5">
                              {scoreData.feedback.seo.map((item, i) => (
                                <li key={i} className="flex items-start gap-2 text-xs text-text-secondary">
                                  {statusIcon(item.status)}
                                  <span>{item.text}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </ToolPageLayout>
  );
}
