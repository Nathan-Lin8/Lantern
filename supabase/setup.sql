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

-- Starting layout (matches site/layout.js): the 5 laser-cut lanterns, 1 = the main frame. Only fills an empty table.
insert into public.lanterns (id, shape, path, interactive, color, wall, proj) values
  (1, 'path', 'M0.9998 0.4977 C0.9974 0.7588 0.9564 0.7891 0.9564 0.7891 L0.9223 0.7871 C0.8696 0.9039 0.7119 1.0016 0.4915 1 C0.1784 0.9978 0.1065 0.8238 0.1065 0.8238 L0.0806 0.8238 C-0.0188 0.7567 0.0017 0.5045 0.0017 0.5045 L0.0017 0.4955 C0.0017 0.4955 -0.0188 0.2433 0.0806 0.1762 L0.1065 0.1762 C0.1065 0.1762 0.1784 -0.0039 0.4915 0 C0.7277 0.003 0.8376 0.0594 0.928 0.2125 L0.9622 0.2145 C0.9622 0.2145 1.0035 0.2526 0.9998 0.5113Z M0.0321 0.3813 L0.0321 0.3168 L0.0366 0.3071 C0.0366 0.3071 0.0556 0.3413 0.0629 0.341 C0.0754 0.3406 0.0897 0.3173 0.0897 0.3173 C0.0897 0.3173 0.2053 0.0629 0.3021 0.0594 C0.4037 0.0557 0.5297 0.2453 0.5658 0.2682 L0.5658 0.3813 L0.5658 0.3784 L0.5658 0.4916 C0.5297 0.5145 0.4037 0.7041 0.3021 0.7004 C0.2053 0.6969 0.0897 0.4425 0.0897 0.4425 C0.0897 0.4425 0.0754 0.4192 0.0629 0.4188 C0.0556 0.4185 0.0366 0.4527 0.0366 0.4527 L0.0321 0.443 L0.0321 0.3784Z M0.897 0.6177 C0.9343 0.6622 0.9342 0.7344 0.897 0.779 L0.897 0.779 C0.8598 0.8235 0.7994 0.8235 0.7621 0.779 L0.7621 0.779 C0.7595 0.7758 0.7571 0.7726 0.7548 0.7691 L0.7548 0.7691 C0.7525 0.7725 0.7501 0.7758 0.7475 0.7789 C0.7103 0.8235 0.6499 0.8235 0.6126 0.7789 C0.5754 0.7344 0.5754 0.6622 0.6126 0.6176 C0.6152 0.6145 0.618 0.6116 0.6209 0.6089 L0.6209 0.6089 C0.618 0.6062 0.6152 0.6033 0.6126 0.6001 C0.5754 0.5556 0.5754 0.4834 0.6126 0.4389 L0.6126 0.4389 C0.6499 0.3943 0.7103 0.3943 0.7475 0.4389 L0.7475 0.4389 C0.7501 0.442 0.7525 0.4453 0.7548 0.4487 L0.7548 0.4487 C0.7571 0.4453 0.7595 0.442 0.7621 0.4389 C0.7994 0.3943 0.8598 0.3943 0.897 0.4389 L0.897 0.4389 C0.9343 0.4834 0.9342 0.5556 0.897 0.6002 C0.8944 0.6033 0.8917 0.6062 0.8888 0.6089 L0.8888 0.6089 C0.8917 0.6117 0.8944 0.6146 0.897 0.6177Z', true, '#fff1d6', '{"x":0.1352,"y":0.1423,"w":0.4769,"h":0.709}', '{"x":0.1352,"y":0.1423,"w":0.4769,"h":0.709}'),
  (2, 'path', 'M0.1485 0.4023 C0.1485 0.4023 0.3553 0.0055 0.5284 0 C0.7101 -0.0058 0.9354 0.29 1 0.3258 L1 0.3681 C1 0.3681 0.8029 0.2743 0.5531 0.2808 C0.3033 0.2873 0.1957 0.4029 0.1485 0.4237 L0.1485 0.4023Z M0.1485 0.4516 C0.1957 0.4308 0.3033 0.3082 0.5531 0.3017 C0.8029 0.2952 1 0.4452 1 0.4452 L1 0.5457 C1 0.5457 0.8029 0.6957 0.5531 0.6892 C0.3033 0.6827 0.1957 0.56 0.1485 0.5393 L0.1485 0.4516Z M0.1485 0.5672 C0.1957 0.5879 0.3033 0.7036 0.5531 0.7101 C0.8029 0.7166 1 0.6228 1 0.6228 L1 0.6742 C0.9354 0.71 0.7101 1.0058 0.5284 1 C0.3553 0.9945 0.1485 0.5977 0.1485 0.5977 L0.1485 0.5672Z M0 0.4978 L0 0.5599 C0.0022 0.5572 0.0551 0.4886 0.1205 0.5865 L0.1205 0.4978 L0.1205 0.4138 C0.0574 0.5082 -0.0001 0.4381 0 0.4429 L0 0.4978Z', false, '#f4a64a', '{"x":0.1562,"y":0.2097,"w":0.2383,"h":0.406}', '{"x":0.1562,"y":0.2097,"w":0.2383,"h":0.406}'),
  (3, 'path', 'M0.0785 0.9214 C-0.0262 0.8166 -0.0262 0.6467 0.0786 0.542 C0.0786 0.542 0.0908 0.5236 0.1193 0.5236 C0.1197 0.5239 0.1201 0.5236 0.1205 0.5236 C0.1217 0.5236 0.1229 0.5236 0.1241 0.5236 C0.1287 0.5236 0.1333 0.5236 0.1379 0.5236 C0.1441 0.5236 0.1503 0.5236 0.1565 0.5236 C0.1689 0.5236 0.1813 0.5236 0.1937 0.5236 C0.2186 0.5236 0.2434 0.5236 0.2682 0.5236 L0.2682 0.5236 C0.3068 0.5236 0.3455 0.5236 0.3841 0.5236 L0.3841 0.5237 C0.3917 0.5315 0.3999 0.54 0.4081 0.5484 C0.4159 0.5565 0.423 0.5637 0.4295 0.5705 C0.4363 0.5776 0.4435 0.5848 0.4513 0.5929 C0.4596 0.6015 0.468 0.6101 0.4763 0.6188 L0.4762 0.6188 C0.4762 0.6564 0.4763 0.6941 0.4762 0.7317 L0.4762 0.7318 C0.4762 0.7566 0.4762 0.7814 0.4762 0.8062 C0.4762 0.8186 0.4762 0.831 0.4762 0.8434 C0.4762 0.8496 0.4762 0.8558 0.4762 0.862 C0.4762 0.8666 0.4762 0.8712 0.4762 0.8758 C0.4762 0.877 0.4762 0.8782 0.4762 0.8794 C0.4762 0.8798 0.4759 0.8802 0.4762 0.8806 C0.4762 0.8806 0.4734 0.9073 0.4579 0.9214 C0.3477 1.0204 0.1833 1.0261 0.0786 0.9214Z M0.5235 0.7318 C0.5235 0.7566 0.5235 0.7814 0.5235 0.8062 C0.5235 0.8186 0.5235 0.831 0.5235 0.8434 C0.5235 0.8496 0.5235 0.8558 0.5235 0.862 C0.5235 0.8666 0.5235 0.8712 0.5235 0.8758 L0.5235 0.8794 C0.5235 0.8798 0.5238 0.8802 0.5235 0.8806 C0.5235 0.8806 0.5242 0.9047 0.5419 0.9214 C0.6467 1.0262 0.8165 1.0262 0.9212 0.9214 L0.9212 0.9215 C1.0259 0.8167 1.0266 0.6462 0.9212 0.5421 C0.9053 0.5264 0.8804 0.5237 0.8804 0.5237 C0.8799 0.524 0.8796 0.5237 0.8791 0.5237 C0.878 0.5237 0.8768 0.5237 0.8756 0.5237 C0.871 0.5237 0.8664 0.5237 0.8618 0.5237 C0.8556 0.5237 0.8494 0.5237 0.8432 0.5237 C0.8308 0.5237 0.8184 0.5237 0.806 0.5237 C0.7812 0.5237 0.7564 0.5237 0.7316 0.5237 L0.7316 0.5237 C0.693 0.5237 0.6544 0.5237 0.6158 0.5237 L0.6158 0.5237 C0.6113 0.5283 0.6065 0.5332 0.6019 0.5379 C0.5973 0.5426 0.593 0.5472 0.5886 0.5516 C0.5786 0.562 0.5687 0.5721 0.5583 0.5829 C0.5528 0.5886 0.5472 0.5943 0.5414 0.6003 C0.5355 0.6064 0.5294 0.6127 0.5235 0.6188 L0.5235 0.6188 C0.5235 0.6564 0.5235 0.6941 0.5235 0.7317Z M0.4762 0.2605 C0.4762 0.263 0.4762 0.2656 0.4762 0.2682 L0.4762 0.2683 C0.4763 0.3073 0.4762 0.3463 0.4762 0.3853 L0.4763 0.3853 C0.4691 0.3924 0.4609 0.4003 0.4524 0.4086 C0.4443 0.4165 0.4368 0.4238 0.4296 0.4308 C0.4225 0.4377 0.4151 0.445 0.4071 0.4527 C0.3987 0.4608 0.3907 0.4686 0.3828 0.4762 L0.3828 0.4763 C0.3446 0.4763 0.3064 0.4763 0.2682 0.4763 L0.2682 0.4763 C0.2434 0.4763 0.2186 0.4763 0.1937 0.4763 C0.1814 0.4763 0.1689 0.4763 0.1565 0.4763 C0.1503 0.4763 0.1441 0.4763 0.1379 0.4763 C0.1333 0.4763 0.1287 0.4763 0.1241 0.4763 C0.1229 0.4763 0.1217 0.4763 0.1205 0.4763 C0.1201 0.4763 0.1197 0.476 0.1193 0.4763 C0.0977 0.4748 0.0786 0.4579 0.0786 0.4579 C-0.0262 0.3532 -0.0262 0.1833 0.0786 0.0786 C0.1833 -0.0262 0.3531 -0.0262 0.4578 0.0786 C0.4578 0.0786 0.4762 0.0934 0.4762 0.1194 C0.4762 0.1204 0.4762 0.121 0.4762 0.1219 L0.4762 0.1244 C0.4762 0.126 0.4762 0.1277 0.4762 0.1294 L0.4762 0.1295 C0.4762 0.1732 0.4762 0.2168 0.4762 0.2605Z M0.9212 0.0786 C1.0259 0.1833 1.0259 0.3532 0.9212 0.4579 C0.9212 0.4579 0.9019 0.4763 0.8804 0.4763 C0.8799 0.4761 0.8796 0.4763 0.8791 0.4763 C0.878 0.4763 0.8768 0.4763 0.8756 0.4763 C0.871 0.4763 0.8664 0.4763 0.8618 0.4763 C0.8556 0.4763 0.8494 0.4763 0.8432 0.4763 C0.8308 0.4763 0.8184 0.4763 0.806 0.4763 C0.7812 0.4763 0.7564 0.4763 0.7316 0.4763 L0.7316 0.4763 C0.6934 0.4763 0.6553 0.4763 0.6171 0.4763 C0.6092 0.4689 0.6012 0.461 0.5928 0.4528 C0.5849 0.445 0.5774 0.4378 0.5703 0.4309 C0.5631 0.4239 0.5556 0.4166 0.5474 0.4087 C0.5389 0.4004 0.5307 0.3925 0.5235 0.3854 C0.5235 0.3464 0.5235 0.3073 0.5235 0.2683 L0.5235 0.2682 C0.5235 0.2656 0.5235 0.263 0.5235 0.2605 C0.5235 0.2168 0.5235 0.1731 0.5235 0.1294 L0.5235 0.1294 C0.5235 0.1277 0.5235 0.126 0.5235 0.1244 C0.5235 0.1235 0.5235 0.1227 0.5235 0.1219 C0.5235 0.121 0.5235 0.1204 0.5235 0.1194 C0.5235 0.0907 0.5419 0.0786 0.5419 0.0786 C0.6467 -0.0262 0.8165 -0.0262 0.9212 0.0786Z M0.4186 0.5008 C0.4227 0.505 0.4276 0.5101 0.4332 0.5159 C0.4337 0.5164 0.4343 0.517 0.4348 0.5176 C0.437 0.5198 0.4393 0.5221 0.4416 0.5245 C0.4469 0.53 0.4525 0.5358 0.4582 0.5417 L0.4582 0.5417 C0.4633 0.5469 0.4684 0.5522 0.4734 0.5573 C0.4776 0.5617 0.4817 0.5659 0.4856 0.5699 C0.4862 0.5705 0.4868 0.5711 0.4873 0.5717 C0.4894 0.5738 0.4914 0.5759 0.4932 0.5778 C0.4956 0.5802 0.4978 0.5825 0.4998 0.5846 L0.4999 0.5846 C0.5036 0.5809 0.5077 0.5765 0.5124 0.5718 C0.5129 0.5712 0.5135 0.5707 0.514 0.5701 C0.5158 0.5683 0.5175 0.5665 0.5194 0.5646 C0.5263 0.5574 0.5337 0.5498 0.5412 0.5421 C0.5446 0.5386 0.548 0.535 0.5514 0.5316 C0.556 0.5268 0.5605 0.5222 0.5648 0.5178 C0.5653 0.5172 0.5659 0.5167 0.5664 0.5161 C0.5678 0.5147 0.5691 0.5133 0.5704 0.512 C0.5745 0.5078 0.5781 0.5041 0.5812 0.5009 L0.5808 0.5002 C0.5761 0.4956 0.5704 0.4901 0.564 0.4838 C0.5638 0.4836 0.5635 0.4834 0.5633 0.4832 C0.5626 0.4825 0.5618 0.4817 0.5611 0.481 C0.5543 0.4744 0.547 0.4674 0.5398 0.4603 C0.5358 0.4565 0.5319 0.4527 0.5281 0.449 C0.526 0.447 0.524 0.445 0.5221 0.4431 C0.5213 0.4424 0.5205 0.4416 0.5198 0.4409 C0.5151 0.4363 0.5107 0.4321 0.5068 0.4283 C0.5043 0.4258 0.502 0.4236 0.4999 0.4216 L0.4998 0.4216 C0.4946 0.4267 0.4877 0.4334 0.4798 0.4411 C0.4795 0.4414 0.4792 0.4417 0.4789 0.442 C0.4784 0.4424 0.478 0.4428 0.4775 0.4433 C0.4718 0.4488 0.4658 0.4547 0.4596 0.4606 C0.454 0.4661 0.4483 0.4716 0.4429 0.4769 C0.4413 0.4785 0.4397 0.48 0.4382 0.4815 C0.4374 0.4822 0.4366 0.483 0.4359 0.4837 C0.4302 0.4892 0.4251 0.4942 0.4207 0.4985 C0.4198 0.4993 0.419 0.5001 0.4183 0.5008Z', false, '#ec7f8f', '{"x":0.4184,"y":0.4372,"w":0.1539,"h":0.2735}', '{"x":0.4184,"y":0.4372,"w":0.1539,"h":0.2735}'),
  (4, 'path', 'M0.0178 0.6383 L0.0343 0.6392 C0.0343 0.6392 0.037 0.7533 0.0733 0.7818 L0.097 0.7818 C0.097 0.7818 0.1807 1 0.4757 1 C0.8125 1 0.8757 0.749 0.8757 0.749 L0.9063 0.749 C0.9063 0.749 0.9447 0.7176 0.9483 0.6335 L0.9571 0.6436 L0.976 0.6427 C0.976 0.6427 1.0011 0.6197 1 0.5224 L1 0.4776 C1.0011 0.3803 0.976 0.3573 0.976 0.3573 L0.9571 0.3564 L0.9483 0.3665 C0.9447 0.2824 0.9063 0.251 0.9063 0.251 L0.8757 0.251 C0.8757 0.251 0.8239 0 0.4757 0 C0.2161 0 0.097 0.2182 0.097 0.2182 L0.0733 0.2182 C0.037 0.2467 0.0343 0.3608 0.0343 0.3608 L0.0178 0.3617 C0.0178 0.3617 -0.0224 0.5061 0.0178 0.6382Z', false, '#f2c35b', '{"x":0.7274,"y":0.1307,"w":0.2135,"h":0.4341}', '{"x":0.7274,"y":0.1307,"w":0.2135,"h":0.4341}'),
  (5, 'path', 'M0.0163 0.6367 C0.0221 0.6498 0.0268 0.6641 0.0268 0.6641 L0.0431 0.6652 C0.0431 0.6652 0.0719 0.8006 0.1079 0.8344 L0.1313 0.8344 C0.1313 0.8344 0.1882 1 0.4805 1 C0.8142 1 0.8768 0.7955 0.8768 0.7955 L0.9072 0.7955 C0.9072 0.7955 0.9452 0.7583 0.9488 0.6584 L0.9575 0.6704 L0.9763 0.6693 C0.9763 0.6693 1.0011 0.642 1 0.5266 L1 0.4734 C1.0011 0.3579 0.9763 0.3307 0.9763 0.3307 L0.9575 0.3296 L0.9488 0.3416 C0.9452 0.2417 0.9072 0.2045 0.9072 0.2045 L0.8768 0.2045 C0.8768 0.2045 0.8255 0 0.4805 0 C0.2233 0 0.1313 0.1656 0.1313 0.1656 L0.1079 0.1656 C0.0719 0.1994 0.0431 0.3348 0.0431 0.3348 L0.0268 0.3359 C0.0268 0.3359 0.0221 0.3502 0.0163 0.3633 C0.0163 0.3633 -0.0205 0.4915 0.0163 0.6367Z', false, '#f59a6a', '{"x":0.6692,"y":0.6093,"w":0.1437,"h":0.2439}', '{"x":0.6692,"y":0.6093,"w":0.1437,"h":0.2439}')
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
