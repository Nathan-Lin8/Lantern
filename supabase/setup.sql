-- Lantern Wall: one-time Supabase setup
-- Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
-- Safe to run again; it won't duplicate anything.
--
-- 1) CHANGE THE ADMIN CODE before running:
--      admin code       = what the projector page needs for calibration and resets
--      (the iPad needs no code: anyone at the wall can send drawings, text and colors)
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
  shape       text  not null check (shape in ('rect', 'square', 'circle', 'oval', 'oblong')),
  color       text  not null default '#f4a64a' check (color ~ '^#[0-9a-f]{6}$' or color = 'off'),
  image_path  text,
  wall        jsonb not null,   -- {x,y,w,h} position on the iPad's picture of the wall
  proj        jsonb not null,   -- {x,y,w,h} position the projector draws it (calibration)
  updated_at  timestamptz not null default now()
);
alter table public.lanterns enable row level security;

-- Older databases were created before 'oblong' existed: replace the shape rule so they allow it too
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
  check (shape in ('rect', 'square', 'circle', 'oval', 'oblong'));

-- Anyone can read (the projector and iPad need to). Nobody can write directly;
-- all writes go through the functions below (admin ones check the admin code).
drop policy if exists "lanterns are readable" on public.lanterns;
create policy "lanterns are readable" on public.lanterns for select to anon, authenticated using (true);
grant select on public.lanterns to anon, authenticated;
revoke insert, update, delete on public.lanterns from anon, authenticated;
revoke all on public.lw_settings from anon, authenticated;

-- Starting layout (matches site/layout.js). Only fills an empty table.
insert into public.lanterns (id, shape, color, wall, proj) values
  (1, 'circle', '#f4a64a', '{"x":0.055,"y":0.3844,"w":0.13,"h":0.2311}', '{"x":0.055,"y":0.3844,"w":0.13,"h":0.2311}'),
  (2, 'rect', '#fff1d6', '{"x":0.235,"y":0.3222,"w":0.15,"h":0.3556}', '{"x":0.235,"y":0.3222,"w":0.15,"h":0.3556}'),
  (3, 'oblong', '#ec6f86', '{"x":0.435,"y":0.2936,"w":0.13,"h":0.3728}', '{"x":0.435,"y":0.2936,"w":0.13,"h":0.3728}'),
  (4, 'square', '#5fb7d4', '{"x":0.615,"y":0.3667,"w":0.15,"h":0.2667}', '{"x":0.615,"y":0.3667,"w":0.15,"h":0.2667}'),
  (5, 'oval', '#9ad46f', '{"x":0.82,"y":0.3476,"w":0.12,"h":0.3048}', '{"x":0.82,"y":0.3476,"w":0.12,"h":0.3048}')
on conflict (id) do nothing;

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

drop policy if exists "lantern pngs can be uploaded" on storage.objects;
create policy "lantern pngs can be uploaded" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'lanterns' and name ~ '^lantern-[0-9]+/[0-9]+\.png$');

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
begin
  p_color := lower(coalesce(p_color, ''));
  if p_color !~ '^#[0-9a-f]{6}$' and p_color <> 'off' then
    raise exception 'Color must look like #ff8800 or off.';
  end if;
  update public.lanterns set color = p_color, updated_at = now() where id = p_id;
  if not found then raise exception 'There is no lantern %.', p_id; end if;
end;
$$;

-- p_path = the uploaded file's path, or null to remove the drawing. Any shape can hold a drawing.
create or replace function public.set_lantern_image(p_id int, p_path text, p_code text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.lanterns where id = p_id) then
    raise exception 'There is no lantern %.', p_id;
  end if;
  if p_path is not null and p_path !~ ('^lantern-' || p_id || '/[0-9]+\.png$') then
    raise exception 'That image does not belong to lantern %.', p_id;
  end if;
  update public.lanterns set image_path = p_path, updated_at = now() where id = p_id;
end;
$$;

-- Calibration: p_rows = [{ "id": 1, "proj": { "x":..,"y":..,"w":..,"h":.. } }, ...]
create or replace function public.save_positions(p_rows jsonb, p_code text)
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
  insert into public.lanterns (id, shape, color, wall, proj)
  select r.id, r.shape, lower(r.color), r.wall, r.proj
    from jsonb_to_recordset(p_rows) as r(id int, shape text, color text, wall jsonb, proj jsonb);
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
grant execute on function public.save_positions(jsonb, text)              to anon, authenticated;
grant execute on function public.reset_layout(jsonb, text)                to anon, authenticated;
grant execute on function public.clear_drawings(text)                     to anon, authenticated;
