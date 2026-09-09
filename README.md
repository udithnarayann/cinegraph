# CineGraph

> A time-boxed interview project that turns continuously updated movie feedback into trends, an auditable knowledge graph, and evidence-grounded answers.

[Live Demo](YOUR_VERCEL_URL) Â· [Architecture](#architecture) Â· [API Reference](#api-routes)

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20pgvector-3ecf8e)
![Gemini](https://img.shields.io/badge/Gemini-Graph%20RAG-8aa8ff)
![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black)

## Overview

CineGraph was built from this product brief:

> Automatically categorize movie feedback, surface trending categories and issues, and maintain a complete audit trail as reviews are added, edited, or deleted.

The deployed application:

- synchronizes real movie metadata and reviews;
- classifies sentiment, categories, and named entities;
- detects emerging discussion themes and sentiment changes;
- builds an interactive, evidence-backed knowledge graph;
- answers natural-language questions with Graph RAG;
- cites the feedback used for each answer; and
- preserves feedback versions and audit events in PostgreSQL.

The default movie is Christopher Nolan's **The Odyssey**, but any movie returned by TMDB can be selected and synchronized.

## Core features

- **Live ingestion:** TMDB metadata and user reviews, NYT professional-review coverage, and optional OMDb enrichment
- **Automated analysis:** Gemini sentiment classification, category assignment, entity extraction, and 768-dimensional embeddings
- **Trend intelligence:** category momentum, sentiment summaries, and recent activity visualization
- **Knowledge graph:** movies, people, sources, categories, concepts, and evidence-supported relationships
- **Graph RAG:** vector retrieval, graph-aware context construction, and cited Gemini synthesis
- **Auditability:** add, edit, soft-delete, and restore feedback while retaining append-only versions
- **Continuous updates:** manual source synchronization plus a daily Vercel Cron job
- **Traceability:** source payloads, timestamps, URLs, evidence excerpts, and feedback IDs

## Architecture

~~~mermaid
flowchart TD
  A["TMDB metadata + reviews"] --> D["Ingestion pipeline"]
  B["NYT Article Search"] --> D
  C["OMDb (optional)"] --> D
  D --> E["Gemini analysis + embeddings"]
  E --> F["Supabase Postgres + pgvector"]
  F --> G["Trends + knowledge graph"]
  F --> H["Graph RAG"]
  G --> I["Next.js dashboard"]
  H --> I
~~~

### Ingestion flow

1. A movie is opened, selected, or scheduled for synchronization.
2. TMDB supplies canonical metadata and up to eight user reviews.
3. NYT Article Search adds matching professional-review summaries and links.
4. OMDb optionally enriches aggregate ratings and box-office metadata.
5. Gemini classifies changed reviews and creates embeddings.
6. Normalized records are idempotently upserted into Supabase.
7. PostgreSQL triggers create versions, audit events, graph nodes, and graph edges.
8. The dashboard recalculates trends and renders the current evidence graph.

## Knowledge graph

A knowledge graph represents information as **entities** and **relationships**, instead of isolated records.

In CineGraph, feedback can produce relationships such as:

~~~text
TMDB â”€â”€reviewedâ”€â”€â”€â”€â”€â”€â”€â”€â–¶ The Odyssey
The Odyssey â”€â”€praised forâ”€â”€â”€â”€â–¶ Visuals
The Odyssey â”€â”€criticized forâ”€â–¶ Pacing
TMDB â”€â”€mentionsâ”€â”€â”€â”€â”€â”€â”€â”€â–¶ Matt Damon
~~~

Every feedback-derived edge retains its supporting feedback ID, confidence, and evidence excerpt. When feedback is edited, deleted, or restored, a database trigger rebuilds its relationships so the graph remains consistent with active evidence.

## Graph RAG

Graph RAG combines semantic retrieval with knowledge-graph relationships:

1. The question is converted into a 768-dimensional Gemini embedding.
2. Supabase pgvector retrieves the most relevant active feedback.
3. Connected categories and entities create a graph-aware evidence path.
4. Only retrieved evidence and its IDs are sent to Gemini.
5. Gemini produces a grounded answer with feedback-ID citations.
6. The UI exposes the path, source excerpts, and original URLs.

If vector retrieval or Gemini generation is unavailable, deterministic lexical retrieval and extractive-answer fallbacks remain available.

## Tech stack

| Technology | Use |
|---|---|
| Next.js 16 + React 19 | Dashboard, server rendering, and API routes |
| TypeScript | End-to-end type safety |
| Tailwind CSS + Radix UI | Responsive interface and accessible components |
| Recharts | Trend visualization |
| Supabase PostgreSQL | Persistent data, graph tables, triggers, and audit history |
| pgvector | Semantic similarity search over review embeddings |
| Gemini | Classification, entity extraction, embeddings, and answer synthesis |
| TMDB API | Movie search, metadata, credits, images, ratings, and user reviews |
| NYT Article Search API | Professional-review summaries and links |
| OMDb API | Optional ratings, awards, and box-office enrichment |
| Vercel | Hosting, serverless execution, and scheduled synchronization |

## Data-source decisions and constraints

IMDb was considered as suggested during the interview, but API access was still awaiting approval within the project window. TMDB was therefore used as the primary movie and audience-review source.

The legacy NYT Movie Reviews API was unavailable, so the integration was adapted to the NYT Article Search API for professional-review coverage. It provides metadata, summaries, and article links rather than full copyrighted review text.

The implementation was designed around free-tier constraints:

- provider review availability varies by movie;
- bounded scheduled synchronization protects API quotas;
- TMDB ingestion is limited to eight reviews per synchronization;
- NYT ingestion is limited to two matching review articles;
- Vercel Cron runs daily; and
- unchanged reviews are skipped to avoid unnecessary Gemini calls.

Here, **continuous** means scheduled synchronization plus immediate processing of user-added feedback.

## Getting started

### Prerequisites

- Node.js 22.13 or newer
- Supabase, TMDB, Gemini, and NYT API credentials
- Optional OMDb API credentials

### 1. Install

~~~bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd cinegraph
npm install
~~~

### 2. Create the database

Run the following file once in the Supabase **SQL Editor**:

~~~text
supabase/migrations/001_cinegraph.sql
~~~

It installs pgvector, creates the relational and graph tables, enables Row Level Security, adds indexes, installs audit/graph triggers, and defines the match_feedback similarity function.

### 3. Configure the environment

~~~bash
cp .env.example .env.local
~~~

~~~dotenv
# Use the TMDB Read Access Token or API key; both are not required.
TMDB_API_READ_TOKEN=your_tmdb_read_token
# TMDB_API_KEY=your_tmdb_api_key

# Christopher Nolan's The Odyssey
DEFAULT_TMDB_MOVIE_ID=1241982

NYT_API_KEY=your_nyt_article_search_key
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-2.5-flash

SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Optional
OMDB_API_KEY=

# Recommended security
APP_ADMIN_KEY=choose_a_long_random_value
CRON_SECRET=choose_a_different_random_value
~~~

Never expose server secrets with a NEXT_PUBLIC_ prefix. If APP_ADMIN_KEY is configured, enter the same value in the app's connection settings; it is retained only in that browser tab's sessionStorage.

### 4. Run locally

~~~bash
npm run dev
~~~

Open [http://localhost:3000](http://localhost:3000).

On the first request, CineGraph loads the configured movie from Supabase or synchronizes it from the providers if it is not stored yet.

## Available scripts

| Command | Purpose |
|---|---|
| npm run dev | Start the development server |
| npm run typecheck | Run TypeScript validation |
| npm run lint | Run ESLint |
| npm run build | Create the production build |
| npm start | Run the production build |
| npm run test:smoke | Exercise the core API workflow |

## Deploying to Vercel

1. Push the project to GitHub.
2. Import the repository into Vercel.
3. Keep the detected framework as **Next.js**.
4. Add the same environment variables used in .env.local.
5. Deploy.

vercel.json schedules /api/cron/sync daily at 08:00 UTC. When CRON_SECRET is configured, Vercel sends it as a bearer token.

## API routes

| Route | Method | Purpose |
|---|---:|---|
| /api/status | GET | Safe integration health without secrets |
| /api/snapshot | GET | Complete dashboard snapshot |
| /api/movies/search?q= | GET | TMDB movie search |
| /api/sync | POST | Synchronize one TMDB movie |
| /api/feedback | POST | Classify and create feedback |
| /api/feedback/:id | PATCH | Edit and reclassify feedback |
| /api/feedback/:id | DELETE | Soft-delete feedback |
| /api/feedback/:id | POST | Restore feedback |
| /api/rag | POST | Run Graph RAG |
| /api/cron/sync | GET | Synchronize tracked movies on schedule |

Write and AI routes require the x-admin-key header when APP_ADMIN_KEY is configured.

## Audit model

- Feedback is soft-deleted through the UI.
- Every add, edit, soft-delete, or restore creates a JSON snapshot in feedback_versions.
- Every mutation creates an audit_events record.
- Deleted feedback is excluded from trends, graph projection, and RAG retrieval.
- Restoring feedback creates a new version and reconstructs graph relationships.
- Raw provider payloads are retained in raw_source and raw_sources.

## Project structure

~~~text
app/                         Next.js pages and server API routes
components/                  Dashboard, graph, charts, and UI primitives
lib/analytics.ts             Trends and graph projection
lib/server/default-movie.ts  Startup-movie resolution
lib/server/providers.ts      TMDB, NYT, and OMDb adapters
lib/server/gemini.ts         Classification, embeddings, and synthesis
lib/server/repository.ts     Supabase persistence boundary
lib/server/rag.ts            Hybrid retrieval and graph-aware RAG
lib/server/sync.ts           Idempotent ingestion pipeline
supabase/migrations/         Schema, triggers, and vector RPC
vercel.json                  Hosting and cron configuration
~~~

## Known limitations

- Public APIs do not provide equally rich review coverage for every movie.
- The NYT adapter stores summaries and links, not full articles.
- Synchronization is bounded for free-tier quotas and serverless execution time.
- The graph taxonomy is intentionally focused on movie-feedback concepts.
- Authentication uses an admin-key safeguard rather than full user accounts.

## Future improvements

- Add IMDb as a normalized provider when API access is approved.
- Move ingestion to a durable background queue for larger volumes.
- Add user authentication and role-based permissions.
- Support deeper multi-hop traversal over the persisted graph.
- Add provider retries, caching, and observability.

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB. External data remains subject to each provider's terms and attribution requirements.

## License

MIT
