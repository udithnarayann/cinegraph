import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/server/env";
import { searchTmdb } from "@/lib/server/providers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() || "";
  if (query.length < 2) return NextResponse.json({ results: [] });
  if (!env.tmdbToken) return NextResponse.json({ error: "TMDB is not configured" }, { status: 503 });
  try {
    return NextResponse.json({ results: await searchTmdb(query) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Movie search failed" }, { status: 502 });
  }
}
