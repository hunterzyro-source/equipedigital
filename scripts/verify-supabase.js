const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
}
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL não configurada.'); process.exit(1); }
const url = new URL(process.env.DATABASE_URL);
url.searchParams.delete('sslmode');
const pool = new Pool({ connectionString: url.toString(), max: 1, connectionTimeoutMillis: 8000, ssl: { rejectUnauthorized: false } });
(async () => {
  try {
    const result = await pool.query(`
      select jsonb_array_length(state->'users')::int as users,
             jsonb_array_length(state->'links')::int as links,
             (select relrowsecurity from pg_class where oid = 'equipe_digital_private.app_state'::regclass) as rls_enabled,
             (select relforcerowsecurity from pg_class where oid = 'equipe_digital_private.app_state'::regclass) as rls_forced
      from equipe_digital_private.app_state where id = 1
    `);
    if (!result.rowCount) throw new Error('O estado persistido ainda não foi inicializado.');
    if (!result.rows[0].rls_enabled || !result.rows[0].rls_forced) throw new Error(`RLS flags: ${result.rows[0].rls_enabled}/${result.rows[0].rls_forced}.`);
    console.log(`Supabase conectado; estado persistido e RLS ativo (${result.rows[0].users} contas, ${result.rows[0].links} links).`);
  } catch (error) { console.error(`Verificação Supabase falhou (${error.code || 'erro'}): ${error.message}`); process.exitCode = 1; }
  finally { await pool.end(); }
})();
