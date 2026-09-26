-- PCI Web App — private semantic index (R4). Introduced only with the
-- controls the blueprint requires: per-user isolation, and deletion of the
-- source material removes its indexed vectors.

create extension if not exists vector;

create table if not exists public.user_embeddings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_table text not null,
  source_id text not null,
  embedding vector(256) not null,
  model text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, source_table, source_id)
);
alter table public.user_embeddings enable row level security;
alter table public.user_embeddings force row level security;
drop policy if exists owner_all on public.user_embeddings;
create policy owner_all on public.user_embeddings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.user_embeddings to authenticated;

create or replace function public.drop_embedding() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.user_embeddings where user_id = old.user_id and source_table = tg_table_name and source_id = old.id;
  return old;
end $$;

do $$
declare t text;
begin
  foreach t in array array['observation_inputs', 'journal_entries', 'ledger_entries', 'contrary_sessions'] loop
    execute format('drop trigger if exists %1$s_drop_embedding on public.%1$I', t);
    execute format('create trigger %1$s_drop_embedding after delete on public.%1$I for each row execute function public.drop_embedding()', t);
  end loop;
end $$;

-- Nearest neighbours within the caller's own material only.
create or replace function public.match_private(p_embedding vector(256), p_limit int default 10)
returns table (source_table text, source_id text, distance float)
language sql stable security invoker set search_path = public as $$
  select source_table, source_id, embedding <=> p_embedding as distance
  from public.user_embeddings
  where user_id = auth.uid()
  order by embedding <=> p_embedding
  limit p_limit;
$$;
grant execute on function public.match_private(vector, int) to authenticated;
