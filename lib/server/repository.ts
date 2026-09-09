import "server-only";
import { buildGraph, computeTrends, computeTrendSeries } from "@/lib/analytics";
import { integrations } from "@/lib/server/env";
import { classifyWithGemini, embedText } from "@/lib/server/gemini";
import { deleteRows, hasSupabase, insertRows, patchRows, selectRows, upsertRows } from "@/lib/server/supabase";
import type { AuditEvent, DashboardSnapshot, Feedback, FeedbackCategory, Movie, SourceKey } from "@/lib/types";

type MovieRow = {
  id: string; tmdb_id: number | null; imdb_id: string | null; title: string; release_date: string | null; overview: string | null;
  poster_path: string | null; backdrop_path: string | null; runtime: number | null; genres: string[] | null; director: string | null;
  cast_members: string[] | null; ratings: Record<string, string | number> | null; is_tracked: boolean; last_synced_at: string | null;
};
type FeedbackRow = {
  id: string; movie_id: string; source_key: SourceKey; external_id: string | null; author: string | null; title: string | null; body: string;
  url: string | null; rating: number | null; sentiment: Feedback["sentiment"]; status: Feedback["status"]; occurred_at: string;
  updated_at: string; metadata: { categories?: FeedbackCategory[]; entities?: string[]; synthetic?: boolean } | null;
};
type AuditRow = {
  id: string; action: AuditEvent["action"]; entity_type: AuditEvent["entityType"]; entity_id: string; actor: string | null;
  source: string | null; occurred_at: string; before_data: Record<string, unknown> | null; after_data: Record<string, unknown> | null; summary: string | null;
};

function movieFromRow(row: MovieRow): Movie {
  return {
    id: row.id, tmdbId: row.tmdb_id || undefined, imdbId: row.imdb_id || undefined, title: row.title,
    year: row.release_date ? Number(row.release_date.slice(0, 4)) : 0, releaseDate: row.release_date || undefined,
    overview: row.overview || "No overview available.",
    posterUrl: row.poster_path ? (row.poster_path.startsWith("http") ? row.poster_path : `https://image.tmdb.org/t/p/w780${row.poster_path}`) : undefined,
    backdropUrl: row.backdrop_path ? (row.backdrop_path.startsWith("http") ? row.backdrop_path : `https://image.tmdb.org/t/p/w1280${row.backdrop_path}`) : undefined,
    runtime: row.runtime || undefined, genres: row.genres || [], director: row.director || undefined, cast: row.cast_members || [],
    ratings: row.ratings || {}, tracked: row.is_tracked, lastSyncedAt: row.last_synced_at || undefined,
  };
}

function feedbackFromRow(row: FeedbackRow): Feedback {
  return {
    id: row.id, movieId: row.movie_id, source: row.source_key, externalId: row.external_id || undefined, author: row.author || "Anonymous",
    title: row.title || undefined, body: row.body, url: row.url || undefined, rating: row.rating || undefined, sentiment: row.sentiment,
    categories: row.metadata?.categories || [], entities: row.metadata?.entities || [], occurredAt: row.occurred_at,
    updatedAt: row.updated_at, status: row.status, synthetic: row.metadata?.synthetic,
  };
}

function auditFromRow(row: AuditRow): AuditEvent {
  return {
    id: row.id, action: row.action, entityType: row.entity_type, entityId: row.entity_id, actor: row.actor || "System", source: row.source || "pipeline",
    occurredAt: row.occurred_at, before: row.before_data, after: row.after_data, summary: row.summary || `${row.action} ${row.entity_type}`,
  };
}

export async function getSnapshot(movieRef?: string): Promise<DashboardSnapshot | null> {
  if (!hasSupabase()) throw new Error("Supabase is not configured");
  const filter = movieRef
    ? /^\d+$/.test(movieRef) ? `tmdb_id=eq.${movieRef}&limit=1` : `id=eq.${encodeURIComponent(movieRef)}&limit=1`
    : "is_tracked=eq.true&order=updated_at.desc&limit=1";
  const movies = await selectRows<MovieRow>("movies", `select=*&${filter}`);
  if (!movies.length) return null;
  const movie = movieFromRow(movies[0]);
  const [feedbackRows, auditRows] = await Promise.all([
    selectRows<FeedbackRow>("feedback", `select=*&movie_id=eq.${movie.id}&order=occurred_at.desc&limit=500`),
    selectRows<AuditRow>("audit_events", `select=*&movie_id=eq.${movie.id}&order=occurred_at.desc&limit=200`),
  ]);
  const feedback = feedbackRows.map(feedbackFromRow);
  return {
    movie, feedback, trends: computeTrends(feedback), trendSeries: computeTrendSeries(feedback), graph: buildGraph(movie, feedback),
    audit: auditRows.map(auditFromRow), mode: "live", integrations: integrations(),
  };
}

async function linkCategories(feedbackId: string, categories: FeedbackCategory[]) {
  if (!categories.length) return;
  const slugs = categories.map((item) => item.slug).join(",");
  const categoryRows = await selectRows<{ id: string; slug: string }>("categories", `select=id,slug&slug=in.(${slugs})`);
  if (!categoryRows.length) return;
  await upsertRows("feedback_categories", categoryRows.map((row) => {
    const category = categories.find((item) => item.slug === row.slug)!;
    return { feedback_id: feedbackId, category_id: row.id, confidence: category.confidence, evidence: category.evidence || null };
  }), "feedback_id,category_id");
}

export async function createFeedback(input: { movieId: string; author: string; body: string; source?: SourceKey; title?: string; url?: string; occurredAt?: string }) {
  const analysis = await classifyWithGemini(input.body);
  const embedding = await embedText(input.body);
  const now = new Date().toISOString();
  const metadata = { categories: analysis.categories, entities: analysis.entities };
  if (!hasSupabase()) throw new Error("Supabase is not configured");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.movieId)) {
    throw new Error("Feedback requires a persisted movie");
  }
  const [row] = await insertRows<FeedbackRow>("feedback", {
    movie_id: input.movieId, source_key: input.source || "user", author: input.author || "Anonymous", title: input.title || null,
    body: input.body, url: input.url || null, sentiment: analysis.sentiment, occurred_at: input.occurredAt || now,
    embedding: embedding ? `[${embedding.join(",")}]` : null, metadata,
  });
  await linkCategories(row.id, analysis.categories);
  return feedbackFromRow(row);
}

export async function updateFeedback(id: string, input: { body: string; author?: string; title?: string }) {
  const analysis = await classifyWithGemini(input.body);
  const embedding = await embedText(input.body);
  if (!hasSupabase()) throw new Error("Supabase is not configured");
  const rows = await patchRows<FeedbackRow>("feedback", `id=eq.${encodeURIComponent(id)}`, {
    body: input.body, author: input.author, title: input.title, sentiment: analysis.sentiment, status: "edited",
    embedding: embedding ? `[${embedding.join(",")}]` : null, metadata: { categories: analysis.categories, entities: analysis.entities },
  });
  if (!rows.length) throw new Error("Feedback not found");
  await deleteRows("feedback_categories", `feedback_id=eq.${encodeURIComponent(id)}`);
  await linkCategories(id, analysis.categories);
  return feedbackFromRow(rows[0]);
}

export async function softDeleteFeedback(id: string) {
  if (!hasSupabase()) throw new Error("Supabase is not configured");
  const rows = await patchRows<FeedbackRow>("feedback", `id=eq.${encodeURIComponent(id)}`, { status: "deleted", deleted_at: new Date().toISOString() });
  if (!rows.length) throw new Error("Feedback not found");
}

export async function restoreFeedback(id: string) {
  if (!hasSupabase()) throw new Error("Supabase is not configured");
  const rows = await patchRows<FeedbackRow>("feedback", `id=eq.${encodeURIComponent(id)}`, { status: "active", deleted_at: null });
  if (!rows.length) throw new Error("Feedback not found");
}
