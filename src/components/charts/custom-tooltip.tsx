"use client";

import React from "react";

export interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  currency?: boolean;
  unit?: string;
  titlePrefix?: string;
}

export function formatINR(val: number): string {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(val);
}

export const CustomTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
  label,
  currency = true,
  unit = "",
  titlePrefix = "",
}) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="bg-black/95 text-white border border-neutral-700 p-2.5 rounded shadow-xl text-xs font-sans min-w-[140px] max-w-[260px] backdrop-blur-xs z-50 pointer-events-none select-none">
      {label && (
        <div className="font-bold text-[11px] uppercase tracking-wider text-neutral-300 pb-1.5 mb-1.5 border-b border-neutral-800 break-words">
          {titlePrefix ? `${titlePrefix}: ` : ""}
          {label}
        </div>
      )}
      <div className="space-y-1">
        {payload.map((entry, index) => {
          const val = Number(entry.value);
          const isNum = !isNaN(val);
          const formattedVal = isNum
            ? currency
              ? `₹${formatINR(val)}`
              : `${formatINR(val)}${unit ? ` ${unit}` : ""}`
            : entry.value;

          return (
            <div key={`item-${index}`} className="flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-1.5 text-neutral-300 min-w-0">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: entry.color || entry.fill || "#fff" }}
                />
                <span className="text-[11px] truncate max-w-[130px]">
                  {entry.name || "Value"}:
                </span>
              </div>
              <span className="font-mono font-bold text-white text-[11px] shrink-0">
                {formattedVal}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
