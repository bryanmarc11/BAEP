-- ============================================================
-- BSESS shared evidence backend — Supabase schema
-- Run once in the Supabase SQL Editor (Dashboard > SQL Editor).
-- ============================================================

-- 1. Custodian accounts are created by you in Auth > Users.
--    There is no public sign-up. Do not enable it.

-- 2. Evidence metadata table
create table if not exists public.evidence (
  id          uuid primary key default gen_random_uuid(),
  path        text not null,               -- e.g. area-3/A/system/S.1.1
  area_id     text not null,               -- e.g. area-3
  title       text not null,
  notes       text default '',
  kind        text not null check (kind in ('file','link')),
  storage_key text,                        -- object key in the 'evidence' bucket
  url         text,                        -- for kind='link'
  size_bytes  bigint,
  mime        text,
  uploaded_by uuid not null references auth.users(id) default auth.uid(),
  uploader_name text,
  created_at  timestamptz not null default now(),

  constraint file_has_key check (kind <> 'file' or storage_key is not null),
  constraint link_has_url check (kind <> 'link' or url is not null),
  -- Reject non-http(s) schemes at the database layer, not just in the browser.
  constraint url_scheme_safe check (
    url is null or url ~* '^https?://'
  )
);

create index if not exists evidence_path_idx on public.evidence (path);
create index if not exists evidence_area_idx on public.evidence (area_id);

-- 3. Per-indicator status
create table if not exists public.indicator_status (
  path       text primary key,
  area_id    text not null,
  status     text not null check (status in ('not-started','in-progress','complete','verified')),
  updated_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now()
);

create index if not exists status_area_idx on public.indicator_status (area_id);

-- 4. Row Level Security
--    Storage does not permit uploads to a bucket with no policy, and tables
--    behave the same way: default deny. Every rule below is explicit.
alter table public.evidence enable row level security;
alter table public.indicator_status enable row level security;

revoke all on table public.evidence from anon;
revoke all on table public.indicator_status from anon;

-- Any signed-in custodian may read everything. This is the whole point:
-- shared visibility across the task force.
create policy "custodians read evidence"
  on public.evidence for select to authenticated using (true);

create policy "custodians insert evidence"
  on public.evidence for insert to authenticated
  with check (uploaded_by = auth.uid());

-- Deliberately narrow: you may only delete what you uploaded.
-- Accreditation evidence should not be silently removable by anyone.
create policy "custodians delete own evidence"
  on public.evidence for delete to authenticated
  using (uploaded_by = auth.uid());

create policy "custodians read status"
  on public.indicator_status for select to authenticated using (true);

create policy "custodians write status"
  on public.indicator_status for insert to authenticated
  with check (updated_by = auth.uid());

create policy "custodians update status"
  on public.indicator_status for update to authenticated
  using (true) with check (updated_by = auth.uid());

-- 5. Storage bucket — PRIVATE. A public bucket is readable by anyone who
--    guesses the URL, which is wrong for institutional documents.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence', 'evidence', false, 26214400,   -- 25 MB per file
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

-- 6. Storage policies. Note these are on storage.objects, not the bucket.
create policy "custodians upload evidence files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence');

create policy "custodians read evidence files"
  on storage.objects for select to authenticated
  using (bucket_id = 'evidence');

create policy "custodians delete own evidence files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'evidence' and owner = auth.uid());

-- ============================================================
-- Verification: run these and confirm they behave as described.
--   set role anon;   select * from public.evidence;   -- must return 0 rows / error
--   reset role;
-- ============================================================
