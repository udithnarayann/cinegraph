"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowUpRight, Bot, Check, ChevronDown, CircleGauge, Clock3, Database, ExternalLink, FileClock,
  Film, GitBranch, KeyRound, Loader2, Network, Pencil, Plus, RefreshCw, Search, Settings2, Sparkles,
  Trash2, TrendingDown, TrendingUp, Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { rebuildSnapshot } from "@/lib/analytics";
import type { AuditEvent, DashboardSnapshot, Feedback, RagAnswer, Sentiment } from "@/lib/types";
import { KnowledgeGraph } from "@/components/knowledge-graph";
import { TrendChart } from "@/components/trend-chart";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";

type MovieSearchResult = { tmdbId: number; title: string; year: number; overview: string; posterUrl?: string; rating?: number | string };

const navItems = [
  { value: "overview", label: "Overview", icon: CircleGauge },
  { value: "graph", label: "Graph + RAG", icon: Network },
  { value: "feedback", label: "Feedback", icon: Activity },
  { value: "audit", label: "Audit trail", icon: FileClock },
];

const sentimentStyle: Record<Sentiment, string> = {
  positive: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  mixed: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  negative: "border-rose-400/20 bg-rose-400/10 text-rose-300",
  neutral: "border-slate-400/20 bg-slate-400/10 text-slate-300",
};

function formatDate(value?: string, includeTime = false) {
  if (!value) return "Never";
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-US", includeTime
    ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function auditEvent(action: AuditEvent["action"], item: Feedback, summary: string): AuditEvent {
  return {
    id: `A-${Date.now()}`, action, entityType: "feedback", entityId: item.id, actor: "Dashboard admin", source: item.source,
    occurredAt: new Date().toISOString(), summary,
  };
}

function StatCard({ label, value, detail, accent }: { label: string; value: string; detail: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border bg-card/75 p-4 shadow-[0_18px_50px_rgb(0_0_0/12%)]">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tracking-[-0.04em] ${accent ? "text-primary" : ""}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function SourceMark({ source }: { source: Feedback["source"] }) {
  const labels = { nyt: "NYT", tmdb: "TMDB", user: "USER", import: "IMPORT" };
  return <span className="inline-flex h-6 items-center rounded-md border bg-background/60 px-2 font-mono text-[11px] font-semibold tracking-wide text-muted-foreground">{labels[source]}</span>;
}

export function CineGraphDashboard({ initialSnapshot }: { initialSnapshot: DashboardSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [activeTab, setActiveTab] = useState("overview");
  const [adminKey, setAdminKey] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [editing, setEditing] = useState<Feedback | null>(null);
  const [deleting, setDeleting] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MovieSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [question, setQuestion] = useState("What are viewers most divided about?");
  const [ragAnswer, setRagAnswer] = useState<RagAnswer | null>(null);
  const [ragLoading, setRagLoading] = useState(false);
  const [form, setForm] = useState({ author: "", body: "" });

  const requestHeaders = useMemo(() => ({ "content-type": "application/json", ...(adminKey ? { "x-admin-key": adminKey } : {}) }), [adminKey]);
  const activeFeedback = snapshot.feedback.filter((item) => item.status !== "deleted");
  const positiveShare = activeFeedback.length ? Math.round((activeFeedback.filter((item) => item.sentiment === "positive").length / activeFeedback.length) * 100) : 0;
  const coverage = activeFeedback.length ? Math.round((activeFeedback.filter((item) => item.categories.some((category) => category.confidence >= 0.75)).length / activeFeedback.length) * 100) : 0;
  const topTrend = snapshot.trends[0];

  useEffect(() => {
    const savedKey = window.sessionStorage.getItem("cinegraph-admin-key") || "";
    setAdminKey(savedKey);
  }, []);

  function saveAdminKey() {
    window.sessionStorage.setItem("cinegraph-admin-key", adminKey);
    setSettingsOpen(false);
    toast.success("Admin key saved for this tab");
  }

  async function parseResponse<T = Record<string, unknown>>(response: Response): Promise<T> {
    const data = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  async function syncCurrent(tmdbId = snapshot.movie.tmdbId) {
    if (!tmdbId) return toast.error("This movie has no TMDB ID");
    setSyncing(true);
    try {
      const next = await parseResponse<DashboardSnapshot>(await fetch("/api/sync", { method: "POST", headers: requestHeaders, body: JSON.stringify({ tmdbId }) }));
      setSnapshot(next);
      setSearchOpen(false);
      setRagAnswer(null);
      toast.success(`${next.movie.title} synchronized`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sync failed");
    } finally { setSyncing(false); }
  }

  async function searchMovies(event: FormEvent) {
    event.preventDefault();
    if (searchQuery.trim().length < 2) return;
    setSearching(true);
    try {
      const data = await parseResponse<{ results: MovieSearchResult[] }>(await fetch(`/api/movies/search?q=${encodeURIComponent(searchQuery.trim())}`));
      setSearchResults(data.results || []);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Search failed"); }
    finally { setSearching(false); }
  }

  async function addFeedback(event: FormEvent) {
    event.preventDefault();
    if (form.body.trim().length < 8) return toast.error("Add at least 8 characters of feedback");
    setBusy(true);
    try {
      const data = await parseResponse<{ feedback: Feedback }>(await fetch("/api/feedback", {
        method: "POST", headers: requestHeaders,
        body: JSON.stringify({ movieId: snapshot.movie.id, author: form.author || "Anonymous", body: form.body }),
      }));
      const item = data.feedback as Feedback;
      setSnapshot((current) => rebuildSnapshot(current, [item, ...current.feedback], [auditEvent("created", item, `Added feedback from ${item.author}`), ...current.audit]));
      setForm({ author: "", body: "" }); setFeedbackOpen(false); toast.success("Feedback classified and added");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not add feedback"); }
    finally { setBusy(false); }
  }

  async function editFeedback(event: FormEvent) {
    event.preventDefault();
    if (!editing || editing.body.trim().length < 8) return;
    setBusy(true);
    try {
      let updated: Feedback;
      const data = await parseResponse<{ feedback: Feedback }>(await fetch(`/api/feedback/${editing.id}`, { method: "PATCH", headers: requestHeaders, body: JSON.stringify({ body: editing.body, author: editing.author, title: editing.title }) }));
      updated = data.feedback;
      const feedback = snapshot.feedback.map((item) => item.id === updated.id ? updated : item);
      setSnapshot((current) => rebuildSnapshot(current, feedback, [auditEvent("updated", updated, "Feedback changed; classifications recomputed"), ...current.audit]));
      setEditing(null); toast.success("Feedback updated; previous version preserved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update feedback"); }
    finally { setBusy(false); }
  }

  async function deleteFeedback() {
    if (!deleting) return;
    setBusy(true);
    try {
      await parseResponse(await fetch(`/api/feedback/${deleting.id}`, { method: "DELETE", headers: requestHeaders }));
      const deleted = { ...deleting, status: "deleted" as const, updatedAt: new Date().toISOString() };
      const feedback = snapshot.feedback.map((item) => item.id === deleted.id ? deleted : item);
      setSnapshot((current) => rebuildSnapshot(current, feedback, [auditEvent("deleted", deleted, "Feedback soft-deleted; history retained"), ...current.audit]));
      setDeleting(null); toast.success("Feedback removed from active analysis");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not delete feedback"); }
    finally { setBusy(false); }
  }

  async function restore(item: Feedback) {
    setBusy(true);
    try {
      await parseResponse(await fetch(`/api/feedback/${item.id}`, { method: "POST", headers: requestHeaders }));
      const restored = { ...item, status: "active" as const, updatedAt: new Date().toISOString() };
      const feedback = snapshot.feedback.map((candidate) => candidate.id === item.id ? restored : candidate);
      setSnapshot((current) => rebuildSnapshot(current, feedback, [auditEvent("restored", restored, "Feedback restored to active analysis"), ...current.audit]));
      toast.success("Feedback restored");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not restore feedback"); }
    finally { setBusy(false); }
  }

  async function askGraph(nextQuestion = question) {
    const clean = nextQuestion.trim(); if (clean.length < 3) return;
    setQuestion(clean); setRagLoading(true);
    try {
      const data = await parseResponse<RagAnswer>(await fetch("/api/rag", { method: "POST", headers: requestHeaders, body: JSON.stringify({ question: clean, movieId: snapshot.movie.id, movieTitle: snapshot.movie.title, feedback: activeFeedback }) }));
      setRagAnswer(data); setActiveTab("graph");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not answer"); }
    finally { setRagLoading(false); }
  }

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-background/88 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5"><span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_0_24px_rgb(215_255_95/18%)]"><GitBranch className="size-5" /></span><span className="text-lg font-semibold tracking-[-0.04em]">CineGraph</span></div>
          <div className="mx-auto hidden items-center gap-2 text-sm text-muted-foreground md:flex"><span className="signal-pulse size-1.5 rounded-full bg-primary" />Live pipeline<span className="text-border">/</span>{activeFeedback.length} evidence items</div>
          <Button variant="outline" size="sm" onClick={() => setSearchOpen(true)} className="ml-auto max-sm:px-2"><Film /><span className="max-sm:hidden">Change movie</span><ChevronDown className="size-3.5" /></Button>
          <Button variant="ghost" size="icon" aria-label="Connection settings" onClick={() => setSettingsOpen(true)}><Settings2 /></Button>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <section className="relative overflow-hidden rounded-[1.4rem] border bg-card/80 shadow-[0_28px_80px_rgb(0_0_0/22%)]">
          {snapshot.movie.backdropUrl && <div className="absolute inset-0 bg-cover bg-center opacity-20" style={{ backgroundImage: `url(${snapshot.movie.backdropUrl})` }} />}
          <div className="absolute inset-0 bg-gradient-to-r from-card via-card/95 to-card/45" />
          <div className="relative flex items-center gap-5 p-5 sm:p-7">
            <div className="hidden h-[142px] w-[96px] shrink-0 overflow-hidden rounded-xl border bg-gradient-to-br from-[#2f4d43] to-[#0b1512] shadow-2xl sm:block">
              {snapshot.movie.posterUrl ? <img src={snapshot.movie.posterUrl} alt={`${snapshot.movie.title} poster`} className="h-full w-full object-cover" /> : <div className="flex h-full flex-col justify-between p-3"><span className="text-[9px] uppercase tracking-[0.22em] text-primary">A film by</span><span className="font-serif text-lg leading-none">{snapshot.movie.title}</span><span className="text-[9px] text-muted-foreground">{snapshot.movie.year}</span></div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="border-primary/25 bg-primary/8 text-primary">Tracking</Badge>{snapshot.movie.genres.slice(0, 3).map((genre) => <span key={genre} className="text-xs text-muted-foreground">{genre}</span>)}</div>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.055em] sm:text-5xl">{snapshot.movie.title}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">{snapshot.movie.overview}</p>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm"><span>{snapshot.movie.year}</span>{snapshot.movie.runtime && <span>{snapshot.movie.runtime} min</span>}{snapshot.movie.director && <span className="text-muted-foreground">Directed by <b className="font-medium text-foreground">{snapshot.movie.director}</b></span>}{Object.entries(snapshot.movie.ratings).slice(0, 3).map(([source, rating]) => <span key={source}><b className="font-medium">{rating}</b> <span className="text-xs text-muted-foreground">{source}</span></span>)}</div>
            </div>
            <div className="hidden self-end lg:block"><Button onClick={() => syncCurrent()} disabled={syncing} className="shadow-[0_0_28px_rgb(215_255_95/14%)]">{syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}Sync sources</Button><p className="mt-2 text-center text-[11px] text-muted-foreground">Last sync {formatDate(snapshot.movie.lastSyncedAt, true)}</p></div>
          </div>
        </section>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
          <div className="flex items-center justify-between gap-3 border-b">
            <TabsList variant="line" className="h-11 w-full justify-start overflow-x-auto rounded-none p-0 sm:w-auto">{navItems.map((item) => <TabsTrigger key={item.value} value={item.value} className="h-11 px-3 sm:px-4"><item.icon />{item.label}</TabsTrigger>)}</TabsList>
            <Button size="sm" onClick={() => setFeedbackOpen(true)} className="hidden sm:flex"><Plus />Add feedback</Button>
          </div>

          <TabsContent value="overview" className="pt-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Active feedback" value={String(activeFeedback.length)} detail={`${new Set(activeFeedback.map((item) => item.source)).size} source types`} />
              <StatCard label="Positive signal" value={`${positiveShare}%`} detail="Across active evidence" accent />
              <StatCard label="Top momentum" value={topTrend ? `${topTrend.change >= 0 ? "+" : ""}${topTrend.change}%` : "—"} detail={topTrend?.label || "Waiting for feedback"} />
              <StatCard label="Evidence coverage" value={`${coverage}%`} detail="High-confidence labels" />
            </div>
            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,.8fr)]">
              <section className="rounded-2xl border bg-card/75 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">Signal velocity</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Category momentum</h2></div><Badge variant="outline" className="text-muted-foreground">Last 8 active days</Badge></div>
                <div className="mt-3"><TrendChart data={snapshot.trendSeries} /></div>
              </section>
              <section className="rounded-2xl border bg-card/75 p-4 sm:p-5">
                <div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">Now emerging</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Issues to watch</h2></div><Activity className="text-muted-foreground" /></div>
                <div className="mt-4 space-y-3">{snapshot.trends.slice(0, 4).map((trend, index) => <div key={trend.slug} className="rounded-xl border bg-background/35 p-3.5"><div className="flex items-center gap-3"><span className="grid size-7 place-items-center rounded-lg bg-secondary font-mono text-xs text-muted-foreground">0{index + 1}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="font-medium">{trend.label}</p><span className={`flex items-center gap-1 text-sm font-medium ${trend.change >= 0 ? "text-primary" : "text-rose-300"}`}>{trend.change >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}{trend.change >= 0 ? "+" : ""}{trend.change}%</span></div><p className="mt-0.5 text-xs text-muted-foreground">{trend.summary}</p></div></div><div className="mt-3 h-1 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${trend.momentum}%` }} /></div></div>)}</div>
              </section>
            </div>
            <section className="mt-4 rounded-2xl border bg-card/75">
              <div className="flex items-center justify-between border-b p-4 sm:px-5"><div><h2 className="font-semibold">Latest evidence</h2><p className="text-sm text-muted-foreground">Every claim stays connected to its source.</p></div><Button variant="ghost" size="sm" onClick={() => setActiveTab("feedback")}>View all <ArrowUpRight /></Button></div>
              <div className="divide-y">{activeFeedback.slice(0, 4).map((item) => <article key={item.id} className="grid gap-3 p-4 transition hover:bg-accent/25 sm:grid-cols-[90px_minmax(0,1fr)_auto] sm:px-5"><div><SourceMark source={item.source} /><p className="mt-2 font-mono text-[11px] text-muted-foreground">{item.id.slice(0, 10)}</p></div><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{item.author}</p><span className="text-xs text-muted-foreground">{formatDate(item.occurredAt, true)}</span>{item.synthetic && <span className="text-[10px] uppercase tracking-wider text-amber-300">Synthetic</span>}</div><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.body}</p><div className="mt-2 flex flex-wrap gap-1.5">{item.categories.map((category) => <Badge key={category.slug} variant="outline" className="font-normal text-muted-foreground">{category.label} · {Math.round(category.confidence * 100)}%</Badge>)}</div></div><Badge variant="outline" className={`h-fit capitalize ${sentimentStyle[item.sentiment]}`}>{item.sentiment}</Badge></article>)}</div>
            </section>
          </TabsContent>

          <TabsContent value="graph" className="pt-6">
            <div className="mb-4"><p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">Knowledge graph</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Relationships, not isolated rows</h2><p className="mt-1 text-sm text-muted-foreground">Select nodes to trace how movies, people, topics, and evidence connect.</p></div>
            <KnowledgeGraph nodes={snapshot.graph.nodes} edges={snapshot.graph.edges} highlightedLabels={ragAnswer?.path} />
            <section className="mt-4 grid overflow-hidden rounded-2xl border bg-card/80 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="p-5 sm:p-6"><div className="flex items-center gap-2 text-primary"><Sparkles className="size-4" /><p className="text-xs font-semibold uppercase tracking-[0.15em]">Graph RAG</p></div><h2 className="mt-2 text-2xl font-semibold tracking-tight">Ask the evidence</h2><form onSubmit={(event) => { event.preventDefault(); askGraph(); }} className="mt-5 flex gap-2"><Input value={question} onChange={(event) => setQuestion(event.target.value)} aria-label="Question for the movie knowledge graph" placeholder="Why is pacing trending?" className="h-11 bg-background/60" /><Button type="submit" className="h-11" disabled={ragLoading}>{ragLoading ? <Loader2 className="animate-spin" /> : <Bot />}Ask</Button></form><div className="mt-3 flex flex-wrap gap-2">{["Why is pacing trending?", "What receives the strongest praise?", "How do viewers describe the performances?"].map((prompt) => <button key={prompt} onClick={() => askGraph(prompt)} className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground">{prompt}</button>)}</div>
                <div className="mt-6 min-h-[150px] rounded-xl border bg-background/45 p-4">{ragLoading ? <div className="flex h-[120px] items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Retrieving vectors and expanding graph neighbors…</div> : ragAnswer ? <div><div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground"><span className="uppercase tracking-wider">Traversal</span>{ragAnswer.path.map((step, index) => <span key={`${step}-${index}`} className="flex items-center gap-1.5"><span>→</span><Badge variant="outline" className="font-normal">{step}</Badge></span>)}</div><p className="whitespace-pre-wrap text-sm leading-7 text-foreground/90">{ragAnswer.answer}</p><p className="mt-3 text-xs text-muted-foreground">{ragAnswer.mode === "gemini" ? "Gemini answer · grounded in retrieved evidence" : "Local extractive answer · connect Gemini for synthesis"}</p></div> : <div className="flex h-[120px] flex-col items-center justify-center text-center"><Bot className="mb-3 size-6 text-muted-foreground" /><p className="text-sm font-medium">Your answer will appear here</p><p className="mt-1 text-xs text-muted-foreground">Results include the graph path and source evidence.</p></div>}</div>
              </div>
              <aside className="border-t bg-background/25 p-5 lg:border-l lg:border-t-0"><p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Retrieved evidence</p><div className="mt-4 space-y-3">{ragAnswer?.citations.length ? ragAnswer.citations.map((citation) => <div key={citation.feedbackId} className="rounded-xl border bg-card/60 p-3"><div className="flex items-center justify-between gap-2"><span className="font-mono text-xs text-primary">[{citation.feedbackId}]</span><span className="text-[10px] uppercase tracking-wider text-muted-foreground">{citation.source}</span></div><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{citation.excerpt}</p><div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground"><span>{citation.author}</span>{citation.url && <a href={citation.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">Source <ExternalLink className="ml-0.5 inline size-3" /></a>}</div></div>) : <p className="text-sm text-muted-foreground">Ask a question to see the exact records used.</p>}</div></aside>
            </section>
          </TabsContent>

          <TabsContent value="feedback" className="pt-6">
            <section className="overflow-hidden rounded-2xl border bg-card/75"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:px-5"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">Evidence registry</p><h2 className="mt-1 text-xl font-semibold">Feedback records</h2></div><Button onClick={() => setFeedbackOpen(true)}><Plus />Add feedback</Button></div>
              <Table><TableHeader><TableRow className="hover:bg-transparent"><TableHead className="pl-5">Source</TableHead><TableHead>Feedback</TableHead><TableHead>Categories</TableHead><TableHead>Sentiment</TableHead><TableHead>State</TableHead><TableHead className="pr-5 text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{snapshot.feedback.map((item) => <TableRow key={item.id} className={item.status === "deleted" ? "opacity-50" : ""}><TableCell className="pl-5"><SourceMark source={item.source} /><span className="mt-1 block font-mono text-[10px] text-muted-foreground">{item.id.slice(0, 9)}</span></TableCell><TableCell className="max-w-[430px] whitespace-normal"><p className="font-medium">{item.author}</p><p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p><p className="mt-1 text-[11px] text-muted-foreground">{formatDate(item.occurredAt, true)}</p></TableCell><TableCell className="max-w-[240px] whitespace-normal"><div className="flex flex-wrap gap-1">{item.categories.slice(0, 3).map((category) => <Badge key={category.slug} variant="outline" className="font-normal text-muted-foreground">{category.label}</Badge>)}</div></TableCell><TableCell><Badge variant="outline" className={`capitalize ${sentimentStyle[item.sentiment]}`}>{item.sentiment}</Badge></TableCell><TableCell><span className="capitalize text-sm text-muted-foreground">{item.status}</span></TableCell><TableCell className="pr-5 text-right">{item.status === "deleted" ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => restore(item)}><Undo2 />Restore</Button> : <div className="flex justify-end gap-1"><Button variant="ghost" size="icon-sm" aria-label={`Edit feedback by ${item.author}`} onClick={() => setEditing({ ...item })}><Pencil /></Button><Button variant="ghost" size="icon-sm" aria-label={`Delete feedback by ${item.author}`} onClick={() => setDeleting(item)} className="text-rose-300 hover:text-rose-200"><Trash2 /></Button></div>}</TableCell></TableRow>)}</TableBody></Table>
            </section>
          </TabsContent>

          <TabsContent value="audit" className="pt-6">
            <section className="rounded-2xl border bg-card/75 p-5 sm:p-6"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">Immutable history</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Audit trail</h2><p className="mt-1 text-sm text-muted-foreground">Adds, edits, deletions, classifications, and syncs remain traceable.</p></div><Database className="text-muted-foreground" /></div><div className="relative mt-7 ml-2 border-l pl-6">{snapshot.audit.map((event) => <article key={event.id} className="relative pb-7 last:pb-0"><span className={`absolute -left-[31px] top-1.5 size-2.5 rounded-full border-2 border-card ${event.action === "deleted" ? "bg-rose-400" : event.action === "synced" ? "bg-blue-400" : "bg-primary"}`} /><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="capitalize">{event.action}</Badge><span className="font-mono text-xs text-muted-foreground">{event.entityId.slice(0, 12)}</span><span className="text-xs text-muted-foreground">{formatDate(event.occurredAt, true)}</span></div><p className="mt-2 text-sm font-medium">{event.summary}</p><p className="mt-1 text-xs text-muted-foreground">{event.actor} · {event.source}</p>{(event.before || event.after) && <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer hover:text-foreground">Inspect change snapshot</summary><pre className="mt-2 overflow-auto rounded-lg border bg-background/50 p-3">{JSON.stringify({ before: event.before, after: event.after }, null, 2)}</pre></details>}</article>)}</div></section>
          </TabsContent>
        </Tabs>
      </div>

      <footer className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 border-t px-4 py-5 text-xs text-muted-foreground sm:px-6 lg:px-8"><p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p><p>Graph RAG · Supabase pgvector · Gemini</p></footer>
      <Button onClick={() => setFeedbackOpen(true)} size="icon-lg" className="fixed bottom-5 right-5 z-30 rounded-full shadow-2xl sm:hidden" aria-label="Add feedback"><Plus /></Button>

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}><DialogContent className="max-h-[82vh] overflow-y-auto border-border/80 bg-popover sm:max-w-2xl"><DialogHeader><DialogTitle>Change tracked movie</DialogTitle><DialogDescription>Search TMDB, then synchronize metadata and available reviews.</DialogDescription></DialogHeader><form onSubmit={searchMovies} className="flex gap-2"><Input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search a movie…" /><Button type="submit" disabled={searching}>{searching ? <Loader2 className="animate-spin" /> : <Search />}Search</Button></form><div className="space-y-2">{searchResults.map((movie) => <button key={movie.tmdbId} onClick={() => syncCurrent(movie.tmdbId)} disabled={syncing} className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition hover:border-primary/40 hover:bg-accent"><div className="grid h-16 w-11 shrink-0 place-items-center overflow-hidden rounded-md bg-secondary">{movie.posterUrl ? <img src={movie.posterUrl} alt="" className="h-full w-full object-cover" /> : <Film className="size-4 text-muted-foreground" />}</div><div className="min-w-0 flex-1"><p className="font-medium">{movie.title} <span className="font-normal text-muted-foreground">({movie.year || "—"})</span></p><p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{movie.overview}</p></div>{syncing ? <Loader2 className="animate-spin" /> : <ArrowUpRight className="text-muted-foreground" />}</button>)}{searchQuery && !searching && !searchResults.length && <p className="py-8 text-center text-sm text-muted-foreground">No matching TMDB movies found.</p>}</div></DialogContent></Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent className="bg-popover"><DialogHeader><DialogTitle>Connections</DialogTitle><DialogDescription>Keys stay server-side. The admin key is stored only in this browser tab.</DialogDescription></DialogHeader><div className="grid grid-cols-2 gap-2">{Object.entries(snapshot.integrations).map(([name, connected]) => <div key={name} className="flex items-center justify-between rounded-lg border px-3 py-2.5"><span className="text-sm uppercase tracking-wide">{name}</span><span className={`flex items-center gap-1.5 text-xs ${connected ? "text-primary" : "text-muted-foreground"}`}><span className={`size-1.5 rounded-full ${connected ? "bg-primary" : "bg-muted-foreground"}`} />{connected ? "Ready" : "Not set"}</span></div>)}</div><div className="mt-2"><label htmlFor="admin-key" className="mb-2 block text-sm font-medium">Admin key</label><div className="relative"><KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="admin-key" type="password" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} placeholder="Matches APP_ADMIN_KEY" className="pl-9" /></div><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Required only when APP_ADMIN_KEY is set in your deployment.</p></div><DialogFooter><Button onClick={saveAdminKey}><Check />Save</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}><DialogContent className="bg-popover"><DialogHeader><DialogTitle>Add feedback</DialogTitle><DialogDescription>Gemini classifies it; the graph, trends, and audit history update automatically.</DialogDescription></DialogHeader><form onSubmit={addFeedback} className="space-y-4"><div><label htmlFor="feedback-author" className="mb-2 block text-sm font-medium">Author</label><Input id="feedback-author" value={form.author} onChange={(event) => setForm({ ...form, author: event.target.value })} placeholder="Name or source handle" maxLength={120} /></div><div><label htmlFor="feedback-body" className="mb-2 block text-sm font-medium">Feedback</label><Textarea id="feedback-body" value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} placeholder="What did they say about the movie?" className="min-h-32" maxLength={8000} /></div><DialogFooter><Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Sparkles />}Classify & add</Button></DialogFooter></form></DialogContent></Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null); }}><DialogContent className="bg-popover"><DialogHeader><DialogTitle>Edit feedback</DialogTitle><DialogDescription>A new immutable version will be written and the classifications recomputed.</DialogDescription></DialogHeader>{editing && <form onSubmit={editFeedback} className="space-y-4"><div><label htmlFor="edit-author" className="mb-2 block text-sm font-medium">Author</label><Input id="edit-author" value={editing.author} onChange={(event) => setEditing({ ...editing, author: event.target.value })} /></div><div><label htmlFor="edit-body" className="mb-2 block text-sm font-medium">Feedback</label><Textarea id="edit-body" value={editing.body} onChange={(event) => setEditing({ ...editing, body: event.target.value })} className="min-h-36" maxLength={8000} /></div><DialogFooter><Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Check />}Save version</Button></DialogFooter></form>}</DialogContent></Dialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null); }}><AlertDialogContent className="bg-popover"><AlertDialogHeader><AlertDialogTitle>Remove this feedback?</AlertDialogTitle><AlertDialogDescription>It will stop affecting trends and Graph RAG. The original record and every version remain in the audit trail.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={deleteFeedback} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Trash2 />}Remove</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <Toaster position="bottom-left" richColors />
    </main>
  );
}
