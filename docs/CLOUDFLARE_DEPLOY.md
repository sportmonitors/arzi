# Cloudflare Workers + D1 (Time Tracker)

## پیش‌نیاز
- Node.js **۲۰+** برای توسعه و ایمپورت D1 (اسکریپت‌های `db:*` از wrangler 3.112 استفاده می‌کنند)
- Node.js **۲۲+** برای `npm run deploy` / `preview` با wrangler 4 و OpenNext
- حساب Cloudflare و لاگین: `npx wrangler login`

## ۱) ساخت دیتابیس D1

```bash
npx wrangler d1 create arzi-time-db
```

خروجی یک `database_id` می‌دهد. آن را در [`wrangler.toml`](../wrangler.toml) جایگزین `local-arzi-time-db` کنید:

```toml
[[d1_databases]]
binding = "DB"
database_name = "arzi-time-db"
database_id = "<DATABASE_ID>"
migrations_dir = "migrations"
```

## ۲) مایگریشن اسکیما

```bash
# لوکال (برای next dev / preview)
npm run db:migrate:local

# پروداکشن
npm run db:migrate:remote
```

## ۳) ایمپورت کارکردهای Clockify (`old_works_logs`)

```bash
npm run db:import:local
npm run db:import:remote
```

حدود ۶۰۸ رکورد با حفظ `_id`، پروژه‌ها و تگ‌ها وارد می‌شود.

## ۴) متغیرهای محیطی Worker

در Cloudflare Dashboard → Worker `arzi` → Settings → Variables، یا با wrangler:

| Variable | مقدار |
|---|---|
| `NEXT_PUBLIC_ADMIN_UID` | UID ادمین Firebase |
| `NEXT_PUBLIC_USE_MOCK_AUTH` | در پروداکشن `false` یا حذف |
| سایر `NEXT_PUBLIC_*` در صورت نیاز | مطابق `.env.local` |

Secrets را با `npx wrangler secret put ...` بگذارید اگر لازم شد.

## ۵) دیپلوی از GitHub Actions (پیشنهادی)

اگر آپلود Worker از ایران روی `POST .../versions` گیر می‌کند یا با پروکسی `fetch failed` می‌دهد، از CI دیپلوی کنید.

### Secrets / Variables در ریپو

GitHub → Settings → Secrets and variables → Actions:

| نوع | نام | مقدار |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | توکن با تمپلیت **Edit Cloudflare Workers** (+ دسترسی D1 اگر لازم) |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Account ID (مثلاً از `npx wrangler whoami`) |
| Variable (اختیاری) | `NEXT_PUBLIC_ADMIN_UID` | UID ادمین Firebase |
| Secret (اختیاری) | `FIREBASE_API_KEY` | اگر می‌خواهید به‌جای fallback بیلد شود |

ساخت توکن: [Cloudflare API tokens](https://dash.cloudflare.com/profile/api-tokens) → Create Token → **Edit Cloudflare Workers**.

### اجرا

- هر push به `main` → workflow [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)
- یا دستی: Actions → **Deploy to Cloudflare Workers** → Run workflow

بیلد با `opennextjs-cloudflare build` و دیپلوی با `wrangler deploy` (+ `OPEN_NEXT_DEPLOY=true`) انجام می‌شود تا مرحله populate کش R2 در CI گیر نکند.

## ۶) دیپلوی لوکال

پروکسی‌های `socks5h://` فقط در `.env.development.local` بمانند (نه `.env.local`).
همچنین `.dev.vars` باید `NEXTJS_ENV=production` باشد؛ اگر `development` باشد، موقع `deploy` همان فایل پروکسی لود می‌شود و wrangler با `Invalid URL protocol` می‌افتد.

```bash
npm run deploy
```

یا فقط آپلود نسخه بدون activate فوری:

```bash
npm run upload
```

پیش‌نمایش لوکال در runtime ورکر:

```bash
npm run preview
```

## ۷) توسعه لوکال با Next

```bash
npm run db:migrate:local   # الزامی — بدون این، API با «no such table» می‌افتد
npm run db:import:local    # یک‌بار برای پر کردن کارکرد Clockify
npm run dev                # پورت 9002
```

`initOpenNextCloudflareForDev` در `next.config.ts` بایندینگ D1 را برای Route Handlerها فعال می‌کند.

اگر در UI خطای «امکان دریافت اطلاعات از دیتابیس Cloudflare» دیدید، معمولاً یکی از این‌هاست:
1. مایگریشن لوکال اجرا نشده (`db:migrate:local`)
2. `next start` بدون Worker — باید `npm run dev` یا دیپلوی Workers باشد
3. روی Worker دیپلوی‌شده: مایگریشن ریموت (`db:migrate:remote`) یا بایندینگ `DB` در `wrangler.toml`

برای خواندن مستقیم D1 پروداکشن از `next dev`، در `wrangler.toml` روی بایندینگ D1 خط `remote = true` را فعال کنید (نیاز به دسترسی پایدار به API کلادفلر).

## مسیرهای مهم
- `/timer` — استارت/استاپ و CRUD کارکرد
- `/` — ماشین‌حساب (کارکرد از D1، پرداخت از Firestore)
- API: `/api/time-entries`, `/api/time-entries/start|stop|active`, `/api/projects`

## نکات
- پرداخت‌ها هنوز روی Firebase/Firestore هستند.
- Route قدیمی `/api/clockify-report` دست‌نخورده مانده ولی از UI استفاده نمی‌شود.
- Genkit خلاصه AI ممکن است روی Workers محدودیت داشته باشد؛ در صورت خطا فقط آن بخش fail می‌شود.
