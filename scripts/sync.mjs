// Pulls the latest code from GitHub without corrupting the local SQLite
// database. A tracked .db file plus leftover -wal/-shm journals is what breaks
// logins ("database disk image is malformed"), so this script:
//   1. refuses to run while the API is serving requests,
//   2. backs up the database and removes the stale journals,
//   3. keeps your local data safe across the pull,
//   4. verifies integrity afterwards and rolls back if anything is wrong.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
const dataDir = path.join(root, "data");
const dbPath = path.join(dataDir, "supportiq.db");
const walPath = `${dbPath}-wal`;
const shmPath = `${dbPath}-shm`;
const backupDir = path.join(dataDir, "backups");
const KEEP_BACKUPS = 10;

function log(message) {
  console.log(`[sync] ${message}`);
}

function fail(message) {
  console.error(`[sync] ${message}`);
  process.exit(1);
}

function git(args) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8" });
}

function gitText(args) {
  const result = git(args);
  return result.status === 0 ? result.stdout.trim() : "";
}

function stamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

function writeBackup() {
  fs.mkdirSync(backupDir, { recursive: true });
  const target = path.join(backupDir, `supportiq-${stamp()}.db`);
  fs.copyFileSync(dbPath, target);
  for (const journal of [walPath, shmPath]) {
    if (fs.existsSync(journal)) {
      fs.copyFileSync(journal, `${target}${journal.slice(dbPath.length)}`);
    }
  }
  return target;
}

function integrity(file) {
  let db;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const rows = db.prepare("PRAGMA integrity_check").all();
    const ok = rows.length === 1 && rows[0].integrity_check === "ok";
    return { ok, detail: rows.map((row) => row.integrity_check).join("; ") };
  } catch (error) {
    return { ok: false, detail: error.message };
  } finally {
    try {
      db?.close();
    } catch {
      // Ignore close errors on a corrupt file.
    }
  }
}

function counts(file) {
  let db;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    return {
      users: db.prepare("SELECT COUNT(*) AS c FROM users").get().c,
      tickets: db.prepare("SELECT COUNT(*) AS c FROM tickets").get().c,
    };
  } catch {
    return null;
  } finally {
    try {
      db?.close();
    } catch {
      // Ignore close errors.
    }
  }
}

function pruneBackups() {
  const files = fs
    .readdirSync(backupDir)
    .filter((name) => name.endsWith(".db"))
    .map((name) => ({ name, time: fs.statSync(path.join(backupDir, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  for (const file of files.slice(KEEP_BACKUPS)) {
    fs.rmSync(path.join(backupDir, file.name), { force: true });
    fs.rmSync(path.join(backupDir, `${file.name}-wal`), { force: true });
    fs.rmSync(path.join(backupDir, `${file.name}-shm`), { force: true });
  }
}

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

function removeJournals(files) {
  for (const journal of files) {
    try {
      fs.rmSync(journal, { force: true });
    } catch (error) {
      if (["EPERM", "EBUSY", "EACCES"].includes(error.code)) {
        fail(
          `Could not remove ${path.basename(journal)} because it is open. ` +
            'Stop "npm run dev" (or "npm start") first, then run this again.',
        );
      }
      throw error;
    }
  }
}

assertDatabaseIdle();

if (!fs.existsSync(dbPath)) {
  log("No local database yet. Pulling code only.");
  const pull = git(["pull", "--ff-only"]);
  process.stdout.write(pull.stdout || "");
  process.stderr.write(pull.stderr || "");
  process.exit(pull.status ?? 0);
}

const journalFiles = [walPath, shmPath].filter((file) => fs.existsSync(file));
log(
  journalFiles.length
    ? `Removing stale SQLite journals: ${journalFiles.map((file) => path.basename(file)).join(", ")}`
    : "No stale SQLite journals found.",
);

const backup = writeBackup();
log(`Backup: ${path.relative(root, backup)}`);
pruneBackups();

for (const journal of journalFiles) {
  removeJournals([journal]);
}

const local = integrity(dbPath);
log(`Local database integrity: ${local.ok ? "ok" : `NOT OK (${local.detail})`}`);
const localCounts = local.ok ? counts(dbPath) : null;
if (localCounts) log(`Local data: ${localCounts.users} users, ${localCounts.tickets} tickets`);

const dirty = gitText(["status", "--porcelain", "--", "data/supportiq.db"]) !== "";
const preserved = path.join(backupDir, `supportiq-${stamp()}-preserved.db`);
let preserveLocal = dirty && local.ok;

if (dirty) {
  if (preserveLocal) {
    fs.copyFileSync(dbPath, preserved);
    log("Keeping your local database across the pull (it is preserved in data/backups).");
  } else {
    log("Local database is corrupt or unchanged in git; letting the pull provide its version.");
  }
  git(["checkout", "--", "data/supportiq.db"]);
}

const before = gitText(["rev-parse", "--short", "HEAD"]);
const pull = git(["pull", "--ff-only"]);
process.stdout.write(pull.stdout || "");
process.stderr.write(pull.stderr || "");

if (pull.status !== 0) {
  log("Pull failed. Restoring your local database so nothing is lost.");
  if (preserveLocal && fs.existsSync(preserved)) fs.copyFileSync(preserved, dbPath);
  process.exit(pull.status ?? 1);
}

if (preserveLocal && fs.existsSync(preserved)) {
  fs.copyFileSync(preserved, dbPath);
}

const after = gitText(["rev-parse", "--short", "HEAD"]);
if (before && after && before !== after) {
  log(`Updated ${before} -> ${after}`);
} else {
  log("Already up to date.");
}

for (const journal of [walPath, shmPath]) {
  fs.rmSync(journal, { force: true });
}

const result = integrity(dbPath);
const finalCounts = counts(dbPath);
if (!result.ok) {
  const latest = fs
    .readdirSync(backupDir)
    .filter((name) => name.endsWith(".db") && !name.includes("preserved"))
    .map((name) => ({ name, time: fs.statSync(path.join(backupDir, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time)
    .map((entry) => path.join(backupDir, entry.name))
    .find((candidate) => integrity(candidate).ok);
  console.error(`[sync] Database integrity check failed after pull: ${result.detail}`);
  if (latest) {
    fs.copyFileSync(latest, dbPath);
    for (const journal of [walPath, shmPath]) fs.rmSync(journal, { force: true });
    console.error(`[sync] Restored the last good backup: ${path.relative(root, latest)}`);
  }
  process.exit(1);
}

log(`Database integrity: ok${finalCounts ? ` (${finalCounts.users} users, ${finalCounts.tickets} tickets)` : ""}`);
log("Done. Start the app with: npm run dev");
