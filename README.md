# Познай песента

Уеб игра за познаване на песни с фокус върху българската поп-фолк музика.
Звукът е 30-секундни откъси от Deezer (резервно iTunes). Spotify се ползва само за списъци с песни.

## Локално

```bash
npm install
cp .env.example .env        # и смени ADMIN_PASSWORD
npm run db:migrate          # създава prisma/dev.db (SQLite)
npm run db:seed             # жанрове + поп-фолк артисти от Deezer + плейлисти по десетилетия
npm run dev                 # http://localhost:3000
```

| Страница | Какво |
|---|---|
| `/` | избор на източник: поп-фолк (по десетилетия), жанрове, артисти, плейлисти |
| `/igra` | игра от 10 рунда |
| `/dnevno` | дневно предизвикателство + „Сподели резултата“ |
| `/staya` | мултиплейър стаи с 6-символен код |
| `/vnos` | внос на плейлист от Deezer / Spotify |
| `/admin` | артисти, жанрове, curated плейлисти (парола: `ADMIN_PASSWORD`) |

Проверки: `npm test`, `npm run typecheck`, `npm run lint`.

Внос на артист от командния ред: `npm run import:artist -- "Преслава" --pop-folk`.
При несигурно съвпадение скриптът показва кандидатите; пусни пак с `--id=DEEZER_ID`.

## Деплой: Vercel + Neon Postgres

Локално е SQLite, в продукция е Postgres. Изборът е автоматичен по `DATABASE_URL`
(`prisma.config.ts` и `src/lib/prisma.ts`). Postgres схемата `prisma/postgres/schema.prisma`
се генерира от основната с `npm run db:pg:sync`. Не я редактирай на ръка.

1. **Neon** (neon.tech, безплатен план): създай проект и база в регион EU (Frankfurt).
   Копирай два connection string-а: **pooled** (с `-pooler` в хоста) и **direct** (без него).
2. **GitHub**: качи проекта в хранилище (`.env` и `prisma/dev.db` са в `.gitignore`).
3. **Vercel** (vercel.com, безплатен план): Import на хранилището. В *Environment Variables*:
   - `DATABASE_URL` = pooled URL от Neon
   - `DIRECT_URL` = direct URL от Neon (за миграциите)
   - `ADMIN_PASSWORD` = силна парола
   - по желание `SPOTIFY_CLIENT_ID` и `SPOTIFY_REDIRECT_URI` = `https://<домейн>.vercel.app/api/spotify/callback`
     (добави същия адрес и в Spotify Dashboard → Redirect URIs)

   Vercel пуска `npm run vercel-build`: проверка на Postgres схемата → `prisma generate` →
   `prisma migrate deploy` → `next build`.
4. **Данни в продукционната база**: пусни seed-а веднъж от своя компютър срещу Neon:
   ```bash
   DATABASE_URL="<direct URL>" npx prisma generate
   DATABASE_URL="<direct URL>" npm run db:seed
   npx prisma generate          # обратно към SQLite клиента за локална работа
   ```
   (в PowerShell: `$env:DATABASE_URL="..."; npm run db:seed; Remove-Item Env:DATABASE_URL`)

### Промени в схемата след деплой

1. Промени `prisma/schema.prisma` → `npm run db:migrate` (SQLite миграция + синхронизира Postgres схемата).
2. Postgres миграция: срещу **отделен dev branch** в Neon (не продукционния):
   `DATABASE_URL="<dev branch URL>" npx prisma migrate dev --name <име>`.
   Създава папка в `prisma/postgres/migrations/`.
3. Commit + push. Vercel прилага миграцията при деплой.

### Ограничения на безплатния хостинг

- Кешът на Deezer метаданните и ограничението на заявките (~50 за 5 сек.) са в паметта на всеки
  сървърен процес. На Vercel всяка инстанция има свои, така че при голям трафик Deezer може да
  върне „quota exceeded“ (клиентът изчаква и опитва пак).
- Мултиплейърът пита сървъра всяка секунда. За десетки едновременни стаи е добре да се мине
  към Supabase Realtime. Логиката на времевата линия (`src/lib/room/timeline.ts`) остава същата.
