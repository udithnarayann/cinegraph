import "server-only";
import { CATEGORY_RULES } from "@/lib/analytics";
import { answerWithGemini, embedText } from "@/lib/server/gemini";
import { hasSupabase, rpc } from "@/lib/server/supabase";
import type { Feedback, RagAnswer } from "@/lib/types";

const STOP_WORDS = new Set(["the", "a", "an", "and", "or", "but", "about", "what", "why", "how", "is", "are", "was", "were", "do", "does", "people", "movie", "film", "feedback"]);

function terms(text: string) {
  return text.toLowerCase().match(/[a-z0-9']+/g)?.filter((term) => term.length > 2 && !STOP_WORDS.has(term)) || [];
}

function lexicalRetrieve(question: string, feedback: Feedback[], count = 8) {
  const queryTerms = terms(question);
  const categoryHits = Object.entries(CATEGORY_RULES)
    .filter(([slug, rule]) => question.toLowerCase().includes(slug) || rule.words.some((word) => question.toLowerCase().includes(word)))
    .map(([slug]) => slug);
  return feedback
    .filter((item) => item.status !== "deleted")
    .map((item) => {
      const haystack = `${item.body} ${item.title || ""} ${item.author} ${item.categories.map((category) => category.label).join(" ")} ${item.entities.join(" ")}`.toLowerCase();
      const matches = queryTerms.filter((term) => haystack.includes(term)).length;
      const categoryBoost = item.categories.some((category) => categoryHits.includes(category.slug)) ? 3 : 0;
      return { item, score: matches * 2 + categoryBoost + (item.sentiment !== "neutral" ? 0.2 : 0) };
    })
    .sort((a, b) => b.score - a.score || new Date(b.item.occurredAt).getTime() - new Date(a.item.occurredAt).getTime())
    .filter((entry, index) => entry.score > 0 || index < 4)
    .slice(0, count)
    .map((entry) => entry.item);
}

function graphPath(question: string, evidence: Feedback[], movieTitle: string) {
  const categoryCounts = new Map<string, number>();
  const entityCounts = new Map<string, number>();
  evidence.forEach((item) => {
    item.categories.forEach((category) => categoryCounts.set(category.label, (categoryCounts.get(category.label) || 0) + 1));
    item.entities.forEach((entity) => entityCounts.set(entity, (entityCounts.get(entity) || 0) + 1));
  });
  const category = [...categoryCounts].sort((a, b) => b[1] - a[1])[0]?.[0] || "Feedback";
  const entity = [...entityCounts].sort((a, b) => b[1] - a[1])[0]?.[0];
  return [question, movieTitle, category, ...(entity ? [entity] : []), `${evidence.length} evidence items`];
}

function extractiveAnswer(question: string, evidence: Feedback[], path: string[]): RagAnswer {
  if (!evidence.length) return { answer: "There is not enough indexed feedback to answer that yet.", citations: [], path, mode: "extractive" };
  const positive = evidence.filter((item) => item.sentiment === "positive").length;
  const negative = evidence.filter((item) => item.sentiment === "negative").length;
  const mixed = evidence.length - positive - negative;
  const tone = positive > negative + mixed ? "mostly positive" : negative > positive ? "mostly critical" : "mixed";
  const topCategories = [...new Set(evidence.flatMap((item) => item.categories.map((category) => category.label)))].slice(0, 3);
  const examples = evidence.slice(0, 3).map((item) => `${item.body} [${item.id}]`).join(" ");
  return {
    answer: `The relevant feedback is ${tone}, with the strongest signals around ${topCategories.join(", ") || "general reception"}. ${examples}`,
    citations: evidence.slice(0, 6).map((item) => ({ feedbackId: item.id, source: item.source.toUpperCase(), author: item.author, excerpt: item.body.slice(0, 180), url: item.url })),
    path,
    mode: "extractive",
  };
}

type MatchRow = { id: string; movie_id: string; source_key: Feedback["source"]; author: string; title: string | null; body: string; url: string | null; sentiment: Feedback["sentiment"]; occurred_at: string; updated_at: string; metadata: { categories?: Feedback["categories"]; entities?: string[] } | null };

export async function graphRag(question: string, movieId: string, movieTitle: string, suppliedFeedback: Feedback[] = []) {
  let evidence = lexicalRetrieve(question, suppliedFeedback);
  if (hasSupabase()) {
    const embedding = await embedText(question);
    if (embedding) {
      try {
        const rows = await rpc<MatchRow[]>("match_feedback", { query_embedding: `[${embedding.join(",")}]`, match_movie_id: movieId, match_count: 8, min_similarity: 0.18 });
        if (rows.length) {
          evidence = rows.map((row) => ({
            id: row.id, movieId: row.movie_id, source: row.source_key, author: row.author || "Anonymous", title: row.title || undefined,
            body: row.body, url: row.url || undefined, sentiment: row.sentiment, categories: row.metadata?.categories || [], entities: row.metadata?.entities || [],
            occurredAt: row.occurred_at, updatedAt: row.updated_at, status: "active" as const,
          }));
        }
      } catch {
        // Lexical retrieval remains available when embeddings are absent or the RPC is not installed.
      }
    }
  }
  const path = graphPath(question, evidence, movieTitle);
  return (await answerWithGemini(question, evidence, path)) || extractiveAnswer(question, evidence, path);
}
