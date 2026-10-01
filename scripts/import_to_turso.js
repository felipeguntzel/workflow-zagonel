import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let TURSO_URL = process.env.TURSO_DATABASE_URL;
let TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_URL || !TURSO_TOKEN) {
  const devVarsPath = path.resolve(__dirname, '../.dev.vars');
  if (fs.existsSync(devVarsPath)) {
    const lines = fs.readFileSync(devVarsPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('TURSO_DATABASE_URL=')) {
        TURSO_URL = trimmed.replace('TURSO_DATABASE_URL=', '').trim();
      } else if (trimmed.startsWith('TURSO_AUTH_TOKEN=')) {
        TURSO_TOKEN = trimmed.replace('TURSO_AUTH_TOKEN=', '').trim();
      }
    }
  }
}

async function main() {
  console.log(`Connecting to Turso: ${TURSO_URL}...`);
  const client = createClient({
    url: TURSO_URL,
    authToken: TURSO_TOKEN,
  });

  // Check existing tables and clean up if partial
  const existingTables = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  if (existingTables.rows.length > 0) {
    console.log(`Cleaning ${existingTables.rows.length} existing tables...`);
    // Disable foreign keys to drop tables cleanly
    await client.execute("PRAGMA foreign_keys = OFF");
    for (const row of existingTables.rows) {
      await client.execute(`DROP TABLE IF EXISTS "${row.name}"`);
    }
    console.log('Cleanup finished.');
  }

  const sqlFile = path.resolve(__dirname, '../dump_d1.sql');
  const sqlContent = fs.readFileSync(sqlFile, 'utf8');

  console.log('Executing dump via executeMultiple...');
  // executeMultiple runs all queries in sequence on the same connection
  // Prepend PRAGMA foreign_keys = OFF to allow out-of-order reference insertion
  const fullSql = `PRAGMA foreign_keys = OFF;\n` + sqlContent + `\nPRAGMA foreign_keys = ON;`;
  await client.executeMultiple(fullSql);

  console.log('All dump statements successfully imported!');

  // Verification
  const tables = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  console.log(`\nImported ${tables.rows.length} tables:`);
  let totalRows = 0;
  for (const row of tables.rows) {
    const countRes = await client.execute(`SELECT COUNT(*) as count FROM "${row.name}"`);
    const count = Number(countRes.rows[0].count);
    totalRows += count;
    console.log(` - ${row.name}: ${count} rows`);
  }
  console.log(`\nTotal rows across all tables: ${totalRows}`);

  client.close();
}

main().catch((err) => {
  console.error('Fatal error during migration:', err);
  process.exit(1);
});
