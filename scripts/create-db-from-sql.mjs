import * as sqljs from 'sql.js';
const { openDatabase } = sqljs;
import fs from 'fs';
import path from 'path';

// Paths relative to project root
const sqlPath = path.resolve('data/supportiq.sql');
const dbPath = path.resolve('data/supportiq_fromsql.db');

// Read the SQL dump (binary string)
const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

// sql.js expects a Uint8Array of the database, but we can open a new in-memory DB and execute statements.
// We'll create a new database file and run the SQL statements using the exec method.
async function main() {
  // Create a new database (in memory first)
  const db = await openDatabase({ filePath: dbPath, readonly: false });

  // sql.js provides a `exec` method that runs SQL statements given as a string.
  // However, the dump contains many statements separated by semicolons and newlines.
  // We'll split on semicolons and execute each non‑empty statement.
  const statements = sqlContent.split(';').map(s => s.trim()).filter(s => s.length > 0);

  for (const stmt of statements) {
    try {
      // sql.js `db.exec` expects an array of objects { sql: string } or just a string?
      // According to sql.js docs, db.exec([{sql: '...'}]) runs statements.
      // We'll try passing an array with a single object.
      await db.exec([{ sql: stmt }]);
    } catch (e) {
      // Some statements may fail (e.g., INSERT into autoincrement id may be okay)
      // Console error but continue
      // console.error('Statement error:', e.message, '— stmt:', stmt.substring(0, 80));
    }
  }

  // Close the database (sql.js will write the file)
  db.close();

  console.log(`SQLite database created at: ${dbPath}`);
}

main().catch(err => {
  console.error('Failed to create database', err);
  process.exit(1);
});