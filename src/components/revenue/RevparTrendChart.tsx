"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Lang } from "@/lib/i18n";
import type { OccupancyTrendPoint } from "@/lib/queries";

interface Props {
  points: OccupancyTrendPoint[];
  lang: Lang;
}

interface TipPayload {
  dataKey?: string;
  value?: number;
  color?: string;
}
interface TipProps {
  active?: boolean;
  payload?: TipPayload[];
  label?: string;
}

function CustomTip({ active, payload, label, lang }: TipProps & { lang: Lang }) {
  if (!active || !payload || payload.length === 0) return null;
  const adr = payload.find((p) => p.dataKey === "adr")?.value ?? 0;
  const revpar = payload.find((p) => p.dataKey === "revpar")?.value ?? 0;
  return (
    <div style={{ background: "var(--bg-elev)", border: "1px solid var(--bd-2)", borderRadius: 6, padding: "8px 10px", fontSize: 11, boxShadow: "var(--shadow-pop)", lineHeight: 1.5 }}>
      <div style={{ color: "var(--t-3)" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 8, height: 8, background: "#4f46e5", borderRadius: 2 }} />
        <span>ADR <strong>₩{(adr / 1000).toFixed(0)}K</strong></span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 8, height: 8, background: "#16a34a", borderRadius: 2 }} />
        <span>RevPAR <strong>₩{(revpar / 1000).toFixed(0)}K</strong></span>
      </div>
      <div style={{ color: "var(--t-3)", marginTop: 4, fontSize: 10 }}>
        {lang === "ko" ? "(예약 기준 14일 예측)" : "(forward 14d, booked)"}
      </div>
    </div>
  );
}

export function RevparTrendChart({ points, lang }: Props) {
  const rows = points.map((p) => {
    const d = new Date(`${p.date}T00:00:00Z`);
    return {
      label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`,
      adr: p.adr,
      revpar: p.revpar,
    };
  });

  return (
    <div style={{ width: "100%", height: 200, padding: "12px 16px" }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="var(--bd-1)" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="label" stroke="var(--t-4)" fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis
            stroke="var(--t-4)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            width={42}
            tickFormatter={(v) => `${Math.round(Number(v) / 1000)}K`}
          />
          <Tooltip content={<CustomTip lang={lang} />} cursor={{ stroke: "var(--bd-2)", strokeDasharray: "2 4" }} />
          <Line
            type="monotone"
            dataKey="adr"
            name="ADR"
            stroke="#4f46e5"
            strokeWidth={1.8}
            dot={false}
            activeDot={{ r: 3, fill: "#4f46e5", strokeWidth: 0 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="revpar"
            name="RevPAR"
            stroke="#16a34a"
            strokeWidth={1.8}
            dot={false}
            activeDot={{ r: 3, fill: "#16a34a", strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
