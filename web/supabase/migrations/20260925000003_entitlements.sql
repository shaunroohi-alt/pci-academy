-- PCI Web App — plans, entitlements, idempotent payment events (§9.3, §17).
-- Plan -> Entitlements -> Feature Access. Payment and entitlement state never
-- reaches the PCI Engine's analytical output.

create table if not exists public.plans (
  id text primary key,
  name text not null,
  active boolean not null default true
);

create table if not exists public.plan_entitlements (
  plan_id text not null references public.plans (id) on delete cascade,
  flag text not null check (flag in ('observe.basic', 'observe.unlimited', 'journal.full_history', 'library.full', 'audio.full', 'contrary.full', 'academy.course.*', 'community.access', 'services.booking')),
  primary key (plan_id, flag)
);

create table if not exists public.subscriptions (
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id text not null references public.plans (id),
  status text not null check (status in ('active', 'trialing', 'past_due', 'cancelled', 'expired')),
  provider text,
  provider_ref text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, plan_id)
);

create table if not exists public.entitlements (
  user_id uuid not null references auth.users (id) on delete cascade,
  flag text not null,
  source text not null default 'grant',
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  primary key (user_id, flag)
);

-- Provider events are recorded once by their provider id: replays are no-ops.
create table if not exists public.payment_events (
  id text primary key,
  provider text not null,
  type text not null,
  received_at timestamptz not null default now(),
  payload jsonb not null
);

alter table public.plans enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.subscriptions enable row level security;
alter table public.entitlements enable row level security;
alter table public.payment_events enable row level security;

drop policy if exists plans_read on public.plans;
create policy plans_read on public.plans for select using (true);
drop policy if exists plan_entitlements_read on public.plan_entitlements;
create policy plan_entitlements_read on public.plan_entitlements for select using (true);
drop policy if exists subscriptions_own on public.subscriptions;
create policy subscriptions_own on public.subscriptions for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists entitlements_own on public.entitlements;
create policy entitlements_own on public.entitlements for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists entitlements_admin on public.entitlements;
create policy entitlements_admin on public.entitlements for all using (public.is_admin()) with check (public.is_admin());
-- payment_events: no policies — service role only.

grant select on public.plans, public.plan_entitlements to anon, authenticated;
grant select on public.subscriptions, public.entitlements to authenticated;
grant insert, update, delete on public.entitlements to authenticated;

-- The default plan: v1 ships without a paywall, so every member holds every flag.
insert into public.plans (id, name) values ('open', 'Open access') on conflict do nothing;
insert into public.plan_entitlements (plan_id, flag)
select 'open', f from unnest(array['observe.basic', 'observe.unlimited', 'journal.full_history', 'library.full', 'audio.full', 'contrary.full', 'academy.course.*', 'community.access', 'services.booking']) f
on conflict do nothing;

-- Server-side entitlement check. Wildcards: 'academy.course.*' grants 'academy.course.<slug>'.
create or replace function public.has_entitlement(p_flag text, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  with flags as (
    select e.flag from public.entitlements e
      where e.user_id = p_user and (e.expires_at is null or e.expires_at > now())
    union
    select pe.flag from public.subscriptions s
      join public.plan_entitlements pe on pe.plan_id = s.plan_id
      where s.user_id = p_user and s.status in ('active', 'trialing')
    union
    -- Members without a subscription fall back to the default plan.
    select pe.flag from public.plan_entitlements pe
      where pe.plan_id = 'open' and p_user is not null
        and not exists (select 1 from public.subscriptions s2 where s2.user_id = p_user and s2.status in ('active', 'trialing'))
  )
  select exists (
    select 1 from flags
    where flag = p_flag
       or (flag like '%.*' and p_flag like replace(flag, '*', '') || '%')
  );
$$;
grant execute on function public.has_entitlement(text, uuid) to authenticated;

-- Record a provider event exactly once; returns false for a replay.
create or replace function public.record_payment_event(p_id text, p_provider text, p_type text, p_payload jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  insert into public.payment_events (id, provider, type, payload) values (p_id, p_provider, p_type, p_payload);
  return true;
exception when unique_violation then
  return false;
end $$;
revoke all on function public.record_payment_event(text, text, text, jsonb) from public, anon, authenticated;
