import { NextRequest, NextResponse } from "next/server";
import { isWriteAuthorized } from "@/lib/server/env";
import { createFeedback } from "@/lib/server/repository";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  if (!isWriteAuthorized(request)) return NextResponse.json({ error: "Invalid admin key" }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!body.movieId || typeof body.body !== "string" || body.body.trim().length < 8 || body.body.length > 8_000) {
      return NextResponse.json({ error: "movieId and 8–8,000 characters of feedback are required" }, { status: 400 });
    }
    const feedback = await createFeedback({
      movieId: String(body.movieId), author: String(body.author || "Anonymous").slice(0, 120), body: body.body.trim(),
      source: body.source === "import" ? "import" : "user", title: body.title ? String(body.title).slice(0, 240) : undefined,
      url: body.url ? String(body.url).slice(0, 1_000) : undefined,
    });
    return NextResponse.json({ feedback }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not add feedback" }, { status: 500 });
  }
}
