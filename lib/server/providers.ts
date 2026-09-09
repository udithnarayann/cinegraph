import "server-only";
import { env } from "@/lib/server/env";
import type { Movie } from "@/lib/types";

const TMDB_BASE = "https://api.themoviedb.org/3";

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Upstream request failed (${response.status})`);
  return response.json() as Promise<T>;
}

function tmdbHeaders(): Record<string, string> {
  if (!env.tmdbToken) throw new Error("TMDB is not configured");
  return env.tmdbToken.startsWith("ey")
    ? { Authorization: `Bearer ${env.tmdbToken}`, accept: "application/json" }
    : { accept: "application/json" };
}

function tmdbUrl(path: string, params: URLSearchParams) {
  if (env.tmdbToken && !env.tmdbToken.startsWith("ey")) params.set("api_key", env.tmdbToken);
  return `${TMDB_BASE}${path}?${params}`;
}

interface TmdbSearchResult {
  id: number;
  title: string;
  release_date?: string;
  overview?: string;
  poster_path?: string | null;
  vote_average?: number;
}

export async function searchTmdb(query: string) {
  const params = new URLSearchParams({ query, include_adult: "false", language: "en-US", page: "1" });
  const data = await getJson<{ results: TmdbSearchResult[] }>(tmdbUrl("/search/movie", params), { headers: tmdbHeaders() });
  return data.results.slice(0, 8).map((movie) => ({
    tmdbId: movie.id,
    title: movie.title,
    year: movie.release_date ? Number(movie.release_date.slice(0, 4)) : 0,
    overview: movie.overview || "No overview available.",
    posterUrl: movie.poster_path ? `https://image.tmdb.org/t/p/w342${movie.poster_path}` : undefined,
    rating: movie.vote_average || 0,
  }));
}

interface TmdbDetail extends TmdbSearchResult {
  imdb_id?: string;
  backdrop_path?: string | null;
  runtime?: number;
  genres?: Array<{ id: number; name: string }>;
  credits?: {
    cast?: Array<{ id: number; name: string; character?: string; profile_path?: string | null }>;
    crew?: Array<{ id: number; name: string; job?: string; department?: string; profile_path?: string | null }>;
  };
  keywords?: { keywords?: Array<{ id: number; name: string }> };
  external_ids?: { imdb_id?: string };
  production_companies?: Array<{ id: number; name: string }>;
  reviews?: {
    results?: Array<{
      id: string;
      author?: string;
      content: string;
      created_at?: string;
      updated_at?: string;
      url?: string;
      author_details?: { username?: string; rating?: number | null };
    }>;
  };
}

export async function fetchTmdbMovie(tmdbId: number) {
  const params = new URLSearchParams({ append_to_response: "credits,keywords,external_ids,reviews", language: "en-US" });
  const data = await getJson<TmdbDetail>(tmdbUrl(`/movie/${tmdbId}`, params), { headers: tmdbHeaders() });
  const director = data.credits?.crew?.find((person) => person.job === "Director")?.name;
  const movie: Movie = {
    id: String(data.id),
    tmdbId: data.id,
    imdbId: data.imdb_id || data.external_ids?.imdb_id,
    title: data.title,
    year: data.release_date ? Number(data.release_date.slice(0, 4)) : 0,
    releaseDate: data.release_date,
    overview: data.overview || "No overview available.",
    posterUrl: data.poster_path ? `https://image.tmdb.org/t/p/w780${data.poster_path}` : undefined,
    backdropUrl: data.backdrop_path ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}` : undefined,
    runtime: data.runtime,
    genres: data.genres?.map((genre) => genre.name) || [],
    director,
    cast: data.credits?.cast?.slice(0, 10).map((person) => person.name) || [],
    ratings: { TMDB: data.vote_average ? Number(data.vote_average.toFixed(1)) : "N/A" },
    tracked: true,
    lastSyncedAt: new Date().toISOString(),
  };
  return {
    movie,
    people: [
      ...(data.credits?.cast?.slice(0, 20).map((person) => ({ ...person, role: "cast" as const })) || []),
      ...(data.credits?.crew?.filter((person) => ["Director", "Writer", "Director of Photography", "Original Music Composer"].includes(person.job || "")).map((person) => ({ ...person, role: "crew" as const })) || []),
    ],
    keywords: data.keywords?.keywords || [],
    companies: data.production_companies || [],
    reviews: (data.reviews?.results || []).slice(0, 8).map((review) => ({
      externalId: `tmdb:${review.id}`,
      author: review.author || review.author_details?.username || "TMDB user",
      title: `${data.title} — TMDB user review`,
      body: review.content.slice(0, 8000),
      url: review.url || `https://www.themoviedb.org/review/${review.id}`,
      rating: review.author_details?.rating ?? undefined,
      occurredAt: review.created_at || new Date().toISOString(),
      updatedAt: review.updated_at || review.created_at || new Date().toISOString(),
      metadata: { rating: review.author_details?.rating ?? null },
      raw: review,
    })),
    raw: data,
  };
}

export async function fetchOmdb(imdbId?: string) {
  if (!env.omdbKey || !imdbId) return null;
  const params = new URLSearchParams({ apikey: env.omdbKey, i: imdbId, plot: "full" });
  const data = await getJson<Record<string, unknown>>(`https://www.omdbapi.com/?${params}`);
  if (data.Response === "False") return null;
  const ratings: Record<string, string> = {};
  for (const rating of (data.Ratings as Array<{ Source: string; Value: string }> | undefined) || []) ratings[rating.Source] = rating.Value;
  return { data, ratings };
}

interface NytArticle {
  _id: string;
  web_url?: string;
  snippet?: string;
  abstract?: string;
  pub_date?: string;
  section_name?: string;
  news_desk?: string;
  type_of_material?: string;
  headline?: { main?: string; print_headline?: string };
  byline?: { original?: string };
  keywords?: Array<{ name?: string; value?: string }>;
}

export async function fetchNytReviews(title: string) {
  if (!env.nytKey) return [];
  const params = new URLSearchParams({ q: `"${title}" review`, fq: 'section_name:("Movies")', sort: "newest", page: "0", "api-key": env.nytKey });
  const data = await getJson<{ response?: { docs?: NytArticle[] } }>(`https://api.nytimes.com/svc/search/v2/articlesearch.json?${params}`);
  const titleWords = title.toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => word.length > 3 && word !== "the") || [];
  return (data.response?.docs || [])
    .filter((article) => {
      const text = [article.headline?.main, article.headline?.print_headline, article.abstract, article.snippet].filter(Boolean).join(" ").toLowerCase();
      const matchesTitle = titleWords.some((word) => text.includes(word));
      const looksLikeReview = article.type_of_material?.toLowerCase() === "review" || text.includes("review");
      return matchesTitle && looksLikeReview;
    })
    .slice(0, 2)
    .map((article) => {
      const publishedAt = article.pub_date || new Date().toISOString();
      return {
        externalId: `nyt:${article._id}`,
        author: article.byline?.original?.replace(/^By\s+/i, "") || "The New York Times",
        title: article.headline?.main || article.headline?.print_headline || `${title} review`,
        body: article.abstract || article.snippet || "Review available at The New York Times.",
        url: article.web_url,
        rating: undefined,
        occurredAt: publishedAt,
        updatedAt: publishedAt,
        metadata: {
          materialType: article.type_of_material,
          section: article.section_name,
          newsDesk: article.news_desk,
          keywords: article.keywords?.map((keyword) => keyword.value).filter(Boolean) || [],
        },
        raw: article,
      };
    });
}
