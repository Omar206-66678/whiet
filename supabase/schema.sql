-- White — قاعدة البيانات والأمان (Supabase / PostgreSQL)
-- شغّل الملف كاملًا في SQL Editor. الأمان هنا في قاعدة البيانات نفسها، مش في الواجهة.

create extension if not exists btree_gist;
create type booking_status as enum ('pending','confirmed','rejected','cancelled','completed');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text, phone text,
  role text not null default 'customer' check (role in ('customer','cashier','admin')),
  created_at timestamptz not null default now()
);

create table devices (
  id uuid primary key default gen_random_uuid(),
  name text not null, category text not null,
  price_hour numeric(8,2) not null check (price_hour >= 0),
  active boolean not null default true
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references devices(id),
  customer_id uuid not null default auth.uid() references profiles(id),
  starts_at timestamptz not null, ends_at timestamptz not null,
  status booking_status not null default 'pending',
  decided_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '12 hours'),
  -- يمنع تداخل حجزين مؤكدين على نفس الجهاز، حتى لو الكاشير ضغط قبول مرتين
  exclude using gist (device_id with =, tstzrange(starts_at, ends_at) with &&) where (status = 'confirmed')
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references devices(id),
  started_at timestamptz not null default now(),
  planned_end timestamptz,            -- null = وقت مفتوح
  ended_at timestamptz,               -- null = الجلسة شغالة
  opened_by uuid default auth.uid() references profiles(id),
  check (planned_end is null or planned_end > started_at)
);
create unique index one_active_session_per_device on sessions(device_id) where ended_at is null;

-- أدوار
create function is_staff() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and role in ('cashier','admin')) $$;

create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as
$$ begin insert into profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name'); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- الواجهات العامة: حالة الأجهزة والمواعيد المحجوزة بدون أي بيانات عملاء أو أموال
create view device_status as
select d.id, d.name, d.category, d.price_hour,
  case when s.id is not null and s.planned_end is null then 'open'
       when s.id is not null or b.id is not null then 'booked'
       else 'available' end as state,
  coalesce(s.planned_end, b.ends_at) as busy_until
from devices d
left join lateral (select * from sessions where device_id = d.id and ended_at is null limit 1) s on true
left join lateral (select * from bookings where device_id = d.id and status = 'confirmed'
                   and starts_at <= now() and ends_at > now() limit 1) b on true
where d.active;

create view device_slots as
select device_id, starts_at, ends_at from bookings
where status = 'confirmed' and ends_at > now();

grant select on device_status, device_slots to anon, authenticated;

-- RLS
alter table profiles enable row level security;
alter table devices  enable row level security;
alter table bookings enable row level security;
alter table sessions enable row level security;

create policy devices_read   on devices  for select using (active or is_staff());
create policy devices_staff  on devices  for all    using (is_staff()) with check (is_staff());

create policy bookings_read   on bookings for select using (customer_id = auth.uid() or is_staff());
create policy bookings_insert on bookings for insert with check (customer_id = auth.uid() and status = 'pending' and starts_at > now());
create policy bookings_staff  on bookings for update using (is_staff()) with check (is_staff());

create policy sessions_staff on sessions for all using (is_staff()) with check (is_staff());

create policy profiles_read   on profiles for select using (id = auth.uid() or is_staff());
create policy profiles_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on profiles from authenticated;
grant  update (full_name, phone) on profiles to authenticated;   -- الدور (role) لا يتغير من التطبيق أبدًا

-- إلغاء العميل لحجزه المعلّق فقط
create function cancel_my_booking(p_id uuid) returns void language sql security definer set search_path = public as
$$ update bookings set status = 'cancelled' where id = p_id and customer_id = auth.uid() and status = 'pending' $$;

-- لترقية حساب إلى كاشير/إدارة (من SQL Editor فقط):
-- update profiles set role = 'admin' where id = '<USER_ID>';
