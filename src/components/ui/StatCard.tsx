"use client";

import React from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  className?: string;
}

export default function StatCard({
  label,
  value,
  subtitle,
  className = "",
}: StatCardProps) {
  return (
    <div className={`card px-5 py-4 ${className}`}>
      <div
        className="text-xs font-semibold uppercase tracking-wider mb-2"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </div>
      <div
        className="text-2xl font-bold"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </div>
      {subtitle && (
        <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}
