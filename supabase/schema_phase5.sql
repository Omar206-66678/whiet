-- White — المرحلة 5: تقوية الأمان وقواعد العمل داخل قاعدة البيانات
-- شغّله بعد schema.sql و schema_phase4.sql
-- مهم: ساعات العمل والمنطقة الزمنية هنا لازم تطابق js/config.js (hours, booking, dayStartHour)

-- 1) سياسة إدخال الحجز: العميل لا يملأ decided_by ولا يغيّر حالة
drop policy if exists bookings_insert on bookings;
create policy bookings_insert on bookings for insert
  with check (customer_id = auth.uid() and status = 'pending' and decided_by is null and starts_at > now());

-- 2) قواعد الحجز تُفرض هنا حتى لو اتجاوزت الواجهة
create or replace function validate_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  tz constant text := 'Africa/Cairo';          -- غيّرها لو منطقتك الزمنية مختلفة
  open_h constant int := 12;                   -- يفتح 12 ظهرًا
  close_h constant int := 26;                  -- يقفل 2 فجرًا (26 = 2 صباح اليوم التالي)
  day_start_h constant int := 6;               -- بداية يوم العمل
  hrs numeric; l_start timestamp; l_end timestamp; biz_day date;
begin
  if is_staff() then return new; end if;
  if not exists (select 1 from devices where id = new.device_id and active) then raise exception 'الجهاز غير متاح للحجز'; end if;
  if new.starts_at < now() + interval '15 minutes' then raise exception 'الموعد قريب جدًا'; end if;
  hrs := extract(epoch from (new.ends_at - new.starts_at)) / 3600;
  if hrs < 1 or hrs > 6 or mod(round(hrs * 60)::int, 30) <> 0 then raise exception 'مدة الحجز غير صحيحة'; end if;
  l_start := new.starts_at at time zone tz;  l_end := new.ends_at at time zone tz;
  biz_day := (l_start - make_interval(hours => day_start_h))::date;
  if l_start < biz_day + make_interval(hours => open_h) or l_end > biz_day + make_interval(hours => close_h) then
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
