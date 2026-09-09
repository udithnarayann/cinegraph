import { NextRequest, NextResponse } from "next/server";
import { getDefaultMovieSnapshot } from "@/lib/server/default-movie";
import { getSnapshot } from "@/lib/server/repository";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const movie = request.nextUrl.searchParams.get("movie") || undefined;
    const snapshot = movie ? await getSnapshot(movie) : await getDefaultMovieSnapshot();
    if (!snapshot) return NextResponse.json({ error: "Movie not found" }, { status: 404 });
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Snapshot unavailable" }, { status: 503 });
  }
}
