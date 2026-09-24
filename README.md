# Семейный календарь

MVP веб-приложения для семейного расписания: общий календарь, участники с цветами, проверка пересечений и буфера на дорогу.

## Стек

- **Frontend:** Vue 3, TypeScript, Vite, Pinia, FullCalendar
- **Backend:** NestJS, Prisma, PostgreSQL, JWT
- **Monorepo:** pnpm workspaces

## Структура

```
apps/
  api/                 NestJS + Prisma
  web/                 Vue 3 + Vite
packages/
  shared-types/        общие enum и типы конфликтов
  eslint-config/
  tsconfig/
infra/
  docker-compose.yml   PostgreSQL (:5433) + MinIO
```

## Быстрый старт

```bash
# 1. Зависимости
pnpm install

# 2. Переменные окружения
cp .env.example .env
cp .env apps/api/.env
# VITE_API_URL уже в .env.example — для Vite:
echo 'VITE_API_URL=http://localhost:3000' > apps/web/.env

# 3. Инфраструктура (Postgres на порту 5433, чтобы не конфликтовать с локальным :5432)
pnpm docker:up

# 4. Shared types + миграция + seed
pnpm --filter @family-calendar/shared-types build
pnpm db:migrate
pnpm db:seed

# 5. Запуск API и web
pnpm dev
```

- Web: http://localhost:5173  
- API: http://localhost:3000  
- Swagger: http://localhost:3000/api/docs  

### Демо-аккаунт

- Email: `demo@family.local`
- Пароль: `demo1234`

В seed уже есть семья из 5 участников и события текущей недели (включая пересечения для демо).

## Переменные окружения

| Переменная | Описание |
|---|---|
| `DATABASE_URL` | PostgreSQL, по умолчанию `localhost:5433` |
| `JWT_SECRET` | секрет подписи JWT |
| `JWT_ACCESS_EXPIRES_IN` | срок жизни access-токена (`15m`) |
| `JWT_REFRESH_EXPIRES_DAYS` | срок жизни refresh-токена в днях (`30`) |
| `JWT_EXPIRES_IN` | legacy-алиас для access (если нет `JWT_ACCESS_EXPIRES_IN`) |
| `WEB_ORIGIN` | origin фронта для ссылок в письмах (`http://localhost:5173`) |
| `PASSWORD_RESET_EXPIRES_HOURS` | срок ссылки сброса пароля (`2`) |
| `API_PORT` | порт API (`3000`) |
| `CORS_ORIGIN` | origin фронтенда |
| `VITE_API_URL` | URL API для фронтенда |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | ключи Web Push |
| `VAPID_SUBJECT` | `mailto:` контакт для VAPID |
| `MINIO_*` | заготовка под аватары |

## API (Stage 1)

| Метод | Путь |
|---|---|
| POST | `/auth/register` |
| POST | `/auth/login` |
| POST | `/auth/forgot-password` |
| POST | `/auth/reset-password` |
| POST | `/auth/change-password` |
| POST | `/auth/logout` |
| GET | `/me` |
| POST | `/families` |
| GET/PATCH | `/families/:familyId` |
| GET/POST | `/families/:familyId/categories` |
| PATCH/DELETE | `/families/:familyId/categories/:categoryId` |
| GET/POST | `/families/:familyId/events` |
| GET/PATCH/DELETE | `/families/:familyId/events/:eventId` |
| POST | `/families/:familyId/events/check-conflicts` |
| POST | `/families/:familyId/events/:eventId/check-conflicts` |
| GET | `/families/:familyId/conflicts?from=&to=` |
| GET/POST | `/families/:familyId/invitations` |
| DELETE | `/families/:familyId/invitations/:invitationId` |
| GET | `/invitations/:token` (публичный preview) |
| POST | `/invitations/:token/accept` |
| POST | `/invitations/accept-by-code` |
| GET | `/notifications` |
| GET | `/notifications/unread-count` |
| PATCH | `/notifications/read-all` |
| PATCH | `/notifications/:id/read` |
| GET | `/push/vapid-public-key` |
| POST | `/push/subscribe` |
| DELETE | `/push/subscribe` |

**Realtime (Socket.IO):** namespace `/realtime`, JWT в `auth.token`. Клиент шлёт `family:join` / `family:leave`. Сервер пушит в комнату семьи: `events:changed`, `members:changed`, `categories:changed`, `family:changed`; в комнату пользователя: `notification:new`.

Конфликты: hard-пересечения блокируют сохранение; buffer-предупреждения требуют `confirmConflict: true`.

Приглашения: владелец создаёт ссылку (`/invite/:token`) или код; новый пользователь принимает после входа.

Напоминания: в событии `reminderMinutes[]`; планировщик каждые 30с создаёт in-app уведомления участникам с аккаунтом. Также уведомления при изменении и отмене события.

**Web Push:** включить в колокольчике уведомлений. Нужны `VAPID_*` в `.env` (см. `.env.example`). Работает на `localhost` без HTTPS.

## Тесты

```bash
pnpm test
```

Покрыто: полное/частичное пересечение, одинаковый старт, касание границ, буфер, конфликт ответственного, разные участники, доступ к семье.

## Ограничения Stage 1 / дальше

Не реализовано:

- загрузка аватаров в MinIO
- роли помощника с ограниченным ACL
- PWA / offline, ICS, интеграции с внешними календарями
- FCM (мобильные пуши) — есть Web Push в браузере
- SMTP для писем сброса пароля (в dev — лог + `devResetUrl`)

## Деплой (CI)

GitHub Actions: `.github/workflows/deploy.yml` — push в `main` → rsync на VPS → `prisma migrate` → `pm2 restart`.

Секреты репозитория:

| Secret | Пример |
|---|---|
| `DEPLOY_HOST` | `166.1.2.199` |
| `DEPLOY_USER` | `root` |
| `DEPLOY_SSH_KEY` | приватный ключ (целиком, включая `BEGIN/END`) |

На сервере один раз: `authorized_keys` для этого ключа, `pnpm`/`pm2`, файл `apps/api/.env` (не в git).

Вручную без CI:

```bash
rsync -avz --exclude node_modules --exclude .git --exclude '**/.env' --exclude apps/web/dist --exclude apps/api/dist \
  ./ root@HOST:/opt/family-calendar/
```



### Этапы

### P1 — готово

1. ~~Day / month / list views~~
2. ~~Recurrence (RRULE) + `EventException`~~
3. ~~Приглашения~~
4. ~~NestJS Gateway (realtime)~~
5. ~~`Reminder` + in-app `Notification`~~
6. ~~Web Push (VAPID)~~

### Дальше (на выбор)

1. ACL помощника
2. Аватары (MinIO)
3. PWA / offline
4. ICS import

//не стирать
37M7WgTjWM@iuMn
ssh root@46.8.237.129

TWQMP6dn2z.7V_w
