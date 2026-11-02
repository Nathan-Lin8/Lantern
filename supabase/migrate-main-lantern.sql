-- Lantern Wall: one main interactive lantern + rear projection.
-- Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run. Safe to run again.
--
-- What it does:
--   - lanterns get an `interactive` flag (only the main lantern is interactive)
--   - allows the new 'capsule' shape (the flat, tall, rounded main lantern)
--   - set_lantern_color / set_lantern_image refuse any lantern that isn't interactive
--   - drawings can only be uploaded for interactive lanterns
--   - reset_layout carries the interactive flag from site/layout.js
--   - save_positions also saves the projector's mirroring (rear projection), in a new lw_display table
--
-- Afterwards: open projector.html, press C, click "Reset to layout.js" twice, line the shapes up with the
-- real lanterns, and press S. (Until then every lantern is decorative and the iPad can't send anything.)

-- ============================================================
-- Lanterns: interactive flag and the capsule shape
-- ============================================================
alter table public.lanterns add column if not exists interactive boolean not null default false;

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

-- ============================================================
-- Projector display settings (mirroring), saved with calibration. Anyone can read; only save_positions writes.
-- ============================================================
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

-- ============================================================
-- Only interactive lanterns take drawings
-- ============================================================
drop policy if exists "lantern pngs can be uploaded" on storage.objects;
create policy "lantern pngs can be uploaded" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'lanterns' and name ~ '^lantern-[0-9]+/[0-9]+\.png$'
    and exists (select 1 from public.lanterns l
                 where l.interactive and 'lantern-' || l.id = split_part(name, '/', 1))
  );

-- ============================================================
-- Functions
-- ============================================================
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

grant execute on function public.set_lantern_color(int, text, text)       to anon, authenticated;
grant execute on function public.set_lantern_image(int, text, text)       to anon, authenticated;
grant execute on function public.save_positions(jsonb, text, boolean)     to anon, authenticated;
grant execute on function public.reset_layout(jsonb, text)                to anon, authenticated;

-- Make the API see the new column, table and function signatures right away
notify pgrst, 'reload schema';
