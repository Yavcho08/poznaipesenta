@AGENTS.md

# Познай песента — правила за работа

Пълният план и статусът на фазите са в `PLAN.md`. Прочети го в началото на всяка сесия.

## Процес
- Комуникацията с потребителя е **на български**.
- Работим **фаза по фаза**. Преди фаза — кратко какво ще се направи. След фаза — спри, кажи какво да се тества и чакай одобрение. Отбелязвай завършените фази в `PLAN.md`.
- При несигурно съвпадение на артист/песен в seed или внос — **питай**, не гадай.

## Код
- TypeScript strict, **без `any`**. Тайни само в `.env`; всяка нова променлива — и в `.env.example`.
- Целият интерфейс е на български.
- Next.js 16 с `cacheComponents: true`: данни от базата/мрежата в страници → в `<Suspense>` или `"use cache"`; `"use cache"` не може директно в тялото на route handler — изнеси в помощна функция. При съмнение чети `node_modules/next/dist/docs/`.
- Prisma 7: клиентът се генерира в `src/generated/prisma` (import от `@/generated/prisma/client`), връзката е през driver adapter (`src/lib/prisma.ts`). Схемата трябва да работи и на SQLite, и на Postgres: без скаларни списъци; списъците са релации или `Json`.
- Deezer ID-тата са `String` (надхвърлят int32).

## Музика и аудио — непроменими правила
- **Spotify никога не е източник на звук** — само на списъци с песни.
- Звукът е от Deezer preview (30 сек.), резервно iTunes (`country=BG`). Не съхраняваме аудио.
- В базата пазим само `deezerId`; preview URL-ът изтича → свеж от `GET /track/{id}` при старт на рунд.
- Всички заявки към Deezer минават през сървъра (няма CORS); кеш + rate limit ~50 заявки / 5 сек. Песни без preview се пропускат.
- Таймингите на клиповете са с **Web Audio API** (`AudioBufferSourceNode.start(0, 0, duration)` + ~30 ms fade-out), не с `<audio>`. Стъпки: 0.2 / 1 / 2 / 5 / 10 сек. Всички започват от **една и съща точка** в откъса — припева, изчислен на сървъра (`src/lib/audio/hook.ts`, пази се в `Track.hookStart`, праща се в хедър `X-Hook-Start`). „Чуй целия откъс“ е от 0. iTunes откъсите (AAC) не се анализират — започват от 0. MP3 декодерът (`mpg123-decoder`) зависва под `tsx` — анализирай през dev сървъра или `node --experimental-strip-types`. Точки: 100 / 80 / 60 / 40 / 20.
- Проверката на отговор е по нормализирани title + основен artist, не по `deezerId`.

## Команди
- `npm run dev` — разработка
- `npm run db:migrate` — нова миграция + `prisma generate` (Prisma 7 не генерира сам). След миграция **рестартирай `npm run dev`** — клиентът е кеширан в `globalThis` и иначе е стар.
- `npm run db:seed` — seed
- `npm run import:artist -- "Име" [--id=DEEZER_ID] [--pop-folk]` — внос на артист от Deezer; при несигурно съвпадение спира и показва кандидатите. Скриптове, които ползват `src/lib` (там е `server-only`), се пускат с `tsx --conditions=react-server`.

## Структура
- `src/lib/deezer.ts` — Deezer клиент (кеш, rate limit); `src/lib/itunes.ts` — резервен звук; `src/lib/cache.ts` — TTL кеш в паметта
- `src/lib/normalize.ts` — транслитерация и ключове за сравнение на песни
- `src/lib/game/rules.ts` (общи за клиент/сървър), `src/lib/game/server.ts` (логика на играта)
- `src/lib/audio/clip-player.ts` — Web Audio плейър (`play(..., at)` за насрочено пускане)
- `src/lib/game/source.ts` — източник на игра (поп-фолк/жанр/артисти/плейлист) и URL параметрите му
- `src/lib/game/daily*.ts` — дневно предизвикателство (дата по Europe/Sofia, детерминиран избор, текст за споделяне)
- `src/lib/search.ts` — търсенето за combobox-а (`/api/search`)
- `src/lib/import/*` — внос на плейлисти; `spotify-embed.ts` е изолиран (неофициален), `similarity.ts` — съпоставяне
- `src/lib/room/*` — мултиплейър; `timeline.ts` е общ за клиент и сървър — **всички тайминги на стаята са там**. Стаята е „като нормална игра“: първият откъс (0.2 сек.) звучи у всички едновременно, после всеки играч сам пропуска/греши (`RoomGuess.kind` = guess|skip, стъпката = брой ходове); 45 сек. на песен (`ROUND_TIME_S`), ранен край, когато всички онлайн играчи са готови.
- `src/lib/admin-auth.ts` — HMAC бисквитка от `ADMIN_PASSWORD`; всяка server action в `src/app/admin/actions.ts` вика `requireAdmin()`
- Стилове: общите класове (`card`, `btn-primary`, `btn-ghost`, `field`, `text-gradient`) са в `globals.css` като `@utility` — в Tailwind 4 `@layer components` + `@apply` между тях не работи.
- `usePathname()`/`useSearchParams()` в клиентски компонент от layout-а → в `<Suspense>` (виж `src/app/nav.tsx`), иначе `next build` гърми за динамичните маршрути.
- Социални: `src/lib/game/social.ts` (име в класацията, предизвикателства с `GameSession.challengeCode` — линкът е `/igra?vs=<код>`, никога id на сесията, иначе отговорите се виждат), `leaderboard.ts` (най-добър резултат на име; чисто), `daily-stats.ts` (серии; в localStorage). Класацията за седмица изключва `daily` и `challenge`. Стаи: 5/10/15 рунда, `RoomReaction`, `Room.nextCode` за реванш. Ефекти: `src/lib/effects.ts` (canvas-confetti, vibrate) + `ClipPlayer.sfx()`.
- Ако dev сървърът влезе в цикъл на презареждане („Compiled in 1ms“ след всяка заявка): спри го, изтрий `.next`, пусни пак.
- `experimental.mcpServer: false` в `next.config.ts` е нарочно — иначе dev сървърът влиза в безкраен цикъл на презареждане (пише в `.next/dev/logs` и го приема за промяна). Не пускай `next build`, докато `npm run dev` работи — разваля `.next`.
- `SongCombobox` на iPhone: Safari маха фокуса от полето преди click върху реда → списъкът се затваря със закъснение (`BLUR_CLOSE_MS`), иначе изборът не става. Тествай промени по него с Playwright **WebKit** + `devices["iPhone 15 Pro Max"]` (Chromium не хваща това). WebKit за Windows няма Web Audio — за полето ползвай `/admin/pleylisti/[id]`.
- Нативните `<select>` имат изрично тъмен фон на опциите в `globals.css` (на Windows списъкът иначе е бял с бял текст).
- Не слагай `position: fixed` вътре в елемент с `backdrop-filter` (хедъра) — тогава е фиксиран спрямо него, не спрямо екрана.
- Чуждестранни артисти: `findArtist(name, { international: true })` / `international: true` в `prisma/seed-data.ts` — без проверката за „български“ профил.
- Вносът на плейлисти е без лимит на песните; Spotify публичният линк (embed) дава само първите 100 — това е ограничение на Spotify.
- Route handler, който чете бисквитки или трябва да е уникален при всяка заявка, започва с `await connection()` — иначе `next build` може да го пререндерира като статичен.

## Продукция (Vercel)
- https://poznai-pesenta.vercel.app — Vercel проект `poznai-pesenta` (yavcho08s-projects), Neon база `poznai-pesenta-db` (Франкфурт), свързана през Vercel Marketplace (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`). `ADMIN_PASSWORD`, `SPOTIFY_CLIENT_ID` и `SPOTIFY_REDIRECT_URI` (`https://poznai-pesenta.vercel.app/api/spotify/callback`) са зададени във Vercel. Spotify приложението е в Development Mode: входът работи само за акаунти, добавени в Spotify Dashboard → User Management (до 5); всички песни — само от собствени/съвместни плейлисти, чуждите минават през embed (до 100).
- Деплой: `npx vercel deploy --prod --yes` (build: `npm run vercel-build` от `vercel.json`).
- Код: https://github.com/Yavcho08/poznaipesenta (публично, клон `main`, remote `origin`). Преди commit провери, че няма тайни — `.env*`, `.vercel`, базата и `.claude/settings.local.json` са в `.gitignore`. Vercel още **не** е свързан с хранилището (деплоят е ръчен).
- Данни: каталогът се прави локално (seed/внос в SQLite) и се прехвърля с `scripts/copy-to-postgres.ts` (виж коментара в него). **Никога** `vercel env pull` в `.env.local` — Postgres адресът там би превключил локалната разработка към продукционната база; тегли в scratchpad.
- На компютъра на потребителя Avast сканира HTTPS и новите връзки се отварят за ~12 сек., а Node `fetch` се отказва след 10 → Vercel CLI дава „fetch failed“. Пусни CLI с `NODE_OPTIONS=--import=<preload>`, който вдига `connect.timeout` на undici (`setGlobalDispatcher(new Agent({ connect: { timeout: 60_000 } }))`).

## База: SQLite локално, Postgres в продукция
- Изборът е по `DATABASE_URL` (`prisma.config.ts`, `src/lib/prisma.ts`).
- `prisma/postgres/schema.prisma` е **генериран** — не го редактирай; `npm run db:migrate` го синхронизира (`db:pg:sync`). `vercel-build` проверява, че е актуален.
- Postgres миграциите са в `prisma/postgres/migrations` (виж README → „Промени в схемата след деплой“).
- API: `/api/game` (POST нова игра), `/api/game/[id]` (GET състояние), `/api/game/[id]/rounds/[index]` (POST ход), `/api/game/[id]/rounds/[index]/audio` (звук на рунда, без да издава песента), `/api/audio/[deezerId]` (пълен preview)
- `npm test` — Vitest
- `npm run typecheck`, `npm run lint`
