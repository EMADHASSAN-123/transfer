# لوحة متابعة التحويلات — Transfer Tracker

واجهة ويب حديثة (HTML + Tailwind CDN + JavaScript وحدات ES) مع **Supabase** (قاعدة بيانات، تخزين، مصادقة): صفحة عامة للعرض، ولوحة إدارة محمية لإدارة السجلات ورفع الصور.

## المتطلبات

- حساب [Supabase](https://supabase.com)
- متصفح حديث يدعم ES Modules
- خادم ثابت محليًا (مثل `npx serve`) لأن الوحدات والاستيراد الديناميكي يتطلبان `http(s)://` وليس `file://`

## إعداد Supabase

### 1) مشروع جديد

أنشئ مشروعًا في Supabase، ثم من **Project Settings → API** انسخ:

- **Project URL**
- **anon public** key

### 2) تشغيل SQL

في **SQL Editor**، نفّذ محتوى الملف:

`supabase/schema.sql`

سيُنشئ:

- جدول `public.transfers` مع الحقول: `id`, `person_name`, `amount`, `image_url`, `status`, `created_at`
- **RLS**: قراءة عامة (`anon` + `authenticated`)، كتابة كاملة للمستخدمين المسجلين فقط
- دلو تخزين **`transfer-images`** عام القراءة مع سياسات رفع/تعديل/حذف للمستخدمين المسجلين

### 3) تفعيل Realtime (اختياري وموصى به)

في **Database → Replication**، فعّل الجدول `transfers` لنشر `supabase_realtime` حتى تعمل الاشتراكات في الواجهة.

### 4) تسجيل الدخول برابط سحري (بدون كلمة مرور)

- في **Authentication → Providers** تأكد أن مزوّد **Email** مفعّل.
- في **Authentication → URL Configuration**:
  - **Site URL**: عنوان أساسي لموقعك (مثل `http://localhost:3000` عند التطوير).
  - **Redirect URLs**: أضف عنوان صفحة الدخول صراحةً، مثل:
    - `http://localhost:3000/login.html`
    - وعند النشر: `https://your-domain.com/login.html`  
    (يجب أن يطابق الرابط الذي يفتحه المستخدم بعد الضغط على الرابط في البريد؛ التطبيق يمرّر `emailRedirectTo` إلى `login.html` تلقائيًا.)

أي بريد تُرسل له رابط من `login.html` يمكنه **إنشاء حساب عند أول استخدام** (`shouldCreateUser: true`) أو **الدخول** إن كان مسجّلًا مسبقًا. لا حاجة لكلمة مرور في الواجهة.

> إن لم يصل البريد: راجع **Authentication → Logs**، وإعدادات SMTP في Supabase، ومجلد الرسائل غير المرغوب فيها.

## إعداد الواجهة الأمامية

1. انسخ الملف:

   `js/config.example.js` → `js/config.js`

2. عدّل القيم:

   ```js
   export const SUPABASE_URL = "https://<ref>.supabase.co";
   export const SUPABASE_ANON_KEY = "<anon-key>";
   ```

3. شغّل موقعًا من جذر المشروع (مجلد يحتوي `index.html`):

   ```bash
   npx --yes serve .
   ```

4. افتح:

   - العرض العام: `/index.html`
   - تسجيل الدخول: `/login.html`
   - لوحة الإدارة: `/dashboard.html` (تتطلب جلسة)

## هيكل المشروع

```
index.html          # صفحة عامة + بحث + بطاقات + معاينة صورة
login.html          # بريد + رابط سحري (تسجيل/دخول بدون كلمة مرور)
dashboard.html      # CRUD + رفع صور
assets/             # أصول ثابتة (اختياري)
js/
  supabase.js       # عميل Supabase + تحميل config
  config.example.js # قالب المفاتيح
  auth.js           # جلسة وحماية المسار
  public.js         # الصفحة العامة + اشتراك لحظي
  dashboard.js      # لوحة الإدارة + اشتراك لحظي
  upload.js         # رفع/حذف من Storage
  ui.js             # Toast، تأكيد الحذف، هيكل تحميل، نافذة صورة
styles/
  custom.css        # خط عربي، زجاجية، تدرجات، تقليل الحركة
supabase/
  schema.sql        # الجدول + RLS + التخزين
```

ملف `js/config.js` مُدرج في `.gitignore` حتى لا تُرفع المفاتيح بالخطأ.

## الأمان

- المفتاح **anon** موجود في الواجهة؛ الحماية تعتمد على **RLS** وسياسات **Storage**.
- لا تستخدم مفتاح `service_role` في المتصفح.

## الأداء والوصولية

- Tailwind عبر CDN، CSS إضافي خفيف، خط واحد من Google Fonts مع `display=swap`.
- صور العرض العام بـ `loading="lazy"` و`decoding="async"`.
- تخطي للمحتوى، أدوار ARIA للـ Toast والحوار، دعم `prefers-reduced-motion` في `styles/custom.css`.
- واجهة **RTL** و`lang="ar"` مع تنسيق أرقام/عملة عبر `Intl` (`ar-SA`).

## الترخيص

استخدم المشروع كقاعدة لمشروعك الخاص واضبط السياسات والعلامة التجارية حسب احتياجك.
