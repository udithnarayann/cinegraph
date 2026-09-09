import { NextRequest, NextResponse } from "next/server";
import { isWriteAuthorized } from "@/lib/server/env";
import { syncMovie } from "@/lib/server/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!isWriteAuthorized(request)) return NextResponse.json({ error: "Invalid admin key" }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const tmdbId = Number(body.tmdbId);
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) return NextResponse.json({ error: "A valid TMDB movie ID is required" }, { status: 400 });
    return NextResponse.json(await syncMovie(tmdbId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sync failed" }, { status: 500 });
  }
}
