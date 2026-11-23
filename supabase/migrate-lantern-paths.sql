-- Lantern Wall: real laser-cut lantern shapes.
-- Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run. Safe to run again.
--
-- What it does:
--   - lanterns get a `path` column: the lantern's real cut openings (from laser cut.svg) as an SVG path,
--     normalized to the lantern's box (0..1), drawn with the even-odd rule
--   - allows the 'path' shape
--   - reset_layout carries `path` from site/layout.js
--
-- Afterwards: open projector.html, press C, click "Reset to layout.js" twice, drag each box onto its real
-- lantern, and press S. (Until then the pages fall back to the paths in site/layout.js.)

alter table public.lanterns add column if not exists path text;

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
  check (shape in ('rect', 'square', 'circle', 'oval', 'oblong', 'capsule', 'path'));

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
  insert into public.lanterns (id, shape, path, color, interactive, wall, proj)
  select r.id, r.shape, nullif(r.path, ''), lower(r.color), coalesce(r.interactive, false), r.wall, r.proj
    from jsonb_to_recordset(p_rows) as r(id int, shape text, path text, color text, interactive boolean, wall jsonb, proj jsonb);
end;
$$;

grant execute on function public.reset_layout(jsonb, text) to anon, authenticated;

-- Make the API see the new column right away
notify pgrst, 'reload schema';
