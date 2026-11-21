// White — إعدادات عامة. لا تضع هنا أي مفاتيح سرية.
window.WHITE_CONFIG = {
  brand: 'White',
  currency: 'ج.م',
  locale: 'ar-EG',
  // المرحلة 5: ربط Supabase أو Firebase (المفتاح العام anon فقط، والأمان من قواعد الوصول RLS)
  backend: { provider: null, url: '', anonKey: '' },
  // حالات الأجهزة الموحدة. مصدر واحد للألوان والنصوص في كل الشاشات
  statuses: {
    available: 'متاح',
    booked:    'محجوز بوقت محدد',
    open:      'محجوز مفتوح',
    pending:   'بانتظار الموافقة',
    done:      'مكتمل',
    rejected:  'مرفوض'
  }
};
