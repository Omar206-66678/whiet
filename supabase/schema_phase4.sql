-- White — المرحلة 4: طلبات الكافيه، الفواتير، المصروفات. شغّله بعد schema.sql
create table session_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  name text not null,
  unit_price numeric(8,2) not null check (unit_price >= 0),
  qty int not null default 1 check (qty > 0),
  added_at timestamptz not null default now()
);
create table invoices (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references sessions(id),
  device_id uuid not null references devices(id),
  minutes int not null,
  time_amount numeric(10,2) not null,
  items_amount numeric(10,2) not null,
  total numeric(10,2) not null,
  closed_by uuid default auth.uid() references profiles(id),
  paid_at timestamptz not null default now()
);
create table expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  amount numeric(10,2) not null check (amount > 0),
  spent_at timestamptz not null default now(),
  created_by uuid default auth.uid() references profiles(id)
);

alter table session_items enable row level security;
alter table invoices      enable row level security;
alter table expenses      enable row level security;
create policy items_staff    on session_items for all using (is_staff()) with check (is_staff());
-- الفواتير والمصروفات (الأرباح) للمالك فقط. الكاشير يصدر الفاتورة عبر close_session ولا يقرأ الحسابات
create policy invoices_owner on invoices      for select using (is_owner());
create policy expenses_owner on expenses      for all using (is_owner()) with check (is_owner());

-- قفل الجلسة وإصدار الفاتورة داخل قاعدة البيانات (الحساب لا يعتمد على المتصفح)
create function close_session(p_session uuid, p_step int default 15, p_min int default 15)
returns invoices language plpgsql security definer set search_path = public as $$
declare s sessions; d devices; mins numeric; billable numeric; rounded int; t numeric; it numeric; inv invoices;
begin
  if not is_staff() then raise exception 'not allowed'; end if;
  select * into s from sessions where id = p_session and ended_at is null for update;
  if not found then raise exception 'session not found'; end if;
  select * into d from devices where id = s.device_id;
  update sessions set ended_at = now() where id = s.id returning * into s;
  mins := extract(epoch from (s.ended_at - s.started_at)) / 60;
  billable := greatest(mins, coalesce(extract(epoch from (s.planned_end - s.started_at)) / 60, 0), p_min);
  rounded := ceil(billable / p_step - 0.000001)::int * p_step;
  t := round(d.price_hour * rounded / 60, 2);
  select coalesce(sum(unit_price * qty), 0) into it from session_items where session_id = s.id;
  insert into invoices (session_id, device_id, minutes, time_amount, items_amount, total)
    values (s.id, d.id, rounded, t, it, t + it) returning * into inv;
  return inv;
end $$;
revoke all on function close_session(uuid, int, int) from public;
grant execute on function close_session(uuid, int, int) to authenticated;

-- المنيو: يقرأه الجميع (الأصناف الظاهرة)، ويعدّله المالك فقط
create table menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null, description text not null default '', category text not null,
  price numeric(8,2) not null check (price >= 0), active boolean not null default true
);
alter table menu_items enable row level security;
create policy menu_read  on menu_items for select using (active or is_staff());
create policy menu_owner on menu_items for all using (is_owner()) with check (is_owner());

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
