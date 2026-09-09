import "server-only";
import { env } from "@/lib/server/env";

function headers(prefer?: string) {
  return {
    apikey: env.supabaseServiceKey,
    Authorization: `Bearer ${env.supabaseServiceKey}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

export function hasSupabase() {
  return Boolean(env.supabaseUrl && env.supabaseServiceKey);
}

export async function supabaseRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!hasSupabase()) throw new Error("Supabase is not configured");
  const response = await fetch(`${env.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers || {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${detail.slice(0, 180)}`);
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

export async function selectRows<T>(table: string, query = "select=*") {
  return supabaseRequest<T[]>(`${table}?${query}`);
}

export async function insertRows<T>(table: string, rows: unknown | unknown[]) {
  return supabaseRequest<T[]>(table, {
    method: "POST",
    headers: headers("return=representation"),
    body: JSON.stringify(rows),
  });
}

export async function upsertRows<T>(table: string, rows: unknown | unknown[], onConflict?: string) {
  const query = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : "";
  return supabaseRequest<T[]>(`${table}${query}`, {
    method: "POST",
    headers: headers("resolution=merge-duplicates,return=representation"),
    body: JSON.stringify(rows),
  });
}

export async function patchRows<T>(table: string, filter: string, patch: unknown) {
  return supabaseRequest<T[]>(`${table}?${filter}`, {
    method: "PATCH",
    headers: headers("return=representation"),
    body: JSON.stringify(patch),
  });
}

export async function deleteRows(table: string, filter: string) {
  return supabaseRequest<null>(`${table}?${filter}`, { method: "DELETE", headers: headers("return=minimal") });
}

export async function rpc<T>(name: string, body: unknown) {
  return supabaseRequest<T>(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
}
