"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { channelById, type ChannelId } from "@/lib/i18n";
import type { MonthlyRevenue } from "@/lib/queries";

interface TooltipPayloadEntry {
  dataKey?: string | number;
  value?: number | string;
  color?: string;
}
interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string | number;
}

const STACK_ORDER: ChannelId[] = ["airbnb", "booking", "agoda", "trip", "direct", "fb"];
const MONTH_NAMES: Record<import("@/lib/i18n").Lang, string[]> = {
  ko: ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  ja: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
  zh: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
};

interface Props {
  monthly: MonthlyRevenue[];
  lang: import("@/lib/i18n").Lang;
}

interface ChartRow {
  name: string;
  total: number;
  airbnb: number;
  booking: number;
  agoda: number;
  trip: number;
  direct: number;
  fb: number;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const total = payload.reduce((s, p) => s + (typeof p.value === "number" ? p.value : 0), 0);
  return (
    <div style={{ background: "var(--bg-elev)", border: "1px solid var(--bd-2)", borderRadius: 6, padding: "8px 10px", fontSize: 11, boxShadow: "var(--shadow-pop)" }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.slice().reverse().map((p, idx) => {
        const ch = channelById(p.dataKey as ChannelId);
        return (
          <div key={String(p.dataKey ?? idx)} style={{ display: "flex", justifyContent: "space-between", gap: 12, color: "var(--t-2)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
              {ch?.name}
            </span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>₩{(((p.value as number) ?? 0)).toFixed(1)}M</span>
          </div>
        );
      })}
      <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid var(--bd-1)", display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
        <span>Total</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>₩{total.toFixed(1)}M</span>
      </div>
    </div>
  );
}

export function RevenueBarChart({ monthly, lang }: Props) {
  const months = MONTH_NAMES[lang];
  const rows: ChartRow[] = monthly.map((m) => {
    const month = parseInt(m.ym.slice(5, 7), 10);
    return {
      name: months[month - 1],
      total: m.total / 1_000_000,
      airbnb: (m.byChannel.airbnb ?? 0) / 1_000_000,
      booking: (m.byChannel.booking ?? 0) / 1_000_000,
      agoda: (m.byChannel.agoda ?? 0) / 1_000_000,
      trip: (m.byChannel.trip ?? 0) / 1_000_000,
      direct: (m.byChannel.direct ?? 0) / 1_000_000,
      fb: (m.byChannel.fb ?? 0) / 1_000_000,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={rows} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
        <XAxis dataKey="name" stroke="var(--t-3)" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="var(--t-4)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v)}M`} />
        <Tooltip cursor={{ fill: "var(--bg-hover)" }} content={<CustomTooltip />} />
        {STACK_ORDER.map((id) => {
          const ch = channelById(id)!;
          // Read CSS variable at runtime via getComputedStyle isn't possible during render — use literal hex matching tokens.css
          const color = COLOR_MAP[id];
          return <Bar key={id} dataKey={id} stackId="a" fill={color} radius={id === "airbnb" ? [4, 4, 0, 0] : 0} name={ch.name} />;
        })}
      </BarChart>
    </ResponsiveContainer>
  );
}

const COLOR_MAP: Record<ChannelId, string> = {
  airbnb: "#ff385c",
  booking: "#003580",
  agoda: "#d92d27",
  trip: "#287dfa",
  direct: "#18181b",
  fb: "#1877f2",
};
