-- WH Field Log: initial schema.
-- Columns mirror src/lib/types.ts one for one. Timestamps are epoch milliseconds
-- (bigint) set by the client; updated_at is the last-write-wins clock used by
-- sync. Run this in the Supabase SQL editor, or with `supabase db push`.

create table if not exists jobs (
  id             text primary key,
  created_at     bigint not null,
  updated_at     bigint not null,
  name           text not null default '',
  customer       text not null default '',
  circuit        text not null default '',
  layer_plan     jsonb not null default '{"silicone": 4, "pvdf": 2}',
  wire_preset    text not null default 'two',
  wire_type_default    jsonb not null default '{"thickness": "#2 (0.32 in)", "voltage": "4 kV", "material": "ACSR"}',
  default_pass_minutes jsonb not null default '{"silicone": 60, "pvdf": 120}',
  notes          text not null default ''
);

-- A street (or line segment). Poles and spans are filed under it.
create table if not exists runs (
  id         text primary key,
  created_at bigint not null,
  updated_at bigint not null,
  job_id     text not null,
  name       text not null default '',
  deleted_at bigint
);

-- Poles the crew has recorded. A pole with no live span shows as "No span yet".
create table if not exists poles (
  id         text primary key,
  created_at bigint not null,
  updated_at bigint not null,
  job_id     text not null,
  run_id     text,
  pole_id    text not null,
  notes      text not null default '',
  deleted_at bigint
);

create table if not exists spans (
  id            text primary key,
  created_at    bigint not null,
  updated_at    bigint not null,
  job_id        text not null,
  run_id        text,
  seq           integer not null default 0,
  pole_a        text not null,
  pole_b        text not null,
  length_ft     double precision,
  length_source text,
  street        text not null default '',
  landmark      text not null default '',
  road          text not null default 'bottom',
  preset        text not null default 'two',
  wires         jsonb not null default '[]',
  layer_plan    jsonb not null default '{"silicone": 4, "pvdf": 2}',
  wire_type     jsonb not null default '{"thickness": "#2 (0.32 in)", "voltage": "4 kV", "material": "ACSR"}',
  notes         text not null default '',
  deleted_at    bigint
);

create table if not exists passes (
  id         text primary key,
  created_at bigint not null,
  updated_at bigint not null,
  job_id     text not null,
  span_id    text not null,
  wire_idx   integer not null,
  side       text not null,          -- 'A' | 'B' | 'full'
  material   text not null,          -- 'silicone' | 'pvdf'
  layer      integer not null,
  robot      integer not null,
  start      bigint not null,
  "end"      bigint,
  status     text not null,          -- running | complete | partial | interrupted | failed
  pct        integer not null default 0,
  reason     text not null default '',
  operator   text not null default '',
  notes      text not null default '',
  source     text not null default 'live'
);

create table if not exists robots (
  id         text primary key,
  created_at bigint not null,
  updated_at bigint not null,
  number     integer not null,
  name       text not null default '',
  type       text not null,          -- 'silicone' | 'pvdf'
  active     boolean not null default true,
  notes      text not null default '',
  deleted_at bigint
);

create table if not exists edits (
  id         text primary key,
  created_at bigint not null,
  updated_at bigint not null,
  job_id     text not null,
  entity     text not null,          -- 'pass' | 'span'
  entity_id  text not null,
  changes    jsonb not null default '{}',
  who        text not null default '',
  reason     text not null default ''
);

-- Incremental pulls scan by updated_at; the rest support the app's queries.
create index if not exists jobs_updated_at_idx   on jobs (updated_at);
create index if not exists runs_updated_at_idx   on runs (updated_at);
create index if not exists poles_updated_at_idx  on poles (updated_at);
create index if not exists poles_job_idx         on poles (job_id);
create index if not exists spans_updated_at_idx  on spans (updated_at);
create index if not exists passes_updated_at_idx on passes (updated_at);
create index if not exists robots_updated_at_idx on robots (updated_at);
create index if not exists edits_updated_at_idx  on edits (updated_at);
create index if not exists spans_job_idx   on spans (job_id);
create index if not exists passes_span_idx on passes (span_id);
create index if not exists passes_job_idx  on passes (job_id);
create unique index if not exists robots_number_idx on robots (number);

-- No foreign keys on purpose: the client pushes its outbox in order, but a
-- pass can reach the server before its span if an earlier push failed. The
-- app tolerates that; strict FKs would reject the row.
--
-- Deletes are soft (deleted_at) so they sync like any other change. Passes are
-- never deleted; a deleted span's passes stay for history and exports.

-- Row-level security: any signed-in user (the crew) can read and write
-- everything. Tighten to per-organization policies before adding a second
-- customer or outside users.
alter table jobs   enable row level security;
alter table runs   enable row level security;
alter table poles  enable row level security;
alter table spans  enable row level security;
alter table passes enable row level security;
alter table robots enable row level security;
alter table edits  enable row level security;

create policy "crew all" on jobs   for all to authenticated using (true) with check (true);
create policy "crew all" on runs   for all to authenticated using (true) with check (true);
create policy "crew all" on poles  for all to authenticated using (true) with check (true);
create policy "crew all" on spans  for all to authenticated using (true) with check (true);
create policy "crew all" on passes for all to authenticated using (true) with check (true);
create policy "crew all" on robots for all to authenticated using (true) with check (true);
create policy "crew all" on edits  for all to authenticated using (true) with check (true);
