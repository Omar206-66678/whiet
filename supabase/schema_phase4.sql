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
