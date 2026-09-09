export type Sentiment = "positive" | "mixed" | "negative" | "neutral";
export type FeedbackStatus = "active" | "edited" | "deleted";
export type SourceKey = "nyt" | "tmdb" | "user" | "import";

export interface Movie {
  id: string;
  tmdbId?: number;
  imdbId?: string;
  title: string;
  year: number;
  releaseDate?: string;
  overview: string;
  posterUrl?: string;
  backdropUrl?: string;
  runtime?: number;
  genres: string[];
  director?: string;
  cast: string[];
  ratings: Record<string, string | number>;
  tracked?: boolean;
  lastSyncedAt?: string;
}

export interface FeedbackCategory {
  slug: string;
  label: string;
  confidence: number;
  evidence?: string;
}

export interface Feedback {
  id: string;
  movieId: string;
  source: SourceKey;
  externalId?: string;
  author: string;
  title?: string;
  body: string;
  url?: string;
  rating?: number;
  sentiment: Sentiment;
  categories: FeedbackCategory[];
  entities: string[];
  occurredAt: string;
  updatedAt: string;
  status: FeedbackStatus;
  synthetic?: boolean;
}

export interface TrendPoint {
  date: string;
  pacing: number;
  visuals: number;
  performance: number;
  sound: number;
  story: number;
}

export interface Trend {
  slug: string;
  label: string;
  count: number;
  change: number;
  sentiment: Sentiment;
  momentum: number;
  summary: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: "movie" | "person" | "category" | "issue" | "source";
  weight: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  predicate: string;
  evidenceIds: string[];
  confidence: number;
}

export interface AuditEvent {
  id: string;
  action: "created" | "updated" | "deleted" | "restored" | "synced" | "classified";
  entityType: "feedback" | "movie" | "graph" | "ingestion";
  entityId: string;
  actor: string;
  source: string;
  occurredAt: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  summary: string;
}

export interface DashboardSnapshot {
  movie: Movie;
  feedback: Feedback[];
  trends: Trend[];
  trendSeries: TrendPoint[];
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  audit: AuditEvent[];
  mode: "live";
  integrations: {
    tmdb: boolean;
    nyt: boolean;
    omdb: boolean;
    gemini: boolean;
    supabase: boolean;
  };
}

export interface RagCitation {
  feedbackId: string;
  source: string;
  author: string;
  excerpt: string;
  url?: string;
}

export interface RagAnswer {
  answer: string;
  citations: RagCitation[];
  path: string[];
  mode: "gemini" | "extractive";
}
