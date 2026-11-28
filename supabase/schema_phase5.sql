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
