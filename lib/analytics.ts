import type {
  AuditEvent,
  DashboardSnapshot,
  Feedback,
  FeedbackCategory,
  GraphEdge,
  GraphNode,
  Movie,
  Sentiment,
  Trend,
  TrendPoint,
} from "@/lib/types";

export const CATEGORY_RULES: Record<string, { label: string; words: string[] }> = {
  visuals: {
    label: "Visuals",
    words: ["visual", "cinematography", "imax", "shot", "camera", "image", "lighting", "spectacle"],
  },
  pacing: {
    label: "Pacing",
    words: ["pace", "pacing", "slow", "long", "drag", "runtime", "rushed", "momentum"],
  },
  performance: {
    label: "Performances",
    words: ["actor", "acting", "performance", "cast", "damon", "hathaway", "holland", "pattinson", "zendaya"],
  },
  sound: {
    label: "Sound & score",
    words: ["sound", "score", "music", "audio", "loud", "göransson", "dialogue"],
  },
  story: {
    label: "Story",
    words: ["story", "plot", "script", "screenplay", "ending", "narrative", "adaptation", "homer"],
  },
  character: {
    label: "Characters",
    words: ["character", "odysseus", "penelope", "telemachus", "circe", "athena", "arc"],
  },
  fidelity: {
    label: "Adaptation fidelity",
    words: ["book", "poem", "homer", "faithful", "adaptation", "myth", "source material"],
  },
};

const POSITIVE_WORDS = [
  "great", "excellent", "stunning", "powerful", "best", "beautiful", "masterful", "love", "loved", "impressive", "strong", "favorite", "incredible",
];
const NEGATIVE_WORDS = [
  "bad", "weak", "slow", "boring", "confusing", "flat", "worse", "disappointing", "bloated", "drag", "dull", "incoherent", "thin",
];

export function heuristicClassify(text: string): {
  sentiment: Sentiment;
  categories: FeedbackCategory[];
  entities: string[];
} {
  const lower = text.toLowerCase();
  const positive = POSITIVE_WORDS.filter((word) => lower.includes(word)).length;
  const negative = NEGATIVE_WORDS.filter((word) => lower.includes(word)).length;
  const sentiment: Sentiment =
    positive && negative
      ? "mixed"
      : positive > negative
        ? "positive"
        : negative > positive
          ? "negative"
          : "neutral";

  const categories = Object.entries(CATEGORY_RULES)
    .map(([slug, rule]) => {
      const matches = rule.words.filter((word) => lower.includes(word));
      return {
        slug,
        label: rule.label,
        confidence: Math.min(0.98, 0.58 + matches.length * 0.12),
        evidence: matches.length ? `Matched: ${matches.slice(0, 3).join(", ")}` : undefined,
      };
    })
    .filter((category) => category.evidence)
    .slice(0, 4);

  if (!categories.length) {
    categories.push({ slug: "story", label: "Story", confidence: 0.52, evidence: "General movie feedback" });
  }

  const entityCandidates = [
    "Christopher Nolan", "Matt Damon", "Anne Hathaway", "Tom Holland", "Robert Pattinson", "Zendaya", "Lupita Nyong'o", "Charlize Theron", "Ludwig Göransson", "Odysseus", "Penelope",
  ];
  const entities = entityCandidates.filter((name) => lower.includes(name.toLowerCase()));
  return { sentiment, categories, entities };
}

function sentimentScore(sentiment: Sentiment) {
  return sentiment === "positive" ? 1 : sentiment === "negative" ? -1 : sentiment === "mixed" ? 0.15 : 0;
}

export function computeTrends(feedback: Feedback[]): Trend[] {
  const active = feedback.filter((item) => item.status !== "deleted");
  const now = active.length ? Math.max(...active.map((item) => new Date(item.occurredAt).getTime())) : Date.now();
  const cutoff = now - 3 * 86_400_000;
  const previousCutoff = cutoff - 3 * 86_400_000;

  return Object.entries(CATEGORY_RULES)
    .map(([slug, rule]) => {
      const items = active.filter((item) => item.categories.some((category) => category.slug === slug));
      const recent = items.filter((item) => new Date(item.occurredAt).getTime() >= cutoff).length;
      const previous = items.filter((item) => {
        const time = new Date(item.occurredAt).getTime();
        return time >= previousCutoff && time < cutoff;
      }).length;
      const change = previous === 0 ? (recent ? 100 : 0) : Math.round(((recent - previous) / previous) * 100);
      const average = items.length
        ? items.reduce((total, item) => total + sentimentScore(item.sentiment), 0) / items.length
        : 0;
      const sentiment: Sentiment = average > 0.35 ? "positive" : average < -0.3 ? "negative" : average !== 0 ? "mixed" : "neutral";
      const momentum = Math.round(Math.min(100, recent * 14 + Math.max(0, change) * 0.35 + new Set(items.map((item) => item.source)).size * 8));
      const summary =
        sentiment === "positive"
          ? `Praise is concentrating around ${rule.label.toLowerCase()}.`
          : sentiment === "negative"
            ? `Criticism is building around ${rule.label.toLowerCase()}.`
            : `Opinion remains split around ${rule.label.toLowerCase()}.`;
      return { slug, label: rule.label, count: items.length, change, sentiment, momentum, summary };
    })
    .filter((trend) => trend.count > 0)
    .sort((a, b) => b.momentum - a.momentum || b.count - a.count)
    .slice(0, 6);
}

export function computeTrendSeries(feedback: Feedback[]): TrendPoint[] {
  const active = feedback.filter((item) => item.status !== "deleted");
  const dates = [...new Set(active.map((item) => item.occurredAt.slice(0, 10)))].sort().slice(-8);
  return dates.map((date) => {
    const daily = active.filter((item) => item.occurredAt.startsWith(date));
    const count = (slug: string) => daily.filter((item) => item.categories.some((category) => category.slug === slug)).length;
    return {
      date: new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      pacing: count("pacing"),
      visuals: count("visuals"),
      performance: count("performance"),
      sound: count("sound"),
      story: count("story"),
    };
  });
}

export function buildGraph(movie: Movie, feedback: Feedback[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const active = feedback.filter((item) => item.status !== "deleted");
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  nodes.set("movie", { id: "movie", label: movie.title, type: "movie", weight: 10 });

  const addNode = (node: GraphNode) => {
    const existing = nodes.get(node.id);
    nodes.set(node.id, existing ? { ...existing, weight: existing.weight + 1 } : node);
  };
  const addEdge = (edge: GraphEdge) => {
    const existing = edges.find((candidate) => candidate.from === edge.from && candidate.to === edge.to && candidate.predicate === edge.predicate);
    if (existing) {
      existing.evidenceIds = [...new Set([...existing.evidenceIds, ...edge.evidenceIds])];
      existing.confidence = Math.max(existing.confidence, edge.confidence);
    } else edges.push(edge);
  };

  movie.cast.slice(0, 5).forEach((name, index) => {
    const id = `person:${name.toLowerCase().replaceAll(" ", "-")}`;
    addNode({ id, label: name, type: "person", weight: 3 });
    addEdge({ id: `cast-${index}`, from: "movie", to: id, predicate: "stars", evidenceIds: [], confidence: 1 });
  });
  if (movie.director) {
    const id = `person:${movie.director.toLowerCase().replaceAll(" ", "-")}`;
    addNode({ id, label: movie.director, type: "person", weight: 5 });
    addEdge({ id: "director", from: id, to: "movie", predicate: "directed", evidenceIds: [], confidence: 1 });
  }

  active.forEach((item) => {
    const sourceId = `source:${item.source}`;
    addNode({ id: sourceId, label: item.source.toUpperCase(), type: "source", weight: 1 });
    addEdge({ id: `source-${item.id}`, from: sourceId, to: "movie", predicate: "reviewed", evidenceIds: [item.id], confidence: 1 });
    item.categories.forEach((category) => {
      const categoryId = `category:${category.slug}`;
      addNode({ id: categoryId, label: category.label, type: "category", weight: 2 });
      addEdge({
        id: `category-${item.id}-${category.slug}`,
        from: "movie",
        to: categoryId,
        predicate: item.sentiment === "positive" ? "praised for" : item.sentiment === "negative" ? "criticized for" : "discussed for",
        evidenceIds: [item.id],
        confidence: category.confidence,
      });
    });
    item.entities.forEach((name) => {
      const personId = `person:${name.toLowerCase().replaceAll(" ", "-")}`;
      addNode({ id: personId, label: name, type: "person", weight: 1 });
      addEdge({ id: `mention-${item.id}-${personId}`, from: sourceId, to: personId, predicate: "mentions", evidenceIds: [item.id], confidence: 0.84 });
    });
  });

  return {
    nodes: [...nodes.values()].sort((a, b) => b.weight - a.weight).slice(0, 18),
    edges: edges.filter((edge) => nodes.has(edge.from) && nodes.has(edge.to)).slice(0, 36),
  };
}

export function rebuildSnapshot(snapshot: DashboardSnapshot, feedback: Feedback[], audit: AuditEvent[]): DashboardSnapshot {
  return {
    ...snapshot,
    feedback,
    audit,
    trends: computeTrends(feedback),
    trendSeries: computeTrendSeries(feedback),
    graph: buildGraph(snapshot.movie, feedback),
  };
}
