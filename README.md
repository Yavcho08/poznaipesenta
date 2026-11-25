# Познай песента

Уеб игра за познаване на песни с фокус върху българската поп-фолк музика.
Звукът е от 30-секундните откъси на Deezer (резервно iTunes) — аудио не се съхранява.
Spotify служи само за списъци с песни (внос на плейлисти и по желание вход).

**Какво има:** „Познай песента“ (клипове 0.2 → 10 сек.), 8 игри без/със слушане (корица, коя е по-нова,
по-популярна, година, хронология, от кой албум, кой пее, липсваща дума в заглавие), дневно предизвикателство
за всяка игра, стаи с приятели (Supabase Realtime), профили (Google / имейл), гост режим с прехвърляне на
прогреса, XP и нива, серии, 30 постижения, класации, статистики, нощна синхронизация на каталога с Deezer.

**Стек:** Next.js 16 · TypeScript · Tailwind 4 · Supabase (Postgres, Auth, Realtime, RLS) · Prisma 7 (типизиран
клиент) · Vercel (хостинг и Cron) · Vitest.

---

## Как е устроено (накратко)

- **База:** Supabase Postgres. Схемата е в SQL миграции — `supabase/migrations/` (там са и RLS политиките).
  `prisma/schema.prisma` служи само за генериране на типизирания клиент; `npm run db:check` проверява, че съвпада с базата.
- **Логиката и точките са само на сървъра.** Браузърът праща ходове, сървърът решава вярно ли е и колко точки.
  Отговорът на текущия рунд никога не стига до браузъра.
- **RLS на всички таблици:** каталогът и профилите — само четене; игри/постижения — само свои; гости,
  дневни, стаи и синхронизация — затворени. Записи през публичния API — никакви. Проверка: `npm run db:check-rls`.
- **Звук:** пазим само `deezer_id`; свеж preview URL се взима при всяко пускане през нашия сървър (`/api/audio/...`).
  Песен без откъс → `is_active = false` и не участва в игрите.
- **Гост:** httpOnly бисквитка с id. При вход/регистрация игрите и постиженията му минават в профила.
  Гостите не участват в класациите (участват в стаи и предизвикателства).

---

## Първоначална настройка (стъпка по стъпка)

### 1. Supabase проект

1. Влез в [supabase.com](https://supabase.com) → **New project**.
   Име: `poznai-pesenta-prod`, регион **Central EU (Frankfurt)**, генерирай силна парола за базата и я запази.
   (Безплатният план позволява 2 активни проекта — за разработка ползвай втори, напр. `poznai-pesenta-dev`.)
2. **Project Settings → Database → Connection string**:
   - *Transaction pooler* (порт **6543**) → това е `DATABASE_URL`
   - *Session pooler* (порт **5432**) → това е `DIRECT_URL`
   (сложи паролата на мястото на `[YOUR-PASSWORD]`).
3. **Project Settings → API Keys**: копирай *Publishable key* (`sb_publishable_…`) и *Secret key* (`sb_secret_…`).
   Project URL е `https://<ref>.supabase.co`.
4. На компютъра си: копирай `.env.example` като `.env.local` и попълни стойностите (виж коментарите в него).
5. Създай таблиците:
   ```bash
   npm install
   npm run db:push      # прилага supabase/migrations върху DIRECT_URL
   npm run db:check     # трябва да каже „No difference detected“
   ```
6. **Authentication → URL Configuration**:
   - *Site URL*: `https://poznai-pesenta.vercel.app`
   - *Redirect URLs*: `https://poznai-pesenta.vercel.app/**` и за разработка `http://localhost:3000/**`
7. **Authentication → Providers → Email**: включено. Ако нямаш собствен SMTP, изключи *Confirm email*
   (вграденият имейл на Supabase праща писма само до членовете на екипа ти, с лимит 2 на час).

### 2. Вход с Google

1. [console.cloud.google.com](https://console.cloud.google.com) → създай проект (напр. „Poznai pesenta“).
2. **APIs & Services → OAuth consent screen**: тип *External*, име на приложението, твоят имейл,
   scopes: `email`, `profile`, `openid`. Публикувай го (*Publish app*), за да могат всички да влизат.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, тип *Web application*:
   - *Authorized JavaScript origins*: `https://poznai-pesenta.vercel.app`
   - *Authorized redirect URIs*: `https://<ref>.supabase.co/auth/v1/callback` (от Supabase → Authentication → Providers → Google)
4. Копирай *Client ID* и *Client secret* в **Supabase → Authentication → Providers → Google** → Enable → Save.
5. Бутонът „Вход с Google“ се появява сам (сайтът проверява кои входове са включени).

### 3. Вход със Spotify (по желание, скрит по подразбиране)

Spotify е в *Development Mode*: работи само за до 5 ръчно добавени акаунта. Нищо в играта не зависи от него.

1. [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) → твоето приложение (или *Create app*).
2. *Redirect URIs*: добави `https://<ref>.supabase.co/auth/v1/callback` (за входа през Supabase) и
   `https://poznai-pesenta.vercel.app/api/spotify/callback` (за вноса на плейлисти без вход).
3. **User Management** → добави имейла и името на всеки, който ще ползва Spotify.
4. Копирай *Client ID* и *Client secret* в **Supabase → Authentication → Providers → Spotify** → Enable.
5. Във Vercel задай `NEXT_PUBLIC_ENABLE_SPOTIFY_LOGIN=true` и деплойни. След вход със Spotify в `/vnos` се
   виждат и собствените ти плейлисти.

### 4. Данни (каталог и стари игри)

- Пренос от старата база (SQLite файл или Neon Postgres със старата схема):
  ```bash
  npm run db:migrate-data -- --from=prisma/dev.db
  npm run db:migrate-data -- --from="postgresql://...neon.tech/neondb?sslmode=require"   # игрите/класацията от продукцията
  ```
  Може да се пуска многократно — пропуска вече пренесеното.
- Допълване от Deezer (албуми, години, дуети, песни без звук): `npm run catalog:backfill` (~20 мин.; продължава, ако се прекъсне).
- Нов артист: `/admin` → търсене в Deezer, или `npm run import:artist -- "Име" [--id=DEEZER_ID] [--pop-folk]`.

### 5. Vercel

1. Проектът `poznai-pesenta` → **Settings → Environment Variables** (Production):

   | Име | Стойност |
   |---|---|
   | `DATABASE_URL` | Transaction pooler (6543) |
   | `DIRECT_URL` | Session pooler (5432) |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |
   | `SUPABASE_SECRET_KEY` | `sb_secret_…` (тайна!) |
   | `ADMIN_EMAILS` | твоят имейл (получава достъп до `/admin`) |
   | `CRON_SECRET` | дълъг случаен низ (`openssl rand -hex 24`) |
   | `SPOTIFY_CLIENT_ID`, `SPOTIFY_REDIRECT_URI` | по желание (внос на плейлисти) |
   | `NEXT_PUBLIC_ENABLE_SPOTIFY_LOGIN` | `false` (или `true`, виж т. 3) |

   Старите `ADMIN_PASSWORD` и Neon (`DATABASE_URL_UNPOOLED` и интеграцията) вече не са нужни.
2. Деплой: `npx vercel deploy --prod --yes` (или чрез свързано GitHub хранилище).
3. **Cron:** `vercel.json` пуска `/api/cron/sync-catalog` три пъти през нощта (03:00, 03:20, 03:40 UTC).
   Vercel праща сам `Authorization: Bearer <CRON_SECRET>`. Всяко пускане работи до ~25 сек. и продължава
   оттам, докъдето е стигнало предишното. Виж **Vercel → Settings → Cron Jobs** и `/admin/sinhronizaciya`.

### 6. Първи вход като админ

Влез в сайта с имейла от `ADMIN_EMAILS` — профилът получава роля `admin` и `/admin` се отключва.

---

## Разработка

```bash
npm run dev            # http://localhost:3000 (Spotify изисква http://127.0.0.1:3000)
npm test               # Vitest
npm run typecheck
npm run lint
npm run db:check-rls   # RLS проверка през публичния API (създава и трие временен потребител)
```

### Промяна в схемата

1. Нов файл `supabase/migrations/<YYYYMMDDHHMMSS>_<име>.sql` (с RLS за новите таблици!).
2. `npm run db:push` (dev), обнови `prisma/schema.prisma`, `npm run db:check`, `npx prisma generate`, рестартирай `npm run dev`.
3. Продукция: `npm run db:push -- --env=<файл с DIRECT_URL на продукцията>`, после деплой.

### Страници

| Път | Какво |
|---|---|
| `/` | заглавна страница |
| `/igrai` | избор на поп-фолк/жанр/артисти/плейлист за „Познай песента“ |
| `/igra?type=…&id=…`, `/igra?vs=<код>` | игра / предизвикателство от приятел |
| `/igri`, `/igri/<игра>[?daily=1][&type=artists&id=…]` | новите игри |
| `/dnevno` | дневно предизвикателство |
| `/staya`, `/staya/<КОД>` | стаи с приятели |
| `/klasaciya` | седмица, месец, общо (XP), дневно, по артист, архив |
| `/statistiki`, `/igrach/<име>` | моите статистики / публичен профил |
| `/vhod`, `/profil` | вход, профил (име, аватар, постижения, изтриване на акаунта) |
| `/vnos` | внос на плейлист (Deezer / Spotify) |
| `/admin`, `/admin/sinhronizaciya` | каталог, синхронизация, филтри, скриване на песни |

### Ограничения на безплатния хостинг

- Безплатният Supabase проект „заспива“ след 7 дни без заявки (нощната синхронизация го държи буден).
- Кешът на Deezer и rate limit-ът (~50 заявки / 5 сек.) са в паметта на всяка сървърна инстанция.
- Rate limit-ът на нашите API-та също е в паметта (на инстанция) — достатъчен срещу скриптове, не е разпределен.
