-- Shabbat Ten: database setup. Run once in Supabase → SQL Editor.

-- ───────── Tables ─────────
create table if not exists public.dinners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  dinner_date date not null,
  neighborhood text not null default '',
  venue text not null default '',
  doors text not null default '19:30',
  candles text not null default '',
  ages text not null default '',
  dress text not null default '',
  description text not null default '',
  menu text[] not null default '{}',
  price int not null default 220,
  seats_m int not null default 5,
  seats_f int not null default 5,
  image_url text not null default 'media/table.jpg',
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  dinner_id uuid not null references public.dinners(id) on delete cascade,
  seat text not null check (seat in ('m','f')),
  full_name text not null,
  email text not null,
  phone text not null,
  social text not null,
  selfie_path text not null,
  dob date not null,
  country text not null,
  relationship text not null check (relationship in ('single','relationship','married')),
  bio text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','waitlist','denied')),
  paid boolean not null default false,
  host_note text not null default '',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists applications_dinner_idx on public.applications(dinner_id);

create table if not exists public.settings (
  key text primary key,
  value text not null default ''
);
insert into public.settings(key,value) values
  ('bit_phone',''),
  ('bit_link',''),
  ('pay_hours','24'),
  ('msg_approved','Hi {first}! 🕯️ You''re approved for {dinner} on {date}. To lock in your seat, please pay ₪{price} via Bit within {hours} hours.\n\nBit: {bit_phone} {bit_link}\n\nOnce we see your payment we''ll send you the address. Shabbat shalom!'),
  ('msg_waitlist','Hi {first}! Thanks for applying to {dinner} on {date}. The table is full right now, so you''re on our waitlist. If a seat opens up we''ll message you right away.'),
  ('msg_denied','Hi {first}, thank you for applying to {dinner}. We couldn''t fit you at this table, but we''d love to see you apply for a future Shabbat. Shabbat shalom!')
on conflict (key) do nothing;

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- ───────── Helpers ─────────
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.admins where user_id = auth.uid());
$$;

-- Public view: dinners with approved seat counts (no applicant data)
create or replace view public.dinners_public as
  select d.*,
    (select count(*) from public.applications a where a.dinner_id=d.id and a.status='approved' and a.seat='m')::int as taken_m,
    (select count(*) from public.applications a where a.dinner_id=d.id and a.status='approved' and a.seat='f')::int as taken_f
  from public.dinners d
  where d.published and d.dinner_date >= current_date;
grant select on public.dinners_public to anon, authenticated;

-- New applications always start as pending and unpaid
create or replace function public.applications_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.status := 'pending'; new.paid := false; new.host_note := ''; new.decided_at := null;
    if not exists (select 1 from public.dinners d where d.id=new.dinner_id and d.published and d.dinner_date>=current_date) then
      raise exception 'This dinner is not open for applications';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists applications_guard on public.applications;
create trigger applications_guard before insert on public.applications
  for each row execute function public.applications_guard();

-- ───────── API access (RLS below decides who sees what) ─────────
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.dinners, public.applications, public.settings to authenticated;
grant select on public.admins to authenticated;
grant insert on public.applications to anon;
grant execute on function public.is_admin() to anon, authenticated;

-- ───────── Row-level security ─────────
alter table public.dinners enable row level security;
alter table public.applications enable row level security;
alter table public.settings enable row level security;
alter table public.admins enable row level security;

drop policy if exists "admin all dinners" on public.dinners;
create policy "admin all dinners" on public.dinners for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public apply" on public.applications;
create policy "public apply" on public.applications for insert to anon, authenticated with check (true);
drop policy if exists "admin all applications" on public.applications;
create policy "admin all applications" on public.applications for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin all settings" on public.settings;
create policy "admin all settings" on public.settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin read self" on public.admins;
create policy "admin read self" on public.admins for select to authenticated using (user_id = auth.uid());

-- ───────── Storage ─────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('selfies','selfies', false, 5242880, array['image/jpeg','image/png','image/webp'])
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('dinner-images','dinner-images', true, 8388608, array['image/jpeg','image/png','image/webp'])
  on conflict (id) do nothing;

drop policy if exists "anyone uploads selfie" on storage.objects;
create policy "anyone uploads selfie" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'selfies');
drop policy if exists "admin reads selfies" on storage.objects;
create policy "admin reads selfies" on storage.objects for select to authenticated
  using (bucket_id = 'selfies' and public.is_admin());
drop policy if exists "admin deletes selfies" on storage.objects;
create policy "admin deletes selfies" on storage.objects for delete to authenticated
  using (bucket_id = 'selfies' and public.is_admin());
drop policy if exists "admin manages dinner images" on storage.objects;
create policy "admin manages dinner images" on storage.objects for all to authenticated
  using (bucket_id = 'dinner-images' and public.is_admin())
  with check (bucket_id = 'dinner-images' and public.is_admin());

-- ───────── Starter dinners (edit or delete in the dashboard) ─────────
insert into public.dinners (title,dinner_date,neighborhood,venue,doors,candles,ages,dress,description,menu,price,image_url)
select * from (values
 ('Rooftop Kiddush', date '2026-11-27','Neve Tzedek','Private rooftop, Neve Tzedek','19:30','16:20','26–34','Shabbat chic, white welcome',
  'We start on a rooftop above the old stone lanes with kiddush as the last light goes, then sit down to a long table under string lights. Your hosts keep the conversation moving, and the seating changes once after mains so you meet more of the table.',
  array['Homemade challah, tahini, matbucha','Charred eggplant, labneh, pomegranate','Slow-cooked chicken with apricots','Malabi with rose and pistachio','Israeli wine and arak'],220,'media/challah1.jpg'),
 ('Jaffa Long Table', date '2026-12-25','Old Jaffa','Courtyard house, Old Jaffa','19:00','16:24','28–38','Relaxed, sea breeze layers',
  'A stone-walled courtyard a few steps from the port. Fish from the market that morning, a cook who tells the story behind every plate, and ten people who came alone and leave as a crew.',
  array['Challah and three spreads','Market crudo with lemon and chili','Whole roasted fish, herbs, potatoes','Knafeh to share','Galilee whites and a rosé'],220,'media/table.jpg')
) v where not exists (select 1 from public.dinners);

-- ───────── Added: observance & kashrut ─────────
alter table public.applications add column if not exists observance text check (observance in ('orthodox','dati_leumi','masorti','secular','other'));
alter table public.applications add column if not exists observance_other text not null default '';
alter table public.applications add column if not exists kashrut text check (kashrut in ('full','home','none'));
