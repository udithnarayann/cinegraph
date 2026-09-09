import "server-only";

const configuredDefaultTmdbId = Number.parseInt(process.env.DEFAULT_TMDB_MOVIE_ID || "", 10);

export const env = {
  tmdbToken: process.env.TMDB_API_READ_TOKEN || process.env.TMDB_API_KEY || "",
  defaultTmdbMovieId: Number.isInteger(configuredDefaultTmdbId) && configuredDefaultTmdbId > 0 ? configuredDefaultTmdbId : null,
  nytKey: process.env.NYT_API_KEY || "",
  omdbKey: process.env.OMDB_API_KEY || "",
  geminiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  supabaseUrl: (process.env.SUPABASE_URL || "").replace(/\/$/, ""),
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  adminKey: process.env.APP_ADMIN_KEY || "",
  cronSecret: process.env.CRON_SECRET || "",
};

export const integrations = () => ({
  tmdb: Boolean(env.tmdbToken),
  nyt: Boolean(env.nytKey),
  omdb: Boolean(env.omdbKey),
  gemini: Boolean(env.geminiKey),
  supabase: Boolean(env.supabaseUrl && env.supabaseServiceKey),
});

export function isWriteAuthorized(request: Request) {
  if (!env.adminKey) return true;
  const supplied = request.headers.get("x-admin-key") || "";
  if (supplied.length !== env.adminKey.length) return false;
  let mismatch = 0;
  for (let index = 0; index < supplied.length; index += 1) mismatch |= supplied.charCodeAt(index) ^ env.adminKey.charCodeAt(index);
  return mismatch === 0;
}

export function isCronAuthorized(request: Request) {
  if (!env.cronSecret && process.env.NODE_ENV !== "production") return true;
  return Boolean(env.cronSecret && request.headers.get("authorization") === `Bearer ${env.cronSecret}`);
}
