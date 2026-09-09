import { NextRequest, NextResponse } from "next/server";
import { isWriteAuthorized } from "@/lib/server/env";
import { restoreFeedback, softDeleteFeedback, updateFeedback } from "@/lib/server/repository";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isWriteAuthorized(request)) return NextResponse.json({ error: "Invalid admin key" }, { status: 401 });
  try {
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.body !== "string" || body.body.trim().length < 8 || body.body.length > 8_000) {
      return NextResponse.json({ error: "Feedback must contain 8–8,000 characters" }, { status: 400 });
    }
    return NextResponse.json({ feedback: await updateFeedback(id, {
      body: body.body.trim(),
      author: typeof body.author === "string" ? body.author.slice(0, 120) : undefined,
      title: typeof body.title === "string" ? body.title.slice(0, 240) : undefined,
    }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update feedback" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isWriteAuthorized(request)) return NextResponse.json({ error: "Invalid admin key" }, { status: 401 });
  try {
    const { id } = await context.params;
    await softDeleteFeedback(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete feedback" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isWriteAuthorized(request)) return NextResponse.json({ error: "Invalid admin key" }, { status: 401 });
  try {
    const { id } = await context.params;
    await restoreFeedback(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not restore feedback" }, { status: 500 });
  }
}
