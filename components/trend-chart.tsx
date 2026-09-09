"use client";

import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendPoint } from "@/lib/types";

const series = [
  { key: "pacing", label: "Pacing", color: "#f0a95e" }, { key: "visuals", label: "Visuals", color: "#d7ff5f" },
  { key: "performance", label: "Performances", color: "#55d6be" }, { key: "sound", label: "Sound", color: "#8aa8ff" },
] as const;

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return <div className="h-[280px] w-full animate-pulse rounded-xl bg-secondary/35" aria-hidden="true" />;
  return (
    <div className="h-[280px] w-full" aria-label="Feedback category trend chart">
      <ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ left: -20, right: 8, top: 12, bottom: 0 }}>
        <defs>{series.map((item) => <linearGradient key={item.key} id={`fill-${item.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={item.color} stopOpacity={0.28} /><stop offset="95%" stopColor={item.color} stopOpacity={0} /></linearGradient>)}</defs>
        <CartesianGrid vertical={false} stroke="#273a34" strokeDasharray="3 5" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: "#91a59e", fontSize: 12 }} dy={8} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#91a59e", fontSize: 12 }} />
        <Tooltip contentStyle={{ background: "#101c1a", border: "1px solid #33463f", borderRadius: 12, color: "#edf5ef" }} labelStyle={{ color: "#edf5ef", marginBottom: 6 }} />
        {series.map((item) => <Area key={item.key} type="monotone" dataKey={item.key} name={item.label} stroke={item.color} strokeWidth={2} fill={`url(#fill-${item.key})`} activeDot={{ r: 4, fill: item.color, stroke: "#07100f", strokeWidth: 2 }} />)}
      </AreaChart></ResponsiveContainer>
      <div className="mt-1 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">{series.map((item) => <span key={item.key} className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: item.color }} />{item.label}</span>)}</div>
    </div>
  );
}
