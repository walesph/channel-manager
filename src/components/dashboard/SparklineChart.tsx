"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";

interface Props {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}

export function SparklineChart({ data, color, width = 80, height = 26 }: Props) {
  const rows = data.map((v, i) => ({ i, v }));
  const id = `spark-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <div style={{ width, height, flex: "0 0 auto" }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 1, right: 1, bottom: 1, left: 1 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.32} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            cursor={false}
            contentStyle={{ display: "none" }}
            formatter={(v) => [v, ""]}
          />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${id})`}
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 2.5, fill: color, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
