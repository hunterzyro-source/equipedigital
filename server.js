const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Pool } = require('pg');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
// Vercel's deployment directory is read-only. The JSON fallback is only for
// local development; keep its temporary files outside the deployment bundle.
const DATA_DIR = process.env.VERCEL ? path.join(require('node:os').tmpdir(), 'equipe-digital') : path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const LINKS_FILE = path.join(DATA_DIR, 'links.json');
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.json');
const PAYOUTS_FILE = path.join(DATA_DIR, 'payouts.json');
const LINK_FINGERPRINTS_FILE = path.join(DATA_DIR, 'link-fingerprints.json');
const ACTIVITY_FILE = path.join(DATA_DIR, 'link-activity.json');
const sessions = new Map();

function loadEnv() {
  try {
    for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (match && process.env[match[1]] === undefined) {
        let value = match[2];
        if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1).replace(/\\(["'\\])/g, '$1');
        process.env[match[1]] = value;
      }
    }
  } catch {}
}
loadEnv();

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.SUPABASE_DB_URL || '';
const postgresUrl = DATABASE_URL ? new URL(DATABASE_URL) : null;
postgresUrl?.searchParams.delete('sslmode');
const databasePool = DATABASE_URL ? new Pool({ connectionString: postgresUrl.toString(), max: 1, connectionTimeoutMillis: 8000, idleTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } }) : null;
let activeDatabaseClient = null;

const PORT = Number(process.env.PORT || 3000);
let ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
let ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'troque-por-uma-senha-forte';
let ADMIN_NAME = process.env.ADMIN_NAME || 'Administrador';
function persistEnvValues(values) {
  const envPath = path.join(ROOT, '.env');
  let lines = [];
  try { lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/); } catch {}
  for (const [key, raw] of Object.entries(values)) {
    if (/[\r\n]/.test(String(raw))) throw new Error('Este valor não pode conter quebras de linha.');
    const encoded = `"${String(raw).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    const index = lines.findIndex(line => new RegExp(`^\\s*${key}\\s*=`).test(line));
    if (index >= 0) lines[index] = `${key}=${encoded}`;
    else lines.push(`${key}=${encoded}`);
    process.env[key] = String(raw);
  }
  const temp = `${envPath}.tmp`;
  fs.writeFileSync(temp, lines.join('\n').replace(/\n+$/, '') + '\n', { mode: 0o600 });
  fs.renameSync(temp, envPath);
}
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => ({
  salt,
  hash: crypto.scryptSync(password, salt, 64).toString('hex')
});

function loadUsers() {
  let users = [];
  try { users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch {}
  const admin = users.find(user => user.role === 'admin' || user.username === ADMIN_USERNAME);
  if (admin) {
    admin.name = ADMIN_NAME;
    admin.username = ADMIN_USERNAME;
    admin.email = ADMIN_EMAIL || admin.email || '';
    admin.role = 'admin';
    if (!databasePool) Object.assign(admin, hashPassword(ADMIN_PASSWORD));
    admin.active = true;
  } else {
    users.unshift({ id: crypto.randomUUID(), name: ADMIN_NAME, username: ADMIN_USERNAME, email: ADMIN_EMAIL, role: 'admin', active: true, avatar: '', ...hashPassword(ADMIN_PASSWORD), createdAt: new Date().toISOString() });
  }
  if (!databasePool) saveUsers(users);
  return users;
}
function saveUsers(users) {
  if (databasePool) return;
  const temp = `${USERS_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(users, null, 2), { mode: 0o600 });
  fs.renameSync(temp, USERS_FILE);
}
let users = loadUsers();
function loadLinks() {
  try {
    const saved = JSON.parse(fs.readFileSync(LINKS_FILE, 'utf8'));
    return Array.isArray(saved) ? saved : [];
  } catch { return []; }
}
function loadList(file) {
  try { const value = JSON.parse(fs.readFileSync(file, 'utf8')); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
function saveList(file, list) {
  if (databasePool) return;
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(list, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
}
function saveLinks(links) {
  if (databasePool) return;
  const temp = `${LINKS_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(links, null, 2), { mode: 0o600 });
  fs.renameSync(temp, LINKS_FILE);
}
let links = loadLinks();
let notifications = loadList(NOTIFICATIONS_FILE);
let payouts = loadList(PAYOUTS_FILE);
let linkFingerprints = new Set(loadList(LINK_FINGERPRINTS_FILE));
let linkActivity = loadList(ACTIVITY_FILE);
let fingerprintsUpdated = false;
for (const link of links) {
  try {
    if (!link.fingerprint) { link.fingerprint = fingerprintUrl(new URL(link.url)); fingerprintsUpdated = true; }
    linkFingerprints.add(link.fingerprint);
  } catch {}
}
if (fingerprintsUpdated) saveLinks(links);
if (!linkActivity.length && links.length) {
  linkActivity = links.map(link => ({ id: link.id, userId: link.userId, createdAt: link.createdAt, status: link.status }));
  saveList(ACTIVITY_FILE, linkActivity);
}
if (linkFingerprints.size) saveList(LINK_FINGERPRINTS_FILE, [...linkFingerprints]);

function initialDatabaseState() {
  if (!users.some(item => item.role === 'admin')) users.unshift({ id: crypto.randomUUID(), name: ADMIN_NAME, username: ADMIN_USERNAME, email: ADMIN_EMAIL, role: 'admin', active: true, avatar: '', ...hashPassword(ADMIN_PASSWORD), createdAt: new Date().toISOString() });
  return { users, links, notifications, payouts, linkFingerprints: [...linkFingerprints], linkActivity, sessions: [...sessions.entries()] };
}
async function withDatabaseState(req, res, url, runHandler = handleApi) {
  const client = await databasePool.connect();
  let responseHead = null;
  let responseCompletion = null;
  let originalHead;
  let originalEnd;
  try {
    await client.query('BEGIN');
    await client.query("select pg_advisory_xact_lock(hashtext('equipe-digital-app-state'))");
    let result = await client.query('select state from equipe_digital_private.app_state where id = 1 for update');
    if (!result.rowCount) {
      const initial = initialDatabaseState();
      await client.query('insert into equipe_digital_private.app_state (id, state) values (1, $1::jsonb) on conflict (id) do nothing', [JSON.stringify(initial)]);
      result = await client.query('select state from equipe_digital_private.app_state where id = 1 for update');
    }
    const state = result.rows[0].state;
    users = Array.isArray(state.users) && state.users.length ? state.users : initialDatabaseState().users;
    links = Array.isArray(state.links) ? state.links : [];
    notifications = Array.isArray(state.notifications) ? state.notifications : [];
    payouts = Array.isArray(state.payouts) ? state.payouts : [];
    linkFingerprints = new Set(Array.isArray(state.linkFingerprints) ? state.linkFingerprints : []);
    linkActivity = Array.isArray(state.linkActivity) ? state.linkActivity : [];
    activeDatabaseClient = client;
    sessions.clear(); for (const [sid, session] of Array.isArray(state.sessions) ? state.sessions : []) sessions.set(sid, session);
    originalHead = res.writeHead.bind(res); originalEnd = res.end.bind(res);
    res.writeHead = function(statusCode, ...args) { responseHead = [statusCode, ...args]; return this; };
    res.end = function(...args) {
      responseCompletion = (async () => {
        try {
          const next = { users, links, notifications, payouts, linkFingerprints: [...linkFingerprints], linkActivity, sessions: [...sessions.entries()] };
          await client.query('update equipe_digital_private.app_state set state = $1::jsonb, updated_at = now() where id = 1', [JSON.stringify(next)]);
          await client.query('COMMIT');
          client.release(); activeDatabaseClient = null;
          if (responseHead) originalHead(...responseHead);
          originalEnd(...args);
        } catch (error) {
          try { await client.query('ROLLBACK'); } catch {}
          client.release(); activeDatabaseClient = null; console.error('Supabase state save failed:', error.message);
          if (!res.headersSent) originalHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          originalEnd(JSON.stringify({ error: 'Não foi possível salvar os dados no Supabase.' }));
        }
      })();
      return this;
    };
    await runHandler(req, res, url);
    if (responseCompletion) await responseCompletion;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    client.release(); activeDatabaseClient = null;
    console.error('Supabase request failed:', error.message);
    json(res, 503, { error: 'Banco Supabase indisponível. Confira DATABASE_URL e a migração.' });
  }
}
function addNotification(userId, eventType, title, message, extras = {}) {
  notifications.unshift({ id: crypto.randomUUID(), userId, eventType, title, message, readAt: null, createdAt: new Date().toISOString(), ...extras });
  if (notifications.length > 4000) notifications.length = 4000;
  saveList(NOTIFICATIONS_FILE, notifications);
}
function moneyLabel(cents) { return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
let lastRejectedCleanup = 0;
function expireOldRejections(force = false) {
  const now = Date.now();
  if (!force && now - lastRejectedCleanup < 60_000) return;
  lastRejectedCleanup = now;
  const cutoff = now - 3 * 24 * 60 * 60 * 1000;
  const kept = links.filter(link => link.status !== 'rejected' || new Date(link.decidedAt || link.createdAt).getTime() > cutoff);
  if (kept.length !== links.length) { links = kept; saveLinks(links); }
}
function fingerprintUrl(parsed) {
  const normalized = new URL(parsed.href);
  normalized.hash = '';
  for (const key of [...normalized.searchParams.keys()]) if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) normalized.searchParams.delete(key);
  normalized.searchParams.sort();
  if (normalized.pathname.length > 1) normalized.pathname = normalized.pathname.replace(/\/+$/, '');
  return crypto.createHash('sha256').update(normalized.href.toLowerCase()).digest('hex');
}

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const publicFiles = new Set(['/index.html', '/styles.css', '/app.js', '/logo-digital.png', '/logo-mark.png']);
const json = (res, status, data, extra = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(JSON.stringify(data));
};
function readBody(req, maxBytes = 16_384) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let tooLarge = false;
    req.on('data', chunk => {
      if (tooLarge) return;
      raw += chunk;
      if (Buffer.byteLength(raw) > maxBytes) { tooLarge = true; raw = ''; reject(new Error('Requisição muito grande')); }
    });
    req.on('end', () => { if (tooLarge) return; try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('Dados inválidos')); } });
    req.on('error', reject);
  });
}
function cookie(req, key) {
  const value = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${key}=`));
  return value ? decodeURIComponent(value.slice(key.length + 1)) : '';
}
function sessionFor(req) {
  const sid = cookie(req, 'eq_session');
  const session = sessions.get(sid);
  if (!session) return null;
  if (session.expires < Date.now()) { sessions.delete(sid); return null; }
  return { sid, session };
}
function currentUser(session) { return users.find(user => user.id === session.userId && user.active); }
function csrfOkay(req, session) { return req.headers['x-csrf-token'] === session.csrf; }
function cleanUser(user) { return user ? { id: user.id, name: user.name, username: user.username, email: user.email || '', avatar: user.avatar || '', role: user.role, active: user.active, createdAt: user.createdAt } : null; }
function linkRateFor(user) { return Number.isInteger(user?.linkValueCents) && user.linkValueCents >= 0 ? user.linkValueCents : 5000; }
function linkValueFor(link) { return Number.isInteger(link.valueCents) && link.valueCents >= 0 ? link.valueCents : 5000; }
function balanceFor(userId) { return links.filter(link => link.userId === userId && link.status === 'approved').reduce((total, link) => total + linkValueFor(link), 0); }
function teamBalance() { return links.filter(link => link.status === 'approved').reduce((total, link) => total + linkValueFor(link), 0); }
function adminLinkRateFor(admin) { return Number.isInteger(admin?.adminLinkValueCents) && admin.adminLinkValueCents >= 0 ? admin.adminLinkValueCents : 5000; }
function adminApprovedLinkCount(admin) {
  const memberHistory = users.filter(member => member.role !== 'admin').reduce((total, member) => total + Math.max(0, Number(member.approvedLinks) || 0), 0);
  const recordedHistory = links.filter(link => link.status === 'approved').length + payouts.reduce((total, payout) => total + (Array.isArray(payout.linkIds) ? payout.linkIds.length : 0), 0);
  const estimate = Math.max(memberHistory, recordedHistory);
  if (!Number.isInteger(admin.approvedLinksTotal) || admin.approvedLinksTotal < estimate) {
    admin.approvedLinksTotal = estimate;
    saveUsers(users);
  }
  return admin.approvedLinksTotal;
}
function adminPersonalBalance(admin) {
  if (!Number.isInteger(admin.personalBalanceCents) || admin.personalBalanceCents < 0) {
    admin.personalBalanceCents = adminApprovedLinkCount(admin) * adminLinkRateFor(admin);
    saveUsers(users);
  }
  return admin.personalBalanceCents;
}
function cleanLink(link) {
  return { id: link.id, publicId: link.publicId, userId: link.userId, userName: link.userName, username: link.username, label: link.label, url: link.url, status: link.status, valueCents: link.status === 'approved' ? linkValueFor(link) : 0, createdAt: link.createdAt, decidedAt: link.decidedAt || null, decidedBy: link.decidedBy || null, reason: link.reason || '' };
}
function createSession(user, remember, previous = null) {
  const sid = crypto.randomBytes(32).toString('hex');
  const csrf = crypto.randomBytes(24).toString('hex');
  const expires = Date.now() + (remember ? 30 : 1) * 24 * 60 * 60 * 1000;
  sessions.set(sid, { userId: user.id, csrf, expires, originalUserId: previous?.originalUserId || null, adminMode: previous?.adminMode || false });
  return { sid, csrf, expires, remember };
}
const cookieHeader = (sid, remember, secure = false) => `eq_session=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${remember ? 2592000 : 86400}${secure ? '; Secure' : ''}`;
const safeEqual = (a, b) => { try { return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex')); } catch { return false; } };

async function handleApi(req, res, url) {
  if (req.method === 'POST' && url.pathname === '/api/login') {
    let body;
    try { body = await readBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    let user = users.find(item => (item.username === username || item.email?.toLowerCase() === username) && item.active);
    // The database may have been seeded locally before the Vercel environment
    // variables were set. Let the configured environment credentials recover
    // the administrator account and persist the matching password hash.
    const isEnvironmentAdmin = username === ADMIN_USERNAME || (ADMIN_EMAIL && username === ADMIN_EMAIL);
    if (isEnvironmentAdmin && password === ADMIN_PASSWORD) {
      const administrator = users.find(item => item.role === 'admin' && item.active);
      if (administrator) {
        user = administrator;
        Object.assign(user, { name: ADMIN_NAME, username: ADMIN_USERNAME, email: ADMIN_EMAIL || user.email || '', ...hashPassword(password) });
        saveUsers(users);
      }
    }
    const candidate = crypto.scryptSync(password.slice(0, 256), user?.salt || 'invalid-user-salt', 64).toString('hex');
    if (!user || !safeEqual(candidate, user.hash)) return json(res, 401, { error: 'Usuário ou senha incorretos.' });
    const created = createSession(user, Boolean(body.remember));
    return json(res, 200, { user: cleanUser(user), csrf: created.csrf }, { 'Set-Cookie': cookieHeader(created.sid, created.remember, process.env.NODE_ENV === 'production') });
  }
  const found = sessionFor(req);
  const user = found && currentUser(found.session);
  if (url.pathname === '/api/session' && req.method === 'GET') {
    return json(res, 200, { user: user ? cleanUser(user) : null, csrf: user ? found.session.csrf : null, impersonating: Boolean(found?.session.adminMode), returnUser: found?.session.originalUserId ? cleanUser(users.find(item => item.id === found.session.originalUserId) || {}) : null });
  }
  if (url.pathname === '/api/logout' && req.method === 'POST') {
    if (found && csrfOkay(req, found.session)) sessions.delete(found.sid);
    return json(res, 200, { ok: true }, { 'Set-Cookie': 'eq_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' });
  }
  if (!user) return json(res, 401, { error: 'Faça login para continuar.' });
  if (!found || !csrfOkay(req, found.session)) return json(res, 403, { error: 'Sessão inválida. Atualize a página.' });
  if (url.pathname === '/api/dashboard' && req.method === 'GET') {
    const active = users.filter(item => item.active).length;
    const recent = [...users].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4).map(cleanUser);
    const userLinks = links.filter(link => link.userId === user.id);
    const approvedCount = userLinks.filter(link => link.status === 'approved').length;
    const balanceCents = user.role === 'admin' ? teamBalance() : balanceFor(user.id);
    const personalApprovedCount = user.role === 'admin' ? adminApprovedLinkCount(user) : 0;
    const personalBalanceCents = user.role === 'admin' ? adminPersonalBalance(user) : 0;
    const pendingCount = user.role === 'admin' ? links.filter(link => link.status === 'pending').length : userLinks.filter(link => link.status === 'pending').length;
    return json(res, 200, { user: cleanUser(user), stats: [{ label: 'Pessoas na equipe', value: String(active).padStart(2, '0'), detail: 'contas ativas', icon: 'people' }, { label: user.role === 'admin' ? 'Links pendentes' : 'Seus links', value: String(user.role === 'admin' ? pendingCount : userLinks.length).padStart(2, '0'), detail: user.role === 'admin' ? 'aguardando análise' : 'sem limite de envio', icon: 'shield' }, { label: user.role === 'admin' ? 'Saldo aprovado da equipe' : 'Saldo ilustrativo', value: (balanceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), detail: user.role === 'admin' ? 'disponível para pagamentos' : `${approvedCount} links aprovados`, icon: 'spark' }, ...(user.role === 'admin' ? [{ label: 'Meu saldo pessoal', value: (personalBalanceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), detail: `${personalApprovedCount} links da equipe · ${moneyLabel(adminLinkRateFor(user))} por link`, icon: 'spark' }] : [])], members: recent, admin: user.role === 'admin', balanceCents, personalBalanceCents, personalApprovedCount, adminLinkValueCents: user.role === 'admin' ? adminLinkRateFor(user) : null, approvedCount, pendingCount, impersonating: found.session.adminMode });
  }
  if (url.pathname === '/api/return-admin' && req.method === 'POST') {
    const admin = users.find(item => item.id === found.session.originalUserId && item.role === 'admin' && item.active);
    if (!found.session.adminMode || !admin) return json(res, 400, { error: 'Não há sessão administrativa para retomar.' });
    const created = createSession(admin, true);
    return json(res, 200, { user: cleanUser(admin), csrf: created.csrf }, { 'Set-Cookie': cookieHeader(created.sid, true, process.env.NODE_ENV === 'production') });
  }
  if (url.pathname === '/api/links' && req.method === 'GET') {
    expireOldRejections();
    const requestedUserId = url.searchParams.get('userId');
    if (user.role === 'admin' && requestedUserId && requestedUserId !== 'all') {
      const target = users.find(item => item.id === requestedUserId);
      if (!target) return json(res, 404, { error: 'Usuário não encontrado.' });
    }
    const visible = links.filter(link => user.role === 'admin' ? (!requestedUserId || requestedUserId === 'all' || link.userId === requestedUserId) : link.userId === user.id)
      .sort((a, b) => Number(a.status !== 'pending') - Number(b.status !== 'pending') || b.createdAt.localeCompare(a.createdAt));
    const rateUser = user.role === 'admin' ? users.find(member => member.id === requestedUserId) : user;
    return json(res, 200, { links: visible.map(cleanLink), balanceCents: user.role === 'admin' ? (requestedUserId && requestedUserId !== 'all' ? balanceFor(requestedUserId) : teamBalance()) : balanceFor(user.id), valuePerLinkCents: rateUser ? linkRateFor(rateUser) : null, pendingCount: visible.filter(link => link.status === 'pending').length });
  }
  if (url.pathname === '/api/links' && req.method === 'POST') {
    expireOldRejections();
    let body;
    try { body = await readBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const value = String(body.url || '').trim();
    if (!value || value.length > 2048) return json(res, 400, { error: 'Informe um link com até 2.048 caracteres.' });
    let parsed;
    try { parsed = new URL(value); } catch { return json(res, 400, { error: 'Confira o formato do link e tente novamente.' }); }
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return json(res, 400, { error: 'Use um link público iniciado por http:// ou https://.' });
    const fingerprint = fingerprintUrl(parsed);
    if (linkFingerprints.has(fingerprint)) return json(res, 409, { error: 'Este link já foi enviado anteriormente.' });
    const label = String(body.label || '').trim().slice(0, 120);
    const created = { id: crypto.randomUUID(), publicId: `ED-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`, userId: user.id, userName: user.name, username: user.username, label, url: parsed.href, fingerprint, status: 'pending', createdAt: new Date().toISOString(), decidedAt: null, decidedBy: null, reason: '' };
    links.push(created); saveLinks(links);
    linkActivity.push({ id: created.id, userId: user.id, createdAt: created.createdAt, status: 'pending' }); saveList(ACTIVITY_FILE, linkActivity);
    user.submittedLinks = (user.submittedLinks || 0) + 1; saveUsers(users);
    linkFingerprints.add(fingerprint); saveList(LINK_FINGERPRINTS_FILE, [...linkFingerprints]);
    addNotification(users.find(item => item.role === 'admin')?.id, 'new-link', 'Novo link enviado', `${user.name} enviou ${created.publicId}.`, { linkId: created.id });
    return json(res, 201, { link: cleanLink(created) });
  }
  if (url.pathname === '/api/notifications' && req.method === 'GET') {
    const own = notifications.filter(item => item.userId === user.id).slice(0, 100);
    return json(res, 200, { notifications: own, unread: own.filter(item => !item.readAt).length });
  }
  if (url.pathname === '/api/notifications/read' && req.method === 'POST') {
    for (const item of notifications) if (item.userId === user.id && !item.readAt) item.readAt = new Date().toISOString();
    saveList(NOTIFICATIONS_FILE, notifications);
    return json(res, 200, { ok: true });
  }
  if (url.pathname === '/api/activity' && req.method === 'GET') {
    expireOldRejections();
    const requested = url.searchParams.get('userId');
    const selected = user.role === 'admin' && requested && requested !== 'all' ? requested : null;
    const scoped = linkActivity.filter(item => selected ? item.userId === selected : user.role === 'admin' ? true : item.userId === user.id);
    const days = Array.from({ length: 7 }, (_, index) => { const day = new Date(); day.setHours(0,0,0,0); day.setDate(day.getDate() - (6-index)); const key = day.toISOString().slice(0,10); const entries = scoped.filter(item => item.createdAt.slice(0,10) === key); return { label: new Intl.DateTimeFormat('pt-BR',{weekday:'short'}).format(day).replace('.',''), count: entries.length, approved: entries.filter(item=>item.status==='approved').length }; });
    return json(res, 200, { days, links: scoped.length, approved: scoped.filter(item=>item.status==='approved').length });
  }
  if (url.pathname === '/api/ranking' && req.method === 'GET') {
    const ranking = users.filter(item => item.role !== 'admin').map(member => { const mine = links.filter(item => item.userId === member.id); return { ...cleanUser(member), submitted: Math.max(member.submittedLinks||0,mine.length), approved: Math.max(member.approvedLinks||0,mine.filter(item => item.status === 'approved').length), pending: mine.filter(item => item.status === 'pending').length }; }).sort((a,b) => b.submitted-a.submitted || b.approved-a.approved || a.name.localeCompare(b.name));
    return json(res, 200, { ranking });
  }
  if (url.pathname === '/api/payouts' && req.method === 'GET') {
    if (user.role !== 'admin') return json(res, 403, { error: 'Apenas o administrador pode consultar pagamentos.' });
    return json(res, 200, { payouts: payouts.slice(0,100), balances: users.filter(item=>item.role!=='admin').map(member=>({ userId:member.id, name:member.name, username:member.username, avatar:member.avatar, linkValueCents:linkRateFor(member), approvedCount:links.filter(link=>link.userId===member.id&&link.status==='approved').length, balanceCents:balanceFor(member.id) })) });
  }
  if (url.pathname === '/api/payouts' && req.method === 'POST') {
    if (user.role !== 'admin' || found.session.adminMode) return json(res, 403, { error: 'Apenas o administrador pode registrar pagamentos.' });
    let body; try { body = await readBody(req); } catch (error) { return json(res,400,{error:error.message}); }
    const target = users.find(item=>item.id===String(body.userId||'') && item.role!=='admin');
    if (!target) return json(res,404,{error:'Conta não encontrada.'});
    const paidLinks = links.filter(item=>item.userId===target.id && item.status==='approved');
    if (!paidLinks.length) return json(res,400,{error:'Esta pessoa não tem saldo aprovado para registrar.'});
    const record = { id:crypto.randomUUID(), userId:target.id, userName:target.name, username:target.username, linkIds:paidLinks.map(item=>item.publicId), amountCents:paidLinks.reduce((total, item)=>total+linkValueFor(item),0), createdAt:new Date().toISOString(), paidBy:user.id };
    links=links.filter(item=>!paidLinks.includes(item)); saveLinks(links);
    payouts.unshift(record); if(payouts.length>2000)payouts.length=2000; saveList(PAYOUTS_FILE,payouts);
    addNotification(target.id,'payout','Pagamento registrado',`${moneyLabel(record.amountCents)} registrado para ${record.linkIds.length} links aprovados.`,{ payoutId:record.id });
    return json(res,200,{ payout:record });
  }
  if (url.pathname === '/api/admin/personal-rate' && req.method === 'PATCH') {
    if (user.role !== 'admin' || found.session.adminMode) return json(res, 403, { error: 'Apenas o administrador pode alterar o próprio valor por link.' });
    let body;
    try { body = await readBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const rateCents = Number(body.rateCents);
    if (!Number.isInteger(rateCents) || rateCents < 1 || rateCents > 10_000_000) return json(res, 400, { error: 'O valor por link deve estar entre R$ 0,01 e R$ 100.000,00.' });
    const approvedCount = adminApprovedLinkCount(user);
    const balanceCents = adminPersonalBalance(user);
    user.adminLinkValueCents = rateCents;
    saveUsers(users);
    return json(res, 200, { rateCents, approvedCount, balanceCents });
  }
  const linkDecisionId = url.pathname.match(/^\/api\/links\/([^/]+)\/decision$/)?.[1];
  if (linkDecisionId && req.method === 'POST') {
    if (user.role !== 'admin' || found.session.adminMode) return json(res, 403, { error: 'Apenas a administração pode analisar links.' });
    let body;
    try { body = await readBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const link = links.find(item => item.id === linkDecisionId);
    if (!link) return json(res, 404, { error: 'Link não encontrado.' });
    if (link.status !== 'pending') return json(res, 409, { error: 'Este link já foi analisado.' });
    if (!['approved', 'rejected'].includes(body.status)) return json(res, 400, { error: 'Escolha aprovar ou desaprovar o link.' });
    const admin = body.status === 'approved' ? users.find(item => item.role === 'admin') : null;
    const adminApprovedCountBefore = admin ? adminApprovedLinkCount(admin) : 0;
    const adminPersonalBalanceBefore = admin ? adminPersonalBalance(admin) : 0;
    link.status = body.status;
    link.decidedAt = new Date().toISOString();
    link.decidedBy = user.id;
    link.reason = body.status === 'rejected' ? String(body.reason || '').trim().slice(0, 240) : '';
    if(body.status==='approved'){const owner=users.find(item=>item.id===link.userId);link.valueCents=linkRateFor(owner);if(owner){owner.approvedLinks=(owner.approvedLinks||0)+1}if(admin){admin.approvedLinksTotal=adminApprovedCountBefore+1;admin.personalBalanceCents=adminPersonalBalanceBefore+adminLinkRateFor(admin);saveUsers(users)}}
    const activity = linkActivity.find(item=>item.id===link.id); if(activity){activity.status=link.status;saveList(ACTIVITY_FILE,linkActivity)}
    saveLinks(links);
    addNotification(link.userId, body.status === 'approved' ? 'link-approved' : 'link-rejected', body.status === 'approved' ? 'Link aprovado' : 'Link desaprovado', `${link.publicId} foi ${body.status === 'approved' ? `aprovado · ${moneyLabel(link.valueCents)}` : 'desaprovado'}${link.reason ? `: ${link.reason}` : '.'}`, { linkId: link.id });
    return json(res, 200, { link: cleanLink(link), balanceCents: balanceFor(link.userId) });
  }
  if (url.pathname === '/api/profile' && req.method === 'PATCH') {
    let body;
    try { body = await readBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const name = String(body.name || '').trim();
    const username = String(body.username || '').trim().toLowerCase();
    const email = String(body.email || '').trim().toLowerCase();
    if (name.length < 2 || name.length > 80 || /[\x00-\x1f]/.test(name)) return json(res, 400, { error: 'Informe um nome entre 2 e 80 caracteres.' });
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) return json(res, 400, { error: 'O nome de usuário deve ter de 3 a 32 caracteres: letras, números, ponto, hífen ou sublinhado.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json(res, 400, { error: 'Informe um endereço de e-mail válido.' });
    if (users.some(item => item.id !== user.id && item.username.toLowerCase() === username)) return json(res, 409, { error: 'Este nome de usuário já está em uso.' });
    if (users.some(item => item.id !== user.id && item.email && item.email.toLowerCase() === email)) return json(res, 409, { error: 'Este e-mail já está em uso.' });
    try {
      if (user.role === 'admin') {
        if (!databasePool) persistEnvValues({ ADMIN_NAME: name, ADMIN_USERNAME: username, ADMIN_EMAIL: email });
        ADMIN_NAME = name; ADMIN_USERNAME = username; ADMIN_EMAIL = email;
      }
    } catch (error) { return json(res, 500, { error: `Não foi possível salvar as configurações do administrador: ${error.message}` }); }
    Object.assign(user, { name, username, email });
    saveUsers(users);
    return json(res, 200, { user: cleanUser(user) });
  }
  if (url.pathname === '/api/profile/password' && req.method === 'PATCH') {
    let body;
    try { body = await readBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const currentPassword = String(body.currentPassword || '');
    const newPassword = String(body.newPassword || '');
    const confirmation = String(body.confirmPassword || '');
    if (user.role !== 'admin') {
      if (currentPassword.length > 128) return json(res, 400, { error: 'A senha atual está incorreta.' });
      const suppliedHash = crypto.scryptSync(currentPassword, user.salt, 64).toString('hex');
      if (!safeEqual(suppliedHash, user.hash)) return json(res, 401, { error: 'A senha atual está incorreta.' });
    }
    if (newPassword.length < 8 || newPassword.length > 128 || /[\r\n]/.test(newPassword)) return json(res, 400, { error: 'A nova senha deve ter de 8 a 128 caracteres.' });
    if (newPassword !== confirmation) return json(res, 400, { error: 'A confirmação não corresponde à nova senha.' });
    if (user.role === 'admin') {
      try { if (!databasePool) persistEnvValues({ ADMIN_PASSWORD: newPassword }); ADMIN_PASSWORD = newPassword; }
      catch (error) { return json(res, 500, { error: `Não foi possível salvar a senha do administrador no .env: ${error.message}` }); }
    }
    Object.assign(user, hashPassword(newPassword));
    saveUsers(users);
    for (const [sid, session] of sessions) {
      if (sid !== found.sid && (session.userId === user.id || session.originalUserId === user.id)) sessions.delete(sid);
    }
    return json(res, 200, { ok: true });
  }
  if (url.pathname === '/api/profile/avatar' && req.method === 'POST') {
    let body;
    try { body = await readBody(req, 4_500_000); } catch (error) { return json(res, 413, { error: 'A foto precisa ter até 3 MB.' }); }
    const data = String(body.data || '');
    const match = data.match(/^data:image\/(png|jpeg|webp);base64,([a-zA-Z0-9+/]+={0,2})$/);
    if (!match || data.length > 4_200_000) return json(res, 400, { error: 'Use uma foto PNG, JPG ou WebP de até 3 MB.' });
    const mimeType = match[1];
    const bytes = Buffer.from(match[2], 'base64');
    const valid = mimeType === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : mimeType === 'jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
    if (!valid || bytes.length > 3_145_728) return json(res, 400, { error: 'O arquivo não parece ser uma foto PNG, JPG ou WebP válida.' });
    const extension = mimeType === 'jpeg' ? 'jpg' : mimeType;
    if (databasePool) {
      await activeDatabaseClient.query('delete from equipe_digital_private.avatars where path like $1', [`/avatars/${user.id}.%`]);
      await activeDatabaseClient.query('insert into equipe_digital_private.avatars (path, content) values ($1, $2)', [`/avatars/${user.id}.${extension}`, bytes]);
    }
    else {
      const avatarDir = path.join(DATA_DIR, 'avatars');
      fs.mkdirSync(avatarDir, { recursive: true });
      for (const ext of ['png', 'jpg', 'webp']) { try { fs.unlinkSync(path.join(avatarDir, `${user.id}.${ext}`)); } catch {} }
      fs.writeFileSync(path.join(avatarDir, `${user.id}.${extension}`), bytes, { mode: 0o600 });
    }
    user.avatar = `/avatars/${user.id}.${extension}`;
    saveUsers(users);
    return json(res, 200, { user: cleanUser(user) });
  }
  if (url.pathname === '/api/profile/avatar' && req.method === 'DELETE') {
    const avatarDir = path.join(DATA_DIR, 'avatars');
    if (databasePool) await activeDatabaseClient.query('delete from equipe_digital_private.avatars where path like $1', [`/avatars/${user.id}.%`]);
    else for (const ext of ['png', 'jpg', 'webp']) { try { fs.unlinkSync(path.join(avatarDir, `${user.id}.${ext}`)); } catch {} }
    user.avatar = '';
    saveUsers(users);
    return json(res, 200, { user: cleanUser(user) });
  }
  if (user.role !== 'admin' || found.session.adminMode) return json(res, 403, { error: 'Apenas o administrador pode gerenciar contas.' });
  if (url.pathname === '/api/users' && req.method === 'GET') return json(res, 200, { users: users.map(member => ({ ...cleanUser(member), ...(member.role === 'admin' ? {} : { linkValueCents: linkRateFor(member) }) })) });
  if (url.pathname === '/api/users' && req.method === 'POST') {
    let body;
    try { body = await readBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const name = String(body.name || '').trim();
    const username = String(body.username || '').trim().toLowerCase();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (name.length < 2 || name.length > 80) return json(res, 400, { error: 'Informe um nome entre 2 e 80 caracteres.' });
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) return json(res, 400, { error: 'O login deve ter 3 a 32 caracteres: letras, números, ponto, hífen ou sublinhado.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json(res, 400, { error: 'Informe um endereço de e-mail válido.' });
    if (password.length < 8 || password.length > 128) return json(res, 400, { error: 'A senha deve ter pelo menos 8 caracteres.' });
    if (users.some(item => item.username === username)) return json(res, 409, { error: 'Este login já está em uso.' });
    if (users.some(item => (item.email || '').toLowerCase() === email)) return json(res, 409, { error: 'Este e-mail já está cadastrado.' });
    const created = { id: crypto.randomUUID(), name, username, email, role: 'user', active: true, avatar: '', linkValueCents: 5000, ...hashPassword(password), createdAt: new Date().toISOString() };
    users.push(created); saveUsers(users);
    return json(res, 201, { user: cleanUser(created) });
  }
  const impersonateId = url.pathname.match(/^\/api\/users\/([^/]+)\/impersonate$/)?.[1];
  if (impersonateId && req.method === 'POST') {
    const target = users.find(item => item.id === impersonateId && item.active && item.role !== 'admin');
    if (!target) return json(res, 404, { error: 'Conta ativa não encontrada.' });
    const created = createSession(target, true, { originalUserId: user.id, adminMode: true });
    return json(res, 200, { user: cleanUser(target), csrf: created.csrf }, { 'Set-Cookie': cookieHeader(created.sid, true, process.env.NODE_ENV === 'production') });
  }
  const targetId = url.pathname.match(/^\/api\/users\/([^/]+)$/)?.[1];
  if (targetId && req.method === 'PATCH') {
    let body;
    try { body = await readBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const target = users.find(item => item.id === targetId && item.role !== 'admin');
    if (!target) return json(res, 404, { error: 'Conta não encontrada.' });
    if (body.active === false && target.id === user.id) return json(res, 400, { error: 'Não é possível desativar a conta em uso.' });
    if (typeof body.active === 'boolean') target.active = body.active;
    if (Object.hasOwn(body, 'linkValueCents')) {
      const linkValueCents = Number(body.linkValueCents);
      if (!Number.isInteger(linkValueCents) || linkValueCents < 1 || linkValueCents > 10_000_000) return json(res, 400, { error: 'O valor por link deve estar entre R$ 0,01 e R$ 100.000,00.' });
      target.linkValueCents = linkValueCents;
    }
    if (body.password) {
      if (String(body.password).length < 8) return json(res, 400, { error: 'A nova senha deve ter pelo menos 8 caracteres.' });
      Object.assign(target, hashPassword(String(body.password)));
    }
    saveUsers(users); return json(res, 200, { user: cleanUser(target) });
  }
  if (targetId && req.method === 'DELETE') {
    const index = users.findIndex(item => item.id === targetId && item.role !== 'admin');
    if (index < 0) return json(res, 404, { error: 'Conta não encontrada.' });
    const [removed] = users.splice(index, 1); saveUsers(users);
    const removedLinkIds = new Set(links.filter(item => item.userId === removed.id).map(item => item.id));
    links = links.filter(item => item.userId !== removed.id); saveLinks(links);
    linkActivity = linkActivity.filter(item => item.userId !== removed.id); saveList(ACTIVITY_FILE, linkActivity);
    notifications = notifications.filter(item => item.userId !== removed.id && !removedLinkIds.has(item.linkId)); saveList(NOTIFICATIONS_FILE, notifications);
    payouts = payouts.filter(item => item.userId !== removed.id); saveList(PAYOUTS_FILE, payouts);
    if (databasePool) await activeDatabaseClient.query('delete from equipe_digital_private.avatars where path like $1', [`/avatars/${removed.id}.%`]);
    else for (const ext of ['png', 'jpg', 'webp']) { try { fs.unlinkSync(path.join(DATA_DIR, 'avatars', `${removed.id}.${ext}`)); } catch {} }
    for (const [sid, session] of sessions) if (session.userId === removed.id) sessions.delete(sid);
    for (const [sid, session] of sessions) if (session.originalUserId === removed.id) sessions.delete(sid);
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: 'Rota não encontrada.' });
}

async function handleAvatar(req, res, pathname) {
  const avatarMatch = pathname.match(/^\/avatars\/([0-9a-f-]{36})\.(png|jpg|webp)$/);
  const viewerSession = sessionFor(req);
  if (!avatarMatch || !viewerSession || !currentUser(viewerSession.session)) return json(res, 401, { error: 'Faça login para ver esta foto.' });
  if (!users.some(item => item.avatar === pathname)) return json(res, 404, { error: 'Foto não encontrada.' });
  const avatarFile = path.join(DATA_DIR, 'avatars', `${avatarMatch[1]}.${avatarMatch[2]}`);
  const send = content => {
    if (!content) return json(res, 404, { error: 'Foto não encontrada.' });
    res.writeHead(200, { 'Content-Type': avatarMatch[2] === 'jpg' ? 'image/jpeg' : `image/${avatarMatch[2]}`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=3600' });
    res.end(content);
  };
  if (databasePool) {
    const result = await activeDatabaseClient.query('select content from equipe_digital_private.avatars where path = $1', [pathname]);
    return send(result.rows[0]?.content || null);
  }
  return fs.readFile(avatarFile, (error, content) => send(error ? null : content));
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    if (process.env.VERCEL && !databasePool) return json(res, 503, { error: 'Banco de dados não configurado. Defina DATABASE_URL nas variáveis da Vercel.' });
    return databasePool ? withDatabaseState(req, res, url) : handleApi(req, res, url).catch(error => { console.error(error); json(res, 500, { error: 'Erro interno. Tente novamente.' }); });
  }
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const avatarMatch = pathname.match(/^\/avatars\/([0-9a-f-]{36})\.(png|jpg|webp)$/);
  if (avatarMatch) return databasePool ? withDatabaseState(req, res, url, () => handleAvatar(req, res, pathname)) : handleAvatar(req, res, pathname);
  if (!publicFiles.has(pathname)) return json(res, 404, { error: 'Não encontrado.' });
  const file = path.resolve(PUBLIC_DIR, `.${pathname}`);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return json(res, 404, { error: 'Não encontrado.' });
  fs.readFile(file, (error, content) => {
    if (error) return json(res, 404, { error: 'Não encontrado.' });
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY', 'Cache-Control': ['.html', '.js', '.css'].includes(ext) ? 'no-cache' : 'public, max-age=3600' });
    res.end(content);
  });
}

module.exports = handleRequest;
if (require.main === module) {
  const server = http.createServer(handleRequest);
  const rejectionCleanupTimer = setInterval(() => expireOldRejections(), 60_000);
  rejectionCleanupTimer.unref();
  server.listen(PORT, () => console.log(`Equipe Digital disponível em http://localhost:${PORT}`));
}
