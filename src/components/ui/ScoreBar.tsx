"use client";

import React from "react";

interface ScoreBarProps {
  label: string;
  score: number;
  maxScore?: number;
  showScore?: boolean;
}

export default function ScoreBar({
  label,
  score,
  maxScore = 100,
  showScore = true,
}: ScoreBarProps) {
  const percentage = Math.min((score / maxScore) * 100, 100);
  const level =
    percentage >= 70 ? "high" : percentage >= 40 ? "medium" : "low";

  const colorMap = {
    high: "var(--score-high)",
    medium: "var(--score-medium)",
    low: "var(--score-low)",
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-text-primary">{label}</span>
        {showScore && (
          <span
            className="text-sm font-bold"
            style={{ color: colorMap[level] }}
          >
            {score}/{maxScore}
          </span>
        )}
      </div>
      <div className="score-bar">
        <div
          className="score-bar-fill"
          style={{
            width: `${percentage}%`,
            background: colorMap[level],
          }}
        />
      </div>
    </div>
  );
}
