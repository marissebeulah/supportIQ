# SupportIQ

**SupportIQ** is a full‑stack customer support platform that provides portals for customers, IT staff, and administrators. It handles ticket management, agent devices, bot conversations, knowledge‑base articles, real‑time calls, and more.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running the Application](#running-the-application)
- [Privacy mode](#privacy-mode)
- [Database](#database)
- [Troubleshooting](#troubleshooting)
- [Available Scripts](#available-scripts)
- [License](#license)
- [Credits](#credits)

---

## Project Overview

SupportIQ helps support teams track, prioritize, and resolve customer issues efficiently. The system includes:

- **Customer portal** – submit and view tickets, rate resolutions.
- **IT/Staff portal** – assign tickets, change status, add notes, manage agents and devices.
- **Admin portal** – user/agent management, reports, system settings.
- **Bot integration** – conversational flows for common queries.
- **Real‑time voice/video calls** – using WebRTC‑style signaling.
- **Knowledge‑base** – searchable articles (KB entries).

The backend is an **Express.js** API (Node.js) that can use either **SQLite** (default) or **MySQL/MariaDB** (optional). The frontend is a **React** single‑page application.

---

## Tech Stack

| Layer | Technology |
|------|------------|
| **Runtime** | Node.js (v20+) |
| **Backend** | Express.js, `mariadb` driver (MySQL) / `better-sqlite3` (SQLite) |
| **Frontend** | React 19, Vite, TypeScript |
| **UI Library** | Lucide React icons, custom CSS |
| **Database** | SQLite (default) or MySQL/MariaDB (optional) |
| **Testing** | Jest + React Testing Library |
| **Other** | `sql.js` (in‑memory SQLite for migrations), `dotenv` for env vars |

---

## Prerequisites

- **Node.js** >= 20 installed.
- (Optional) **MySQL/MariaDB** server if you want to use the MySQL backend instead of SQLite.
- **Git** (for cloning) – optional if you already have the files.

---

## Installation

1. **Clone the repo** (or unzip the project):

   ```bash
   git clone https://github.com/marissebeulah/supportiq.git
   cd supportiq
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

   This installs both backend and frontend deps (express, react, etc.) plus `mariadb` and `sql.js`.

3. **Configure environment variables** – copy the example file and adjust:

   ```bash
   cp .env.example .env   # if present; otherwise create .env
   ```

   Required variables (defaults are commented):

   ```env
   # Server
   PORT=3000

   # Database – SQLite (default)
   DB_TYPE=sqlite        # or "mysql" to use MySQL

   # MySQL (only if DB_TYPE=mysql)
   DB_HOST=127.0.0.1
   DB_PORT=3308          # project default; change if your MySQL runs on 3306
   DB_USER=root
   DB_PASSWORD=          # leave empty for no password
   DB_NAME=supportiq

   # Optional: JWT secret, etc.
   ```

4. **Database setup** (skip if you stay with SQLite):

   - **SQLite** – the app creates and seeds `data/supportiq.db` on first run.
   - **MySQL** – ensure the server is running and the `supportiq` database exists (the migration script can create it):

     ```bash
     npm run db:migrate     # reads DB_* env vars and applies server/migrations/*.sql
     ```

5. **Start the development server**:

   ```bash
   npm run dev
   ```

   The frontend will be available at `http://localhost:3000` (or the port you set).

---

## Running the Application

| Command | Description |
|---------|-------------|
| `npm run dev` | Starts Vite + Express in development mode (hot‑reload for front‑end, nodemon‑like for back‑end). |
| `npm run dev:https` | Same, but serves the app over HTTPS on port **5173** so camera, microphone, calls, and remote support work from other devices on the LAN. |
| `npm run firewall:open` | Adds Windows Firewall inbound rules for ports 5173 and 3001 (run once from an elevated terminal). |
| `npm run sync` | Pull the latest code from GitHub safely: stops if the API is running, backs up the database, clears stale SQLite journals, keeps your local data, and verifies integrity afterwards. |
| `npm start` | Production build – first run `npm run build` then `node server/index.js`. |
| `npm run build` | Compile TypeScript and bundle the React app into `dist/`. |
| `npm test` | Run the Jest test suite. |
| `npm run db:migrate` | Apply pending SQL migrations (MySQL/MariaDB only). |
| `npm run db:reset` | Delete `data/` (database, uploads, backups); the next start recreates and seeds the database. |
| `npm run db:seed` | Rebuild the database from the tracked dump `data/supportiq.sql`. Add `-- --force` to replace an existing database; it is backed up first. |

---

## LAN access, calls, and remote support

To use SupportIQ from another device on the same network:

1. Start the HTTPS server (it replaces `npm run dev` on port 5173):

   ```bash
   npm run dev:https
   ```

   The console prints `Local: https://localhost:5173` and `Network: https://<LAN-IP>:5173`.

2. On the first visit the browser warns about the self-signed development
   certificate. Choose **Advanced → Proceed**, or install `.certs/dev.cer`
   once on that device. The same file is served at `/dev-cert.cer`.

3. If other devices cannot connect, open Windows Firewall once from an
   **elevated** PowerShell:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/open-firewall.ps1
   ```

4. Voice and video calls require HTTPS (or localhost); they will not work over
   `http://<LAN-IP>:5173`. Both participants must be signed in and online.

5. Remote desktop control uses the native **SupportIQ Agent**, not the browser
   alone. On the customer's Windows PC, open the request, click **Set up this
   PC**, run the installer, and leave the agent in the tray. IT can then request
   a session from the same request page. Phones and devices without the agent
   can be called, but cannot be remote-controlled.

6. During a session the technician can switch on **Privacy mode** (the eye
   button in the remote viewer). See [Privacy mode](#privacy-mode).

---

## Privacy mode

Privacy mode covers the customer's own screen with a full-screen "secure support
session" animation while the technician keeps seeing and controlling the real
desktop underneath. It is switched on from the eye button in the remote viewer,
and everything still stops with **Stop sharing**.

What the agent guarantees, and why:

- **The overlay never takes keyboard focus.** It is click-through
  (`WM_NCHITTEST` → `HTTRANSPARENT`), it hands the foreground window back in
  `SetVisibleCore`/`OnActivated`, and it answers `WM_MOUSEACTIVATE` with
  `MA_NOACTIVATE`. Without this the overlay became the focused window and every
  injected keystroke was posted to it and discarded, which looked like the
  customer's PC freezing.
- **The technician still sees the desktop.** The overlay is excluded from the
  agent's own capture with `WDA_EXCLUDEFROMCAPTURE`, so the animation never
  shows up in the viewer.
- **The customer sees no pointer.** Injected mouse movement is a real cursor
  move, so the system arrow is replaced with a fully transparent one
  (`SetSystemCursor`) for as long as the overlay is up. The pointer is restored
  with `SPI_SETCURSORS` when the overlay closes, when the agent exits, and when
  the agent starts — the last one covers a previous run that was killed.
- **The technician still sees a cursor.** Because the real arrow is blank, the
  capture loop draws an arrow at the last injected position while privacy mode
  is active.

Known limitations:

- Only the standard system arrow is blanked. An app that paints its own cursor
  (some games, CAD) can still draw one over the privacy screen.
- If the agent is force-killed while privacy is on, the pointer stays invisible
  until the agent is started again.
- Elevated windows (Task Manager, UAC prompts) ignore injected input.

A step-by-step verification list lives in
[docs/privacy-mode-checklist.md](docs/privacy-mode-checklist.md).

## Database

### SQLite (default)

- The database file is `data/supportiq.db` (created automatically).
- It is **not tracked by git**. SQLite rewrites it on every run, so it showed up
  as a modification after each session and could be replaced by a pull. A
  tracked database plus stale `-wal`/`-shm` journals is also what used to break
  sign-in with "database disk image is malformed". `.gitignore` covers
  `data/*.db`, `data/*.db-wal`, `data/*.db-shm`, and `data/*.db-journal`.
- On first start the server creates the schema and seeds the demo accounts, so a
  fresh clone works with no extra step. See [Demo accounts](#demo-accounts).
- `data/supportiq.sql` is a tracked dump of a populated database; `npm run
  db:seed` rebuilds the database from it.
- All schema and seed data live in `server/migrations/` and `server/seed.js`.
- No extra server required; perfect for local development and testing.

### Demo accounts

The seeded accounts all use the password `support123`:

| Email | Role |
|-------|------|
| `admin@supportiq.app` | Admin |
| `alex@supportiq.app` | IT support |
| `priya@supportiq.app` | IT support |
| `marcus@supportiq.app` | IT support |
| `maya@northwind.co` | Customer |
| `daniel@lumenpay.io` | Customer |
| `elena@arclight.health` | Customer |

Accounts you register yourself keep their own passwords.

### MySQL / MariaDB (optional)

- Set `DB_TYPE=mysql` and fill in the `DB_*` env vars.
- Run `npm run db:migrate` to create the `supportiq` schema and apply the two migration files:

  - `server/migrations/001_initial_schema.sql` – core tables (`users`, `tickets`, `messages`, …)
  - `server/migrations/002_text_column_defaults.sql` – ALTER TABLE defaults

- The migration script also creates the database if it does not exist, using `CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`.

---

## Troubleshooting

### "Can't reach SupportIQ" when signing in

The web app is served by Vite, but every login, ticket, and call goes to the
API on port 3001. If the API is not running, the frontend still loads and the
login form can only report that the request failed — no password is ever checked.

Check whether the API is alive:

```bash
curl http://localhost:3001/api/health
```

If nothing answers, start the stack again with `npm run dev:https` (or
`npm run dev`). It prints whether it started its own API or reused one that was
already running, and if it reused one that later stops answering it starts its
own. Any HTTP status means the API is up; a connection error means it is not.

### "Email or password is incorrect"

The credentials are checked against the local database. The seeded accounts are
listed under [Demo accounts](#demo-accounts) and use `support123`; an account you
registered has the password you chose. You can request a reset link from the
sign-in page (`POST /api/auth/forgot-password`).

### "database disk image is malformed"

Usually a stale `-wal`/`-shm` journal left by a killed server, or a database file
replaced while the server was running.

1. Stop the dev server.
2. Run `npm run db:reset` to recreate and reseed an empty database, or
   `npm run db:seed -- --force` to rebuild it from `data/supportiq.sql`
   (the current file is backed up to `data/backups/` first).

### The certificate warning on another device

Install `.certs/dev.cer` once on that device, or open `/dev-cert.cer` from the
server and trust it.

---

## License

This project is **private** and source‑available. If you need a license grant, please contact the repository owner.

---

## Credits

- Developed by **Marisse Beulah** – see the GitHub profile for more details.
- Icons from **Lucide React**.
- Built with **Node.js**, **Express**, **React**, **Vite**, and **TypeScript**.

---

**Happy supporting!** 🎉
