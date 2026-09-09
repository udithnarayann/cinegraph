import "server-only";
import { classifyWithGemini, embedText } from "@/lib/server/gemini";
import { fetchNytReviews, fetchOmdb, fetchTmdbMovie } from "@/lib/server/providers";
import { hasSupabase, selectRows, upsertRows } from "@/lib/server/supabase";
import type { DashboardSnapshot } from "@/lib/types";
import { getSnapshot } from "@/lib/server/repository";

export async function syncMovie(tmdbId: number): Promise<DashboardSnapshot> {
  if (!hasSupabase()) throw new Error("Supabase is not configured");
  const tmdb = await fetchTmdbMovie(tmdbId);
  const [omdb, nytReviews] = await Promise.all([fetchOmdb(tmdb.movie.imdbId), fetchNytReviews(tmdb.movie.title)]);
  const reviews = [
    ...tmdb.reviews.map((review) => ({ ...review, source: "tmdb" as const })),
    ...nytReviews.map((review) => ({ ...review, source: "nyt" as const })),
  ];
  if (omdb?.ratings) tmdb.movie.ratings = { ...tmdb.movie.ratings, ...omdb.ratings };

  const [movieRow] = await upsertRows<{ id: string }>("movies", {
    tmdb_id: tmdb.movie.tmdbId, imdb_id: tmdb.movie.imdbId || null, title: tmdb.movie.title, release_date: tmdb.movie.releaseDate || null,
    overview: tmdb.movie.overview, poster_path: tmdb.movie.posterUrl || null, backdrop_path: tmdb.movie.backdropUrl || null,
    runtime: tmdb.movie.runtime || null, genres: tmdb.movie.genres, director: tmdb.movie.director || null, cast_members: tmdb.movie.cast,
    ratings: tmdb.movie.ratings, raw_sources: { tmdb: tmdb.raw, omdb: omdb?.data || null }, is_tracked: true, last_synced_at: new Date().toISOString(),
  }, "tmdb_id");

  let changedReviews = 0;
  for (const review of reviews) {
    const existing = await selectRows<{ source_updated_at: string | null }>(
      "feedback",
      `select=source_updated_at&source_key=eq.${review.source}&external_id=eq.${encodeURIComponent(review.externalId)}&limit=1`,
    );
    if (existing[0]?.source_updated_at && new Date(existing[0].source_updated_at).getTime() >= new Date(review.updatedAt).getTime()) continue;
    const [analysis, embedding] = await Promise.all([classifyWithGemini(review.body), embedText(review.body)]);
    await upsertRows("feedback", {
      movie_id: movieRow.id, source_key: review.source, external_id: review.externalId, author: review.author, title: review.title, body: review.body,
      url: review.url || null, rating: review.rating ?? null, sentiment: analysis.sentiment, occurred_at: review.occurredAt, source_updated_at: review.updatedAt,
      content_hash: null, embedding: embedding ? `[${embedding.join(",")}]` : null,
      metadata: { categories: analysis.categories, entities: analysis.entities, provider: review.metadata }, raw_source: review.raw,
    }, "source_key,external_id");
    changedReviews += 1;
  }

  const runId = crypto.randomUUID();
  await upsertRows("ingestion_runs", {
    id: runId, provider: "tmdb+nyt", movie_id: movieRow.id, status: "completed", records_seen: reviews.length + 1,
    records_changed: changedReviews + 1, started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
  });
  const snapshot = await getSnapshot(movieRow.id);
  if (!snapshot) throw new Error("Synchronized movie could not be loaded");
  return snapshot;
}
