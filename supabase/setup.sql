-- Lantern Wall: one-time Supabase setup
-- Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
-- Safe to run again; it won't duplicate anything.
--
-- 1) CHANGE THE ADMIN CODE before running:
--      admin code       = what the projector page needs for calibration and resets
--      (the iPad needs no code: anyone at the wall can send drawings, text and colors to the main lantern)
--    (To change them later, edit and run just the "Access codes" block again.)

-- ============================================================
-- Access codes (private: the website can't read this table)
-- ============================================================
create table if not exists public.lw_settings (
  key   text primary key,
  value text not null
);
alter table public.lw_settings enable row level security;

insert into public.lw_settings (key, value) values
  ('controller_code', 'lanterns'),      -- no longer used by the iPad
  ('admin_code',      'calibrate-me')   -- <-- change me
on conflict (key) do update set value = excluded.value;

-- ============================================================
-- Lanterns
-- ============================================================
create table if not exists public.lanterns (
  id          int primary key,
  shape       text  not null check (shape in ('rect', 'square', 'circle', 'oval', 'oblong', 'capsule')),
  color       text  not null default '#f4a64a' check (color ~ '^#[0-9a-f]{6}$' or color = 'off'),
  interactive boolean not null default false,   -- true only for the main lantern (the iPad can change it)
  image_path  text,
  wall        jsonb not null,   -- {x,y,w,h} position on the iPad's picture of the wall
  proj        jsonb not null,   -- {x,y,w,h} position the projector draws it (calibration)
  updated_at  timestamptz not null default now()
);
alter table public.lanterns enable row level security;
alter table public.lanterns add column if not exists interactive boolean not null default false;   -- older databases

-- Older databases were created before 'oblong' / 'capsule' existed: replace the shape rule so they allow them
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.lanterns'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%shape%'
  loop
    execute format('alter table public.lanterns drop constraint %I', c);
  end loop;
end $$;
alter table public.lanterns add constraint lanterns_shape_check
  check (shape in ('rect', 'square', 'circle', 'oval', 'oblong', 'capsule'));

-- Anyone can read (the projector and iPad need to). Nobody can write directly;
-- all writes go through the functions below (admin ones check the admin code).
drop policy if exists "lanterns are readable" on public.lanterns;
create policy "lanterns are readable" on public.lanterns for select to anon, authenticated using (true);
grant select on public.lanterns to anon, authenticated;
revoke insert, update, delete on public.lanterns from anon, authenticated;
revoke all on public.lw_settings from anon, authenticated;

-- Starting layout (matches site/layout.js): one main capsule lantern + 8 decorative. Only fills an empty table.
insert into public.lanterns (id, shape, interactive, color, wall, proj) values
  (1, 'capsule', true, '#fff1d6', '{"x":0.415,"y":0.1978,"w":0.17,"h":0.6044}', '{"x":0.415,"y":0.1978,"w":0.17,"h":0.6044}'),
  (2, 'oval', false, '#f4a64a', '{"x":0.065,"y":0.217,"w":0.07,"h":0.1659}', '{"x":0.065,"y":0.217,"w":0.07,"h":0.1659}'),
  (3, 'circle', false, '#f59a6a', '{"x":0.175,"y":0.55,"w":0.09,"h":0.16}', '{"x":0.175,"y":0.55,"w":0.09,"h":0.16}'),
  (4, 'oblong', false, '#ec7f8f', '{"x":0.276,"y":0.1525,"w":0.068,"h":0.195}', '{"x":0.276,"y":0.1525,"w":0.068,"h":0.195}'),
  (5, 'circle', false, '#f2c35b', '{"x":0.3275,"y":0.7511,"w":0.055,"h":0.0978}', '{"x":0.3275,"y":0.7511,"w":0.055,"h":0.0978}'),
  (6, 'oblong', false, '#f4a64a', '{"x":0.631,"y":0.5782,"w":0.078,"h":0.2237}', '{"x":0.631,"y":0.5782,"w":0.078,"h":0.2237}'),
  (7, 'circle', false, '#ec7f8f', '{"x":0.6775,"y":0.2233,"w":0.075,"h":0.1333}', '{"x":0.6775,"y":0.2233,"w":0.075,"h":0.1333}'),
  (8, 'oval', false, '#f2c35b', '{"x":0.8,"y":0.4811,"w":0.08,"h":0.1778}', '{"x":0.8,"y":0.4811,"w":0.08,"h":0.1778}'),
  (9, 'circle', false, '#f59a6a', '{"x":0.904,"y":0.1638,"w":0.052,"h":0.0924}', '{"x":0.904,"y":0.1638,"w":0.052,"h":0.0924}')
on conflict (id) do nothing;

-- Projector display settings (mirroring for rear projection), saved with calibration.
-- Anyone can read; only save_positions writes.
create table if not exists public.lw_display (
  id          int primary key default 1 check (id = 1),
  mirror_x    boolean,
  updated_at  timestamptz not null default now()
);
alter table public.lw_display enable row level security;
drop policy if exists "display is readable" on public.lw_display;
create policy "display is readable" on public.lw_display for select to anon, authenticated using (true);
grant select on public.lw_display to anon, authenticated;
revoke insert, update, delete on public.lw_display from anon, authenticated;

-- Push row changes to the projector and iPads instantly
do $$
begin
  alter publication supabase_realtime add table public.lanterns;
exception when duplicate_object then null;
end $$;

-- ============================================================
-- Image storage (public read, PNG only, 5 MB max)
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lanterns', 'lanterns', true, 5242880, array['image/png'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/png'];

-- Drawings can only be uploaded for the main (interactive) lantern
drop policy if exists "lantern pngs can be uploaded" on storage.objects;
create policy "lantern pngs can be uploaded" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'lanterns' and name ~ '^lantern-[0-9]+/[0-9]+\.png$'
    and exists (select 1 from public.lanterns l
                 where l.interactive and 'lantern-' || l.id = split_part(name, '/', 1))
  );

-- ============================================================
-- Functions the website calls
-- ============================================================
create or replace function public.check_access(p_code text, p_kind text default 'controller')
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.lw_settings
    where value = p_code
      and (key = p_kind || '_code' or (p_kind = 'controller' and key = 'admin_code'))
  );
$$;

create or replace function public.set_lantern_color(p_id int, p_color text, p_code text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_interactive boolean;
begin
  select interactive into v_interactive from public.lanterns where id = p_id;
  if not found then raise exception 'There is no lantern %.', p_id; end if;
  if not v_interactive then
    raise exception 'Lantern % is decorative: only the main lantern can be changed from the iPad.', p_id;
  end if;
  p_color := lower(coalesce(p_color, ''));
  if p_color !~ '^#[0-9a-f]{6}$' and p_color <> 'off' then
    raise exception 'Color must look like #ff8800 or off.';
  end if;
  update public.lanterns set color = p_color, updated_at = now() where id = p_id;
end;
$$;

-- p_path = the uploaded file's path, or null to remove the drawing. Only the main (interactive) lantern.
create or replace function public.set_lantern_image(p_id int, p_path text, p_code text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_interactive boolean;
begin
  select interactive into v_interactive from public.lanterns where id = p_id;
  if not found then raise exception 'There is no lantern %.', p_id; end if;
  if not v_interactive then
    raise exception 'Lantern % is decorative: only the main lantern can be changed from the iPad.', p_id;
  end if;
  if p_path is not null and p_path !~ ('^lantern-' || p_id || '/[0-9]+\.png$') then
    raise exception 'That image does not belong to lantern %.', p_id;
  end if;
  update public.lanterns set image_path = p_path, updated_at = now() where id = p_id;
end;
$$;

-- Calibration: p_rows = [{ "id": 1, "proj": { "x":..,"y":..,"w":..,"h":.. } }, ...]
-- p_mirror = the projector's mirroring (null leaves it unchanged)
drop function if exists public.save_positions(jsonb, text);
create or replace function public.save_positions(p_rows jsonb, p_code text, p_mirror boolean default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.check_access(p_code, 'admin') then
    raise exception 'That admin code is wrong.';
  end if;
  update public.lanterns l
     set proj = jsonb_build_object('x', (r.proj->>'x')::float, 'y', (r.proj->>'y')::float,
                                   'w', (r.proj->>'w')::float, 'h', (r.proj->>'h')::float),
         updated_at = now()
    from jsonb_to_recordset(p_rows) as r(id int, proj jsonb)
   where l.id = r.id;
  if p_mirror is not null then
    insert into public.lw_display (id, mirror_x, updated_at) values (1, p_mirror, now())
    on conflict (id) do update set mirror_x = excluded.mirror_x, updated_at = now();
  end if;
end;
$$;

-- Replace every lantern with a new layout (from site/layout.js). Clears calibration and drawings.
create or replace function public.reset_layout(p_rows jsonb, p_code text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.check_access(p_code, 'admin') then
    raise exception 'That admin code is wrong.';
  end if;
  delete from public.lanterns where true;
  insert into public.lanterns (id, shape, color, interactive, wall, proj)
  select r.id, r.shape, lower(r.color), coalesce(r.interactive, false), r.wall, r.proj
    from jsonb_to_recordset(p_rows) as r(id int, shape text, color text, interactive boolean, wall jsonb, proj jsonb);
end;
$$;

-- Remove every drawing (keeps colors and calibration)
create or replace function public.clear_drawings(p_code text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.check_access(p_code, 'admin') then
    raise exception 'That admin code is wrong.';
  end if;
  update public.lanterns set image_path = null, updated_at = now() where image_path is not null;
end;
$$;

grant execute on function public.check_access(text, text)                 to anon, authenticated;
grant execute on function public.set_lantern_color(int, text, text)       to anon, authenticated;
grant execute on function public.set_lantern_image(int, text, text)       to anon, authenticated;
grant execute on function public.save_positions(jsonb, text, boolean)     to anon, authenticated;
grant execute on function public.reset_layout(jsonb, text)                to anon, authenticated;
grant execute on function public.clear_drawings(text)                     to anon, authenticated;

notify pgrst, 'reload schema';
