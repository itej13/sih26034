-- Two gaps left by the init migration, closed together because both block the same flow:
-- an officer cannot get from signup to a stored scan without a profile row, and the
-- evidence chain they'd eventually write is unverifiable without a server-computed hash.

-- ---------------------------------------------------------------------------
-- Evidence hash chain. The init migration made `evidence` append-only but left prev_hash
-- and row_hash as plain client-supplied columns — a client can write any row_hash it
-- likes and the table has no way to notice it doesn't chain to anything. Computed here
-- instead, in a BEFORE INSERT trigger that overwrites whatever the client sent.
-- ---------------------------------------------------------------------------

create function evidence_chain() returns trigger
  language plpgsql security definer set search_path = public
as $$
declare
  last_hash text;
  input     text;
begin
  -- Serialise appends to one scan's chain for the rest of this transaction. Without it two
  -- concurrent inserts both read the same last row, both claim it as prev_hash, and the
  -- chain forks into two links that each look valid in isolation — which is exactly the
  -- ambiguity a hash chain exists to remove. Keyed on scan_id, so unrelated scans never wait.
  perform pg_advisory_xact_lock(hashtext(new.scan_id));

  -- The real previous link, not whatever the client put in NEW.prev_hash. Null for the
  -- first row of a scan's chain, same as the init migration's comment on this column.
  select row_hash into last_hash
    from evidence
   where scan_id = new.scan_id
   order by seq desc
   limit 1;

  new.prev_hash := last_hash;

  -- Netstring-style framing (byte-length prefix + ':' per field, fields simply
  -- concatenated with no separator between them) rather than a plain delimiter. With a
  -- plain delimiter, a value that happens to contain that delimiter could shift bytes
  -- across a field boundary and still hash to something that looks like a legitimate
  -- chain link. A length prefix makes each field's boundary a fact derived from the
  -- field itself, so there is no character left for a forged value to embed.
  -- recorded_at goes in as epoch seconds, not its text cast, so the hash a verifier
  -- recomputes later from the stored column doesn't depend on the session's TimeZone
  -- setting at insert time.
  input :=
    octet_length(new.scan_id)::text                                   || ':' || new.scan_id ||
    octet_length(new.officer_id)::text                                || ':' || new.officer_id ||
    octet_length(new.image_sha256)::text                               || ':' || new.image_sha256 ||
    octet_length(new.payload_sha256)::text                             || ':' || new.payload_sha256 ||
    octet_length(extract(epoch from new.recorded_at)::text)::text      || ':' || extract(epoch from new.recorded_at)::text ||
    octet_length(coalesce(last_hash, ''))::text                        || ':' || coalesce(last_hash, '');

  -- sha256() is core Postgres (11+), so this needs no extension. pgcrypto's digest() would
  -- have meant depending on WHICH schema pgcrypto happens to be installed in, and
  -- `create extension if not exists` silently keeps an existing install wherever it already
  -- is — so a schema-qualified call is a deployment-time coin flip.
  new.row_hash := encode(sha256(convert_to(input, 'UTF8')), 'hex');

  return new;
end $$;

create trigger evidence_chain_before_insert before insert on evidence
  for each row execute function evidence_chain();

-- ---------------------------------------------------------------------------
-- Profile creation. Nothing created a profiles row on signup, so current_officer_code()
-- returned null for a brand-new account and scans_insert_own rejected every insert it
-- tried to make. A trigger on auth.users, the standard Supabase pattern for this, closes
-- the gap at the source instead of trusting application code to remember.
-- ---------------------------------------------------------------------------

-- Backs officer_code generation. A sequence rather than counting existing profiles: it
-- stays unique under two concurrent signups, where a count-then-format would collide.
-- Starts at 100 so a generated code can never collide with a hand-seeded low one: the six
-- team officers and the fixtures occupy off_001..off_0NN, officer_code is UNIQUE, and a
-- collision would surface as a failed signup rather than as anything diagnosable.
create sequence officer_code_seq start with 100;

create function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  -- officer_code's shape ("off_007") is a fixture contract — see the init migration's
  -- comment on profiles.officer_code. full_name is left null (no signup form collects
  -- it yet) and role keeps its column default of 'officer'.
  insert into profiles (id, officer_code)
  values (new.id, 'off_' || lpad(nextval('officer_code_seq')::text, 3, '0'));
  return new;
end $$;

create trigger users_create_profile after insert on auth.users
  for each row execute function handle_new_user();
