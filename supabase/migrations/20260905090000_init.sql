-- The Label Object Model, as Postgres.
--
-- Every table below mirrors a shape in lib/types.ts. That file is the frozen contract and this
-- file follows it — if they ever disagree, lib/types.ts wins and this migration is the bug.
-- Run `npm run check:contract` after touching either.
--
-- Two things here are not bookkeeping and should survive any refactor:
--   1. A measurement cannot exist without its expanded uncertainty. Enforced by NOT NULL, not
--      by convention, because a bare number is the failure this project exists to prevent.
--   2. `evidence` is append-only, enforced by trigger. A record that can be edited after the
--      fact is not evidence, and the Section 63 certificate rests on this.

-- ---------------------------------------------------------------------------
-- Enums. Closed vocabularies, so a typo fails at insert rather than at demo.
-- ---------------------------------------------------------------------------

create type app_role as enum ('officer', 'admin');

create type verdict as enum ('COMPLIANT', 'VIOLATION', 'INDETERMINATE');

create type field_key as enum (
  'mrp', 'net_qty', 'mfg_date', 'manufacturer', 'consumer_care', 'generic_name'
);

create type metric_kind as enum ('numeral_height_mm', 'numeral_width_mm');

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

-- Named `profiles`, not `users`, because Supabase already owns `auth.users` and two tables
-- called users in one database is a bug waiting for a tired evening. This is the only
-- deliberate deviation from the data model recorded in the wiki.
create table profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  -- The contract's `officer_id` is a string like "off_007", not a uuid, and fixtures depend on
  -- that. This column is what scans point at; `id` is what auth compares against.
  officer_code text not null unique,
  full_name    text,
  role         app_role not null default 'officer',
  created_at   timestamptz not null default now()
);

create function current_officer_code() returns text
  language sql stable security definer set search_path = public
as $$ select officer_code from profiles where id = auth.uid() $$;

create function is_admin() returns boolean
  language sql stable security definer set search_path = public
as $$ select exists (select 1 from profiles where id = auth.uid() and role = 'admin') $$;

-- ---------------------------------------------------------------------------
-- The legal framework, as data
-- ---------------------------------------------------------------------------

create table rule_packs (
  pack_id        text primary key,           -- "lmpc@2026-07-01"
  effective_from date not null,
  title          text not null,
  pack           jsonb not null,             -- the packs/*.json file, verbatim
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Scans and their parts
-- ---------------------------------------------------------------------------

create table scans (
  scan_id      text primary key,             -- "sc_0142"
  captured_at  timestamptz not null,
  officer_id   text not null references profiles (officer_code),
  image_url    text not null,
  image_sha256 text not null,
  gps_lat      double precision,
  gps_lon      double precision,
  -- Nested objects stay jsonb so this table cannot drift from the contract one column at a
  -- time. Flatten a field only when a dashboard query actually needs to filter on it.
  calibration  jsonb not null,               -- mode, marker_mm, mm_per_px, uncertainty_mm_per_px, squareness_residual
  pdp          jsonb not null,               -- poly, area_cm2, confidence
  other_print  jsonb not null default '[]'::jsonb,
  rule_pack    text not null references rule_packs (pack_id),
  overall      verdict not null,             -- worst-wins rollup of findings
  created_at   timestamptz not null default now()
);

create table fields (
  id                   bigint generated always as identity primary key,
  scan_id              text not null references scans (scan_id) on delete cascade,
  key                  field_key not null,
  text                 text not null,
  value                jsonb,                -- number | string | {n,unit} | null
  poly                 jsonb not null,       -- clockwise from top-left, RECTIFIED pixels
  numeral_poly         jsonb,
  confidence           double precision not null,
  corrected_by_officer boolean not null default false
);

create table measurements (
  id                      bigint generated always as identity primary key,
  scan_id                 text not null references scans (scan_id) on delete cascade,
  field                   field_key not null,
  metric                  metric_kind not null,
  value                   double precision not null,
  -- Not nullable, on purpose. See the header.
  expanded_uncertainty_mm double precision not null check (expanded_uncertainty_mm >= 0),
  k                       smallint not null default 2 check (k = 2)
);

create table findings (
  id        bigint generated always as identity primary key,
  scan_id   text not null references scans (scan_id) on delete cascade,
  rule_ref  text not null,                   -- "7(3)"
  verdict   verdict not null,
  measured  text not null,
  required  text not null,
  rule_pack text not null references rule_packs (pack_id),
  rule_text text not null,                   -- quoted verbatim from the Gazette
  message   text
);

-- ---------------------------------------------------------------------------
-- Evidence. Append-only, hash-chained.
-- ---------------------------------------------------------------------------

create table evidence (
  seq            bigint generated always as identity primary key,
  scan_id        text not null references scans (scan_id),
  recorded_at    timestamptz not null default now(),
  officer_id     text not null references profiles (officer_code),
  image_sha256   text not null,
  payload_sha256 text not null,
  -- The previous row's row_hash. Null only on the first row of the chain.
  prev_hash      text,
  row_hash       text not null
);

create function evidence_is_append_only() returns trigger
  language plpgsql
as $$
begin
  raise exception 'evidence is append-only; % is not permitted', tg_op;
end $$;

create trigger evidence_no_update before update on evidence
  for each row execute function evidence_is_append_only();

create trigger evidence_no_delete before delete on evidence
  for each row execute function evidence_is_append_only();

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index scans_officer_idx on scans (officer_id);
create index scans_captured_idx on scans (captured_at desc);
create index fields_scan_idx on fields (scan_id);
create index measurements_scan_idx on measurements (scan_id);
create index findings_scan_idx on findings (scan_id);
create index evidence_scan_idx on evidence (scan_id, seq);

-- ---------------------------------------------------------------------------
-- Row-level security. An officer sees their own work; an admin sees everything.
-- Enforced here rather than in application code, so a forgotten `where` in a route
-- cannot leak another officer's scans.
-- ---------------------------------------------------------------------------

alter table profiles     enable row level security;
alter table rule_packs   enable row level security;
alter table scans        enable row level security;
alter table fields       enable row level security;
alter table measurements enable row level security;
alter table findings     enable row level security;
alter table evidence     enable row level security;

create policy profiles_read_self on profiles for select
  using (id = auth.uid() or is_admin());

create policy rule_packs_read_all on rule_packs for select
  using (auth.uid() is not null);

create policy scans_read_own on scans for select
  using (officer_id = current_officer_code() or is_admin());

create policy scans_insert_own on scans for insert
  with check (officer_id = current_officer_code());

-- Child rows inherit their parent's visibility rather than restating the rule.
create policy fields_read on fields for select
  using (exists (select 1 from scans s where s.scan_id = fields.scan_id));

create policy fields_insert on fields for insert
  with check (exists (select 1 from scans s where s.scan_id = fields.scan_id));

-- The one table an officer edits by hand: `corrected_by_officer` exists because the model's
-- classification of which string is the MRP is a judgement, and the officer overrules it.
-- Correcting a field after evidence is written deliberately breaks the chain hash — that is
-- the chain doing its job, not a bug.
create policy fields_update on fields for update
  using (exists (select 1 from scans s where s.scan_id = fields.scan_id))
  with check (exists (select 1 from scans s where s.scan_id = fields.scan_id));

create policy measurements_read on measurements for select
  using (exists (select 1 from scans s where s.scan_id = measurements.scan_id));

create policy measurements_insert on measurements for insert
  with check (exists (select 1 from scans s where s.scan_id = measurements.scan_id));

create policy findings_read on findings for select
  using (exists (select 1 from scans s where s.scan_id = findings.scan_id));

create policy findings_insert on findings for insert
  with check (exists (select 1 from scans s where s.scan_id = findings.scan_id));

-- Insert and select only. No update policy and no delete policy exist, so RLS refuses both
-- before the triggers above ever fire — belt and braces, deliberately.
create policy evidence_read on evidence for select
  using (exists (select 1 from scans s where s.scan_id = evidence.scan_id));

create policy evidence_insert on evidence for insert
  with check (officer_id = current_officer_code());
