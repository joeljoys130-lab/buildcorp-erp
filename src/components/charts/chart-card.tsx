"use client";

import React, { useState, useEffect } from "react";
import { BarChart3, AlertCircle } from "lucide-react";

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  loading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  error?: string | null;
  height?: number | string;
  headerAction?: React.ReactNode;
  className?: string;
  printHidden?: boolean;
}

export const ChartCard: React.FC<ChartCardProps> = ({
  title,
  subtitle,
  children,
  loading = false,
  isEmpty = false,
  emptyMessage = "No data available yet.",
  error = null,
  height = 260,
  headerAction,
  className = "",
  printHidden = true,
}) => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const minHeightPx = typeof height === "number" ? `${height}px` : height;

  return (
    <div
      className={`border border-neutral-200 bg-white p-4 sm:p-5 rounded flex flex-col justify-between transition-colors min-w-0 ${
        printHidden ? "print:hidden" : ""
      } ${className}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider flex items-center gap-1.5 truncate">
            <BarChart3 className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
            <span className="truncate">{title}</span>
          </div>
          {subtitle && (
            <p className="text-[11px] text-neutral-500 mt-0.5 leading-tight">{subtitle}</p>
          )}
        </div>
        {headerAction && <div className="shrink-0">{headerAction}</div>}
      </div>

      {/* Body / Chart Area - min-w-0 ensures no flexbox collapse on mobile */}
      <div
        className="w-full min-w-0 relative flex-1"
        style={{ minHeight: minHeightPx }}
      >
        {!isMounted || loading ? (
          <div
            className="w-full flex flex-col items-center justify-center text-neutral-400 gap-2 py-8"
            style={{ minHeight: minHeightPx }}
          >
            <div className="w-6 h-6 border-2 border-neutral-300 border-t-black rounded-full animate-spin" />
            <span className="text-[11px] font-medium tracking-wide">
              {loading ? "Loading financial data..." : "Preparing visualization..."}
            </span>
          </div>
        ) : error ? (
          <div
            className="w-full flex flex-col items-center justify-center text-red-500 gap-1.5 p-4 text-center py-8"
            style={{ minHeight: minHeightPx }}
          >
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="text-xs font-semibold">Unable to load chart data</span>
            <span className="text-[10px] text-neutral-400">{error}</span>
          </div>
        ) : isEmpty ? (
          <div
            className="w-full flex flex-col items-center justify-center text-neutral-400 gap-1.5 p-4 text-center py-8"
            style={{ minHeight: minHeightPx }}
          >
            <BarChart3 className="w-6 h-6 text-neutral-300 stroke-[1.5]" />
            <span className="text-xs font-medium text-neutral-500">{emptyMessage}</span>
          </div>
        ) : (
          <div className="w-full min-w-0 relative" style={{ minHeight: minHeightPx }}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
};
