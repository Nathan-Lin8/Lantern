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
  shape       text  not null check (shape in ('rect', 'square', 'circle', 'oval', 'oblong', 'capsule', 'path')),
  path        text,             -- real cut openings: SVG path normalized to the box (0..1), even-odd fill
  color       text  not null default '#f4a64a' check (color ~ '^#[0-9a-f]{6}$' or color = 'off'),
  interactive boolean not null default false,   -- true only for the main lantern (the iPad can change it)
  image_path  text,
  wall        jsonb not null,   -- {x,y,w,h} position on the iPad's picture of the wall
  proj        jsonb not null,   -- {x,y,w,h} position the projector draws it (calibration)
  updated_at  timestamptz not null default now()
);
alter table public.lanterns enable row level security;
alter table public.lanterns add column if not exists interactive boolean not null default false;   -- older databases
alter table public.lanterns add column if not exists path text;                                     -- older databases

-- Older databases were created before 'oblong' / 'capsule' / 'path' existed: replace the shape rule so they allow them
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

-- Anyone can read (the projector and iPad need to). Nobody can write directly;
-- all writes go through the functions below (admin ones check the admin code).
drop policy if exists "lanterns are readable" on public.lanterns;
create policy "lanterns are readable" on public.lanterns for select to anon, authenticated using (true);
grant select on public.lanterns to anon, authenticated;
revoke insert, update, delete on public.lanterns from anon, authenticated;
revoke all on public.lw_settings from anon, authenticated;

-- Starting layout (matches site/layout.js): the 5 laser-cut lanterns, each in its own spot, turned to hang
-- as on the wall (LANTERN_ROTATE). 1 = the main frame. Only fills an empty table.
insert into public.lanterns (id, shape, path, interactive, color, wall, proj) values
  (1, 'path', 'M 0.4977 0.0002 C 0.7588 0.0026 0.7891 0.0436 0.7891 0.0436 L 0.7871 0.0777 C 0.9039 0.1304 1.0016 0.2881 1 0.5085 C 0.9978 0.8216 0.8238 0.8935 0.8238 0.8935 L 0.8238 0.9194 C 0.7567 1.0188 0.5045 0.9983 0.5045 0.9983 L 0.4955 0.9983 C 0.4955 0.9983 0.2433 1.0188 0.1762 0.9194 L 0.1762 0.8935 C 0.1762 0.8935 -0.0039 0.8216 0 0.5085 C 0.003 0.2723 0.0594 0.1624 0.2125 0.072 L 0.2145 0.0378 C 0.2145 0.0378 0.2526 -0.0035 0.5113 0.0002 Z', true, '#fff1d6', '{"x":0.4252,"y":0.208,"w":0.2747,"h":0.584}', '{"x":0.4252,"y":0.208,"w":0.2747,"h":0.584}'),
  (2, 'path', 'M 0.6383 0.9822 L 0.6392 0.9657 C 0.6392 0.9657 0.7533 0.963 0.7818 0.9267 L 0.7818 0.903 C 0.7818 0.903 1 0.8193 1 0.5243 C 1 0.1875 0.749 0.1243 0.749 0.1243 L 0.749 0.0937 C 0.749 0.0937 0.7176 0.0553 0.6335 0.0517 L 0.6436 0.0429 L 0.6427 0.024 C 0.6427 0.024 0.6197 -0.0011 0.5224 0 L 0.4776 0 C 0.3803 -0.0011 0.3573 0.024 0.3573 0.024 L 0.3564 0.0429 L 0.3665 0.0517 C 0.2824 0.0553 0.251 0.0937 0.251 0.0937 L 0.251 0.1243 C 0.251 0.1243 0 0.1761 0 0.5243 C 0 0.7839 0.2182 0.903 0.2182 0.903 L 0.2182 0.9267 C 0.2467 0.963 0.3608 0.9657 0.3608 0.9657 L 0.3617 0.9822 C 0.3617 0.9822 0.5061 1.0224 0.6382 0.9822 Z', false, '#f2c35b', '{"x":0.04,"y":0.2893,"w":0.1682,"h":0.2614}', '{"x":0.04,"y":0.2893,"w":0.1682,"h":0.2614}'),
  (3, 'path', 'M 0.4023 0.8515 C 0.4023 0.8515 0.0055 0.6447 0 0.4716 C -0.0058 0.2899 0.29 0.0646 0.3258 0 L 0.3681 0 C 0.3681 0 0.2743 0.1971 0.2808 0.4469 C 0.2873 0.6967 0.4029 0.8043 0.4237 0.8515 L 0.4023 0.8515 Z M 0.4516 0.8515 C 0.4308 0.8043 0.3082 0.6967 0.3017 0.4469 C 0.2952 0.1971 0.4452 0 0.4452 0 L 0.5457 0 C 0.5457 0 0.6957 0.1971 0.6892 0.4469 C 0.6827 0.6967 0.56 0.8043 0.5393 0.8515 L 0.4516 0.8515 Z M 0.5672 0.8515 C 0.5879 0.8043 0.7036 0.6967 0.7101 0.4469 C 0.7166 0.1971 0.6228 0 0.6228 0 L 0.6742 0 C 0.71 0.0646 1.0058 0.2899 1 0.4716 C 0.9945 0.6447 0.5977 0.8515 0.5977 0.8515 L 0.5672 0.8515 Z M 0.4978 1 L 0.5599 1 C 0.5572 0.9978 0.4886 0.9449 0.5865 0.8795 L 0.4978 0.8795 L 0.4138 0.8795 C 0.5082 0.9426 0.4381 1.0001 0.4429 1 L 0.4978 1 Z', false, '#f4a64a', '{"x":0.2381,"y":0.2741,"w":0.1573,"h":0.2918}', '{"x":0.2381,"y":0.2741,"w":0.1573,"h":0.2918}'),
  (4, 'path', 'M 0.9214 0.9215 C 0.8166 1.0262 0.6467 1.0262 0.542 0.9214 C 0.542 0.9214 0.5236 0.9092 0.5236 0.8807 C 0.5239 0.8803 0.5236 0.8799 0.5236 0.8795 C 0.5236 0.8783 0.5236 0.8771 0.5236 0.8759 C 0.5236 0.8713 0.5236 0.8667 0.5236 0.8621 C 0.5236 0.8559 0.5236 0.8497 0.5236 0.8435 C 0.5236 0.8311 0.5236 0.8187 0.5236 0.8063 C 0.5236 0.7814 0.5236 0.7566 0.5236 0.7318 L 0.5236 0.7318 C 0.5236 0.6932 0.5236 0.6545 0.5236 0.6159 L 0.5237 0.6159 C 0.5315 0.6083 0.54 0.6001 0.5484 0.5919 C 0.5565 0.5841 0.5637 0.577 0.5705 0.5705 C 0.5776 0.5637 0.5848 0.5565 0.5929 0.5487 C 0.6015 0.5404 0.6101 0.532 0.6188 0.5237 L 0.6188 0.5238 C 0.6564 0.5238 0.6941 0.5237 0.7317 0.5238 L 0.7318 0.5238 C 0.7566 0.5238 0.7814 0.5238 0.8062 0.5238 C 0.8186 0.5238 0.831 0.5238 0.8434 0.5238 C 0.8496 0.5238 0.8558 0.5238 0.862 0.5238 C 0.8666 0.5238 0.8712 0.5238 0.8758 0.5238 C 0.877 0.5238 0.8782 0.5238 0.8794 0.5238 C 0.8798 0.5238 0.8802 0.5241 0.8806 0.5238 C 0.8806 0.5238 0.9073 0.5266 0.9214 0.5421 C 1.0204 0.6523 1.0261 0.8167 0.9214 0.9214 Z M 0.7318 0.4765 C 0.7566 0.4765 0.7814 0.4765 0.8062 0.4765 C 0.8186 0.4765 0.831 0.4765 0.8434 0.4765 C 0.8496 0.4765 0.8558 0.4765 0.862 0.4765 C 0.8666 0.4765 0.8712 0.4765 0.8758 0.4765 L 0.8794 0.4765 C 0.8798 0.4765 0.8802 0.4762 0.8806 0.4765 C 0.8806 0.4765 0.9047 0.4758 0.9214 0.4581 C 1.0262 0.3533 1.0262 0.1835 0.9214 0.0788 L 0.9215 0.0788 C 0.8167 -0.0259 0.6462 -0.0266 0.5421 0.0788 C 0.5264 0.0947 0.5237 0.1196 0.5237 0.1196 C 0.524 0.1201 0.5237 0.1204 0.5237 0.1209 C 0.5237 0.122 0.5237 0.1232 0.5237 0.1244 C 0.5237 0.129 0.5237 0.1336 0.5237 0.1382 C 0.5237 0.1444 0.5237 0.1506 0.5237 0.1568 C 0.5237 0.1692 0.5237 0.1816 0.5237 0.194 C 0.5237 0.2188 0.5237 0.2436 0.5237 0.2684 L 0.5237 0.2684 C 0.5237 0.307 0.5237 0.3456 0.5237 0.3842 L 0.5237 0.3842 C 0.5283 0.3887 0.5332 0.3935 0.5379 0.3981 C 0.5426 0.4027 0.5472 0.407 0.5516 0.4114 C 0.562 0.4214 0.5721 0.4313 0.5829 0.4417 C 0.5886 0.4472 0.5943 0.4528 0.6003 0.4586 C 0.6064 0.4645 0.6127 0.4706 0.6188 0.4765 L 0.6188 0.4765 C 0.6564 0.4765 0.6941 0.4765 0.7317 0.4765 Z M 0.2605 0.5238 C 0.263 0.5238 0.2656 0.5238 0.2682 0.5238 L 0.2683 0.5238 C 0.3073 0.5237 0.3463 0.5238 0.3853 0.5238 L 0.3853 0.5237 C 0.3924 0.5309 0.4003 0.5391 0.4086 0.5476 C 0.4165 0.5557 0.4238 0.5632 0.4308 0.5704 C 0.4377 0.5775 0.445 0.5849 0.4527 0.5929 C 0.4608 0.6013 0.4686 0.6093 0.4762 0.6172 L 0.4763 0.6172 C 0.4763 0.6554 0.4763 0.6936 0.4763 0.7318 L 0.4763 0.7318 C 0.4763 0.7566 0.4763 0.7814 0.4763 0.8063 C 0.4763 0.8186 0.4763 0.8311 0.4763 0.8435 C 0.4763 0.8497 0.4763 0.8559 0.4763 0.8621 C 0.4763 0.8667 0.4763 0.8713 0.4763 0.8759 C 0.4763 0.8771 0.4763 0.8783 0.4763 0.8795 C 0.4763 0.8799 0.476 0.8803 0.4763 0.8807 C 0.4748 0.9023 0.4579 0.9214 0.4579 0.9214 C 0.3532 1.0262 0.1833 1.0262 0.0786 0.9214 C -0.0262 0.8167 -0.0262 0.6469 0.0786 0.5422 C 0.0786 0.5422 0.0934 0.5238 0.1194 0.5238 C 0.1204 0.5238 0.121 0.5238 0.1219 0.5238 L 0.1244 0.5238 C 0.126 0.5238 0.1277 0.5238 0.1294 0.5238 L 0.1295 0.5238 C 0.1732 0.5238 0.2168 0.5238 0.2605 0.5238 Z M 0.0786 0.0788 C 0.1833 -0.0259 0.3532 -0.0259 0.4579 0.0788 C 0.4579 0.0788 0.4763 0.0981 0.4763 0.1196 C 0.4761 0.1201 0.4763 0.1204 0.4763 0.1209 C 0.4763 0.122 0.4763 0.1232 0.4763 0.1244 C 0.4763 0.129 0.4763 0.1336 0.4763 0.1382 C 0.4763 0.1444 0.4763 0.1506 0.4763 0.1568 C 0.4763 0.1692 0.4763 0.1816 0.4763 0.194 C 0.4763 0.2188 0.4763 0.2436 0.4763 0.2684 L 0.4763 0.2684 C 0.4763 0.3066 0.4763 0.3447 0.4763 0.3829 C 0.4689 0.3908 0.461 0.3988 0.4528 0.4072 C 0.445 0.4151 0.4378 0.4226 0.4309 0.4297 C 0.4239 0.4369 0.4166 0.4444 0.4087 0.4526 C 0.4004 0.4611 0.3925 0.4693 0.3854 0.4765 C 0.3464 0.4765 0.3073 0.4765 0.2683 0.4765 L 0.2682 0.4765 C 0.2656 0.4765 0.263 0.4765 0.2605 0.4765 C 0.2168 0.4765 0.1731 0.4765 0.1294 0.4765 L 0.1294 0.4765 C 0.1277 0.4765 0.126 0.4765 0.1244 0.4765 C 0.1235 0.4765 0.1227 0.4765 0.1219 0.4765 C 0.121 0.4765 0.1204 0.4765 0.1194 0.4765 C 0.0907 0.4765 0.0786 0.4581 0.0786 0.4581 C -0.0262 0.3533 -0.0262 0.1835 0.0786 0.0788 Z M 0.5008 0.5814 C 0.505 0.5773 0.5101 0.5724 0.5159 0.5668 C 0.5164 0.5663 0.517 0.5657 0.5176 0.5652 C 0.5198 0.563 0.5221 0.5607 0.5245 0.5584 C 0.53 0.5531 0.5358 0.5475 0.5417 0.5418 L 0.5417 0.5418 C 0.5469 0.5367 0.5522 0.5316 0.5573 0.5266 C 0.5617 0.5224 0.5659 0.5183 0.5699 0.5144 C 0.5705 0.5138 0.5711 0.5132 0.5717 0.5127 C 0.5738 0.5106 0.5759 0.5086 0.5778 0.5068 C 0.5802 0.5044 0.5825 0.5022 0.5846 0.5002 L 0.5846 0.5001 C 0.5809 0.4964 0.5765 0.4923 0.5718 0.4876 C 0.5712 0.4871 0.5707 0.4865 0.5701 0.486 C 0.5683 0.4842 0.5665 0.4825 0.5646 0.4806 C 0.5574 0.4737 0.5498 0.4663 0.5421 0.4588 C 0.5386 0.4554 0.535 0.452 0.5316 0.4486 C 0.5268 0.444 0.5222 0.4395 0.5178 0.4352 C 0.5172 0.4347 0.5167 0.4341 0.5161 0.4336 C 0.5147 0.4322 0.5133 0.4309 0.512 0.4296 C 0.5078 0.4255 0.5041 0.4219 0.5009 0.4188 L 0.5002 0.4192 C 0.4956 0.4239 0.4901 0.4296 0.4838 0.436 C 0.4836 0.4362 0.4834 0.4365 0.4832 0.4367 C 0.4825 0.4374 0.4817 0.4382 0.481 0.4389 C 0.4744 0.4457 0.4674 0.453 0.4603 0.4602 C 0.4565 0.4642 0.4527 0.4681 0.449 0.4719 C 0.447 0.474 0.445 0.476 0.4431 0.4779 C 0.4424 0.4787 0.4416 0.4795 0.4409 0.4802 C 0.4363 0.4849 0.4321 0.4893 0.4283 0.4932 C 0.4258 0.4957 0.4236 0.498 0.4216 0.5001 L 0.4216 0.5002 C 0.4267 0.5054 0.4334 0.5123 0.4411 0.5202 C 0.4414 0.5205 0.4417 0.5208 0.442 0.5211 C 0.4424 0.5216 0.4428 0.522 0.4433 0.5225 C 0.4488 0.5282 0.4547 0.5342 0.4606 0.5404 C 0.4661 0.546 0.4716 0.5517 0.4769 0.5571 C 0.4785 0.5587 0.48 0.5603 0.4815 0.5618 C 0.4822 0.5626 0.483 0.5634 0.4837 0.5641 C 0.4892 0.5698 0.4942 0.5749 0.4985 0.5793 C 0.4993 0.5802 0.5001 0.581 0.5008 0.5817 Z', false, '#ec7f8f', '{"x":0.7297,"y":0.4858,"w":0.106,"h":0.1885}', '{"x":0.7297,"y":0.4858,"w":0.106,"h":0.1885}'),
  (5, 'path', 'M 0.6367 0.9837 C 0.6498 0.9779 0.6641 0.9732 0.6641 0.9732 L 0.6652 0.9569 C 0.6652 0.9569 0.8006 0.9281 0.8344 0.8921 L 0.8344 0.8687 C 0.8344 0.8687 1 0.8118 1 0.5195 C 1 0.1858 0.7955 0.1232 0.7955 0.1232 L 0.7955 0.0928 C 0.7955 0.0928 0.7583 0.0548 0.6584 0.0512 L 0.6704 0.0425 L 0.6693 0.0237 C 0.6693 0.0237 0.642 -0.0011 0.5266 0 L 0.4734 0 C 0.3579 -0.0011 0.3307 0.0237 0.3307 0.0237 L 0.3296 0.0425 L 0.3416 0.0512 C 0.2417 0.0548 0.2045 0.0928 0.2045 0.0928 L 0.2045 0.1232 C 0.2045 0.1232 0 0.1745 0 0.5195 C 0 0.7767 0.1656 0.8687 0.1656 0.8687 L 0.1656 0.8921 C 0.1994 0.9281 0.3348 0.9569 0.3348 0.9569 L 0.3359 0.9732 C 0.3359 0.9732 0.3502 0.9779 0.3633 0.9837 C 0.3633 0.9837 0.4915 1.0205 0.6367 0.9837 Z', false, '#f59a6a', '{"x":0.8656,"y":0.492,"w":0.0945,"h":0.176}', '{"x":0.8656,"y":0.492,"w":0.0945,"h":0.176}')
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
  insert into public.lanterns (id, shape, path, color, interactive, wall, proj)
  select r.id, r.shape, nullif(r.path, ''), lower(r.color), coalesce(r.interactive, false), r.wall, r.proj
    from jsonb_to_recordset(p_rows) as r(id int, shape text, path text, color text, interactive boolean, wall jsonb, proj jsonb);
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
