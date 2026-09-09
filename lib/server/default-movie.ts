import "server-only";
import { env } from "@/lib/server/env";
import { getSnapshot } from "@/lib/server/repository";
import { syncMovie } from "@/lib/server/sync";

export async function getDefaultMovieSnapshot() {
  if (!env.defaultTmdbMovieId) {
    throw new Error("Set DEFAULT_TMDB_MOVIE_ID to a valid TMDB movie ID");
  }

  const existing = await getSnapshot(String(env.defaultTmdbMovieId));
  return existing || syncMovie(env.defaultTmdbMovieId);
}
