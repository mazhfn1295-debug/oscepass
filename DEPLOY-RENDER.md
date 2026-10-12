# النشر على Render (مجاني) + Neon + Cloudflare R2

## 1) القاعدة (Neon)
أنشئ الجداول مرة واحدة من أي جهاز عليه المشروع:
```
DATABASE_URL="postgresql://..." pnpm --filter @workspace/db run push
DATABASE_URL="postgresql://..." pnpm --filter @workspace/scripts run seed
```

## 2) التخزين (Cloudflare R2 أو أي S3)
1. أنشئ bucket (خاص، بدون وصول عام).
2. أنشئ API Token بصلاحية Object Read & Write لهذا الـbucket، فتحصل على Access Key ID وSecret.
3. اضبط CORS للـbucket للسماح برفع الملفات من موقعك:
```json
[{"AllowedOrigins":["https://YOUR-APP.onrender.com"],"AllowedMethods":["PUT"],"AllowedHeaders":["Content-Type"],"MaxAgeSeconds":3600}]
```
4. الـendpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`

## 3) Render
New → Blueprint → اختر المستودع (فيه `render.yaml`). ثم أدخل المتغيرات:
`DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` (12+ حرفًا), `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
`SESSION_SECRET` يُولَّد تلقائيًا.

الموقع والـAPI على نفس العنوان، فلا حاجة لـ`CORS_ORIGINS`.
الخطة المجانية تنام عند الخمول وأول طلب بعدها يتأخر قليلًا.

## ملاحظة
لا يوجد `pnpm-lock.yaml` في هذه النسخة. شغّل `pnpm install` مرة واحدة على جهازك أو في Replit وأضف الملف الناتج إلى المستودع، ثم غيّر `--no-frozen-lockfile` إلى `--frozen-lockfile` في `render.yaml`.
