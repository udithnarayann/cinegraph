import "server-only";
import { heuristicClassify } from "@/lib/analytics";
import { env } from "@/lib/server/env";
import type { Feedback, FeedbackCategory, RagAnswer, Sentiment } from "@/lib/types";

type Classification = { sentiment: Sentiment; categories: FeedbackCategory[]; entities: string[] };

function cleanJson(text: string) {
  return text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
}

async function generate(prompt: string, json = false): Promise<string> {
  if (!env.geminiKey) throw new Error("Gemini is not configured");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:generateContent?key=${env.geminiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.15, maxOutputTokens: 1200, ...(json ? { responseMimeType: "application/json" } : {}) },
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return data.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("") || "";
}

export async function classifyWithGemini(text: string): Promise<Classification> {
  if (!env.geminiKey) return heuristicClassify(text);
  const prompt = `Classify this movie feedback. Return JSON only with keys sentiment, categories, entities.
sentiment must be positive, mixed, negative, or neutral.
categories must be an array of 1-4 objects: {slug,label,confidence,evidence}. Use only these slugs: visuals, pacing, performance, sound, story, character, fidelity. confidence is 0-1. evidence is a short phrase from the feedback.
entities is an array of explicitly mentioned people, characters, companies, or movie-specific concepts. Do not invent entities.

Feedback: ${JSON.stringify(text)}`;
  try {
    const parsed = JSON.parse(cleanJson(await generate(prompt, true))) as Classification;
    if (!Array.isArray(parsed.categories) || !Array.isArray(parsed.entities)) throw new Error("Invalid classification");
    return parsed;
  } catch {
    return heuristicClassify(text);
  }
}

export async function embedText(text: string): Promise<number[] | null> {
  if (!env.geminiKey) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${env.geminiKey}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "models/gemini-embedding-001",
        content: { parts: [{ text }] },
        taskType: "RETRIEVAL_DOCUMENT",
        outputDimensionality: 768,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return null;
    const data = await response.json() as { embedding?: { values?: number[] } };
    return data.embedding?.values || null;
  } catch {
    return null;
  }
}

export async function answerWithGemini(question: string, evidence: Feedback[], graphPath: string[]): Promise<RagAnswer | null> {
  if (!env.geminiKey || !evidence.length) return null;
  const context = evidence
    .map((item) => `[${item.id}] ${item.source.toUpperCase()} — ${item.author} — ${item.sentiment} — ${item.body}`)
    .join("\n");
  const prompt = `You are a movie feedback analyst. Answer only from the supplied evidence. Be direct, distinguish consensus from disagreement, and cite every factual claim with feedback IDs in square brackets. Never cite an ID not supplied. If evidence is insufficient, say so.

Question: ${question}
Graph traversal: ${graphPath.join(" → ")}
Evidence:
${context}`;
  try {
    const answer = await generate(prompt);
    return {
      answer,
      citations: evidence.map((item) => ({ feedbackId: item.id, source: item.source.toUpperCase(), author: item.author, excerpt: item.body.slice(0, 180), url: item.url })),
      path: graphPath,
      mode: "gemini",
    };
  } catch {
    return null;
  }
}
