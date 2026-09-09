import { NextRequest, NextResponse } from "next/server";
import { env, isCronAuthorized } from "@/lib/server/env";
import { syncMovie } from "@/lib/server/sync";
import { hasSupabase, selectRows } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasSupabase() || !env.tmdbToken) return NextResponse.json({ ok: true, skipped: "Supabase or TMDB is not configured" });
  const movies = await selectRows<{ tmdb_id: number }>("movies", "select=tmdb_id&is_tracked=eq.true&tmdb_id=not.is.null&limit=5");
  const results: Array<{ tmdbId: number; ok: boolean; error?: string }> = [];
  for (const movie of movies) {
    try {
      await syncMovie(movie.tmdb_id);
      results.push({ tmdbId: movie.tmdb_id, ok: true });
    } catch (error) {
      results.push({ tmdbId: movie.tmdb_id, ok: false, error: error instanceof Error ? error.message : "Sync failed" });
    }
  }
  return NextResponse.json({ ok: results.every((result) => result.ok), results, timestamp: new Date().toISOString() });
}
