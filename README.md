# SupportIQ

**SupportIQ** is a full‑stack customer support platform that provides portals for customers, IT staff, and administrators. It handles ticket management, agent devices, bot conversations, knowledge‑base articles, real‑time calls, and more.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running the Application](#running-the-application)
- [Database](#database)
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

   - **SQLite** – the app creates `data/supportiq.db` on first run.
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
| `npm run db:reset` | Reset the SQLite database (drops and recreates `supportiq.db`). |

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
   button in the remote viewer). The customer's screen then shows a full-screen
   "secure support session" animation while the technician keeps working on the
   real desktop. Everything still stops with **Stop sharing**.

## Database

### SQLite (default)

- The database file is `data/supportiq.db` (created automatically).
- All schema and seed data live in `server/migrations/` and `server/seed.js`.
- No extra server required; perfect for local development and testing.

### MySQL / MariaDB (optional)

- Set `DB_TYPE=mysql` and fill in the `DB_*` env vars.
- Run `npm run db:migrate` to create the `supportiq` schema and apply the two migration files:

  - `server/migrations/001_initial_schema.sql` – core tables (`users`, `tickets`, `messages`, …)
  - `server/migrations/002_text_column_defaults.sql` – ALTER TABLE defaults

- The migration script also creates the database if it does not exist, using `CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`.

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