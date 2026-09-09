"use client";

import { useMemo, useState } from "react";
import { Network, Search } from "lucide-react";
import type { GraphEdge, GraphNode } from "@/lib/types";

const colors: Record<GraphNode["type"], { fill: string; stroke: string; text: string }> = {
  movie: { fill: "#d7ff5f", stroke: "#efffb9", text: "#10170b" },
  person: { fill: "#172b27", stroke: "#55d6be", text: "#dffbf5" },
  category: { fill: "#2a2419", stroke: "#f0a95e", text: "#ffe7c3" },
  issue: { fill: "#2c1e2a", stroke: "#e882ca", text: "#ffe2f7" },
  source: { fill: "#192236", stroke: "#8aa8ff", text: "#e3eaff" },
};

function positionNodes(nodes: GraphNode[]) {
  const movie = nodes.find((node) => node.type === "movie");
  const remaining = nodes.filter((node) => node.id !== movie?.id);
  const grouped = {
    category: remaining.filter((node) => node.type === "category" || node.type === "issue"),
    person: remaining.filter((node) => node.type === "person"),
    source: remaining.filter((node) => node.type === "source"),
  };
  const output = new Map<string, { x: number; y: number }>();
  if (movie) output.set(movie.id, { x: 360, y: 235 });
  grouped.category.forEach((node, index) => {
    const angle = -Math.PI * 0.86 + (index / Math.max(1, grouped.category.length - 1)) * Math.PI * 1.72;
    output.set(node.id, { x: 360 + Math.cos(angle) * 190, y: 235 + Math.sin(angle) * 145 });
  });
  grouped.person.forEach((node, index) => {
    const angle = Math.PI * 0.12 + (index / Math.max(1, grouped.person.length - 1)) * Math.PI * 0.76;
    output.set(node.id, { x: 360 + Math.cos(angle) * 285, y: 225 + Math.sin(angle) * 205 });
  });
  grouped.source.forEach((node, index) => output.set(node.id, { x: 74 + index * 112, y: 430 }));
  return output;
}

export function KnowledgeGraph({ nodes, edges, highlightedLabels = [] }: { nodes: GraphNode[]; edges: GraphEdge[]; highlightedLabels?: string[] }) {
  const [selected, setSelected] = useState(nodes[0]?.id || "movie");
  const positions = useMemo(() => positionNodes(nodes), [nodes]);
  const selectedNode = nodes.find((node) => node.id === selected);
  const relatedEdges = edges.filter((edge) => edge.from === selected || edge.to === selected);
  const highlighted = new Set(highlightedLabels.map((label) => label.toLowerCase()));

  if (!nodes.length) {
    return <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed bg-card/60 text-center"><Network className="mb-4 size-8 text-muted-foreground" /><p className="font-medium">No graph data yet</p><p className="mt-1 max-w-sm text-sm text-muted-foreground">Sync a movie or add feedback to create connected entities and evidence.</p></div>;
  }

  return (
    <div className="grid min-h-[540px] grid-cols-[minmax(0,1fr)_240px] overflow-hidden rounded-2xl border bg-[#081310]/90 max-lg:grid-cols-1">
      <div className="relative min-h-[500px] overflow-hidden border-r max-lg:border-b max-lg:border-r-0">
        <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur"><Search className="size-3.5" /> Select a node to inspect its evidence</div>
        <svg viewBox="0 0 720 470" className="h-full min-h-[500px] w-full" role="img" aria-label="Interactive movie knowledge graph">
          <defs><filter id="node-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
          {edges.map((edge) => {
            const from = positions.get(edge.from); const to = positions.get(edge.to); if (!from || !to) return null;
            const active = edge.from === selected || edge.to === selected;
            return <line key={edge.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={active ? "#d7ff5f" : "#31443e"} strokeWidth={active ? 2 : 1} strokeOpacity={active ? 0.85 : 0.52} />;
          })}
          {nodes.map((node, index) => {
            const point = positions.get(node.id); if (!point) return null;
            const palette = colors[node.type]; const active = selected === node.id; const isPath = highlighted.has(node.label.toLowerCase());
            const width = node.type === "movie" ? 132 : Math.min(118, Math.max(70, node.label.length * 6.4 + 24));
            return (
              <g key={node.id} className="graph-node cursor-pointer outline-none" style={{ animationDelay: `${Math.min(index * 35, 380)}ms` }} role="button" tabIndex={0} aria-label={`${node.label}, ${node.type}`} onClick={() => setSelected(node.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelected(node.id); }}>
                <rect x={point.x - width / 2} y={point.y - 18} width={width} height={36} rx={18} fill={palette.fill} stroke={isPath || active ? "#d7ff5f" : palette.stroke} strokeWidth={active ? 2.5 : 1.2} filter={active || isPath ? "url(#node-glow)" : undefined} />
                <text x={point.x} y={point.y + 4} fill={palette.text} textAnchor="middle" fontSize={node.type === "movie" ? 12.5 : 10.5} fontWeight={node.type === "movie" ? 700 : 600}>{node.label.length > 16 ? `${node.label.slice(0, 15)}…` : node.label}</text>
                <title>{node.label} · {node.type} · {node.weight} connections</title>
              </g>
            );
          })}
        </svg>
        <div className="absolute bottom-4 left-4 flex flex-wrap gap-3 text-[11px] text-muted-foreground">{Object.entries(colors).map(([type, palette]) => <span key={type} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ backgroundColor: palette.stroke }} />{type}</span>)}</div>
      </div>
      <aside className="p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Node inspector</p>
        <h3 className="mt-3 text-xl font-semibold tracking-tight">{selectedNode?.label}</h3>
        <p className="mt-1 capitalize text-sm text-muted-foreground">{selectedNode?.type} · {selectedNode?.weight} signals</p>
        <div className="mt-6 space-y-3">
          {relatedEdges.slice(0, 8).map((edge) => {
            const otherId = edge.from === selected ? edge.to : edge.from; const other = nodes.find((node) => node.id === otherId);
            return <button key={edge.id} onClick={() => setSelected(otherId)} className="w-full rounded-xl border bg-card/60 p-3 text-left transition hover:border-primary/40 hover:bg-accent"><span className="block text-[11px] uppercase tracking-wider text-muted-foreground">{edge.predicate}</span><span className="mt-1 block text-sm font-medium">{other?.label || otherId}</span><span className="mt-1 block text-xs text-muted-foreground">{edge.evidenceIds.length || "Metadata"} evidence link{edge.evidenceIds.length === 1 ? "" : "s"}</span></button>;
          })}
          {!relatedEdges.length && <p className="text-sm text-muted-foreground">No direct relationships for this node.</p>}
        </div>
      </aside>
    </div>
  );
}
