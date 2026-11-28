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
