const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

function loadEnv() {
  try {
    for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {}
}

loadEnv();
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Configure DIRECT_URL ou DATABASE_URL no .env antes de aplicar a migração.');
  process.exit(1);
}

const postgresUrl = new URL(connectionString);
postgresUrl.searchParams.delete('sslmode');
const pool = new Pool({ connectionString: postgresUrl.toString(), max: 1, connectionTimeoutMillis: 8000, ssl: { rejectUnauthorized: false } });
(async () => {
  try {
    const migrationDir = path.join(__dirname, '..', 'supabase', 'migrations');
    const files = fs.readdirSync(migrationDir).filter(file => file.endsWith('.sql')).sort();
    for (const file of files) await pool.query(fs.readFileSync(path.join(migrationDir, file), 'utf8'));
    console.log('Migrações do banco Supabase aplicadas e verificadas.');
  } catch (error) {
    console.error(`Não foi possível aplicar a migração Supabase (${error.code || 'erro de conexão'}).`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
