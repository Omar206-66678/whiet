-- ============================================================
-- White — إعداد قاعدة البيانات كاملة (ملف واحد)
-- الصقه كله في Supabase › SQL Editor واضغط Run (مرة واحدة على مشروع جديد).
-- بعد التشغيل: سجّل حسابك من التطبيق وأكّد البريد، وبعدين شغّل سطر "ترقية المالك" في آخر الملف.
-- ============================================================

-- ############ schema.sql ############
-- White — قاعدة البيانات والأمان (Supabase / PostgreSQL)
-- شغّل الملف كاملًا في SQL Editor. الأمان هنا في قاعدة البيانات نفسها، مش في الواجهة.

create extension if not exists btree_gist;
create type booking_status as enum ('pending','confirmed','rejected','cancelled','completed');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  phone text unique,                 -- رقم الهاتف (مفتاح الدخول)
  role text not null default 'customer' check (role in ('customer','cashier','owner')),
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
$$ select exists (select 1 from profiles where id = auth.uid() and role in ('cashier','owner')) $$;
create function is_owner() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and role = 'owner') $$;

create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as
$$ begin insert into profiles (id, full_name, phone) values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone'); return new; end $$;
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
create policy devices_owner  on devices  for all    using (is_owner()) with check (is_owner());   -- الأجهزة والأسعار للمالك فقط

create policy bookings_read   on bookings for select using (customer_id = auth.uid() or is_staff());
create policy bookings_insert on bookings for insert with check (customer_id = auth.uid() and status = 'pending' and starts_at > now());
create policy bookings_staff  on bookings for update using (is_staff()) with check (is_staff());

create policy sessions_staff on sessions for all using (is_staff()) with check (is_staff());

create policy profiles_read   on profiles for select using (id = auth.uid() or is_staff());
create policy profiles_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on profiles from authenticated;
grant  update (full_name) on profiles to authenticated;   -- الدور (role) والهاتف لا يتغيران من التطبيق أبدًا

-- إلغاء العميل لحجزه المعلّق فقط
create function cancel_my_booking(p_id uuid) returns void language sql security definer set search_path = public as
$$ update bookings set status = 'cancelled' where id = p_id and customer_id = auth.uid() and status = 'pending' $$;

-- لترقية حساب إلى كاشير/إدارة (من SQL Editor فقط):
-- لترقية أول مالك (مرة واحدة): update profiles set role = 'owner' where phone = '01XXXXXXXXX';

-- إعدادات التشغيل (ساعات العمل وقواعد الحجز): يقرأها الجميع ويعدّلها المالك من لوحة الإعدادات
create table app_settings (
  id int primary key default 1 check (id = 1),
  open_hour int not null default 12 check (open_hour between 0 and 23),       -- ساعة الفتح
  close_hour int not null default 26 check (close_hour between 1 and 30),     -- ساعة الإغلاق (26 = 2 صباحًا اليوم التالي)
  day_start int not null default 6 check (day_start between 0 and 12),        -- بداية يوم العمل (للتقارير)
  min_hours numeric(4,1) not null default 1 check (min_hours > 0),
  max_hours numeric(4,1) not null default 10 check (max_hours >= min_hours and max_hours <= 12),
  step_min int not null default 30 check (step_min in (15, 30, 60)),
  lead_min int not null default 15 check (lead_min between 0 and 240),        -- أقل وقت قبل الحجز
  timezone text not null default 'Africa/Cairo'
);
insert into app_settings default values;
alter table app_settings enable row level security;
create policy settings_read  on app_settings for select using (true);
create policy settings_owner on app_settings for update using (is_owner()) with check (is_owner());

-- ############ schema_phase4.sql ############
-- White — المرحلة 4: جلسات الأجهزة، طلبات الكافيه، الفواتير، المصروفات، المنيو، الفئات، تعيين الكاشير
-- شغّله بعد schema.sql

create table session_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  name text not null,
  unit_price numeric(8,2) not null check (unit_price >= 0),
  qty int not null default 1 check (qty > 0),
  added_at timestamptz not null default now()
);

-- كافيه مستقل: عملاء يطلبون مشروبات/أكل بدون جهاز بلايستيشن
create table cafe_orders (
  id uuid primary key default gen_random_uuid(),
  label text not null default '',        -- اسم أو رقم طاولة (اختياري)
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opened_by uuid default auth.uid() references profiles(id)
);
create table cafe_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references cafe_orders(id) on delete cascade,
  name text not null,
  unit_price numeric(8,2) not null check (unit_price >= 0),
  qty int not null default 1 check (qty > 0),
  added_at timestamptz not null default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  session_id uuid unique references sessions(id),     -- فاتورة جهاز
  order_id uuid unique references cafe_orders(id),    -- أو فاتورة كافيه مستقل
  device_id uuid references devices(id),
  minutes int not null default 0,                     -- الدقائق المحسوبة (مقرّبة)
  time_amount numeric(10,2) not null default 0,
  items_amount numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  closed_by uuid default auth.uid() references profiles(id),
  paid_at timestamptz not null default now(),
  check ((session_id is not null and device_id is not null) or order_id is not null)
);
create table expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  amount numeric(10,2) not null check (amount > 0),
  spent_at timestamptz not null default now(),
  created_by uuid default auth.uid() references profiles(id)
);

-- المنيو: يقرأه الجميع (الأصناف الظاهرة)، ويعدّله المالك فقط
create table menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null, description text not null default '', category text not null,
  price numeric(8,2) not null check (price >= 0), active boolean not null default true
);
-- الفئات (أجهزة ومنيو): يقرأها الجميع (الوصف يظهر للعميل)، ويديرها المالك
create table categories (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('device','menu')),
  name text not null,
  description text not null default '',
  unique (kind, name)
);

alter table session_items    enable row level security;
alter table cafe_orders      enable row level security;
alter table cafe_order_items enable row level security;
alter table invoices         enable row level security;
alter table expenses         enable row level security;
alter table menu_items       enable row level security;
alter table categories       enable row level security;

create policy items_staff      on session_items    for all using (is_staff()) with check (is_staff());
create policy cafe_orders_staff on cafe_orders     for all using (is_staff()) with check (is_staff());
create policy cafe_items_staff on cafe_order_items for all using (is_staff()) with check (is_staff());
-- الفواتير والمصروفات (الأرباح) للمالك فقط. الكاشير يصدر الفاتورة عبر close_session ولا يقرأ الحسابات
create policy invoices_owner   on invoices         for select using (is_owner());
create policy expenses_owner   on expenses         for all using (is_owner()) with check (is_owner());
create policy menu_read        on menu_items       for select using (active or is_staff());
create policy menu_owner       on menu_items       for all using (is_owner()) with check (is_owner());
create policy categories_read  on categories      for select using (true);
create policy categories_owner on categories       for all using (is_owner()) with check (is_owner());

-- بعد قفل الفاتورة لا يمكن تعديل أصنافها
create function guard_session_items() returns trigger language plpgsql security definer set search_path = public as $$
declare sid uuid := coalesce(new.session_id, old.session_id);
begin
  if exists (select 1 from sessions where id = sid and ended_at is not null) then raise exception 'الفاتورة مقفولة ولا يمكن تعديلها'; end if;
  return coalesce(new, old);
end $$;
create trigger trg_guard_session_items before insert or update or delete on session_items for each row execute function guard_session_items();

create function guard_cafe_items() returns trigger language plpgsql security definer set search_path = public as $$
declare oid_ uuid := coalesce(new.order_id, old.order_id);
begin
  if exists (select 1 from cafe_orders where id = oid_ and closed_at is not null) then raise exception 'الفاتورة مقفولة ولا يمكن تعديلها'; end if;
  return coalesce(new, old);
end $$;
create trigger trg_guard_cafe_items before insert or update or delete on cafe_order_items for each row execute function guard_cafe_items();

-- قفل جلسة جهاز وإصدار الفاتورة. الحساب على الوقت الفعلي (مقرّب لأعلى لأقرب خطوة وبحد أدنى)
create function close_session(p_session uuid, p_step int default 15, p_min int default 15)
returns invoices language plpgsql security definer set search_path = public as $$
declare s sessions; d devices; mins numeric; billable numeric; rounded int; t numeric; it numeric; inv invoices;
begin
  if not is_staff() then raise exception 'not allowed'; end if;
  select * into s from sessions where id = p_session and ended_at is null for update;
  if not found then raise exception 'الجلسة مقفولة بالفعل'; end if;
  select * into d from devices where id = s.device_id;
  update sessions set ended_at = now() where id = s.id returning * into s;
  mins := extract(epoch from (s.ended_at - s.started_at)) / 60;
  billable := greatest(mins, p_min);
  rounded := ceil(billable / p_step - 0.000001)::int * p_step;
  t := round(d.price_hour * rounded / 60, 2);
  select coalesce(sum(unit_price * qty), 0) into it from session_items where session_id = s.id;
  insert into invoices (session_id, device_id, minutes, time_amount, items_amount, total)
    values (s.id, d.id, rounded, t, it, t + it) returning * into inv;
  return inv;
end $$;
revoke all on function close_session(uuid, int, int) from public;
grant execute on function close_session(uuid, int, int) to authenticated;

-- إنهاء طلب كافيه مستقل
create function close_cafe_order(p_order uuid) returns invoices
language plpgsql security definer set search_path = public as $$
declare o cafe_orders; it numeric; inv invoices;
begin
  if not is_staff() then raise exception 'not allowed'; end if;
  select * into o from cafe_orders where id = p_order and closed_at is null for update;
  if not found then raise exception 'الطلب مقفول بالفعل'; end if;
  select coalesce(sum(unit_price * qty), 0) into it from cafe_order_items where order_id = o.id;
  update cafe_orders set closed_at = now() where id = o.id;
  insert into invoices (order_id, minutes, time_amount, items_amount, total) values (o.id, 0, 0, it, it) returning * into inv;
  return inv;
end $$;
revoke all on function close_cafe_order(uuid) from public;
grant execute on function close_cafe_order(uuid) to authenticated;

-- تعديل اسم/وصف فئة (والاسم الجديد ينتقل لكل الأجهزة/الأصناف التابعة لها)
create function rename_category(p_id uuid, p_name text, p_desc text) returns void
language plpgsql security definer set search_path = public as $$
declare c categories; n text := btrim(p_name);
begin
  if not is_owner() then raise exception 'للمالك فقط'; end if;
  if n = '' then raise exception 'اكتب اسم الفئة'; end if;
  select * into c from categories where id = p_id;
  if not found then raise exception 'الفئة غير موجودة'; end if;
  if exists (select 1 from categories where kind = c.kind and name = n and id <> c.id) then raise exception 'الفئة موجودة بالفعل'; end if;
  update categories set name = n, description = coalesce(p_desc, '') where id = c.id;
  if c.name <> n then
    if c.kind = 'device' then update devices set category = n where category = c.name;
    else update menu_items set category = n where category = c.name; end if;
  end if;
end $$;
create function delete_category(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c categories; used boolean;
begin
  if not is_owner() then raise exception 'للمالك فقط'; end if;
  select * into c from categories where id = p_id;
  if not found then raise exception 'الفئة غير موجودة'; end if;
  if c.kind = 'device' then used := exists (select 1 from devices where category = c.name);
  else used := exists (select 1 from menu_items where category = c.name); end if;
  if used then raise exception 'فيه عناصر تابعة للفئة دي. انقلها لفئة تانية الأول'; end if;
  delete from categories where id = c.id;
end $$;
revoke all on function rename_category(uuid, text, text) from public;
revoke all on function delete_category(uuid) from public;
grant execute on function rename_category(uuid, text, text) to authenticated;
grant execute on function delete_category(uuid) to authenticated;

-- تعيين/إلغاء كاشير (للمالك فقط). المالك لا يُعيَّن إلا من SQL Editor
create function set_role(p_phone text, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare t profiles;
begin
  if not is_owner() then raise exception 'للمالك فقط'; end if;
  if p_role not in ('cashier','customer') then raise exception 'صلاحية غير مسموحة'; end if;
  select * into t from profiles where phone = p_phone;
  if not found then raise exception 'مفيش حساب بالرقم ده. لازم يسجّل كعميل الأول'; end if;
  if t.id = auth.uid() or t.role = 'owner' then raise exception 'لا يمكن تغيير صلاحية المالك'; end if;
  update profiles set role = p_role where id = t.id;
end $$;
revoke all on function set_role(text, text) from public;
grant execute on function set_role(text, text) to authenticated;

-- ############ schema_phase5.sql ############
-- White — المرحلة 5: تقوية الأمان وقواعد العمل داخل قاعدة البيانات
-- شغّله بعد schema.sql و schema_phase4.sql
-- ساعات العمل وقواعد الحجز بتتقرأ من جدول app_settings (المالك بيعدّلها من التطبيق)

-- 1) سياسة إدخال الحجز: العميل لا يملأ decided_by ولا يغيّر حالة
drop policy if exists bookings_insert on bookings;
create policy bookings_insert on bookings for insert
  with check (customer_id = auth.uid() and status = 'pending' and decided_by is null and starts_at > now());

-- 2) قواعد الحجز تُفرض هنا حتى لو اتجاوزت الواجهة (القيم من جدول app_settings)
create or replace function validate_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare cfg app_settings; hrs numeric; l_start timestamp; l_end timestamp; biz_day date;
begin
  if is_staff() then return new; end if;
  select * into cfg from app_settings where id = 1;
  if not exists (select 1 from devices where id = new.device_id and active) then raise exception 'الجهاز غير متاح للحجز'; end if;
  if new.starts_at < now() + make_interval(mins => cfg.lead_min) then raise exception 'الموعد قريب جدًا'; end if;
  hrs := extract(epoch from (new.ends_at - new.starts_at)) / 3600;
  if hrs < cfg.min_hours or hrs > cfg.max_hours or mod(round(hrs * 60)::int, cfg.step_min) <> 0 then raise exception 'مدة الحجز غير صحيحة'; end if;
  l_start := new.starts_at at time zone cfg.timezone;  l_end := new.ends_at at time zone cfg.timezone;
  biz_day := (l_start - make_interval(hours => cfg.day_start))::date;
  if l_start < biz_day + make_interval(hours => cfg.open_hour) or l_end > biz_day + make_interval(hours => cfg.close_hour) then
    raise exception 'خارج ساعات العمل';
  end if;
  if (select count(*) from bookings where customer_id = new.customer_id and status = 'pending') >= 3 then
    raise exception 'عندك 3 طلبات معلّقة بالفعل';
  end if;
  return new;
end $$;
drop trigger if exists trg_validate_booking on bookings;
create trigger trg_validate_booking before insert on bookings for each row execute function validate_booking();

-- 3) فهارس للسرعة
create index if not exists bookings_device_status_idx on bookings (device_id, status, starts_at);
create index if not exists bookings_customer_idx on bookings (customer_id, starts_at desc);
create index if not exists invoices_paid_idx on invoices (paid_at desc);
create index if not exists expenses_spent_idx on expenses (spent_at desc);

-- 4) منع المستخدم العادي من قراءة أي شيء بالخطأ: تأكيد أن الجداول الحساسة بلا صلاحيات لـ anon
revoke all on profiles, devices, bookings, sessions, session_items, cafe_orders, cafe_order_items, invoices, expenses from anon;

-- ############ schema_phase6.sql ############
-- White — المرحلة 6: الشيفتات، ربط الفواتير والجلسات بالعملاء، حجز الموظف للعميل، التقارير الشهرية
-- شغّله بعد schema_phase5.sql
-- (المنطقة الزمنية ويوم العمل تُمرَّر من التطبيق، ومصدرها js/config.js: timezone و dayStartHour)

-- 1) ربط الجلسات وطلبات الكافيه بعميل مسجّل (اختياري)
alter table sessions   add column customer_id uuid references profiles(id);
alter table cafe_orders add column customer_id uuid references profiles(id);

-- 2) الشيفتات: كل موظف له شيفت واحد مفتوح كحد أقصى
create table shifts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references profiles(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_cash numeric(10,2) not null default 0 check (opening_cash >= 0),
  counted_cash numeric(10,2),          -- المبلغ اللي اتعدّ فعليًا عند القفل
  expected_cash numeric(10,2),         -- المتوقع = افتتاحي + إيراد - مصروفات الشيفت
  note text not null default ''
);
create unique index one_open_shift_per_staff on shifts (staff_id) where closed_at is null;
create index shifts_opened_idx on shifts (opened_at desc);
alter table shifts enable row level security;
create policy shifts_read on shifts for select using (is_owner() or staff_id = auth.uid());   -- الكتابة عبر الدوال فقط
revoke all on shifts from anon;

alter table invoices add column customer_id uuid references profiles(id);
alter table invoices add column shift_id uuid references shifts(id);
alter table expenses add column shift_id uuid references shifts(id);
create index invoices_shift_idx on invoices (shift_id);
create index invoices_customer_idx on invoices (customer_id, paid_at desc);

-- 3) الموظف يحجز للعميل (حجز مؤكد مباشرة). القيد المانع للتداخل بيحمي برضه
drop policy if exists bookings_staff on bookings;
create policy bookings_staff on bookings for all using (is_staff()) with check (is_staff());

-- 4) دوال الشيفت
create function open_shift(p_opening numeric default 0) returns shifts
language plpgsql security definer set search_path = public as $$
declare s shifts;
begin
  if not is_staff() then raise exception 'not allowed'; end if;
  if exists (select 1 from shifts where staff_id = auth.uid() and closed_at is null) then raise exception 'عندك شيفت مفتوح بالفعل'; end if;
  insert into shifts (staff_id, opening_cash) values (auth.uid(), greatest(coalesce(p_opening, 0), 0)) returning * into s;
  return s;
end $$;

create function shift_totals(p_shift uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s shifts; n int; dev numeric; caf numeric; ex numeric;
begin
  select * into s from shifts where id = p_shift;
  if not found then raise exception 'الشيفت غير موجود'; end if;
  if not (is_owner() or s.staff_id = auth.uid()) then raise exception 'not allowed'; end if;
  select count(*), coalesce(sum(time_amount), 0), coalesce(sum(items_amount), 0) into n, dev, caf from invoices where shift_id = s.id;
  select coalesce(sum(amount), 0) into ex from expenses where shift_id = s.id;
  return jsonb_build_object('invoices', n, 'device', dev, 'cafe', caf, 'expenses', ex, 'expected', s.opening_cash + dev + caf - ex);
end $$;

create function close_shift(p_shift uuid, p_counted numeric, p_note text default '') returns shifts
language plpgsql security definer set search_path = public as $$
declare s shifts; t jsonb;
begin
  select * into s from shifts where id = p_shift and closed_at is null for update;
  if not found then raise exception 'الشيفت مقفول بالفعل'; end if;
  if not (is_owner() or s.staff_id = auth.uid()) then raise exception 'not allowed'; end if;
  if p_counted is null or p_counted < 0 then raise exception 'اكتب المبلغ اللي في الدرج'; end if;
  t := shift_totals(p_shift);
  update shifts set closed_at = now(), counted_cash = p_counted, expected_cash = (t->>'expected')::numeric, note = coalesce(p_note, '')
    where id = s.id returning * into s;
  return s;
end $$;

create function list_shifts(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'not allowed'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'staff_name', p.full_name, 'opened_at', s.opened_at, 'closed_at', s.closed_at,
      'opening_cash', s.opening_cash, 'counted_cash', s.counted_cash, 'expected_cash', s.expected_cash, 'note', s.note,
      'invoices', (select count(*) from invoices i where i.shift_id = s.id),
      'total', (select coalesce(sum(i.total), 0) from invoices i where i.shift_id = s.id),
      'expenses', (select coalesce(sum(e.amount), 0) from expenses e where e.shift_id = s.id)
    ) order by s.opened_at desc)
    from shifts s join profiles p on p.id = s.staff_id
    where s.opened_at >= p_from and s.opened_at < p_to and (is_owner() or s.staff_id = auth.uid())
  ), '[]'::jsonb);
end $$;

-- مصروف يسجّله أي موظف (يتربط بشيفته المفتوح). قراءة المصروفات تبقى للمالك فقط
create function add_expense(p_title text, p_amount numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'not allowed'; end if;
  if btrim(coalesce(p_title, '')) = '' or coalesce(p_amount, 0) <= 0 then raise exception 'اكتب البند ومبلغًا أكبر من صفر'; end if;
  insert into expenses (title, amount, shift_id) values (btrim(p_title), p_amount, (select id from shifts where staff_id = auth.uid() and closed_at is null));
end $$;

-- 5) قفل الجلسة/الكافيه يربط الفاتورة بالعميل وبشيفت الموظف
create or replace function close_session(p_session uuid, p_step int default 15, p_min int default 15)
returns invoices language plpgsql security definer set search_path = public as $$
declare s sessions; d devices; mins numeric; billable numeric; rounded int; t numeric; it numeric; inv invoices;
begin
  if not is_staff() then raise exception 'not allowed'; end if;
  select * into s from sessions where id = p_session and ended_at is null for update;
  if not found then raise exception 'الجلسة مقفولة بالفعل'; end if;
  select * into d from devices where id = s.device_id;
  update sessions set ended_at = now() where id = s.id returning * into s;
  mins := extract(epoch from (s.ended_at - s.started_at)) / 60;
  billable := greatest(mins, p_min);
  rounded := ceil(billable / p_step - 0.000001)::int * p_step;
  t := round(d.price_hour * rounded / 60, 2);
  select coalesce(sum(unit_price * qty), 0) into it from session_items where session_id = s.id;
  insert into invoices (session_id, device_id, customer_id, shift_id, minutes, time_amount, items_amount, total)
    values (s.id, d.id, s.customer_id, (select id from shifts where staff_id = auth.uid() and closed_at is null), rounded, t, it, t + it)
    returning * into inv;
  return inv;
end $$;

create or replace function close_cafe_order(p_order uuid) returns invoices
language plpgsql security definer set search_path = public as $$
declare o cafe_orders; it numeric; inv invoices;
begin
  if not is_staff() then raise exception 'not allowed'; end if;
  select * into o from cafe_orders where id = p_order and closed_at is null for update;
  if not found then raise exception 'الطلب مقفول بالفعل'; end if;
  select coalesce(sum(unit_price * qty), 0) into it from cafe_order_items where order_id = o.id;
  update cafe_orders set closed_at = now() where id = o.id;
  insert into invoices (order_id, customer_id, shift_id, minutes, time_amount, items_amount, total)
    values (o.id, o.customer_id, (select id from shifts where staff_id = auth.uid() and closed_at is null), 0, 0, it, it) returning * into inv;
  return inv;
end $$;

-- 6) التقرير الشهري (للمالك فقط)
create function monthly_report(p_from timestamptz, p_to timestamptz, p_tz text default 'Africa/Cairo', p_day_start int default 6)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'للمالك فقط'; end if;
  return jsonb_build_object(
    'invoices',   (select count(*) from invoices where paid_at >= p_from and paid_at < p_to),
    'device_rev', (select coalesce(sum(time_amount), 0) from invoices where paid_at >= p_from and paid_at < p_to),
    'cafe_rev',   (select coalesce(sum(items_amount), 0) from invoices where paid_at >= p_from and paid_at < p_to),
    'expenses',   (select coalesce(sum(amount), 0) from expenses where spent_at >= p_from and spent_at < p_to),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', x.d, 'revenue', x.rev, 'invoices', x.n) order by x.d), '[]'::jsonb)
              from (select ((paid_at at time zone p_tz) - make_interval(hours => p_day_start))::date as d, sum(total) as rev, count(*) as n
                    from invoices where paid_at >= p_from and paid_at < p_to group by 1) x),
    'per_device', (select coalesce(jsonb_agg(jsonb_build_object('name', y.name, 'revenue', y.rev, 'minutes', y.mins, 'sessions', y.n) order by y.rev desc), '[]'::jsonb)
              from (select dv.name, sum(i.time_amount) as rev, sum(i.minutes) as mins, count(*) as n
                    from invoices i join devices dv on dv.id = i.device_id where i.paid_at >= p_from and i.paid_at < p_to group by dv.name) y),
    'top_items', (select coalesce(jsonb_agg(jsonb_build_object('name', z.name, 'qty', z.q, 'amount', z.amt) order by z.amt desc), '[]'::jsonb)
              from (select u.name, sum(u.qty) as q, sum(u.unit_price * u.qty) as amt
                    from (select si.name, si.qty, si.unit_price from session_items si join invoices i on i.session_id = si.session_id where i.paid_at >= p_from and i.paid_at < p_to
                          union all
                          select ci.name, ci.qty, ci.unit_price from cafe_order_items ci join invoices i on i.order_id = ci.order_id where i.paid_at >= p_from and i.paid_at < p_to) u
                    group by u.name order by amt desc limit 8) z),
    'expenses_by', (select coalesce(jsonb_agg(jsonb_build_object('title', w.title, 'amount', w.amt) order by w.amt desc), '[]'::jsonb)
              from (select title, sum(amount) as amt from expenses where spent_at >= p_from and spent_at < p_to group by title) w)
  );
end $$;

-- 7) الصلاحيات: الدوال للمسجّلين فقط
revoke all on function open_shift(numeric), shift_totals(uuid), close_shift(uuid, numeric, text), list_shifts(timestamptz, timestamptz), add_expense(text, numeric), monthly_report(timestamptz, timestamptz, text, int) from public;
grant execute on function open_shift(numeric), shift_totals(uuid), close_shift(uuid, numeric, text), list_shifts(timestamptz, timestamptz), add_expense(text, numeric), monthly_report(timestamptz, timestamptz, text, int) to authenticated;

-- ############ schema_phase7.sql ############
-- White — المرحلة 7: الدخول بالهاتف أو البريد، فواتير العميل، الإشعارات اللحظية
-- شغّله بعد schema_phase6.sql

-- 1) تسجيل الدخول بالهاتف: يرجّع البريد المرتبط بالرقم (بيتنادى قبل تسجيل الدخول)
create function email_for_phone(p_phone text) returns text
language sql stable security definer set search_path = public, auth as $$
  select u.email::text from profiles p join auth.users u on u.id = p.id where p.phone = p_phone limit 1
$$;
revoke all on function email_for_phone(text) from public;
grant execute on function email_for_phone(text) to anon, authenticated;

-- 2) العميل يشوف فواتيره هو فقط (لصفحة الملف الشخصي)
create policy invoices_customer on invoices for select using (customer_id = auth.uid());

-- 3) الإشعارات اللحظية: المالك يشوف الطلب الجديد فورًا، والعميل يشوف قبول حجزه
do $$ declare t text; begin
  foreach t in array array['bookings','sessions','cafe_orders','cafe_order_items','session_items','invoices','shifts'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; when undefined_object then null; end;
  end loop;
end $$;

-- ############ seed.sql ############
-- White — بيانات ابتدائية. عدّل الأسماء والأسعار قبل التشغيل (وبعدين المالك بيديرها من لوحة الإعدادات)
insert into devices (name, category, price_hour) values
  ('PS5 - غرفة 1', 'PS5', 40),
  ('PS5 - غرفة 2', 'PS5', 40),
  ('PS4 - جهاز 3', 'PS4', 25),
  ('غرفة VIP',     'VIP', 70);

insert into menu_items (name, description, category, price) values
  ('قهوة تركي', 'سادة أو مظبوط', 'مشروبات ساخنة', 35),
  ('شاي', 'كوب شاي', 'مشروبات ساخنة', 20),
  ('آيس لاتيه', 'إسبريسو مع حليب مثلج', 'مشروبات باردة', 55),
  ('عصير برتقال', 'طازج', 'عصائر', 40),
  ('بطاطس مقلية', 'حصة كبيرة', 'سناكس', 45);

-- الفئات (المالك بيديرها من الإعدادات)
insert into categories (kind, name, description) values
  ('device', 'PS5', 'جهاز بلايستيشن 5 للعب بجودة عالية.'),
  ('device', 'PS4', 'جهاز بلايستيشن 4 بسعر اقتصادي.'),
  ('device', 'VIP', 'غرفة خاصة لمجموعتك.'),
  ('menu', 'مشروبات ساخنة', ''),
  ('menu', 'مشروبات باردة', ''),
  ('menu', 'عصائر', ''),
  ('menu', 'سناكس', '');

-- ============================================================
-- ترقية حسابك لمالك (شغّل السطر ده بعد ما تسجّل وتأكّد بريدك، وبدّل البريد بتاعك):
-- update profiles set role = 'owner' where id = (select id from auth.users where email = 'YOUR_EMAIL@example.com');
-- ============================================================
