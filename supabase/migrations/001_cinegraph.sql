-- CineGraph schema: run once in the Supabase SQL editor.
create extension if not exists pgcrypto;
create extension if not exists vector;

create table if not exists public.movies (
  id uuid primary key default gen_random_uuid(),
  tmdb_id bigint unique,
  imdb_id text,
  title text not null,
  release_date date,
  overview text,
  poster_path text,
  backdrop_path text,
  runtime integer,
  genres jsonb not null default '[]'::jsonb,
  director text,
  cast_members jsonb not null default '[]'::jsonb,
  ratings jsonb not null default '{}'::jsonb,
  raw_sources jsonb not null default '{}'::jsonb,
  is_tracked boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  tmdb_id bigint unique,
  name text not null,
  profile_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.movie_people (
  movie_id uuid not null references public.movies(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  role text not null,
  character_name text not null default '',
  billing_order integer,
  primary key (movie_id, person_id, role, character_name)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  description text,
  parent_id uuid references public.categories(id),
  created_at timestamptz not null default now()
);

insert into public.categories (slug, label, description) values
  ('visuals', 'Visuals', 'Cinematography, lighting, production design, and spectacle'),
  ('pacing', 'Pacing', 'Runtime, momentum, structure, and scene-level pacing'),
  ('performance', 'Performances', 'Acting and cast performances'),
  ('sound', 'Sound & score', 'Music, score, mixing, dialogue clarity, and sound design'),
  ('story', 'Story', 'Plot, screenplay, narrative structure, and ending'),
  ('character', 'Characters', 'Characterization, relationships, and arcs'),
  ('fidelity', 'Adaptation fidelity', 'Relationship to source material and mythology')
on conflict (slug) do update set label = excluded.label, description = excluded.description;

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references public.movies(id) on delete cascade,
  source_key text not null check (source_key in ('nyt', 'tmdb', 'user', 'demo', 'import')),
  external_id text,
  author text,
  title text,
  body text not null check (char_length(body) between 1 and 8000),
  url text,
  rating numeric,
  sentiment text not null default 'neutral' check (sentiment in ('positive', 'mixed', 'negative', 'neutral')),
  status text not null default 'active' check (status in ('active', 'edited', 'deleted')),
  occurred_at timestamptz not null default now(),
  source_updated_at timestamptz,
  content_hash text,
  embedding vector(768),
  metadata jsonb not null default '{}'::jsonb,
  raw_source jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (source_key, external_id)
);

create table if not exists public.feedback_categories (
  feedback_id uuid not null references public.feedback(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  confidence numeric not null check (confidence between 0 and 1),
  evidence text,
  created_at timestamptz not null default now(),
  primary key (feedback_id, category_id)
);

create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references public.movies(id) on delete cascade,
  entity_type text not null check (entity_type in ('movie', 'person', 'category', 'issue', 'source', 'company', 'concept')),
  name text not null,
  canonical_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (movie_id, canonical_key)
);

create table if not exists public.graph_edges (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references public.movies(id) on delete cascade,
  from_entity_id uuid not null references public.entities(id) on delete cascade,
  predicate text not null,
  to_entity_id uuid not null references public.entities(id) on delete cascade,
  feedback_id uuid references public.feedback(id) on delete cascade,
  confidence numeric not null default 1 check (confidence between 0 and 1),
  evidence text,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.feedback_versions (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.feedback(id) on delete cascade,
  version_number integer not null,
  operation text not null check (operation in ('created', 'updated', 'deleted', 'restored')),
  snapshot jsonb not null,
  actor text not null default 'pipeline',
  created_at timestamptz not null default now(),
  unique (feedback_id, version_number)
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid references public.movies(id) on delete cascade,
  action text not null check (action in ('created', 'updated', 'deleted', 'restored', 'synced', 'classified')),
  entity_type text not null check (entity_type in ('feedback', 'movie', 'graph', 'ingestion')),
  entity_id text not null,
  actor text not null default 'pipeline',
  source text not null default 'system',
  before_data jsonb,
  after_data jsonb,
  summary text,
  occurred_at timestamptz not null default now()
);

create table if not exists public.trend_snapshots (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references public.movies(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  window_start timestamptz not null,
  window_end timestamptz not null,
  total_count integer not null default 0,
  trend_score numeric not null default 0,
  sentiment_delta numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (movie_id, category_id, window_start, window_end)
);

create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  movie_id uuid references public.movies(id) on delete cascade,
  status text not null check (status in ('running', 'completed', 'failed')),
  records_seen integer not null default 0,
  records_changed integer not null default 0,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists feedback_movie_time_idx on public.feedback(movie_id, occurred_at desc);
create index if not exists feedback_status_idx on public.feedback(movie_id, status);
create index if not exists feedback_embedding_idx on public.feedback using hnsw (embedding vector_cosine_ops);
create index if not exists graph_edges_movie_idx on public.graph_edges(movie_id);
create index if not exists graph_edges_from_idx on public.graph_edges(from_entity_id);
create index if not exists graph_edges_to_idx on public.graph_edges(to_entity_id);
create index if not exists audit_movie_time_idx on public.audit_events(movie_id, occurred_at desc);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists movies_set_updated_at on public.movies;
create trigger movies_set_updated_at before update on public.movies for each row execute function public.set_updated_at();
drop trigger if exists feedback_set_updated_at on public.feedback;
create trigger feedback_set_updated_at before update on public.feedback for each row execute function public.set_updated_at();

create or replace function public.capture_feedback_history() returns trigger language plpgsql security definer set search_path = public as $$
declare
  next_version integer;
  event_action text;
begin
  select coalesce(max(version_number), 0) + 1 into next_version from public.feedback_versions where feedback_id = new.id;
  event_action := case
    when tg_op = 'INSERT' then 'created'
    when old.status <> 'deleted' and new.status = 'deleted' then 'deleted'
    when old.status = 'deleted' and new.status <> 'deleted' then 'restored'
    else 'updated'
  end;
  insert into public.feedback_versions (feedback_id, version_number, operation, snapshot)
  values (new.id, next_version, event_action, to_jsonb(new));
  insert into public.audit_events (movie_id, action, entity_type, entity_id, actor, source, before_data, after_data, summary)
  values (
    new.movie_id, event_action, 'feedback', new.id::text, 'pipeline', new.source_key,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end, to_jsonb(new),
    case event_action when 'created' then 'Feedback added and classified' when 'deleted' then 'Feedback soft-deleted; prior versions retained' when 'restored' then 'Feedback restored to active analysis' else 'Feedback updated and reclassified' end
  );
  return new;
end;
$$;

drop trigger if exists feedback_history on public.feedback;
create trigger feedback_history after insert or update on public.feedback for each row execute function public.capture_feedback_history();

create or replace function public.rebuild_feedback_graph() returns trigger language plpgsql security definer set search_path = public as $$
declare
  movie_node uuid;
  source_node uuid;
  target_node uuid;
  category_item jsonb;
  entity_name text;
begin
  delete from public.graph_edges where feedback_id = new.id;
  if new.status = 'deleted' then return new; end if;

  insert into public.entities (movie_id, entity_type, name, canonical_key)
  select new.movie_id, 'movie', title, 'movie:' || new.movie_id::text from public.movies where id = new.movie_id
  on conflict (movie_id, canonical_key) do update set name = excluded.name returning id into movie_node;

  insert into public.entities (movie_id, entity_type, name, canonical_key)
  values (new.movie_id, 'source', upper(new.source_key), 'source:' || new.source_key)
  on conflict (movie_id, canonical_key) do update set name = excluded.name returning id into source_node;

  insert into public.graph_edges (movie_id, from_entity_id, predicate, to_entity_id, feedback_id, confidence, evidence)
  values (new.movie_id, source_node, 'reviewed', movie_node, new.id, 1, left(new.body, 280));

  for category_item in select * from jsonb_array_elements(coalesce(new.metadata->'categories', '[]'::jsonb)) loop
    insert into public.entities (movie_id, entity_type, name, canonical_key)
    values (new.movie_id, 'category', category_item->>'label', 'category:' || (category_item->>'slug'))
    on conflict (movie_id, canonical_key) do update set name = excluded.name returning id into target_node;
    insert into public.graph_edges (movie_id, from_entity_id, predicate, to_entity_id, feedback_id, confidence, evidence)
    values (new.movie_id, movie_node,
      case new.sentiment when 'positive' then 'praised for' when 'negative' then 'criticized for' else 'discussed for' end,
      target_node, new.id, coalesce((category_item->>'confidence')::numeric, .5), category_item->>'evidence');
  end loop;

  for entity_name in select jsonb_array_elements_text(coalesce(new.metadata->'entities', '[]'::jsonb)) loop
    insert into public.entities (movie_id, entity_type, name, canonical_key)
    values (new.movie_id, 'concept', entity_name, 'mention:' || lower(regexp_replace(entity_name, '[^a-zA-Z0-9]+', '-', 'g')))
    on conflict (movie_id, canonical_key) do update set name = excluded.name returning id into target_node;
    insert into public.graph_edges (movie_id, from_entity_id, predicate, to_entity_id, feedback_id, confidence, evidence)
    values (new.movie_id, source_node, 'mentions', target_node, new.id, .84, left(new.body, 280));
  end loop;
  return new;
end;
$$;

drop trigger if exists feedback_graph on public.feedback;
create trigger feedback_graph after insert or update of body, sentiment, status, metadata on public.feedback for each row execute function public.rebuild_feedback_graph();

create or replace function public.match_feedback(
  query_embedding vector(768),
  match_movie_id uuid,
  match_count integer default 8,
  min_similarity double precision default 0.18
) returns table (
  id uuid, movie_id uuid, source_key text, author text, title text, body text, url text,
  sentiment text, occurred_at timestamptz, updated_at timestamptz, metadata jsonb, similarity double precision
) language sql stable security definer set search_path = public as $$
  select f.id, f.movie_id, f.source_key, f.author, f.title, f.body, f.url, f.sentiment,
    f.occurred_at, f.updated_at, f.metadata, 1 - (f.embedding <=> query_embedding) as similarity
  from public.feedback f
  where f.movie_id = match_movie_id and f.status <> 'deleted' and f.embedding is not null
    and 1 - (f.embedding <=> query_embedding) >= min_similarity
  order by f.embedding <=> query_embedding
  limit greatest(1, least(match_count, 20));
$$;

alter table public.movies enable row level security;
alter table public.people enable row level security;
alter table public.movie_people enable row level security;
alter table public.categories enable row level security;
alter table public.feedback enable row level security;
alter table public.feedback_categories enable row level security;
alter table public.entities enable row level security;
alter table public.graph_edges enable row level security;
alter table public.feedback_versions enable row level security;
alter table public.audit_events enable row level security;
alter table public.trend_snapshots enable row level security;
alter table public.ingestion_runs enable row level security;

revoke all on function public.match_feedback(vector, uuid, integer, double precision) from public, anon, authenticated;
grant execute on function public.match_feedback(vector, uuid, integer, double precision) to service_role;
