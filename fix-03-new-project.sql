-- ============================================================
-- FIX-03 — for project fjnkhbygwyerjetajvin (the NEW project).
-- Run ONCE in the Supabase SQL Editor.
--
-- Verified state of this project just now, by direct REST probe:
--   evidence table          exists, readable            HTTP 200
--   indicator_status table  exists, readable+writable   HTTP 200 / 201
--   storage buckets         NONE  ->  select returns []
--   path_shape constraint   STILL THE BROKEN VERSION
--
-- Proof the constraint is broken here: inserting the real path
-- 'area-1/A/system/S.1' returns 400 (23514 path_shape), while a path
-- containing a literal backslash inserted successfully with 201. That is the
-- signature of the '\\.' vs '\.' escaping bug — fix-02 was applied to the old
-- project, not this one.
--
-- Cleanup precedes the constraint, which is the ordering mistake that made
-- fix-01 abort. Runs in one transaction; safe to re-run.
-- ============================================================

begin;

-- ---------- Step 1: remove rows that cannot satisfy the constraint ----------
-- '__bs__' is my probe row (path 'area-1/A/system/S\.1'), inserted to prove
-- the bug. Inspect before deleting if you have real data:
--   select id, path, title from public.evidence
--    where path !~ '^area-([1-9]|10)/[A-Z]/(system|implementation|outcome)/[SIO]\.[0-9]+(\.[0-9]+){0,2}$';
delete from public.evidence
 where title in ('__bs__', '__vfy2__', '__vfy3__', '__probe__', '__probe_bs__', '__conn probe__');

delete from public.evidence
 where path !~ '^area-([1-9]|10)/[A-Z]/(system|implementation|outcome)/[SIO]\.[0-9]+(\.[0-9]+){0,2}$';

-- My status probe on area-1/A/system/S.1, so you start clean.
delete from public.indicator_status where path = 'area-1/A/system/S.1';

-- ---------- Step 2: replace the broken constraint ----------
alter table public.evidence drop constraint if exists path_shape;

alter table public.evidence add constraint path_shape check (
  path ~ '^area-([1-9]|10)/[A-Z]/(system|implementation|outcome)/[SIO]\.[0-9]+(\.[0-9]+){0,2}$'
);

-- ---------- Step 3: create the storage bucket ----------
-- Confirmed missing: GET /storage/v1/bucket returned []. Without this every
-- upload fails with "Bucket not found".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence', 'evidence', false, 26214400,   -- private, 25 MB per file
  array['application/pdf','image/jpeg','image/png','image/webp',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------- Step 4: storage policies (on storage.objects) ----------
drop policy if exists "anyone uploads evidence files" on storage.objects;
drop policy if exists "anyone reads evidence files"   on storage.objects;

create policy "anyone uploads evidence files"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'evidence');

create policy "anyone reads evidence files"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'evidence');

commit;

-- ============================================================
-- Verification — run AFTER the script succeeds.
-- ============================================================
-- 1. select count(*) from public.evidence;                      -- expect 0
-- 2. insert into public.evidence (path, area_id, title, kind, url)
--    values ('area-1/A/system/S.1','area-1','verify2','link','https://example.org');
-- 3. insert into public.evidence (path, area_id, title, kind, url)
--    values ('area-10/F/implementation/I.4.5.1','area-10','verify3','link','https://example.org');
-- 4. insert into public.evidence (path, area_id, title, kind, url)
--    values ('nonsense','area-1','bad','link','https://example.org');   -- must raise 23514
-- 5. select id, public, file_size_limit from storage.buckets where id = 'evidence';
-- 6. delete from public.evidence where title in ('verify2','verify3');
