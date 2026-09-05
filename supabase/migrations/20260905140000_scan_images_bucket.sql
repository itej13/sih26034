-- The scan-images bucket. Storage's other half: once an officer's device has real photograph
-- bytes to upload, scans.image_url points here instead of at a fixture path under /fixtures.
--
-- Private, not public. The evidence chain hashes the original photograph
-- (lib/evidence.ts's payload_sha256 / image_sha256), and a photograph of somebody's shop is not
-- something this project serves to the open internet by default. Read and write are both gated
-- on auth.uid() is not null — the same check the init migration already uses for
-- rule_packs_read_all — rather than inventing a second officer-identity scheme just for storage.
--
-- Safe to run twice: `on conflict do nothing` for the bucket row, `drop policy if exists`
-- before each `create policy`.

insert into storage.buckets (id, name, public)
values ('scan-images', 'scan-images', false)
on conflict (id) do nothing;

drop policy if exists scan_images_insert_officer on storage.objects;
create policy scan_images_insert_officer on storage.objects for insert
  with check (bucket_id = 'scan-images' and auth.uid() is not null);

drop policy if exists scan_images_read_officer on storage.objects;
create policy scan_images_read_officer on storage.objects for select
  using (bucket_id = 'scan-images' and auth.uid() is not null);
