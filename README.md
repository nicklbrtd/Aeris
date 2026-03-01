# Aeris (Аэрис) MVP

Премиальный приватный мессенджер + небольшие комьюнити в стиле iMessage (PWA, realtime, инвайты, анонимные профили).

## Стек
- Monorepo + `pnpm workspaces`
- `apps/web`: Next.js 14 (App Router), TypeScript, Tailwind, Framer Motion, socket.io-client
- `apps/api`: Fastify + TypeScript + Socket.IO + Prisma + SQLite

## Варианты входа
- Регистрация: ник + email + пароль
- Регистрация: ник + телефон + пароль + SMS OTP
- Вход: ник/почта/телефон + пароль
- Вход по инвайту: анонимный профиль без почты/телефона

## Быстрый старт
Требования:
- Node.js 20+
- pnpm 9+

1. Установить зависимости:
   ```bash
   pnpm install
   ```
2. Подготовить переменные:
   ```bash
   cp .env.example .env
   ```
3. Применить миграции Prisma:
   ```bash
   pnpm --filter @mfs/api prisma:migrate
   ```
4. Создать инвайт код:
   ```bash
   pnpm --filter @mfs/api invite:create -- --code DEMO2026 --maxUses 100
   ```
5. Запустить проект:
   ```bash
   pnpm dev
   ```

Web: http://localhost:3000  
API: http://localhost:4000

## Проверка MVP
- Открыть `/join`
- Проверить регистрацию по email + пароль
- Проверить регистрацию по телефону + OTP (в `SMS_PROVIDER=console` код придет в ответе API как `debugOtpCode`)
- Проверить вход по ник/почте/телефону + пароль
- Проверить вход по инвайту `/join?code=DEMO2026`
- Перейти в чаты, открыть любой чат
- Открыть второй таб, зайти под другим ником и проверить realtime

## Структура
- `apps/web` — клиент (PWA shell, UI, чаты)
- `apps/api` — API, auth, invites, websockets, uploads, prisma

## Команды
- `pnpm dev` — web + api одновременно
- `pnpm lint` — линт
- `pnpm build` — сборка всех приложений

## Безопасность (база)
- `httpOnly` cookie сессии (prod), dev fallback через guest token
- Пароли хранятся только в `scrypt`-хешах (без plaintext)
- Телефонная регистрация подтверждается SMS OTP
- CSRF token для state-changing REST endpoint-ов
- Input sanitization (сообщения только текст)
- Rate limit на API + лимит отправки сообщений
- Минимальные логи без содержания сообщений
- E2EE сообщений пока не реализовано (планируется отдельной фазой)

## Next steps
1. Добавить E2EE (Signal/MLS)
2. Полноценный Web Push (VAPID + подписки)
3. Переключить SQLite -> Postgres
4. Вынести медиа в S3/CDN и добавить трансформации
