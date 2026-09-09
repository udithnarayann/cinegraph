import { NextResponse } from "next/server";
import { integrations } from "@/lib/server/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const connected = integrations();
  return NextResponse.json({
    ok: true,
    mode: connected.supabase ? "live" : "unconfigured",
    integrations: connected,
    timestamp: new Date().toISOString(),
  });
}
