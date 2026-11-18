create table if not exists public.athlete_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 profile jsonb not null default '{}'::jsonb,
 revision integer not null default 1,
 updated_at timestamptz not null default now()
);
alter table public.athlete_profiles enable row level security;
drop policy if exists "Read own profile" on public.athlete_profiles;
create policy "Read own profile" on public.athlete_profiles for select to authenticated using (auth.uid() = user_id);
revoke all on public.athlete_profiles from anon, authenticated;
grant select on public.athlete_profiles to authenticated;
create or replace function public.save_athlete_profile(expected_revision integer, new_profile jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare next_revision integer;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if jsonb_typeof(new_profile) <> 'object' or length(new_profile::text) > 20000 then raise exception 'Invalid profile'; end if;
 if expected_revision = 0 then
  insert into public.athlete_profiles(user_id,profile) values(auth.uid(),new_profile) on conflict do nothing returning revision into next_revision;
 else
  update public.athlete_profiles set profile=new_profile, revision=revision+1, updated_at=now()
  where user_id=auth.uid() and revision=expected_revision returning revision into next_revision;
 end if;
 if next_revision is null then raise exception 'Profile changed on another device'; end if;
 return next_revision;
end $$;
revoke all on function public.save_athlete_profile(integer,jsonb) from public;
grant execute on function public.save_athlete_profile(integer,jsonb) to authenticated;

-- Unified revision prevents profile and planner changes overwriting each other.
create table if not exists public.athlete_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 profile jsonb not null default '{}'::jsonb,
 planner jsonb not null default '{}'::jsonb,
 revision integer not null default 1,
 updated_at timestamptz not null default now()
);
alter table public.athlete_accounts enable row level security;
drop policy if exists "Read own account" on public.athlete_accounts;
create policy "Read own account" on public.athlete_accounts for select to authenticated using(auth.uid()=user_id);
revoke all on public.athlete_accounts from anon,authenticated;
grant select on public.athlete_accounts to authenticated;
create or replace function public.save_athlete_account(expected_revision integer,new_profile jsonb,new_planner jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare next_revision integer;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if jsonb_typeof(new_profile) <> 'object' or jsonb_typeof(new_planner) <> 'object' or length(new_profile::text)>20000 or length(new_planner::text)>2000000 then raise exception 'Invalid account data'; end if;
 if expected_revision=0 then
 insert into public.athlete_accounts(user_id,profile,planner) values(auth.uid(),new_profile,new_planner) on conflict do nothing returning revision into next_revision;
 else
 update public.athlete_accounts set profile=new_profile,planner=new_planner,revision=revision+1,updated_at=now() where user_id=auth.uid() and revision=expected_revision returning revision into next_revision;
 end if;
 if next_revision is null then raise exception 'Account changed on another device'; end if;
 return next_revision;
end $$;
revoke all on function public.save_athlete_account(integer,jsonb,jsonb) from public;
grant execute on function public.save_athlete_account(integer,jsonb,jsonb) to authenticated;
-- Preserve profiles saved with the first prototype.
insert into public.athlete_accounts(user_id,profile) select user_id,profile from public.athlete_profiles on conflict do nothing;
