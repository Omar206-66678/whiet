# White — دليل التشغيل والرفع

## 1) إنشاء قاعدة البيانات (Supabase)
1. أنشئ مشروعًا مجانيًا على supabase.com.
2. من **SQL Editor** شغّل الملفات بالترتيب (الصق محتوى كل ملف واضغط Run):
   1. `supabase/schema.sql`
   2. `supabase/schema_phase4.sql`
   3. `supabase/schema_phase5.sql`
   4. `supabase/seed.sql` (بعد تعديل أسماء وأسعار الأجهزة)
3. من **Authentication → URL Configuration** اكتب في Site URL رابط موقعك على GitHub Pages (مثال: `https://USERNAME.github.io/REPO/`).
4. من **Authentication → Providers → Email** قرّر هل تفعّل تأكيد البريد (مفضّل) أو تلغيه للتجربة.

## 2) ربط التطبيق
من **Project Settings → API** انسخ:
- **Project URL**
- **anon public key** (المفتاح العام فقط)

وفي `js/config.js` عدّل:
```js
backend: { provider: 'supabase', url: 'https://xxxx.supabase.co', anonKey: 'ضع هنا anon key' },
```
**ممنوع** تضع مفتاح `service_role` في أي ملف. مفتاح anon عام بطبيعته، والأمان الحقيقي من قواعد RLS اللي في ملفات SQL.

## 3) إنشاء حساب الكاشير/الإدارة
1. سجّل حسابًا عاديًا من شاشة "حسابي" في التطبيق (أو من Authentication → Users).
2. من SQL Editor رقّيه:
```sql
update profiles set role = 'admin' where id = (select id from auth.users where email = 'بريدك@example.com');
```
(`role` يقبل `admin` أو `cashier`.) بعدها تدخل من `/admin/`.

## 4) الرفع على GitHub Pages
1. ارفع محتوى مجلد `white` كما هو في مستودع GitHub (الملفات في الجذر: `index.html` و`admin/` و`css/` و`js/`...).
2. **Settings → Pages → Deploy from a branch → main / (root)**.
3. بعد دقيقة: العميل على `https://USERNAME.github.io/REPO/` والإدارة على `.../admin/`.
4. تثبيت كتطبيق: من متصفح الموبايل اختر "إضافة إلى الشاشة الرئيسية".

## 5) اختبار الأمان قبل الإطلاق
- افتح التطبيق بدون تسجيل دخول: لازم تشوف حالة الأجهزة فقط.
- سجّل بحساب عميل عادي وافتح `/admin/`: لازم يرفض الدخول.
- من حساب عميل، لازم ترى حجوزاتك أنت فقط.
- جرّب حجزًا خارج ساعات العمل أو بمدة 10 ساعات: لازم يتم رفضه.
- من حساب كاشير: وافق على حجزين متداخلين لنفس الجهاز: الثاني لازم يفشل.

## 6) إعدادات تعدّلها حسب مكانك (`js/config.js`)
`hours` (ساعات العمل)، `booking` (مدد الحجز)، `billing` (تقريب الوقت)، `menu`، `categories`، `dayStartHour`.
ساعات العمل والمنطقة الزمنية موجودة كمان داخل `schema_phase5.sql` (دالة `validate_booking`) وكل التعديلات لازم تتطابق في الاثنين.
