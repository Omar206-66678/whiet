# إعداد رمز التحقق واسترداد كلمة السر (بالبريد الإلكتروني)

التطبيق بيبعت رمز من 6 أرقام للبريد عند إنشاء الحساب وعند نسيان كلمة السر. محتاج 3 خطوات في Supabase:

## 1) تفعيل تأكيد البريد
*Authentication → Providers → Email*: فعّل **Confirm email**.

## 2) خدمة إرسال بريد (SMTP) — مهم
خدمة Supabase الافتراضية محدودة جدًا (عدد قليل في الساعة وبتبعت لأعضاء الفريق بس). استخدمي خدمة مجانية:
- **Resend** (مجانية لحد 100 رسالة يوميًا) أو **Brevo** (300 يوميًا) أو SendGrid.
- *Project Settings → Authentication → SMTP Settings*: فعّل **Enable Custom SMTP** وأدخلي بيانات الخدمة (Host/Port/User/Password) وبريد المرسل.

## 3) قوالب الرسائل (لازم تعرض الرمز {{ .Token }})
*Authentication → Email Templates*:

**Confirm signup** — العنوان: `رمز تأكيد حسابك في White`
```html
<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:16px">
  <h2>أهلًا بيك في White</h2>
  <p>رمز تأكيد حسابك:</p>
  <p style="font-size:32px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
  <p>الرمز صالح لمدة ساعة. لو مش إنتِ اللي سجّلتي تجاهلي الرسالة.</p>
</div>
```

**Reset Password** — العنوان: `رمز استرداد كلمة السر`
```html
<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;font-size:16px">
  <h2>استرداد كلمة السر</h2>
  <p>اكتب الرمز ده في التطبيق:</p>
  <p style="font-size:32px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
  <p>الرمز صالح لمدة ساعة. لو مش إنتِ اللي طلبتي تجاهلي الرسالة.</p>
</div>
```

## ملاحظات
- الدخول بعد كده بـ **رقم الهاتف أو البريد** + كلمة السر.
- لو العميل نسي كلمة السر: "نسيت كلمة السر" → يكتب بريده → الرمز → كلمة سر جديدة.
- لو عايزة رمز على الهاتف (SMS) بدل البريد: محتاج مزوّد رسائل مدفوع (Twilio وغيره) وتفعيل Phone Auth. قوليلي لو حابة.
