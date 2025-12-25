-- PairPilot IDE / PairPilot rooms persistence schema
-- Rooms table (metadata)
create table if not exists public.rooms (
    id text primary key,
    created_at timestamptz not null default now(),
    created_by uuid not null references auth.users (id) on delete cascade
);

-- Room membership + roles
create table if not exists public.room_members (
    room_id text not null references public.rooms (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade,
    role text not null check (
        role in ('owner', 'editor', 'viewer')
    ),
    created_at timestamptz not null default now(),
    primary key (room_id, user_id)
);

-- One snapshot per room (base64 of Y.encodeStateAsUpdate(doc))
create table if not exists public.room_snapshots (
    room_id text primary key references public.rooms (id) on delete cascade,
    snapshot_b64 text not null,
    updated_at timestamptz not null default now(),
    updated_by uuid references auth.users (id) on delete set null
);

-- Enable RLS
alter table public.rooms enable row level security;

alter table public.room_members enable row level security;

alter table public.room_snapshots enable row level security;

-- Helper: membership check
create or replace function public.is_room_member(target_room_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.room_members rm
    where rm.room_id = target_room_id
      and rm.user_id = auth.uid()
  );
$$;

-- SECURITY DEFINER helpers (bypass RLS for policy checks)
create or replace function public.room_has_members(target_room_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.room_members rm
        where rm.room_id = target_room_id
    );
$$;

create or replace function public.is_room_owner(target_room_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.room_members rm
        where rm.room_id = target_room_id
            and rm.user_id = auth.uid()
            and rm.role = 'owner'
    );
$$;

create or replace function public.is_room_creator(target_room_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.rooms r
        where r.id = target_room_id
            and r.created_by = auth.uid()
    );
$$;

create or replace function public.is_room_creator_user(target_room_id text, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.rooms r
        where r.id = target_room_id
            and r.created_by = target_user_id
    );
$$;

create or replace function public.is_room_editor_or_owner(target_room_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.room_members rm
        where rm.room_id = target_room_id
            and rm.user_id = auth.uid()
            and rm.role in ('owner','editor')
    );
$$;

-- rooms policies
-- Allow members OR the creator to see a room.
drop policy if exists "rooms_select_member" on public.rooms;

drop policy if exists "rooms_select_member_or_creator" on public.rooms;

create policy "rooms_select_member_or_creator" on public.rooms for
select using (
        public.is_room_member (id)
        or created_by = auth.uid ()
    );

create policy "rooms_insert_authenticated" on public.rooms for
insert
    to authenticated
with
    check (created_by = auth.uid ());

-- room_members policies
drop policy if exists "room_members_select_self_or_member" on public.room_members;

drop policy if exists "room_members_insert_room_creator_owner" on public.room_members;

drop policy if exists "room_members_insert_self_viewer" on public.room_members;

drop policy if exists "room_members_insert_first_owner" on public.room_members;

drop policy if exists "room_members_insert_owner_adds_others" on public.room_members;

drop policy if exists "room_members_update_owner_only" on public.room_members;

drop policy if exists "room_members_update_creator_self_owner" on public.room_members;

-- Allow a user to see their own membership rows (needed for lobby history).
-- Also allow members to see roles for the room (used for the People list).
create policy "room_members_select_self_or_member" on public.room_members for
select using (
        public.is_room_member (room_id)
    );

-- Allow a user to self-join as a viewer. FK enforces that the room exists.
create policy "room_members_insert_self_viewer" on public.room_members for
insert
    to authenticated
with
    check (
        user_id = auth.uid ()
        and role = 'viewer'
        and not public.is_room_creator (room_id)
    );

-- Allow the room creator to be owner.
create policy "room_members_insert_first_owner" on public.room_members for
insert
    to authenticated
with
    check (
        user_id = auth.uid ()
        and role = 'owner'
        and public.is_room_creator (room_id)
    );

-- Allow owners to add other members (viewer/editor).
create policy "room_members_insert_owner_adds_others" on public.room_members for
insert
    to authenticated
with
    check (
        public.is_room_owner (room_id)
        and role in ('viewer', 'editor')
    );

create policy "room_members_update_owner_only" on public.room_members for
update to authenticated using (
    public.is_room_owner (room_id)
)
with
    check (
        (role <> 'owner')
        or public.is_room_creator_user (room_id, user_id)
    );

-- Self-heal: if the room creator accidentally has a non-owner role,
-- allow them to update their own row to owner.
create policy "room_members_update_creator_self_owner" on public.room_members for
update to authenticated using (
    user_id = auth.uid ()
    and public.is_room_creator (room_id)
)
with
    check (role = 'owner');

-- room_snapshots policies
drop policy if exists "room_snapshots_select_member" on public.room_snapshots;

drop policy if exists "room_snapshots_upsert_editor_or_owner" on public.room_snapshots;

drop policy if exists "room_snapshots_update_editor_or_owner" on public.room_snapshots;

create policy "room_snapshots_select_member" on public.room_snapshots for
select using (
        public.is_room_member (room_id)
    );

create policy "room_snapshots_upsert_editor_or_owner" on public.room_snapshots for
insert
    to authenticated
with
    check (
        public.is_room_editor_or_owner (room_id)
    );

create policy "room_snapshots_update_editor_or_owner" on public.room_snapshots for
update to authenticated using (
    public.is_room_editor_or_owner (room_id)
)
with
    check (true);