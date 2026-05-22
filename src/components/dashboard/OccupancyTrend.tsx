"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Lang } from "@/lib/i18n";

export interface OccupancyPoint {
  date: string; // yyyy-mm-dd
  pct: number;
  revenue: number;
}

interface Props {
  points: OccupancyPoint[];
  lang: Lang;
}

interface TooltipPayloadEntry {
  dataKey?: string;
  value?: number;
  color?: string;
}

interface TooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}

function CustomTip({ active, payload, label }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const occ = payload.find((p) => p.dataKey === "pct")?.value ?? 0;
  const rev = payload.find((p) => p.dataKey === "revenue")?.value ?? 0;
  return (
    <div style={{ background: "var(--bg-elev)", border: "1px solid var(--bd-2)", borderRadius: 6, padding: "8px 10px", fontSize: 11, boxShadow: "var(--shadow-pop)", lineHeight: 1.5 }}>
      <div style={{ color: "var(--t-3)" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 8, height: 8, background: "#4f46e5", borderRadius: 2 }} />
        <span>점유 <strong>{occ}%</strong></span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 8, height: 8, background: "#16a34a", borderRadius: 2 }} />
        <span>수익 <strong>₩{(rev / 1000).toFixed(0)}K</strong></span>
      </div>
    </div>
  );
}

export function OccupancyTrend({ points, lang }: Props) {
  const rows = points.map((p) => {
    const d = new Date(`${p.date}T00:00:00Z`);
    return {
      label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`,
      pct: p.pct,
      revenue: p.revenue,
    };
  });

  return (
    <div style={{ width: "100%", height: 200, padding: "12px 16px" }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 24, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="occ-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--bd-1)" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="label" stroke="var(--t-4)" fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis
            yAxisId="left"
            stroke="var(--t-4)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            width={32}
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="var(--t-4)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            width={42}
            tickFormatter={(v) => `${Math.round(Number(v) / 1000)}K`}
          />
          <Tooltip content={<CustomTip />} cursor={{ stroke: "var(--bd-2)", strokeDasharray: "2 4" }} />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="pct"
            name={lang === "ko" ? "점유율" : "Occupancy"}
            stroke="#4f46e5"
            strokeWidth={1.8}
            fill="url(#occ-grad)"
            isAnimationActive={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="revenue"
            name={lang === "ko" ? "수익" : "Revenue"}
            stroke="#16a34a"
            strokeWidth={1.8}
            dot={false}
            activeDot={{ r: 3, fill: "#16a34a", strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
