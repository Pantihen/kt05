# kt05 — блог-API + realtime-чат (Socket.io)

КТ №5, направление A: в проект из КТ №4 добавлен WebSocket-чат с JWT-аутентификацией.
Расширение КТ №3 и КТ №4. Express 5 + Prisma 6 (SQLite) + Joi + JWT + bcrypt + helmet + express-rate-limit.
Тесты — Jest + Supertest.

## Запуск

```bash
npm install
cp .env.example .env        # в production задайте свои JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
npx prisma migrate dev      # применить миграции
npm run seed                # демо-аккаунты: admin@example.com / admin123, moderator@example.com / moderator123
npm start                   # src/server.js → http://localhost:3000, демо-чат: /chat.html
npm test                    # все тесты (отдельная база prisma/test.db создаётся автоматически)
```

Структура: `src/app.js` — само приложение (экспортируется для тестов), `src/server.js` — запуск `listen`.

## Realtime-чат (Socket.io)

Socket.io подключён к тому же HTTP-серверу, что и Express (`src/server.js`, один порт).
Код: `src/socket/` — `auth.js` (JWT-middleware), `presence.js` (кто онлайн), `handlers/` (события),
`events.js` (имена событий); сохранение сообщений — `src/services/messages.js`.

**Подключение** — access token из `POST /auth/login`:

```js
const socket = io('http://localhost:3000', { auth: { token: accessToken } });
// или заголовок Authorization: Bearer <token>
socket.on('connect_error', (err) => console.log(err.message)); // «Требуется авторизация» и т.п.
```

Middleware проверяет токен и загружает пользователя из БД; без токена или с неверным токеном подключение отклоняется.

**События**

| Событие            | Направление        | Данные | Описание |
|--------------------|--------------------|--------|----------|
| `users:online`     | сервер → новый клиент | `[{ id, name, role }]` | Список онлайн-пользователей сразу после подключения |
| `user:online`      | сервер → остальные | `{ id, name, role }` | Пользователь подключился |
| `user:offline`     | сервер → остальные | `{ id, name, role }` | Пользователь отключился (закрыл последнюю вкладку) |
| `message:send`     | клиент → сервер    | `{ content }` | Сообщение в общий чат, сохраняется в БД |
| `message:new`      | сервер → все       | `Message` | Новое сообщение общего чата |
| `room:join`        | клиент → сервер    | `{ room }` | Войти в комнату; в ack — `history` (последние сообщения из БД) |
| `room:leave`       | клиент → сервер    | `{ room }` | Выйти из комнаты |
| `room:message`     | клиент → сервер    | `{ room, content }` | Сообщение в комнату (только участникам) |
| `room:message`     | сервер → комната   | `Message` | Новое сообщение комнаты |
| `room:user-joined` / `room:user-left` | сервер → комната | `{ room, user }` | Кто вошёл / вышел |

Клиентские события поддерживают acknowledgement: `socket.emit('message:send', { content }, (res) => ...)`,
ответ — `{ ok: true, message }` или `{ ok: false, error, details }` (валидация Joi).

`Message`: `{ id, content, room, createdAt, authorId, author: { id, name, role } }` (`room: null` — общий чат).

**История через REST:** `GET /api/messages?room=nodejs&page=1&limit=50` (нужен access token).

Настройки — в `.env`: `CLIENT_ORIGIN` (CORS для сокетов), `CHAT_HISTORY_LIMIT`, `CHAT_MAX_MESSAGE_LENGTH`.

**Демо:** `npm run seed`, `npm start`, открыть http://localhost:3000/chat.html в двух окнах
(например, в обычном и приватном) под `admin@example.com / admin123` и `moderator@example.com / moderator123`.

## Аутентификация

| Метод | URL            | Описание |
|-------|----------------|----------|
| POST  | /auth/register | Регистрация `{ email, name, password }`, пароль хэшируется bcrypt, роль всегда USER → 201 |
| POST  | /auth/login    | `{ email, password }` → `{ accessToken, user }` + refresh token в httpOnly cookie. Лимит: 10 запросов / 15 мин |
| POST  | /auth/refresh  | Новый access token по refresh token из cookie (cookie тоже обновляется) |
| POST  | /auth/logout   | Очистка cookie → 204 |
| GET   | /auth/me       | Текущий пользователь (нужен `Authorization: Bearer <accessToken>`) |

Access token живёт 15 минут, refresh — 7 дней; они подписаны разными секретами.
Пароль никогда не возвращается в ответах (глобальный `omit` в PrismaClient).

## RBAC

Все маршруты `/api/*` и `/admin/*` требуют access token. Роль берётся из БД при каждом запросе,
поэтому смена роли действует сразу.

| Маршрут                     | USER        | MODERATOR | ADMIN |
|-----------------------------|-------------|-----------|-------|
| GET /api/posts              | ✓           | ✓         | ✓     |
| POST /api/posts             | ✓           | ✓         | ✓     |
| PATCH /api/posts/:id        | только свои | любые     | любые |
| DELETE /api/posts/:id       | только свои | любые     | любые |
| GET /api/users              | ✗           | ✓         | ✓     |
| PATCH /admin/users/:id/role | ✗           | ✗         | ✓     |

Остальные маршруты: `GET /api/posts/:id`, `GET /api/users/:id` — любая роль;
`PATCH`/`DELETE /api/users/:id` — свой профиль или ADMIN; `POST /api/users` — только ADMIN.
В `POST /api/posts` автором становится текущий пользователь (`authorId` из тела не принимается).

Коды: `401` — нет/неверный токен, `403` — недостаточно прав, `404` — не найдено.

## Безопасность

- `helmet()` — `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff` и другие заголовки
- rate limiting на `/auth/login`: не более 10 запросов за 15 минут, затем `429`
- `express.json({ limit: '10kb' })` — большее тело запроса → `413`
- error handler: при `NODE_ENV=production` stack trace и текст внутренних ошибок не отдаются
- refresh cookie: `httpOnly`, `sameSite=strict`, `path=/auth`, `secure` в production

## Тесты (45, `npm test`)

- `tests/socket.test.js` — JWT при подключении, `users:online`, `user:online`/`user:offline` (в т.ч. несколько вкладок),
  `message:send` → `message:new` с сохранением в БД, комнаты (join/leave/message, изоляция), валидация, REST-история

- `tests/auth.test.js` — регистрация (успех, дубль email, валидация), логин (успех, неверный пароль),
  refresh, logout, `/auth/me` с токеном и без
- `tests/rbac.test.js` — владелец удаляет свой пост, чужой USER получает 403, права MODERATOR/ADMIN,
  `GET /api/users` и смена роли
- `tests/security.test.js` — заголовки helmet, лимит 10kb, rate limit
- `tests/unit/` — unit-тесты JWT-утилиты, middleware валидации и error handler

## PostgreSQL

В `prisma/schema.prisma` поменять `provider = "postgresql"`, в `.env` указать `DATABASE_URL="postgresql://..."`,
удалить `prisma/migrations` и выполнить `npx prisma migrate dev --name init`.
Поиск по заголовку тогда автоматически использует `mode: 'insensitive'`.
