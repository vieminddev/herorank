"use client";

import React from "react";

type BadgeLevel = "high" | "medium" | "low" | "nodata";

interface BadgeProps {
  level: BadgeLevel;
  label?: string;
}

const defaultLabels: Record<BadgeLevel, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  nodata: "No Data",
};

export default function Badge({ level, label }: BadgeProps) {
  return (
    <span className={`badge badge-${level}`}>
      {label || defaultLabels[level]}
    </span>
  );
}
