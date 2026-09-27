-- PCI Web App — foundation: profiles, roles, private material with RLS.
-- Canon 2026.09.25. Every private table is owned by exactly one user and
-- isolated by Row-Level Security. Raw evidence tables are write-once.


-- ── Profiles & roles ───────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role text not null default 'member' check (role in ('member', 'editor', 'admin')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('editor', 'admin'));
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_self_update on public.profiles;
-- Members may edit their display name; role changes are admin-only (enforced by trigger).
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.guard_profile_role() returns trigger
language plpgsql as $$
begin
  -- End users (a JWT subject) need admin rights; the service role and SQL
  -- console (no subject) are how the first administrator is appointed.
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only an administrator can change roles.';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role before update on public.profiles for each row execute function public.guard_profile_role();
grant select on public.profiles to authenticated;
grant update (display_name, role) on public.profiles to authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ── Private material ───────────────────────────────────────────────────
-- Each table stores the client document (doc) plus typed columns derived
-- from it. Composite key (user_id, id): ids are only unique per user.

create or replace function public.prevent_update() returns trigger
language plpgsql as $$
begin
  raise exception '%.% is write-once: raw evidence and analysis versions are never edited', tg_table_schema, tg_table_name;
end $$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  if new.updated_at is null or new.updated_at = old.updated_at then
    new.updated_at := now();
  end if;
  return new;
end $$;

do $$
declare
  t text;
  private_tables text[] := array[
    'observation_inputs', 'observation_addenda', 'observation_versions', 'drafts',
    'journal_entries', 'ledger_entries', 'contrary_sessions', 'bookmarks', 'highlights',
    'notes', 'reading_positions', 'course_enrollments', 'lesson_progress', 'twin_versions',
    'preferences', 'event_registrations', 'service_requests'
  ];
  immutable_tables text[] := array['observation_inputs', 'observation_addenda', 'observation_versions', 'twin_versions'];
begin
  foreach t in array private_tables loop
    execute format($f$
      create table if not exists public.%1$I (
        user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
        id text not null,
        doc jsonb not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        primary key (user_id, id),
        constraint %1$s_doc_id check (doc->>'id' = id)
      )$f$, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists owner_select on public.%I', t);
    execute format('create policy owner_select on public.%I for select using (user_id = auth.uid())', t);
    execute format('drop policy if exists owner_insert on public.%I', t);
    execute format('create policy owner_insert on public.%I for insert with check (user_id = auth.uid())', t);
    execute format('drop policy if exists owner_delete on public.%I', t);
    execute format('create policy owner_delete on public.%I for delete using (user_id = auth.uid())', t);
    execute format('drop policy if exists owner_update on public.%I', t);
    if t = any (immutable_tables) then
      execute format('drop trigger if exists %1$s_write_once on public.%1$I', t);
      execute format('create trigger %1$s_write_once before update on public.%1$I for each row execute function public.prevent_update()', t);
    else
      execute format('create policy owner_update on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
      execute format('drop trigger if exists %1$s_touch on public.%1$I', t);
      execute format('create trigger %1$s_touch before update on public.%1$I for each row execute function public.touch_updated_at()', t);
    end if;
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Typed columns for the evidence chain.
alter table public.observation_inputs add column if not exists raw text generated always as (doc->>'raw') stored;
alter table public.observation_inputs add column if not exists content_hash text generated always as (doc->>'content_hash') stored;
alter table public.observation_inputs add column if not exists source_type text generated always as (doc->>'source_type') stored;
alter table public.observation_addenda add column if not exists observation_id text generated always as (doc->>'observation_id') stored;
alter table public.observation_versions add column if not exists observation_id text generated always as (doc->>'observation_id') stored;
alter table public.observation_versions add column if not exists status text generated always as (doc->>'status') stored;
alter table public.observation_versions add column if not exists report jsonb generated always as (doc->'report') stored;
alter table public.journal_entries add column if not exists entry_date text generated always as (doc->>'date') stored;
alter table public.ledger_entries add column if not exists kind text generated always as (doc->>'kind') stored;
alter table public.contrary_sessions add column if not exists status text generated always as (doc->>'status') stored;

alter table public.observation_inputs drop constraint if exists observation_inputs_raw_present;
alter table public.observation_inputs add constraint observation_inputs_raw_present check (length(coalesce(doc->>'raw', '')) > 0);

-- An analysis version belongs to an existing observation of the same user.
create or replace function public.check_version_parent() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from public.observation_inputs o where o.user_id = new.user_id and o.id = new.doc->>'observation_id') then
    raise exception 'analysis version refers to an unknown observation';
  end if;
  if new.doc->>'status' = 'valid' and (new.doc->'report' is null or new.doc->'report'->>'boundary' <> 'PCI boundary reached: the report ends at observation. No prescription is generated.') then
    raise exception 'a valid analysis must carry a report that ends at the PCI boundary';
  end if;
  return new;
end $$;
drop trigger if exists observation_versions_parent on public.observation_versions;
create trigger observation_versions_parent before insert on public.observation_versions for each row execute function public.check_version_parent();

-- Deleting an observation deletes its addenda and analysis versions.
create or replace function public.cascade_observation_delete() returns trigger
language plpgsql as $$
begin
  delete from public.observation_addenda where user_id = old.user_id and observation_id = old.id;
  delete from public.observation_versions where user_id = old.user_id and observation_id = old.id;
  return old;
end $$;
drop trigger if exists observation_inputs_cascade on public.observation_inputs;
create trigger observation_inputs_cascade after delete on public.observation_inputs for each row execute function public.cascade_observation_delete();

-- Blueprint table names (§7.2) as read-only views over the stored documents.
-- security_invoker makes the caller's RLS apply.
create or replace view public.observations with (security_invoker = true) as
  select user_id, id, raw, source_type, content_hash, created_at from public.observation_inputs;
create or replace view public.observational_reports with (security_invoker = true) as
  select user_id, id, observation_id, (doc->>'version')::int as version, status, report, created_at from public.observation_versions;
create or replace view public.user_preferences with (security_invoker = true) as
  select user_id, doc, updated_at from public.preferences;
grant select on public.observations, public.observational_reports, public.user_preferences to authenticated;

-- ── Client error log (redacted: no user material) ─────────────────────
create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  at timestamptz not null default now(),
  message text not null check (length(message) <= 500),
  route text not null check (length(route) <= 200)
);
alter table public.client_errors enable row level security;
drop policy if exists errors_insert on public.client_errors;
create policy errors_insert on public.client_errors for insert with check (user_id is null or user_id = auth.uid());
drop policy if exists errors_admin_read on public.client_errors;
create policy errors_admin_read on public.client_errors for select using (public.is_admin());
grant insert on public.client_errors to authenticated;
