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
