# SupportIQ Integration Hand-off

## Backend
- Folder: `server/`
- Local command: `npm run dev` (API `http://localhost:3001`)
- Production-style command: `npm start` (serves API and built `dist/`)
- Health: `GET /api/health`
- Current persistence: built-in Node `node:sqlite`, `data/supportiq.db`; tables are initialized in `server/db.js`. The approved plan targets local XAMPP MariaDB, but a MariaDB adapter/migrations are not implemented yet.

## Frontend
- Folder: repository root (`src/`)
- Build: `npm run build`
- Dev: `npm run dev` (Vite `http://localhost:5173/`, proxies `/api` to port 3001)
- Live API seam: `src/lib/api.ts`; UI calls the existing Express API directly.
- Mock data to remove: none in `src/`; screens use live API responses. `server/seed.js` provides local demo accounts/sample support records.
- Shared types: `src/lib/types.ts`; no separate shared package or import alias.

## Authentication
- `POST /api/auth/register` (customer-only account creation), `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/logout-all`, `GET /api/auth/me`
- Cookie session auth middleware: `server/auth.js`; route implementation: `server/routes/auth.routes.js`.
- Demo-only seeded account password: `support123`; do not use this default in production.

## API route inventory
- `GET /api/health`
- `GET|POST /api/tickets`
- `GET /api/tickets/:id`
- `POST /api/tickets/:id/messages`
- `PATCH /api/tickets/:id/status`
- `PATCH /api/tickets/:id/assign`
- `PATCH /api/tickets/:id/priority`
- `POST /api/tickets/:id/rating`
- `POST /api/tickets/:id/close`
- `POST /api/tickets/:id/read`
- `GET /api/canned-replies`
- `GET /api/bot/conversation`
- `POST /api/bot/messages`
- `POST /api/bot/reset`
- `GET /api/bot/conversations/:id`
- `GET /api/admin/overview`
- `GET /api/admin/team`
- `GET /api/admin/conversations`
- `GET /api/admin/conversations/:id`
- `GET|PUT /api/admin/settings`
- `POST /api/admin/kb`
- `PATCH|DELETE /api/admin/kb/:id`
- `GET /api/admin/canned-replies`
- `POST /api/admin/canned-replies`
- `PATCH|DELETE /api/admin/canned-replies/:id`
- `POST /api/uploads`
- `GET /api/attachments/:id`
- `GET /api/events` (authenticated server-sent events)

## Database and attachments
- Target: XAMPP MariaDB locally; current app still uses SQLite `data/supportiq.db`.
- Migration tool/directory: none exists; introduce reviewed MariaDB migrations under `server/migrations/`.
- Connection settings to document/configure: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
- Local attachment files: `data/uploads/`; replaceable storage boundary remains future work.
- **Create schema migrations only; NO seed data.** Preserve existing SQLite database and demo records.

## Services
- Essential (future Azure phase): Azure Static Web Apps, Azure App Service (Node API), Azure Database for PostgreSQL, Azure Blob Storage.
- Enhancement: none classified in the approved plan.

## Local MariaDB migration progress
- Added `server/migrations/001_initial_schema.sql`, `server/migrations/002_text_column_defaults.sql`, and `scripts/migrate.mjs`; `npm run db:migrate` applies checksum-tracked schema-only migrations to XAMPP MariaDB (`127.0.0.1:3308` by default).
- Applied the initial migration to the previously absent `supportiq` database. It contains 12 application tables plus `schema_migrations`; the `users` and `tickets` tables are empty. No application records were inserted or copied.
- **Cutover intentionally not performed:** the existing SQLite database contains live accounts and support records. The API still uses synchronous `node:sqlite` calls across middleware and routes; switching to an empty MariaDB would strand those records and break existing sign-in/workflows. Keep SQLite as the active API store until an explicit, reviewed persistence-adapter and data-migration/cutover decision is approved. Do not copy records automatically or remove `data/supportiq.db`.
- Verification at this checkpoint: `npm test` (5/5) and `npm run build` pass; migrations apply and re-run idempotently; direct API health, Vite-proxied health, portal page, API route registration/auth responses, and customer/agent/admin read workflows pass against the preserved SQLite store. Existing SQLite counts remained users 7, tickets 22, messages 93, bot conversations 4, and settings 7.
