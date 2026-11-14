// Rebuilds data/supportiq.db from the tracked dump in data/supportiq.sql.
//
// The live database is deliberately not tracked by git: SQLite rewrites it on
// every run, so it showed up as a modification after each session and could be
// replaced by a pull. This script is how you get the dump's data back.
//
//   npm run db:seed              create the database from the dump
//   npm run db:seed -- --force   replace the current database (backed up first)
//
// An empty database needs no seeding: the server creates the schema and
// server/seed.js adds the demo accounts on first start. Use `npm run db:reset`
// for that.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
const dataDir = path.join(root, "data");
const dumpPath = path.join(dataDir, "supportiq.sql");
const dbPath = path.join(dataDir, "supportiq.db");
const walPath = `${dbPath}-wal`;
const shmPath = `${dbPath}-shm`;
const backupDir = path.join(dataDir, "backups");
const force = process.argv.includes("--force");

function log(message) {
  console.log(`[seed] ${message}`);
}

function fail(message) {
  console.error(`[seed] ${message}`);
  process.exit(1);
}

function stamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

// The API keeps the database open while it runs, so replacing the file under a
// live server leaves it writing to a file nobody can see, and the next request
// fails in confusing ways.
function assertDatabaseIdle() {
  for (const journal of [walPath, shmPath]) {
    if (!fs.existsSync(journal)) continue;
    const probe = `${journal}.probe`;
    try {
      fs.renameSync(journal, probe);
      fs.renameSync(probe, journal);
    } catch (error) {
      fs.rmSync(probe, { force: true });
      if (["EPERM", "EBUSY", "EACCES"].includes(error.code)) {
        fail(
          `The SupportIQ API is still running (${path.basename(journal)} is locked). ` +
            'Stop "npm run dev" (or "npm start") first, then run this again.',
        );
      }
      throw error;
    }
  }
}

if (!fs.existsSync(dumpPath)) {
  fail(`No SQL dump found at ${path.relative(root, dumpPath)}.`);
}

if (fs.existsSync(dbPath)) {
  if (!force) {
    fail(
      "data/supportiq.db already exists. Use `npm run db:reset` to start with an " +
        "empty database seeded with demo accounts, or `npm run db:seed -- --force` " +
        "to replace it with the dump.",
    );
  }
  assertDatabaseIdle();
  fs.mkdirSync(backupDir, { recursive: true });
  const backup = path.join(backupDir, `supportiq-before-seed-${stamp()}.db`);
  fs.copyFileSync(dbPath, backup);
  log(`Backup: ${path.relative(root, backup)}`);
  fs.rmSync(dbPath, { force: true });
}

const dump = fs.readFileSync(dumpPath, "utf8");
const tempPath = `${dbPath}.seeding`;
fs.rmSync(tempPath, { force: true });

// A dump is written with foreign keys off, so its INSERTs are not in dependency
// order. Node's SQLite driver enables them by default and would abort halfway.
const db = new DatabaseSync(tempPath, { enableForeignKeyConstraints: false });
try {
  db.exec(dump);
} catch (error) {
  fs.rmSync(tempPath, { force: true });
  fail(`Could not load ${path.basename(dumpPath)}: ${error.message}`);
} finally {
  try {
    db.close();
  } catch {
    // Already closed or failed mid-load; the file is removed above.
  }
}

for (const journal of [`${tempPath}-wal`, `${tempPath}-shm`, walPath, shmPath]) {
  fs.rmSync(journal, { force: true });
}

const check = new DatabaseSync(tempPath, { readOnly: true });
try {
  const integrity = check.prepare("PRAGMA integrity_check").all();
  if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") {
    check.close();
    fs.rmSync(tempPath, { force: true });
    fail(`Integrity check failed: ${integrity.map((row) => row.integrity_check).join("; ")}`);
  }
  const users = check.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  const tickets = check.prepare("SELECT COUNT(*) AS c FROM tickets").get().c;
  log(
    `Loaded ${path.basename(dumpPath)}: ${users} users, ${tickets} tickets.`,
  );
} finally {
  check.close();
}

fs.renameSync(tempPath, dbPath);
log(`Wrote ${path.relative(root, dbPath)}.`);

log("Done. Start the app with: npm run dev");
