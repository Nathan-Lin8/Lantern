-- Lantern Wall: no access code on the iPad, drawings/text on every shape, and 5 lanterns.
-- Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
-- Safe to run again. The admin code (projector calibration) is unchanged.
-- Note: the last block replaces all lanterns with the 5 from site/layout.js, which clears
-- drawings and projector calibration. Recalibrate on the projector page (press C) afterwards.

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

-- Allow the 'oblong' shape (same as add-oblong.sql)
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

-- 5 lanterns (matches site/layout.js)
delete from public.lanterns where true;
insert into public.lanterns (id, shape, color, wall, proj) values
  (1, 'circle', '#f4a64a', '{"x":0.055,"y":0.3844,"w":0.13,"h":0.2311}', '{"x":0.055,"y":0.3844,"w":0.13,"h":0.2311}'),
  (2, 'rect', '#fff1d6', '{"x":0.235,"y":0.3222,"w":0.15,"h":0.3556}', '{"x":0.235,"y":0.3222,"w":0.15,"h":0.3556}'),
  (3, 'oblong', '#ec6f86', '{"x":0.435,"y":0.2936,"w":0.13,"h":0.3728}', '{"x":0.435,"y":0.2936,"w":0.13,"h":0.3728}'),
  (4, 'square', '#5fb7d4', '{"x":0.615,"y":0.3667,"w":0.15,"h":0.2667}', '{"x":0.615,"y":0.3667,"w":0.15,"h":0.2667}'),
  (5, 'oval', '#9ad46f', '{"x":0.82,"y":0.3476,"w":0.12,"h":0.3048}', '{"x":0.82,"y":0.3476,"w":0.12,"h":0.3048}');
