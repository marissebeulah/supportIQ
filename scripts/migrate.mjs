import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mariadb from "mariadb";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationDir = path.join(root, "server", "migrations");
const database = process.env.DB_NAME || "supportiq";
if (!/^[A-Za-z0-9_]+$/.test(database)) {
  throw new Error("DB_NAME may contain only letters, numbers, and underscores.");
}

const connectionOptions = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3308),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  connectTimeout: 5000,
};

const connection = await mariadb.createConnection(connectionOptions);
try {
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await connection.query(`USE \`${database}\``);
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(190) NOT NULL PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  const files = (await fs.readdir(migrationDir))
    .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name))
    .sort();
  for (const name of files) {
    const sql = await fs.readFile(path.join(migrationDir, name), "utf8");
    const checksum = crypto.createHash("sha256").update(sql).digest("hex");
    const applied = await connection.query(
      "SELECT checksum FROM schema_migrations WHERE name = ?",
      [name],
    );
    if (applied.length) {
      if (applied[0].checksum !== checksum) {
        throw new Error(`Applied migration ${name} has changed; refusing to continue.`);
      }
      console.log(`Already applied: ${name}`);
      continue;
    }

    const statements = sql.split(/;\s*(?:\r?\n|$)/).map((statement) => statement.trim()).filter(Boolean);
    for (const statement of statements) {
      await connection.query(statement);
    }
    await connection.query(
      "INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)",
      [name, checksum],
    );
    console.log(`Applied: ${name}`);
  }
  console.log(`Schema migrations complete for database "${database}". No application records were inserted.`);
} finally {
  await connection.end();
}
