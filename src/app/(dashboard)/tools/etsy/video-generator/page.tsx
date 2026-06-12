"use client";
import React, { useState } from "react";
import ToolPageLayout from "@/components/tools/ToolPageLayout";
import { Upload, Play, Download, Image as ImageIcon } from "lucide-react";

export default function VideoGeneratorPage() {
  const [uploaded, setUploaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  const handleUpload = () => { setUploaded(true); };
  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => { setGenerating(false); setGenerated(true); }, 2000);
  };

  return (
    <ToolPageLayout title="Video Generator" description="Build Etsy-ready slideshow videos from product photos. Upload images and we'll create a professional video preview for your listing.">
      {/* Upload Section */}
      <div className="card p-6 mb-6">
        <h3 className="text-base font-bold text-text-primary mb-4">Upload Product Photos</h3>
        <div
          onClick={handleUpload}
          className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-teal hover:bg-teal/5 transition-all"
        >
          <Upload size={40} className="mx-auto text-text-muted mb-3" />
          <p className="text-sm text-text-primary font-medium">Click to upload or drag & drop</p>
          <p className="text-xs text-text-muted mt-1">PNG, JPG, WEBP up to 10MB each. Maximum 10 images.</p>
        </div>
        {uploaded && (
          <div className="mt-4 animate-fade-in">
            <div className="flex gap-3 overflow-x-auto pb-2">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="w-24 h-24 rounded-lg bg-gradient-to-br from-bg-page to-border flex items-center justify-center flex-shrink-0 border border-border">
                  <ImageIcon size={20} className="text-text-muted" />
                </div>
              ))}
            </div>
            <p className="text-xs text-text-muted mt-2">4 images uploaded</p>
          </div>
        )}
      </div>

      {/* Settings */}
      {uploaded && (
        <div className="card p-6 mb-6 animate-fade-in">
          <h3 className="text-base font-bold text-text-primary mb-4">Video Settings</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">Duration per slide</label>
              <select className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white">
                <option>2 seconds</option>
                <option>3 seconds</option>
                <option>4 seconds</option>
                <option>5 seconds</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">Transition</label>
              <select className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white">
                <option>Fade</option>
                <option>Slide</option>
                <option>Zoom</option>
                <option>None</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1 block">Aspect Ratio</label>
              <select className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white">
                <option>1:1 (Square)</option>
                <option>16:9 (Landscape)</option>
                <option>9:16 (Portrait)</option>
                <option>4:5 (Instagram)</option>
              </select>
            </div>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="mt-4 px-8 py-2.5 rounded-lg text-sm font-semibold text-white flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--navy)" }}
          >
            {generating ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generating...</>
            ) : (
              <><Play size={14} /> Generate Video</>
            )}
          </button>
        </div>
      )}

      {/* Result */}
      {generated && (
        <div className="card p-6 animate-fade-in">
          <h3 className="text-base font-bold text-text-primary mb-4">Your Video</h3>
          <div className="aspect-video bg-navy-dark rounded-xl flex items-center justify-center mb-4">
            <div className="text-center">
              <Play size={48} className="mx-auto text-white/80 mb-2" />
              <p className="text-sm text-white/60">Video Preview</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white hover:opacity-90" style={{ background: "var(--teal)" }}>
              <Download size={14} /> Download MP4
            </button>
            <button className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium border border-border text-text-primary hover:bg-bg-page transition-colors">
              <Play size={14} /> Preview
            </button>
          </div>
        </div>
      )}
    </ToolPageLayout>
  );
}
