-- 002_moderation_and_social_core.sql
--
-- Block / report / mute ship at launch, not in a later phase. The feed,
-- follows and comments sit on top of them so every read path can filter
-- blocked users from the start.

-- ---------------------------------------------------------------------------
-- Moderation
-- ---------------------------------------------------------------------------
create table if not exists public.user_blocks (
  id         uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.user_mutes (
  id         uuid primary key default gen_random_uuid(),
  muter_id   uuid not null references public.profiles(id) on delete cascade,
  muted_id   uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (muter_id, muted_id),
  check (muter_id <> muted_id)
);

create table if not exists public.report_reason_options (
  reason_key    text primary key,
  label         text not null,
  display_order smallint not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Harassment and unwanted contact are called out explicitly, as promised in
-- the privacy policy.
insert into public.report_reason_options (reason_key, label, display_order) values
  ('harassment',        'Harassment or bullying',            1),
  ('unwanted_contact',  'Unwanted contact',                  2),
  ('minor_safety',      'Concern about a minor''s safety',   3),
  ('impersonation',     'Impersonation',                     4),
  ('spam',              'Spam or scam',                      5),
  ('animal_welfare',    'Animal welfare concern',            6),
  ('fraudulent_listing','Fraudulent marketplace listing',    7),
  ('explicit',          'Explicit or inappropriate content', 8),
  ('other',             'Something else',                    9)
on conflict (reason_key) do nothing;

create table if not exists public.user_reports (
  id                    uuid primary key default gen_random_uuid(),
  reporter_id           uuid not null references public.profiles(id) on delete cascade,
  reported_user_id      uuid references public.profiles(id) on delete cascade,
  reported_content_id   uuid,
  reported_content_type text,
  reason                text not null references public.report_reason_options(reason_key),
  description           text,
  involves_minor        boolean not null default false,
  status                text not null default 'open'
                          check (status in ('open','reviewing','actioned','dismissed')),
  admin_notes           text,
  resolved_by           uuid references public.profiles(id),
  resolved_at           timestamptz,
  created_at            timestamptz not null default now()
);

create index if not exists user_reports_status_idx on public.user_reports(status, created_at desc);

-- Convenience predicate used by feed and messaging policies.
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_blocks
     where (blocker_id = a and blocked_id = b)
        or (blocker_id = b and blocked_id = a)
  );
$$;

-- ---------------------------------------------------------------------------
-- Follows
-- ---------------------------------------------------------------------------
create table if not exists public.follows (
  id           uuid primary key default gen_random_uuid(),
  follower_id  uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (follower_id, following_id),
  check (follower_id <> following_id)
);

create index if not exists follows_following_idx on public.follows(following_id);

create or replace function public.is_following(p_follower uuid, p_following uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.follows
     where follower_id = p_follower and following_id = p_following
  );
$$;

-- ---------------------------------------------------------------------------
-- Posts, stories, comments
-- ---------------------------------------------------------------------------
create table if not exists public.posts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  content        text not null default '',
  media_urls     text[],
  post_type      text not null default 'text'
                   check (post_type in ('text','photo','video','run','practice','first_check','milestone')),
  practice_run_id uuid,
  horse_id       uuid,
  location       text,
  privacy        text not null default 'public'
                   check (privacy in ('public','followers','private')),
  is_shared      boolean not null default false,
  shared_post_id uuid references public.posts(id) on delete set null,
  like_count     integer not null default 0,
  comment_count  integer not null default 0,
  repost_count   integer not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists posts_user_created_idx on public.posts(user_id, created_at desc);
create index if not exists posts_created_idx      on public.posts(created_at desc);

-- A minor's post is never public. Same reasoning as the profile rule.
create or replace function public.enforce_minor_post_privacy()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_minor(new.user_id) and new.privacy = 'public' then
    new.privacy := 'followers';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_minor_post_privacy on public.posts;
create trigger trg_enforce_minor_post_privacy
  before insert or update on public.posts
  for each row execute function public.enforce_minor_post_privacy();

create table if not exists public.post_likes (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create table if not exists public.post_bookmarks (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create table if not exists public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  content    text not null,
  parent_id  uuid references public.post_comments(id) on delete cascade,
  like_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists post_comments_post_idx on public.post_comments(post_id, created_at);

create table if not exists public.comment_likes (
  id         uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.post_comments(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);

create table if not exists public.stories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  media_url  text not null,
  media_type text not null default 'photo' check (media_type in ('photo','video')),
  caption    text,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now()
);

create table if not exists public.story_views (
  id         uuid primary key default gen_random_uuid(),
  story_id   uuid not null references public.stories(id) on delete cascade,
  viewer_id  uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (story_id, viewer_id)
);

-- ---------------------------------------------------------------------------
-- Counter triggers
-- ---------------------------------------------------------------------------
create or replace function public.bump_post_like_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  else
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_post_like_count on public.post_likes;
create trigger trg_post_like_count
  after insert or delete on public.post_likes
  for each row execute function public.bump_post_like_count();

create or replace function public.bump_post_comment_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  else
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_post_comment_count on public.post_comments;
create trigger trg_post_comment_count
  after insert or delete on public.post_comments
  for each row execute function public.bump_post_comment_count();

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  type              text not null,
  title             text not null,
  body              text not null,
  data              jsonb not null default '{}'::jsonb,
  is_read           boolean not null default false,
  related_user_id   uuid references public.profiles(id) on delete cascade,
  related_post_id   uuid references public.posts(id) on delete cascade,
  created_at        timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.user_blocks           enable row level security;
alter table public.user_mutes            enable row level security;
alter table public.user_reports          enable row level security;
alter table public.report_reason_options enable row level security;
alter table public.follows               enable row level security;
alter table public.posts                 enable row level security;
alter table public.post_likes            enable row level security;
alter table public.post_bookmarks        enable row level security;
alter table public.post_comments         enable row level security;
alter table public.comment_likes         enable row level security;
alter table public.stories               enable row level security;
alter table public.story_views           enable row level security;
alter table public.notifications         enable row level security;

drop policy if exists "blocks owned" on public.user_blocks;
create policy "blocks owned" on public.user_blocks for all to authenticated
  using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

drop policy if exists "mutes owned" on public.user_mutes;
create policy "mutes owned" on public.user_mutes for all to authenticated
  using (auth.uid() = muter_id) with check (auth.uid() = muter_id);

drop policy if exists "reports insertable" on public.user_reports;
create policy "reports insertable" on public.user_reports for insert to authenticated
  with check (auth.uid() = reporter_id);

drop policy if exists "reports readable by reporter" on public.user_reports;
create policy "reports readable by reporter" on public.user_reports for select to authenticated
  using (auth.uid() = reporter_id);

drop policy if exists "reason options readable" on public.report_reason_options;
create policy "reason options readable" on public.report_reason_options for select to authenticated
  using (true);

drop policy if exists "follows readable" on public.follows;
create policy "follows readable" on public.follows for select to authenticated using (true);

drop policy if exists "follows managed by follower" on public.follows;
create policy "follows managed by follower" on public.follows for all to authenticated
  using (auth.uid() = follower_id) with check (auth.uid() = follower_id);

-- Feed visibility: own posts always; public posts unless blocked; followers-only
-- posts if you actually follow them. Private stays private.
drop policy if exists "posts readable by audience" on public.posts;
create policy "posts readable by audience" on public.posts for select to authenticated
  using (
    auth.uid() = user_id
    or (
      not public.is_blocked_between(auth.uid(), user_id)
      and (
        privacy = 'public'
        or (privacy = 'followers' and public.is_following(auth.uid(), user_id))
      )
    )
  );

drop policy if exists "posts written by owner" on public.posts;
create policy "posts written by owner" on public.posts for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "likes readable" on public.post_likes;
create policy "likes readable" on public.post_likes for select to authenticated using (true);
drop policy if exists "likes owned" on public.post_likes;
create policy "likes owned" on public.post_likes for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "bookmarks owned" on public.post_bookmarks;
create policy "bookmarks owned" on public.post_bookmarks for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "comments readable" on public.post_comments;
create policy "comments readable" on public.post_comments for select to authenticated
  using (not public.is_blocked_between(auth.uid(), user_id));
drop policy if exists "comments owned" on public.post_comments;
create policy "comments owned" on public.post_comments for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "comment likes readable" on public.comment_likes;
create policy "comment likes readable" on public.comment_likes for select to authenticated using (true);
drop policy if exists "comment likes owned" on public.comment_likes;
create policy "comment likes owned" on public.comment_likes for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "stories readable" on public.stories;
create policy "stories readable" on public.stories for select to authenticated
  using (
    auth.uid() = user_id
    or (
      not public.is_blocked_between(auth.uid(), user_id)
      and expires_at > now()
      and (not public.is_minor(user_id) or public.is_following(auth.uid(), user_id))
    )
  );
drop policy if exists "stories owned" on public.stories;
create policy "stories owned" on public.stories for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "story views owned" on public.story_views;
create policy "story views owned" on public.story_views for all to authenticated
  using (auth.uid() = viewer_id) with check (auth.uid() = viewer_id);

drop policy if exists "notifications owned" on public.notifications;
create policy "notifications owned" on public.notifications for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
