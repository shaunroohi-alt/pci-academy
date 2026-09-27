-- PCI Web App — public corpus, CMS lifecycle, publication validation.
-- Published content is readable by anyone; only staff can write. Revisions
-- create new versions; nothing overwrites version history.

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  type text not null check (type in ('book', 'chapter', 'booklet', 'article', 'research_note', 'framework', 'glossary', 'course', 'audio', 'front_matter', 'back_matter')),
  collection text,
  title text not null,
  summary text,
  canon_status text not null default 'provisional' check (canon_status in ('canonical', 'derived', 'extended', 'provisional', 'external_comparison', 'contradictory', 'deprecated')),
  status text not null default 'draft' check (status in ('draft', 'review', 'approved', 'published', 'revised', 'superseded')),
  chapter_order int,
  current_version int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.content_versions (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_items (id) on delete cascade,
  content_version int not null,
  title text not null,
  body text not null default '',
  canon_status text not null,
  canon_version text not null,
  status text not null default 'draft' check (status in ('draft', 'review', 'approved', 'published', 'revised', 'superseded')),
  supersedes uuid references public.content_versions (id),
  change_note text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (content_id, content_version)
);

-- Publication validation (§5.2): a title without a complete body cannot publish.
create or replace function public.content_is_publishable(p_title text, p_body text, p_canon_version text) returns boolean
language sql immutable as $$
  select coalesce(length(trim(p_title)), 0) > 0
     and coalesce(length(trim(p_body)), 0) >= 400
     and p_canon_version is not null
     and p_body !~* '(lorem ipsum|\mTBD\M|\mTODO\M|coming soon|\[placeholder\]|to be written|content to follow)';
$$;

create or replace function public.validate_content_version() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    -- Body, title and canon of an existing version are frozen; revise by adding a version.
    if new.body is distinct from old.body or new.title is distinct from old.title or new.canon_version is distinct from old.canon_version then
      raise exception 'content versions are immutable; create a new version to revise';
    end if;
  end if;
  if new.status = 'published' and not public.content_is_publishable(new.title, new.body, new.canon_version) then
    raise exception 'publication validation failed for "%": a complete body (400+ characters, no placeholders) and canon version are required', new.title;
  end if;
  return new;
end $$;
drop trigger if exists content_versions_validate on public.content_versions;
create trigger content_versions_validate before insert or update on public.content_versions for each row execute function public.validate_content_version();

-- Lifecycle: Draft -> Review -> Approved -> Published -> Revised -> Superseded.
create or replace function public.valid_transition(p_from text, p_to text) returns boolean
language sql immutable as $$
  select p_from = p_to or (p_from, p_to) in (
    ('draft', 'review'), ('review', 'draft'), ('review', 'approved'), ('approved', 'review'),
    ('approved', 'published'), ('published', 'revised'), ('revised', 'review'),
    ('revised', 'superseded'), ('published', 'superseded')
  );
$$;

create or replace function public.guard_content_item() returns trigger
language plpgsql as $$
declare v public.content_versions;
begin
  if tg_op = 'UPDATE' and not public.valid_transition(old.status, new.status) then
    raise exception 'invalid lifecycle transition % -> %', old.status, new.status;
  end if;
  if new.status = 'published' then
    select * into v from public.content_versions where content_id = new.id and content_version = new.current_version;
    if v.id is null or not public.content_is_publishable(v.title, v.body, v.canon_version) then
      raise exception 'publication validation failed for "%"', new.title;
    end if;
    new.published_at := coalesce(new.published_at, now());
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists content_items_guard on public.content_items;
create trigger content_items_guard before insert or update on public.content_items for each row execute function public.guard_content_item();

create table if not exists public.content_relationships (
  from_slug text not null references public.content_items (slug) on delete cascade,
  to_slug text not null references public.content_items (slug) on delete cascade,
  relationship text not null default 'related_to',
  primary key (from_slug, to_slug, relationship)
);

create table if not exists public.glossary_terms (
  slug text primary key,
  term text not null,
  definition text not null check (length(definition) > 0),
  canon_status text not null default 'provisional',
  status text not null default 'draft' check (status in ('draft', 'review', 'approved', 'published', 'revised', 'superseded')),
  updated_at timestamptz not null default now()
);

create table if not exists public.journal_prompts (
  id text primary key,
  ord int not null,
  text text not null,
  concept text not null,
  canon_status text not null default 'provisional',
  status text not null default 'draft' check (status in ('draft', 'review', 'approved', 'published', 'revised', 'superseded'))
);

create table if not exists public.courses (
  slug text primary key,
  title text not null,
  summary text not null,
  canon_status text not null default 'derived',
  status text not null default 'draft' check (status in ('draft', 'review', 'approved', 'published', 'revised', 'superseded')),
  entitlement text not null default 'academy.course.*'
);

create table if not exists public.course_modules (
  course_slug text not null references public.courses (slug) on delete cascade,
  slug text not null,
  title text not null,
  ord int not null,
  primary key (course_slug, slug)
);

create table if not exists public.lessons (
  course_slug text not null references public.courses (slug) on delete cascade,
  lesson_id text not null,
  module_slug text not null,
  ord int not null,
  title text not null,
  video_url text,
  transcript text,
  related_chapters text[] not null default '{}',
  related_concepts text[] not null default '{}',
  journal_prompt text not null,
  optional_observation boolean not null default true,
  resources jsonb not null default '[]',
  primary key (course_slug, lesson_id),
  constraint lessons_video_needs_transcript check (video_url is null or length(coalesce(transcript, '')) > 0)
);

-- Audio shares the content identity and is bound to the text version (§6.3).
create table if not exists public.audio_assets (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_items (id) on delete cascade,
  text_version int not null,
  audio_version int not null,
  voice text not null,
  duration_seconds int not null check (duration_seconds > 0),
  transcript text,
  audio_url text not null,
  created_at timestamptz not null default now(),
  unique (content_id, audio_version)
);

create or replace view public.current_audio with (security_invoker = true) as
  select a.* from public.audio_assets a
  join public.content_items c on c.id = a.content_id
  where a.text_version = c.current_version;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null check (kind in ('gathering', 'seminar', 'discussion')),
  starts_at timestamptz not null,
  location text not null,
  description text not null,
  capacity int,
  status text not null default 'draft' check (status in ('draft', 'published'))
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null check (kind in ('coaching', 'consultation', 'workshop')),
  description text not null,
  duration_minutes int not null,
  price_note text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published'))
);

-- Read: published to everyone; everything to staff. Write: staff only.
do $$
declare t text;
begin
  foreach t in array array['content_items', 'content_relationships', 'content_versions', 'glossary_terms', 'journal_prompts', 'courses', 'course_modules', 'lessons', 'audio_assets', 'events', 'services'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists staff_write on public.%I', t);
    execute format('create policy staff_write on public.%I for all using (public.is_staff()) with check (public.is_staff())', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

drop policy if exists public_read on public.content_items;
create policy public_read on public.content_items for select using (status = 'published' or public.is_staff());
drop policy if exists public_read on public.content_versions;
create policy public_read on public.content_versions for select using (status = 'published' or public.is_staff());
drop policy if exists public_read on public.content_relationships;
create policy public_read on public.content_relationships for select using (true);
drop policy if exists public_read on public.glossary_terms;
create policy public_read on public.glossary_terms for select using (status = 'published' or public.is_staff());
drop policy if exists public_read on public.journal_prompts;
create policy public_read on public.journal_prompts for select using (status in ('approved', 'published') or public.is_staff());
drop policy if exists public_read on public.courses;
create policy public_read on public.courses for select using (status = 'published' or public.is_staff());
drop policy if exists public_read on public.course_modules;
create policy public_read on public.course_modules for select using (true);
drop policy if exists public_read on public.lessons;
create policy public_read on public.lessons for select using (true);
drop policy if exists public_read on public.audio_assets;
create policy public_read on public.audio_assets for select using (true);
drop policy if exists public_read on public.events;
create policy public_read on public.events for select using (status = 'published' or public.is_staff());
drop policy if exists public_read on public.services;
create policy public_read on public.services for select using (status = 'published' or public.is_staff());
