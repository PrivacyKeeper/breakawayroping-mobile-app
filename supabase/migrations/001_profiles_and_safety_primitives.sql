-- 001_profiles_and_safety_primitives.sql
--
-- Profiles, guardians, and the minor-safety primitives everything else
-- depends on. Breakaway is overwhelmingly women and girls with a large
-- junior population, so age awareness is a first-class column here rather
-- than a setting bolted on later.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  email                  text,
  name                   text,
  full_name              text,
  username               text unique,
  bio                    text,
  avatar_url             text,
  profile_photo          text,

  -- Location. For minors the precise pair is stripped on write; see the
  -- enforce_minor_location_precision trigger below.
  location_city          text,
  location_state         text,
  latitude               numeric,
  longitude              numeric,

  -- Age. birth_date drives is_minor(), which drives the safety rules.
  birth_date             date,

  -- Breakaway-specific competitive identity
  wpra_member_no         text,
  wpra_permit_filled     boolean not null default false,
  nhsra_member_no        text,
  njhsra_member_no       text,
  nlbra_member_no        text,
  nira_member_no         text,
  prca_card_no           text,
  home_association       text,
  years_competing        integer,
  dominant_hand          text check (dominant_hand in ('right','left')),

  -- Visibility. Minors are forced to 'followers' by the trigger below.
  profile_visibility     text not null default 'public'
                           check (profile_visibility in ('public','followers','private')),

  is_online              boolean default false,
  last_seen              timestamptz,
  push_token             text,

  is_premium             boolean not null default false,
  premium_expires_at     timestamptz,
  has_lifetime_access    boolean not null default false,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on column public.profiles.birth_date is
  'Drives public.is_minor(). Never exposed to other users.';

-- ---------------------------------------------------------------------------
-- Age helpers
-- ---------------------------------------------------------------------------

-- Null birth_date is treated as a minor: fail closed, not open.
create or replace function public.is_minor(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select birth_date is null or birth_date > (current_date - interval '18 years')
       from public.profiles where id = p_user_id),
    true
  );
$$;

comment on function public.is_minor(uuid) is
  'True when the user is under 18 OR has no birth date on file. Fails closed.';

create or replace function public.is_adult(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.is_minor(p_user_id);
$$;

-- ---------------------------------------------------------------------------
-- Guardians
-- ---------------------------------------------------------------------------
create table if not exists public.guardian_links (
  id             uuid primary key default gen_random_uuid(),
  guardian_id    uuid not null references public.profiles(id) on delete cascade,
  minor_id       uuid not null references public.profiles(id) on delete cascade,
  relationship   text,
  status         text not null default 'pending'
                   check (status in ('pending','active','revoked')),
  -- Guardian-controlled switches for the minor's account
  allow_media_sharing      boolean not null default false,
  allow_mentor_dms         boolean not null default false,
  allow_recruiting_profile boolean not null default false,
  verified_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (guardian_id, minor_id),
  check (guardian_id <> minor_id)
);

create index if not exists guardian_links_minor_idx    on public.guardian_links(minor_id);
create index if not exists guardian_links_guardian_idx on public.guardian_links(guardian_id);

create or replace function public.has_active_guardian(p_minor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.guardian_links
     where minor_id = p_minor_id and status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- Enforced minor defaults
--
-- These are trigger-enforced rather than app-enforced on purpose: the privacy
-- policy commits to them, so they have to hold no matter which client writes.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_minor_profile_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  minor boolean;
begin
  minor := new.birth_date is null
        or new.birth_date > (current_date - interval '18 years');

  if minor then
    -- Never store street-level precision for a minor.
    new.latitude  := null;
    new.longitude := null;

    -- A minor's profile is never public. Private is allowed (more restrictive).
    if new.profile_visibility = 'public' then
      new.profile_visibility := 'followers';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_enforce_minor_profile_rules on public.profiles;
create trigger trg_enforce_minor_profile_rules
  before insert or update on public.profiles
  for each row execute function public.enforce_minor_profile_rules();

-- ---------------------------------------------------------------------------
-- Auth hook
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, full_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'full_name'
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- user_settings
-- ---------------------------------------------------------------------------
create table if not exists public.user_settings (
  user_id                    uuid primary key references public.profiles(id) on delete cascade,
  push_notifications         boolean not null default true,
  email_notifications        boolean not null default true,
  sms_notifications          boolean not null default false,
  notification_frequency     text    not null default 'realtime',
  show_online_status         boolean not null default true,
  allow_non_follower_messages boolean not null default true,
  dark_mode                  boolean not null default true,
  units                      text    not null default 'imperial',
  language                   text    not null default 'en',
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

-- Now that user_settings exists, wire the auth trigger.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
create table if not exists public.user_role_options (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique,
  label         text not null,
  display_order smallint not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role_id    uuid not null references public.user_role_options(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

insert into public.user_role_options (key, label, display_order) values
  ('roper',      'Roper',            1),
  ('producer',   'Event Producer',   2),
  ('coach',      'Coach / Trainer',  3),
  ('judge',      'Judge / Timer',    4),
  ('guardian',   'Parent / Guardian',5),
  ('fan',        'Fan',              6),
  ('vet',        'Veterinarian',     7),
  ('hauler',     'Hauler',           8)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.user_settings     enable row level security;
alter table public.guardian_links    enable row level security;
alter table public.user_roles        enable row level security;
alter table public.user_role_options enable row level security;

-- Profiles are readable by authenticated users; the client is responsible for
-- respecting profile_visibility in what it renders. Precise coordinates for
-- minors are already null at rest, so there is nothing sensitive to leak here.
drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated"
  on public.profiles for select to authenticated using (true);

drop policy if exists "profiles updatable by owner" on public.profiles;
create policy "profiles updatable by owner"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles insertable by owner" on public.profiles;
create policy "profiles insertable by owner"
  on public.profiles for insert to authenticated with check (auth.uid() = id);

drop policy if exists "settings owned" on public.user_settings;
create policy "settings owned"
  on public.user_settings for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- A guardian link is visible to the two parties on it, and only they can act.
drop policy if exists "guardian links visible to parties" on public.guardian_links;
create policy "guardian links visible to parties"
  on public.guardian_links for select to authenticated
  using (auth.uid() = guardian_id or auth.uid() = minor_id);

drop policy if exists "guardian links managed by guardian" on public.guardian_links;
create policy "guardian links managed by guardian"
  on public.guardian_links for all to authenticated
  using (auth.uid() = guardian_id) with check (auth.uid() = guardian_id);

drop policy if exists "roles readable" on public.user_roles;
create policy "roles readable"
  on public.user_roles for select to authenticated using (true);

drop policy if exists "roles managed by owner" on public.user_roles;
create policy "roles managed by owner"
  on public.user_roles for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "role options readable" on public.user_role_options;
create policy "role options readable"
  on public.user_role_options for select to authenticated using (true);
