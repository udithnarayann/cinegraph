import { NextRequest, NextResponse } from "next/server";
import { isWriteAuthorized } from "@/lib/server/env";
import { graphRag } from "@/lib/server/rag";
import type { Feedback } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function POST(request: NextRequest) {
  if (!isWriteAuthorized(request)) return NextResponse.json({ error: "Invalid admin key" }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (question.length < 3 || question.length > 1_000 || !body.movieId) {
      return NextResponse.json({ error: "A question and movieId are required" }, { status: 400 });
    }
    const supplied = Array.isArray(body.feedback) ? (body.feedback as Feedback[]).slice(0, 150) : [];
    return NextResponse.json(await graphRag(question, String(body.movieId), String(body.movieTitle || "Selected movie"), supplied));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Graph RAG failed" }, { status: 500 });
  }
}
