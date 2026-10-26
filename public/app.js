const app = document.querySelector('#app');
const toast = document.querySelector('#toast');
let csrf = null;
let current = null;
let dashboardData = null;
let members = [];
let linkItems = [];
let selectedLinkUser = 'all';
let selectedLinkStatus = 'all';
let activityUserFilter = 'all';
let linksBalanceCents = 0;
let linksPendingCount = 0;
let valuePerLinkCents = 5000;
let notifications = [];
let unreadNotifications = 0;
let activityData = { days: [] };
let rankingData = [];
let payoutData = { payouts: [], balances: [] };
let notificationsTimer = null;
let notificationIds = new Set();
let activeView = 'overview';
let toastTimer;

const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
  camera: '<path d="M14 5h-4l-2 3H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-3l-2-3Z"/><circle cx="12" cy="13" r="3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.4.8l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.4-.8l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.7l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.4-.8l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.4.8l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.7Z" transform="translate(-1 -1)"/>',
  x: '<path d="m18 6-12 12M6 6l12 12"/>',
  spark: '<path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2L12 3Z"/><path d="m19 14 1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1L19 14Z"/>',
  shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
  chart: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-5 5"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  close: '<path d="m18 6-12 12M6 6l12 12"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/>',
  wave: '<path d="M2 12h3l3-8 4 16 4-12 3 4h3"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
};
const svg = (name, size = 17) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.spark}</svg>`;
const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const dateFmt = value => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}
let notificationAudioContext = null;
async function playNotificationSound(force = false) {
  if (!force && localStorage.getItem('eq_sound_notifications') === 'false') return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    notificationAudioContext ||= new AudioContextClass();
    const context = notificationAudioContext;
    if (context.state === 'suspended') await context.resume();
    const start = context.currentTime;
    // A short, bright three-note chime at a comfortable notification level.
    [{ hz: 880, at: 0, length: .19 }, { hz: 1175, at: .14, length: .23 }, { hz: 1047, at: .34, length: .28 }].forEach(note => {
      for (const [ratio, level, type] of [[1, .24, 'sine'], [2, .055, 'triangle']]) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const when = start + note.at;
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(note.hz * ratio, when);
        gain.gain.setValueAtTime(.0001, when);
        gain.gain.linearRampToValueAtTime(level, when + .018);
        gain.gain.exponentialRampToValueAtTime(.0001, when + note.length);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(when);
        oscillator.stop(when + note.length + .015);
      }
    });
  } catch {}
}
function notificationMarkup() { return `<div class="notification-head"><strong>Notificações</strong>${unreadNotifications?'<button class="action-link" id="mark-notifications-read">Marcar como lidas</button>':''}</div>${notifications.length?notifications.slice(0,12).map(item=>`<div class="notification-row ${item.readAt?'':'unread'}"><span class="notification-dot"></span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.message)}</small><time>${dateFmt(item.createdAt)}</time></span></div>`).join(''):'<div class="notification-empty">Tudo em dia. As novidades da equipe aparecerão aqui.</div>'}`; }
async function refreshNotifications(playSound=true) {
  if(!current)return; try { const result=await api('/api/notifications',{headers:{'X-CSRF-Token':csrf}}); const incoming=(result.notifications||[]).filter(item=>!notificationIds.has(item.id)); if(notificationIds.size&&incoming.length&&playSound){playNotificationSound();notify(incoming[0].title)} notifications=result.notifications||[];unreadNotifications=result.unread||0;notificationIds=new Set(notifications.map(item=>item.id));const badge=document.querySelector('#notification-count');if(badge){badge.textContent=unreadNotifications>9?'9+':String(unreadNotifications);badge.hidden=!unreadNotifications}const panel=document.querySelector('#notification-panel');if(panel){panel.innerHTML=notificationMarkup();panel.querySelector('#mark-notifications-read')?.addEventListener('click',async()=>{try{await api('/api/notifications/read',{method:'POST',body:'{}'});await refreshNotifications(false)}catch(error){notify(error.message)}})} }catch{}
}
function bindNotificationActions() {
 document.querySelector('#notification-toggle')?.addEventListener('click',async()=>{const panel=document.querySelector('#notification-panel');panel?.classList.toggle('open');if(panel?.classList.contains('open'))await refreshNotifications(false)});
 document.querySelector('#mark-notifications-read')?.addEventListener('click',async()=>{try{await api('/api/notifications/read',{method:'POST',body:'{}'});await refreshNotifications(false)}catch(error){notify(error.message)}});
}
async function api(url, options = {}) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(csrf && options.method !== 'GET' || csrf && options.headers?.['X-CSRF-Token'] ? { 'X-CSRF-Token': csrf } : {}), ...options.headers };
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options, headers });
  let data;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) {
    const fallback = response.status === 404
      ? 'A API do sistema não foi encontrada nesta implantação. Aguarde a publicação mais recente da Vercel.'
      : `O servidor não concluiu a solicitação (erro ${response.status}). Tente novamente em instantes.`;
    throw Object.assign(new Error(data.error || fallback), { status: response.status });
  }
  return data;
}

function brand(mobile = false) {
  return `<div class="brand ${mobile ? 'login-brand-mobile' : ''}"><div class="brand-mark"><img src="/logo-mark.png?v=3" alt="" aria-hidden="true"></div><div><div class="brand-title">Equipe Digital</div><span class="brand-sub">workspace privado</span></div></div>`;
}
function renderLogin() {
  const saved = localStorage.getItem('eq_saved_login') || '';
  app.innerHTML = `<main class="login-screen">
    <section class="login-art">${brand()}<div class="art-center"><div class="orb-wrap"><div class="orb-halo one"></div><div class="orb-halo two"></div><div class="orb-line"></div><div class="orb-line second"></div><div class="orb"></div></div><div class="art-copy"><span class="art-kicker">Um só time. Em sintonia.</span><h1>Seu trabalho merece um espaço <span>à altura.</span></h1><p>Um ambiente privado para conectar pessoas, organizar a operação e transformar boas ideias em movimento.</p></div></div><div class="art-foot"><span>© ${new Date().getFullYear()} Equipe Digital</span><span class="connection"><i></i> Ambiente seguro</span></div></section>
    <section class="login-side"><div class="login-card">${brand(true)}<div class="login-eyebrow">Acesso à equipe</div><h2>Bom ter você por aqui.</h2><p class="login-lead">Entre com os dados da sua conta para acessar seu espaço de trabalho.</p><form id="login-form"><div class="field"><label for="username">Nome de usuário ou e-mail</label><input id="username" name="username" autocomplete="username" placeholder="Seu usuário ou e-mail" value="${escapeHtml(saved)}" required autofocus></div><div class="field"><label for="password">Senha</label><div class="input-wrap"><input class="has-toggle" id="password" name="password" type="password" autocomplete="current-password" placeholder="Sua senha" required><button class="password-toggle" id="show-password" type="button">Mostrar</button></div></div><div class="form-row"><label class="check-label"><input id="remember-login" type="checkbox" ${saved ? 'checked' : ''}> Lembrar meu login neste aparelho</label><span>Área restrita</span></div><div class="login-error" id="login-error"></div><button class="primary-btn login-submit" id="login-submit" type="submit">Entrar no espaço ${svg('arrow', 15)}</button></form><div class="secure-note">${svg('lock', 14)} Acesso protegido e exclusivo para convidados</div><div class="login-note">As contas são disponibilizadas pela administração da equipe.<br>Precisa de acesso? Fale com o administrador.</div></div></section></main>`;
  document.querySelector('#show-password').addEventListener('click', event => {
    const input = document.querySelector('#password');
    input.type = input.type === 'password' ? 'text' : 'password';
    event.currentTarget.textContent = input.type === 'password' ? 'Mostrar' : 'Ocultar';
  });
  document.querySelector('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = document.querySelector('#login-submit');
    const error = document.querySelector('#login-error');
    button.disabled = true;
    button.innerHTML = 'Validando acesso…';
    error.classList.remove('show');
    try {
      const form = new FormData(event.currentTarget);
      const username = String(form.get('username')).trim();
      const remember = document.querySelector('#remember-login').checked;
      const result = await api('/api/login', { method: 'POST', body: JSON.stringify({ username, password: form.get('password'), remember }) });
      csrf = result.csrf; current = result.user; activeView = 'overview';
      if (remember) localStorage.setItem('eq_saved_login', username); else localStorage.removeItem('eq_saved_login');
      await openDashboard();
    } catch (err) {
      error.textContent = err.message;
      error.classList.add('show');
      button.disabled = false;
      button.innerHTML = `Entrar no espaço ${svg('arrow', 15)}`;
      document.querySelector('#password').value = '';
      document.querySelector('#password').focus();
    }
  });
}
function navItem(key, label, iconName, badge = '') {
  return `<button class="nav-item ${activeView === key ? 'active' : ''}" data-nav="${key}">${svg(iconName, 17)}<span>${label}</span>${badge ? `<span class="nav-badge">${badge}</span>` : ''}</button>`;
}
function metricCard(item) {
  return `<article class="metric"><div class="metric-top"><span>${escapeHtml(item.label)}</span><span class="metric-icon">${svg(item.icon, 15)}</span></div><div class="metric-value">${escapeHtml(item.value)}<span class="metric-sub">${escapeHtml(item.detail)}</span></div></article>`;
}
function memberRows(list) {
  if (!list.length) return '<div class="empty-state">Nenhuma conta encontrada.</div>';
  return list.map(member => `<tr data-user-row="${escapeHtml(member.id)}"><td><div class="user-name">${avatarMarkup(member)}<span><strong>${escapeHtml(member.name)}</strong><small>@${escapeHtml(member.username)}${member.email ? ` · ${escapeHtml(member.email)}` : ''}</small></span></div></td><td><span class="role-pill ${member.role === 'admin' ? 'admin' : ''}">${member.role === 'admin' ? 'Administrador' : 'Equipe'}</span></td><td><span class="status-pill ${member.active ? '' : 'inactive'}"><i class="live-dot" style="${member.active ? '' : 'background:#ff8e96;box-shadow:none'}"></i>${member.active ? 'Ativa' : 'Inativa'}</span></td><td>${dateFmt(member.createdAt)}</td><td>${member.role === 'admin' ? '<span style="color:#687873;font-size:10px">Conta do ambiente</span>' : `<div class="table-actions"><button class="action-link" data-action="login-as" data-id="${escapeHtml(member.id)}">Entrar</button><button class="action-link" data-action="password" data-id="${escapeHtml(member.id)}">Redefinir senha</button><button class="action-link ${member.active ? 'danger' : ''}" data-action="toggle" data-id="${escapeHtml(member.id)}">${member.active ? 'Desativar' : 'Ativar'}</button><button class="action-link danger" data-action="delete" data-id="${escapeHtml(member.id)}">Excluir conta</button></div>`}</td></tr>`).join('');
}
function avatarMarkup(profile, className = 'avatar') {
  const fallback = `<span class="avatar-fallback">${initials(profile?.name)}</span>`;
  return `<span class="${className} ${profile?.avatar ? 'has-photo' : ''}" aria-label="Foto de ${escapeHtml(profile?.name || 'perfil')}">${profile?.avatar ? `<img src="${escapeHtml(profile.avatar)}" alt="" onerror="this.parentElement.classList.remove('has-photo');this.remove()">${fallback}` : fallback}</span>`;
}
function money(cents) { return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function linkStatus(link) {
  const labels = { pending: 'Pendente', approved: 'Aprovado', rejected: 'Desaprovado' };
  if (link.status === 'rejected' && link.reanalysisRequestedAt) return `<span class="status-pill link-status pending"><i></i>Reanálise solicitada</span>`;
  return `<span class="status-pill link-status ${link.status}"><i></i>${labels[link.status] || 'Pendente'}</span>`;
}
function renderLinkCards(list, isAdmin) {
  if (!list.length) return `<div class="links-empty"><span class="empty-link-icon">${svg('link', 21)}</span><strong>${isAdmin ? 'Nenhum link neste filtro' : 'Seu fluxo começa com um link'}</strong><p>${isAdmin ? 'Escolha outra pessoa ou aguarde novos envios da equipe.' : 'Envie quantos links precisar. Cada um será analisado pela administração.'}</p></div>`;
  return list.map(link => `<article class="submitted-link" data-link-card="${escapeHtml(link.id)}"><div class="link-card-top"><div class="link-id-wrap"><span class="link-icon">${svg('link', 15)}</span><span><strong>${escapeHtml(link.publicId)}</strong><small>${escapeHtml(link.userName)} · @${escapeHtml(link.username)}</small></span></div>${linkStatus(link)}</div>${link.label ? `<div class="link-label">${escapeHtml(link.label)}</div>` : ''}<a class="link-url" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" title="Abrir link">${escapeHtml(link.url)}</a><div class="link-card-bottom"><span class="link-meta">Enviado em ${dateFmt(link.createdAt)}${link.status === 'approved' ? ` · <b class="approved-credit">+ ${money(link.valueCents)}</b>` : ''}${link.status === 'rejected' && link.reason ? ` · <span class="reject-reason">${escapeHtml(link.reason)}</span>` : ''}</span><div class="link-actions"><button class="soft-btn small-soft" data-link-copy="${escapeHtml(link.id)}">${svg('copy', 13)} Copiar link</button>${isAdmin && link.status === 'pending' ? `<button class="approve-btn" data-link-decision="approved" data-id="${escapeHtml(link.id)}">${svg('check', 13)} Aprovar</button><button class="reject-btn" data-link-decision="rejected" data-id="${escapeHtml(link.id)}">${svg('x', 13)} Desaprovar</button>` : ''}${isAdmin && link.status === 'rejected' && link.reanalysisRequestedAt ? `<button class="approve-btn" data-link-decision="approved" data-id="${escapeHtml(link.id)}">${svg('check', 13)} Aprovar reanálise</button><button class="reject-btn" data-link-decision="rejected" data-id="${escapeHtml(link.id)}">${svg('x', 13)} Manter desaprovado</button>` : ''}${!isAdmin && link.status === 'rejected' ? (link.reanalysisRequestedAt ? '<span class="link-meta">Pedido enviado · aguardando administrador</span>' : `<button class="soft-btn small-soft" data-link-reanalysis="${escapeHtml(link.id)}">Pedir reanálise</button>`) : ''}</div></div></article>`).join('');
}
function downloadLinksText(list, target) {
  const safeName = (target?.username || target?.name || 'equipe').normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'equipe';
  const lines = [
    'EQUIPE DIGITAL | RELATÓRIO DE LINKS',
    `Usuário: ${target?.name || 'Equipe'} (@${target?.username || 'equipe'})`,
    `Exportado em: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short' }).format(new Date())}`,
    `Total de links: ${list.length}`,
    '',
    ...list.map(link => [
      '----------------------------------------',
      `ID: ${link.publicId}`,
      `Pessoa: ${link.userName} (@${link.username})`,
      `Título: ${link.label || 'Sem título'}`,
      `Link: ${link.url}`,
      `Status: ${{ pending: 'Pendente', approved: 'Aprovado', rejected: 'Desaprovado' }[link.status] || link.status}`,
      `Saldo ilustrativo: ${link.status === 'approved' ? money(link.valueCents) : money(0)}`,
      `Enviado em: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(link.createdAt))}`,
      `Analisado em: ${link.decidedAt ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(link.decidedAt)) : 'Ainda não analisado'}`,
      link.reason ? `Observação: ${link.reason}` : '',
      ''
    ].filter(Boolean).join('\n'))
  ];
  const file = new Blob(['\uFEFF' + lines.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(file);
  anchor.download = `${safeName}_links.txt`;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}
function linkSection(isAdmin) {
  const target = isAdmin && selectedLinkUser !== 'all' ? members.find(member => member.id === selectedLinkUser) : current;
  const reviewedBalance = linksBalanceCents;
  const filter = isAdmin ? `<select class="search-input user-filter" id="link-user-filter" aria-label="Filtrar links por usuário"><option value="all" ${selectedLinkUser === 'all' ? 'selected' : ''}>Toda a equipe</option>${members.map(member => `<option value="${escapeHtml(member.id)}" ${selectedLinkUser === member.id ? 'selected' : ''}>${escapeHtml(member.name)}${member.active ? '' : ' · inativa'}</option>`).join('')}</select><select class="search-input status-filter" id="link-status-filter" aria-label="Filtrar links por status"><option value="all" ${selectedLinkStatus === 'all' ? 'selected' : ''}>Todos os status</option><option value="pending" ${selectedLinkStatus === 'pending' ? 'selected' : ''}>Pendentes</option><option value="reanalysis" ${selectedLinkStatus === 'reanalysis' ? 'selected' : ''}>Reanálise solicitada</option><option value="approved" ${selectedLinkStatus === 'approved' ? 'selected' : ''}>Aprovados</option><option value="rejected" ${selectedLinkStatus === 'rejected' ? 'selected' : ''}>Desaprovados</option></select>` : '';
  const targetBalanceLabel = isAdmin && selectedLinkUser === 'all' ? 'Total aprovado na equipe' : 'Saldo ilustrativo';
  const shown = isAdmin && selectedLinkStatus !== 'all' ? linkItems.filter(link => selectedLinkStatus === 'reanalysis' ? link.status === 'rejected' && link.reanalysisRequestedAt : link.status === selectedLinkStatus) : linkItems;
  return `<section class="links-section" id="links-section"><div class="section-title"><div><h2>${isAdmin ? 'Central de links' : 'Meus links'}</h2><p>${isAdmin ? 'Analise cada envio e acompanhe os créditos ilustrativos.' : 'Envie links ilimitados e acompanhe cada análise.'}</p></div><div class="link-head-actions">${filter}<button class="soft-btn" id="export-links">${svg('download', 14)} Exportar TXT</button></div></div><div class="link-summary"><div class="link-summary-card"><span class="link-summary-icon">${svg('spark', 15)}</span><span><small>${targetBalanceLabel}</small><strong id="links-balance">${money(reviewedBalance)}</strong><em id="link-value-label">${valuePerLinkCents === null ? 'Valor definido individualmente por perfil' : money(valuePerLinkCents) + ' por link aprovado'} · saldo ilustrativo</em></span></div><div class="link-summary-card pending-summary"><span class="link-summary-icon">${svg('clock', 15)}</span><span><small>${isAdmin ? 'Aguardando sua análise' : 'Aguardando aprovação'}</small><strong id="links-pending">${linksPendingCount}</strong><em>${isAdmin ? 'Links pendentes da seleção atual' : 'Você pode continuar enviando'}</em></span></div></div>${isAdmin?`<article class="panel payout-panel"><div class="panel-head"><div><h3>Registrar pagamento ilustrativo</h3><span>Ao confirmar, o saldo zera e os links aprovados saem da lista ativa.</span></div></div><div class="payout-balances">${payoutData.balances.filter(item=>item.balanceCents>0).map(item=>`<div class="payout-row">${avatarMarkup(item)}<span><strong>${escapeHtml(item.name)}</strong><small>${money(item.balanceCents)} · ${item.approvedCount} links · ${money(item.linkValueCents)} por link</small></span><button class="soft-btn" data-payout-user="${escapeHtml(item.userId)}">Registrar pagamento</button></div>`).join('')||'<div class="notification-empty">Nenhum saldo aprovado para pagar.</div>'}</div></article><article class="panel payout-history"><div class="panel-head"><h3>Histórico de pagamentos</h3></div>${payoutData.payouts.slice(0,8).map(item=>`<div class="payout-row"><span class="module-icon">${svg('check',14)}</span><span><strong>${escapeHtml(item.userName)}</strong><small>${item.linkIds.length} links · IDs ${item.linkIds.map(escapeHtml).join(', ')}</small></span><b>${money(item.amountCents)}</b><time>${dateFmt(item.createdAt)}</time></div>`).join('')||'<div class="notification-empty">Os pagamentos registrados aparecerão aqui.</div>'}</article>`:''}${!isAdmin ? `<form id="submit-link-form" class="submit-link-form"><div class="submit-link-title"><span class="link-icon">${svg('plus', 15)}</span><span><strong>Adicionar um link</strong><small>Não há limite de envios. Cada link recebe um ID próprio.</small></span></div><div class="link-form-fields"><label class="modal-field"><span>Link</span><input name="url" type="url" placeholder="https://exemplo.com/sua-pagina" required maxlength="2048"></label><label class="modal-field"><span>Nome para identificar <small>(opcional)</small></span><input name="label" type="text" placeholder="Ex.: Campanha de outubro" maxlength="120"></label><button class="primary-btn compact" type="submit" id="submit-link-button">${svg('plus', 14)} Enviar para análise</button></div><div class="login-error" id="link-form-error"></div></form>` : ''}<div class="links-list-head"><strong>${isAdmin ? 'Links enviados' : 'Histórico de envios'}</strong><span id="links-total">${shown.length} ${shown.length === 1 ? 'link' : 'links'}${isAdmin && selectedLinkStatus !== 'all' ? ` de ${linkItems.length}` : ''}</span></div><div id="links-list" class="links-list">${renderLinkCards(shown, isAdmin)}</div></section>`;
}
function chartMarkup() {
  const days=activityData?.days||[];const max=Math.max(1,...days.map(day=>day.count));const pts=days.map((day,i)=>({x:days.length<2?300:i*600/(days.length-1),y:132-(day.count/max)*105}));const line=pts.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ');const area=pts.length?`${line} L600 160 L0 160Z`:'';
  return `<div class="flow-chart"><div class="chart-grid"></div><svg class="chart-svg" viewBox="0 0 600 160" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#b9dcff" stop-opacity=".22"/><stop offset="1" stop-color="#b9dcff" stop-opacity="0"/></linearGradient></defs><path d="${area}" fill="url(#area)"/><path d="${line}" fill="none" stroke="#9dcfff" stroke-width="2.4" vector-effect="non-scaling-stroke"/>${pts.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="#d2e9ff" stroke="#233b55" stroke-width="3"/>`).join('')}</svg><div class="chart-labels">${days.map(day=>`<span>${escapeHtml(day.label)}</span>`).join('')}</div></div>`;
}
async function fetchInsights() {
  const admin=current?.role==='admin'&&!dashboardData?.impersonating;
  const userId=admin?activityUserFilter:'all';
  const results=await Promise.all([api(`/api/activity?userId=${encodeURIComponent(userId)}`,{headers:{'X-CSRF-Token':csrf}}),api('/api/ranking',{headers:{'X-CSRF-Token':csrf}}),...(admin?[api('/api/payouts',{headers:{'X-CSRF-Token':csrf}})]:[])]);
  activityData=results[0];rankingData=results[1].ranking||[];if(admin)payoutData=results[2];
}
function rankingView() {
  const podium=rankingData.slice(0,3);const podiumOrder=[podium[1],podium[0],podium[2]].filter(Boolean);
  const bars=rankingData.slice(0,8);const max=Math.max(1,...bars.map(item=>item.submitted));
  return `<section class="ranking-page"><div class="section-title"><div><div class="eyebrow">DESEMPENHO DA EQUIPE</div><h2>Ranking de envios</h2><p>Links enviados, aprovados e ritmo de cada pessoa.</p></div></div><div class="podium">${podiumOrder.map((member,index)=>`<article class="podium-card place-${index===1?'1':index===0?'2':'3'}"><span class="podium-place">${index===1?'1º':index===0?'2º':'3º'}</span>${avatarMarkup(member,'avatar podium-avatar')}<strong>${escapeHtml(member.name)}</strong><small>@${escapeHtml(member.username)}</small><b>${member.submitted} links</b><span>${member.approved} aprovados</span></article>`).join('')||'<div class="empty-state">O pódio aparece quando a equipe enviar links.</div>'}</div><article class="panel ranking-chart-panel"><div class="panel-head"><h3>Links enviados por pessoa</h3><span>Volume total</span></div>${bars.length?bars.map(member=>`<div class="rank-bar-row">${avatarMarkup(member,'avatar rank-avatar')}<span>${escapeHtml(member.name)}</span><div class="rank-track"><i style="width:${Math.max(4,member.submitted/max*100)}%"></i></div><b>${member.submitted}</b></div>`).join(''):'<div class="empty-state">Ainda não há envios.</div>'}</article></section>`;
}
async function fetchLinks() {
  const isAdmin = current?.role === 'admin' && !dashboardData?.impersonating;
  const query = isAdmin ? `?userId=${encodeURIComponent(selectedLinkUser)}` : '';
  const result = await api(`/api/links${query}`, { headers: { 'X-CSRF-Token': csrf } });
  linkItems = result.links;
  linksBalanceCents = result.balanceCents;
  linksPendingCount = result.pendingCount;
  valuePerLinkCents = result.valuePerLinkCents ?? null;
}
function updateLinksUi() {
  const list = document.querySelector('#links-list');
  if (!list) return;
  const isAdmin = current?.role === 'admin' && !dashboardData?.impersonating;
  const shown = isAdmin && selectedLinkStatus !== 'all' ? linkItems.filter(link => selectedLinkStatus === 'reanalysis' ? link.status === 'rejected' && link.reanalysisRequestedAt : link.status === selectedLinkStatus) : linkItems;
  list.innerHTML = renderLinkCards(shown, isAdmin);
  document.querySelector('#links-balance').textContent = money(linksBalanceCents);
  document.querySelector('#links-pending').textContent = String(linksPendingCount);
  const valueLabel = document.querySelector('#link-value-label');
  if (valueLabel) valueLabel.textContent = `${valuePerLinkCents === null ? 'Valor definido individualmente por perfil' : `${money(valuePerLinkCents)} por link aprovado`} · saldo ilustrativo`;
  document.querySelector('#links-total').textContent = `${shown.length} ${shown.length === 1 ? 'link' : 'links'}${isAdmin && selectedLinkStatus !== 'all' ? ` de ${linkItems.length}` : ''}`;
  list.querySelectorAll('[data-link-copy]').forEach(button => button.addEventListener('click', async () => {
    const target = linkItems.find(link => link.id === button.dataset.linkCopy);
    if (!target) return;
    try { await navigator.clipboard.writeText(target.url); notify('Link copiado.'); }
    catch { notify('Não foi possível copiar automaticamente.'); }
  }));
  list.querySelectorAll('[data-link-decision]').forEach(button => button.addEventListener('click', () => decideLink(button.dataset.id, button.dataset.linkDecision)));
  list.querySelectorAll('[data-link-reanalysis]').forEach(button => button.addEventListener('click', () => requestLinkReanalysis(button.dataset.linkReanalysis)));
}
async function loadLinks() {
  try { await fetchLinks(); updateLinksUi(); }
  catch (error) { notify(error.message); }
}
async function submitLink(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = document.querySelector('#submit-link-button');
  const error = document.querySelector('#link-form-error');
  const fields = new FormData(form);
  button.disabled = true;
  error.classList.remove('show');
  try {
    await api('/api/links', { method: 'POST', body: JSON.stringify({ url: fields.get('url'), label: fields.get('label') }) });
    form.reset();
    notify('Link enviado para análise.');
    await refreshDashboardPreservingScroll();
  } catch (err) { error.textContent = err.message; error.classList.add('show'); }
  finally { button.disabled = false; }
}
async function decideLink(id, status) {
  const target = linkItems.find(link => link.id === id);
  if (!target) return;
  const approved = status === 'approved';
  const ownerRate = payoutData.balances.find(item => item.userId === target.userId)?.linkValueCents ?? 5000;
  if (!confirm(approved ? `Aprovar ${target.publicId}? O saldo ilustrativo de ${money(ownerRate)} será somado para ${target.userName}.` : `Desaprovar ${target.publicId}? O valor deste link ficará zerado.`)) return;
  try {
    const result = await api(`/api/links/${encodeURIComponent(id)}/decision`, { method: 'POST', body: JSON.stringify({ status }) });
    notify(approved ? `Link aprovado · ${money(result.link.valueCents)} adicionados ao saldo ilustrativo.` : 'Link desaprovado.');
    await refreshDashboardPreservingScroll();
  } catch (error) { notify(error.message); }
}
async function requestLinkReanalysis(id) {
  const target = linkItems.find(link => link.id === id);
  if (!target || !confirm(`Pedir ao administrador uma nova análise para ${target.publicId}?`)) return;
  try {
    await api(`/api/links/${encodeURIComponent(id)}/reanalysis`, { method: 'POST', body: '{}' });
    notify('Pedido de reanálise enviado ao administrador.');
    await refreshDashboardPreservingScroll();
  } catch (error) { notify(error.message); }
}
async function refreshDashboardPreservingScroll() {
  const scrollTop = window.scrollY;
  await openDashboard();
  window.scrollTo({ top: scrollTop, behavior: 'instant' });
}
function bindUserActions() {
  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', async () => {
    const target = members.find(item => item.id === button.dataset.id);
    if (!target) return;
    if (button.dataset.action === 'login-as') {
      if (!confirm(`Entrar no espaço de ${target.name}? A área administrativa ficará disponível ao retornar.`)) return;
      try { const result = await api(`/api/users/${target.id}/impersonate`, { method: 'POST', body: '{}' }); csrf = result.csrf; current = result.user; await openDashboard(); } catch (error) { notify(error.message); }
    }
    if (button.dataset.action === 'toggle') {
      try { await api(`/api/users/${target.id}`, { method: 'PATCH', body: JSON.stringify({ active: !target.active }) }); notify(target.active ? 'Conta desativada.' : 'Conta ativada.'); await openDashboard(); }
      catch (error) { notify(error.message); }
    }
    if (button.dataset.action === 'delete') {
      const accepted = confirm(`Excluir a conta de ${target.name} (@${target.username})? Os links, notificações e fotos dessa conta também serão removidos. Esta ação não pode ser desfeita.`);
      if (!accepted) return;
      try {
        await api(`/api/users/${encodeURIComponent(target.id)}`, { method: 'DELETE' });
        notify(`Conta de ${target.name} excluída.`);
        await openDashboard();
      } catch (error) { notify(error.message); }
    }
    if (button.dataset.action === 'password') showPasswordChange(target);
  }));
}
function scrollAccounts() { document.querySelector('#accounts-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function showModal(html) {
  const layer = document.createElement('div');
  layer.className = 'modal-backdrop';
  layer.innerHTML = html;
  document.body.appendChild(layer);
  layer.addEventListener('click', event => { if (event.target === layer || event.target.closest('[data-close]')) layer.remove(); });
  return layer;
}
function showCreateUser() {
  const modal = showModal(`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><div><div class="eyebrow">NOVO ACESSO</div><h2 id="modal-title">Adicionar à equipe</h2><p>Crie um login individual para uma pessoa da equipe.</p></div><button class="icon-btn" data-close aria-label="Fechar">${svg('close')}</button></div><form id="create-user-form"><div class="modal-field"><label for="new-name">Nome completo</label><input id="new-name" name="name" placeholder="Ex.: Ana Oliveira" minlength="2" maxlength="80" required></div><div class="modal-field"><label for="new-username">Login</label><input id="new-username" name="username" placeholder="ex.: ana.oliveira" minlength="3" maxlength="32" pattern="[A-Za-z0-9._-]+" autocomplete="off" required></div><div class="modal-field"><label for="new-password">Senha inicial</label><input id="new-password" name="password" type="password" placeholder="Pelo menos 8 caracteres" minlength="8" maxlength="128" autocomplete="new-password" required></div><div class="login-error" id="modal-error"></div><div class="modal-actions"><button class="soft-btn" type="button" data-close>Cancelar</button><button class="primary-btn compact" id="create-user-submit" type="submit">Criar acesso ${svg('arrow', 14)}</button></div></form></section>`);
  modal.querySelector('#create-user-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const button = modal.querySelector('#create-user-submit');
    const error = modal.querySelector('#modal-error');
    button.disabled = true;
    try {
      await api('/api/users', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) });
      modal.remove(); notify('Conta criada com sucesso.'); await openDashboard();
    } catch (err) { error.textContent = err.message; error.classList.add('show'); button.disabled = false; }
  });
  modal.querySelector('#new-name').focus();
}
function showPasswordChange(target) {
  const modal = showModal(`<section class="modal password-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><div><div class="eyebrow">ACESSO DA EQUIPE</div><h2 id="modal-title">Redefinir senha</h2><p>Nova senha para <strong>${escapeHtml(target.name)}</strong>.</p></div><button class="icon-btn" data-close aria-label="Fechar">${svg('close')}</button></div><form id="change-password-form"><div class="modal-field"><label for="change-password">Nova senha</label><input id="change-password" type="password" name="password" placeholder="Pelo menos 8 caracteres" minlength="8" maxlength="128" autocomplete="new-password" required><small class="password-modal-help">Use no mínimo 8 caracteres.</small></div><div class="login-error" id="modal-error"></div><div class="modal-actions"><button class="soft-btn" type="button" data-close>Cancelar</button><button class="primary-btn compact" type="submit">Salvar senha</button></div></form></section>`);
  modal.classList.add('password-modal-backdrop');
  modal.querySelector('#change-password-form').addEventListener('submit', async event => {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get('password');
    const error = modal.querySelector('#modal-error');
    try { await api(`/api/users/${target.id}`, { method: 'PATCH', body: JSON.stringify({ password }) }); modal.remove(); notify('Senha atualizada.'); }
    catch (err) { error.textContent = err.message; error.classList.add('show'); }
  });
  modal.querySelector('#change-password').focus();
}
async function openDashboard() {
  try {
    dashboardData = await api('/api/dashboard', { headers: csrf ? { 'X-CSRF-Token': csrf } : {} });
    current = dashboardData.user;
    if (dashboardData.admin && !dashboardData.impersonating) {
      const result = await api('/api/users', { headers: { 'X-CSRF-Token': csrf } });
      members = result.users;
    } else members = dashboardData.members || [];
    if (dashboardData.admin && !dashboardData.impersonating && selectedLinkUser !== 'all' && !members.some(member => member.id === selectedLinkUser)) selectedLinkUser = 'all';
    await fetchLinks();
    await fetchInsights();
    await refreshNotifications(false);
    if (notificationsTimer) clearInterval(notificationsTimer);
    notificationsTimer = setInterval(() => refreshNotifications(true), 20000);
    renderDashboard();
  } catch (error) {
    if (error.status === 401 || error.status === 403) { csrf = null; current = null; renderLogin(); }
    else { app.innerHTML = `<main class="login-side"><div class="login-card"><div class="login-eyebrow">EQUIPE DIGITAL</div><h2>Não foi possível abrir seu espaço.</h2><p class="login-lead">${escapeHtml(error.message)}</p><button class="primary-btn" onclick="location.reload()">Tentar novamente</button></div></main>`; }
  }
}
async function logout() {
  try { await api('/api/logout', { method: 'POST', body: '{}' }); } catch {}
  if (notificationsTimer) clearInterval(notificationsTimer); notificationsTimer=null; notificationIds=new Set(); notifications=[]; unreadNotifications=0;
  csrf = null; current = null; dashboardData = null; members = []; activeView = 'overview'; renderLogin();
}
async function returnAdmin() {
  try { const result = await api('/api/return-admin', { method: 'POST', body: '{}' }); csrf = result.csrf; current = result.user; await openDashboard(); notify('Você voltou à administração.'); }
  catch (error) { notify(error.message); }
}
async function start() {
  try {
    const session = await api('/api/session');
    if (session.user) { current = session.user; csrf = session.csrf; if (session.impersonating) dashboardData = { impersonating: true }; await openDashboard(); }
    else renderLogin();
  } catch { renderLogin(); }
}
function profileSection() {
  const role = current?.role === 'admin' ? 'Administrador' : 'Membro da equipe';
  return `<section class="profile-section" id="profile-section"><div class="section-title"><div><h2>Meu perfil</h2><p>Escolha uma foto para identificar sua conta no espaço da equipe.</p></div></div><article class="panel profile-panel"><div class="profile-info">${avatarMarkup(current, 'profile-avatar')}<div class="profile-details"><strong>${escapeHtml(current?.name)}</strong><span>@${escapeHtml(current?.username)}</span><span>${escapeHtml(current?.email || 'E-mail não informado')}</span><small>${role}</small></div></div><div class="profile-photo-actions"><input id="avatar-file" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp"><button class="soft-btn" type="button" id="choose-avatar">${svg('camera', 14)} ${current?.avatar ? 'Trocar foto' : 'Adicionar foto'}</button>${current?.avatar ? `<button class="action-link danger" type="button" id="remove-avatar">Remover foto</button>` : ''}<small>PNG, JPG ou WebP · até 3 MB</small></div></article></section>`;
}
function adminAccountsSection() {
  return `<section class="admin-section" id="accounts-section"><div class="section-title"><div><h2>Contas da equipe</h2><p>Crie acessos e acompanhe as contas registradas.</p></div><div class="admin-toolbar"><input class="search-input" id="user-search" type="search" placeholder="Buscar pessoas…" aria-label="Buscar contas"></div></div><article class="panel create-account-panel"><div class="panel-head"><div><h3>Criar conta</h3><span>O acesso fica disponível assim que for criado.</span></div></div><form id="create-user-form" class="create-account-form"><label class="modal-field"><span>Nome completo</span><input id="new-name" name="name" placeholder="Ex.: Ana Oliveira" minlength="2" maxlength="80" required></label><label class="modal-field"><span>Nome de usuário</span><input id="new-username" name="username" placeholder="ex.: ana.oliveira" minlength="3" maxlength="32" pattern="[A-Za-z0-9._-]+" autocomplete="off" required></label><label class="modal-field"><span>E-mail</span><input id="new-email" name="email" type="email" placeholder="ana@empresa.com" maxlength="254" autocomplete="email" required></label><label class="modal-field"><span>Senha inicial</span><input id="new-password" name="password" type="password" placeholder="Pelo menos 8 caracteres" minlength="8" maxlength="128" autocomplete="new-password" required></label><div class="create-account-submit"><div class="login-error" id="account-form-error"></div><button class="primary-btn compact" id="create-user-submit" type="submit">${svg('plus', 14)} Criar conta</button></div></form></article><div class="section-title account-table-title"><div><h2>Contas registradas</h2><p>Entre no espaço de uma pessoa, redefina a senha ou altere o acesso.</p></div></div><article class="panel" style="padding:7px 17px"><div class="table-wrap"><table class="user-table"><thead><tr><th>Conta</th><th>Perfil</th><th>Status</th><th>Adicionada</th><th>Ações</th></tr></thead><tbody id="user-rows">${memberRows(members)}</tbody></table></div></article></section>`;
}
async function createAccount(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = document.querySelector('#account-form-error');
  const button = document.querySelector('#create-user-submit');
  button.disabled = true; error.classList.remove('show');
  try {
    const fields = Object.fromEntries(new FormData(form));
    await api('/api/users', { method: 'POST', body: JSON.stringify(fields) });
    form.reset(); notify('Conta criada com sucesso.'); await refreshDashboardPreservingScroll();
  } catch (err) { error.textContent = err.message; error.classList.add('show'); }
  finally { button.disabled = false; }
}
async function saveProfileSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = document.querySelector('#profile-settings-error');
  const button = form.querySelector('button[type="submit"]');
  error.classList.remove('show'); button.disabled = true;
  try {
    const result = await api('/api/profile', { method: 'PATCH', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    current = result.user;
    notify('Dados do perfil atualizados.');
    await refreshDashboardPreservingScroll();
  } catch (err) { error.textContent = err.message; error.classList.add('show'); }
  finally { button.disabled = false; }
}
async function saveAdminPersonalRate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = document.querySelector('#admin-personal-rate-error');
  const button = form.querySelector('button[type="submit"]');
  const amount = Number(new FormData(form).get('rate'));
  const rateCents = Math.round(amount * 100);
  error.classList.remove('show');
  if (!Number.isFinite(amount) || rateCents < 1 || rateCents > 10_000_000) {
    error.textContent = 'Informe um valor entre R$ 0,01 e R$ 100.000,00.';
    error.classList.add('show');
    return;
  }
  button.disabled = true;
  try {
    await api('/api/admin/personal-rate', { method: 'PATCH', body: JSON.stringify({ rateCents }) });
    notify('Seu valor por link foi atualizado.');
    await refreshDashboardPreservingScroll();
  } catch (err) { error.textContent = err.message; error.classList.add('show'); }
  finally { button.disabled = false; }
}
async function savePasswordSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = document.querySelector('#password-settings-error');
  const button = form.querySelector('button[type="submit"]');
  const fields = Object.fromEntries(new FormData(form));
  error.classList.remove('show'); button.disabled = true;
  try {
    await api('/api/profile/password', { method: 'PATCH', body: JSON.stringify(fields) });
    form.reset(); notify('Senha atualizada.');
  } catch (err) { error.textContent = err.message; error.classList.add('show'); }
  finally { button.disabled = false; }
}
async function uploadAvatar(event) {
  const file = event.currentTarget.files?.[0];
  event.currentTarget.value = '';
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return notify('Escolha uma foto PNG, JPG ou WebP.');
  if (file.size > 3 * 1024 * 1024) return notify('A foto precisa ter até 3 MB.');
  const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Não foi possível abrir esta foto.')); reader.readAsDataURL(file); }).catch(error => { notify(error.message); return null; });
  if (!data) return;
  try { await api('/api/profile/avatar', { method: 'POST', body: JSON.stringify({ data }) }); notify('Foto de perfil atualizada.'); await refreshDashboardPreservingScroll(); }
  catch (error) { notify(error.message); }
}
async function removeAvatar() {
  try { await api('/api/profile/avatar', { method: 'DELETE' }); notify('Foto de perfil removida.'); await refreshDashboardPreservingScroll(); }
  catch (error) { notify(error.message); }
}
function createAccountView() {
  return `<section class="admin-section" id="accounts-section"><div class="section-title"><div><div class="eyebrow">ADMINISTRAÇÃO DA EQUIPE</div><h2>Nova conta</h2><p>Preencha os dados para liberar um acesso à equipe.</p></div></div><article class="panel create-account-panel"><form id="create-user-form" class="create-account-form"><label class="modal-field"><span>Nome completo</span><input id="new-name" name="name" placeholder="Ex.: Ana Oliveira" minlength="2" maxlength="80" required></label><label class="modal-field"><span>Nome de usuário</span><input id="new-username" name="username" placeholder="ex.: ana.oliveira" minlength="3" maxlength="32" pattern="[A-Za-z0-9._-]+" autocomplete="off" required></label><label class="modal-field"><span>E-mail</span><input id="new-email" name="email" type="email" placeholder="ana@empresa.com" maxlength="254" autocomplete="email" required></label><label class="modal-field"><span>Senha inicial</span><input id="new-password" name="password" type="password" placeholder="Pelo menos 8 caracteres" minlength="8" maxlength="128" autocomplete="new-password" required></label><div class="create-account-submit"><div class="login-error" id="account-form-error"></div><button class="primary-btn compact" id="create-user-submit" type="submit">${svg('plus', 14)} Criar conta</button></div></form></article></section>`;
}
function registeredAccountsView() {
  return `<section class="admin-section" id="registered-accounts"><div class="section-title"><div><div class="eyebrow">ADMINISTRAÇÃO DA EQUIPE</div><h2>Contas registradas</h2><p>Consulte o perfil, abra uma conta ou atualize o acesso.</p></div><div class="admin-toolbar"><input class="search-input" id="user-search" type="search" placeholder="Buscar nome, usuário ou e-mail…" aria-label="Buscar contas"></div></div><article class="panel" style="padding:7px 17px"><div class="table-wrap"><table class="user-table"><thead><tr><th>Conta</th><th>Perfil</th><th>Status</th><th>Adicionada</th><th>Ações</th></tr></thead><tbody id="user-rows">${memberRows(members)}</tbody></table></div></article></section>`;
}
function linkValuesView() {
  const team = members.filter(member => member.role !== 'admin');
  return `<section class="admin-section link-values-page"><div class="section-title"><div><div class="eyebrow">ADMINISTRAÇÃO DA EQUIPE</div><h2>Valores por perfil</h2><p>Defina quanto cada pessoa recebe por link aprovado.</p></div></div><article class="panel link-values-intro"><span class="module-icon">${svg('spark', 16)}</span><div><strong>Valor automático na aprovação</strong><p>O valor definido será aplicado ao aprovar os próximos links. Aprovações anteriores mantêm o valor registrado na época.</p></div></article><div class="link-values-list">${team.map(member => `<article class="panel link-value-card" data-rate-row="${escapeHtml(member.id)}">${avatarMarkup(member, 'avatar link-value-avatar')}<div class="link-value-person"><strong>${escapeHtml(member.name)}</strong><small>@${escapeHtml(member.username)}${member.active ? '' : ' · conta inativa'}</small></div><label class="link-value-field"><span>Valor por link</span><span class="currency-input"><b>R$</b><input type="number" min="0.01" max="100000" step="0.01" value="${((member.linkValueCents ?? 5000) / 100).toFixed(2)}" data-link-value="${escapeHtml(member.id)}" aria-label="Valor por link aprovado para ${escapeHtml(member.name)}"></span></label><button class="primary-btn compact" type="button" data-save-link-value="${escapeHtml(member.id)}">Salvar</button></article>`).join('') || '<article class="panel empty-state">Crie uma conta para definir o valor por link.</article>'}</div></section>`;
}
async function saveLinkValue(userId) {
  const input = document.querySelector(`[data-link-value="${CSS.escape(userId)}"]`);
  const button = document.querySelector(`[data-save-link-value="${CSS.escape(userId)}"]`);
  const value = Number(input?.value);
  const cents = Math.round(value * 100);
  if (!Number.isFinite(value) || cents < 1 || cents > 10_000_000) return notify('Informe um valor entre R$ 0,01 e R$ 100.000,00.');
  button.disabled = true;
  try {
    await api(`/api/users/${encodeURIComponent(userId)}`, { method: 'PATCH', body: JSON.stringify({ linkValueCents: cents }) });
    const member = members.find(item => item.id === userId);
    if (member) member.linkValueCents = cents;
    const balance = payoutData.balances.find(item => item.userId === userId);
    if (balance) balance.linkValueCents = cents;
    notify('Valor por link atualizado.');
  } catch (error) { notify(error.message); }
  finally { button.disabled = false; }
}
function adminPersonalSettingsView() {
  if (current?.role !== 'admin' || dashboardData?.impersonating) return '';
  const rate = dashboardData?.adminLinkValueCents ?? 5000;
  const count = dashboardData?.personalApprovedCount ?? 0;
  const balance = dashboardData?.personalBalanceCents ?? count * rate;
  return `<section class="settings-card admin-personal-settings"><div class="settings-card-head"><span class="settings-icon">${svg('spark', 16)}</span><div><h3>Meu saldo pessoal por link</h3><p>Seu ganho pessoal é calculado para cada link aprovado da equipe.</p></div></div><p class="admin-personal-explainer">Cada aprovação soma este valor ao seu total pessoal. O total não diminui ao pagar os membros, e mudanças no valor valem para as próximas aprovações.</p><form id="admin-personal-rate-form" class="settings-form"><label class="modal-field"><span>Quanto recebo por link aprovado?</span><span class="currency-input"><b>R$</b><input name="rate" type="number" min="0.01" max="100000" step="0.01" value="${(rate / 100).toFixed(2)}" required></span></label><div class="admin-personal-balance"><small>Saldo pessoal total · ${count} links aprovados</small><strong>${money(balance)}</strong></div><div class="settings-form-actions"><div class="login-error" id="admin-personal-rate-error"></div><button class="primary-btn compact" type="submit">Salvar meu valor</button></div></form></section>`;
}
function settingsView() {
  const theme = localStorage.getItem('eq_theme') === 'light' ? 'light' : 'dark';
  const compact = localStorage.getItem('eq_compact_mode') === 'true';
  const sound = localStorage.getItem('eq_sound_notifications') !== 'false';
  return `<div class="settings-page"><section class="settings-intro"><div class="eyebrow">PREFERÊNCIAS DA CONTA</div><h2>Configurações</h2><p>Atualize seu perfil, escolha a aparência do painel e proteja seu acesso.</p></section><section class="settings-card"><div class="settings-card-head"><span class="settings-icon">${svg('users', 16)}</span><div><h3>Dados do perfil</h3><p>Seu nome, usuário e e-mail usados pela equipe.</p></div></div><form id="profile-settings-form" class="settings-form"><label class="modal-field"><span>Nome completo</span><input name="name" value="${escapeHtml(current?.name)}" minlength="2" maxlength="80" required></label><label class="modal-field"><span>Nome de usuário</span><input name="username" value="${escapeHtml(current?.username)}" minlength="3" maxlength="32" pattern="[A-Za-z0-9._-]+" required></label><label class="modal-field"><span>E-mail</span><input name="email" type="email" value="${escapeHtml(current?.email || '')}" maxlength="254" required></label><div class="settings-form-actions"><div class="login-error" id="profile-settings-error"></div><button class="primary-btn compact" type="submit">Salvar perfil</button></div></form></section>${profileSection()}${adminPersonalSettingsView()}<section class="settings-card"><div class="settings-card-head"><span class="settings-icon">${svg('spark', 16)}</span><div><h3>Aparência do painel</h3><p>Escolha o tema que fica melhor para você.</p></div></div><div class="theme-options"><label class="theme-option ${theme === 'dark' ? 'selected' : ''}"><input type="radio" name="site-theme" value="dark" ${theme === 'dark' ? 'checked' : ''}><span class="theme-swatch dark-swatch">◐</span><span><strong>Modo escuro</strong><small>Fundo escuro e detalhes azul-bebê</small></span></label><label class="theme-option ${theme === 'light' ? 'selected' : ''}"><input type="radio" name="site-theme" value="light" ${theme === 'light' ? 'checked' : ''}><span class="theme-swatch light-swatch">☼</span><span><strong>Modo claro</strong><small>Fundo claro e detalhes azul-bebê</small></span></label></div><label class="setting-toggle"><span><strong>Layout compacto</strong><small>Reduz os espaços entre os cartões do painel.</small></span><input id="compact-mode" type="checkbox" ${compact ? 'checked' : ''}><i></i></label><label class="setting-toggle"><span><strong>Alertas sonoros</strong><small>Alerta musical tipo mensagem quando chegar algo novo.</small></span><input id="sound-mode" type="checkbox" ${sound ? 'checked' : ''}><i></i></label><div class="sound-test-row"><span><strong>Prévia do alerta</strong><small>Ouça o som de mensagem antes de salvar esta preferência.</small></span><button class="soft-btn" id="test-notification-sound" type="button">Testar som</button></div></section><section class="settings-card"><div class="settings-card-head"><span class="settings-icon">${svg('shield', 16)}</span><div><h3>Senha e segurança</h3><p>${current?.role==='admin'?'Como administrador, você pode definir uma nova senha sem informar a atual.':'Confirme sua senha atual para definir uma nova.'}</p></div></div><form id="password-settings-form" class="settings-form password-settings-form">${current?.role==='admin'?'':`<label class="modal-field"><span>Senha atual</span><input name="currentPassword" type="password" autocomplete="current-password" required></label>`}<label class="modal-field"><span>Nova senha</span><input name="newPassword" type="password" minlength="8" maxlength="128" autocomplete="new-password" placeholder="Pelo menos 8 caracteres" required></label><label class="modal-field"><span>Confirme a nova senha</span><input name="confirmPassword" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label><div class="settings-form-actions"><div class="login-error" id="password-settings-error"></div><button class="primary-btn compact" type="submit">${current?.role==='admin'?'Redefinir senha':'Atualizar senha'}</button></div></form></section></div>`;
}
function applyUiPreferences() {
  document.documentElement.dataset.theme = localStorage.getItem('eq_theme') === 'light' ? 'light' : 'dark';
  document.documentElement.classList.toggle('compact-mode', localStorage.getItem('eq_compact_mode') === 'true');
}
function overviewView(isAdmin, welcomeName) {
  const activityFilter=isAdmin?`<select class="search-input activity-user-filter" id="activity-user-filter"><option value="all" ${activityUserFilter==='all'?'selected':''}>Toda a equipe</option>${members.filter(item=>item.role!=='admin').map(item=>`<option value="${escapeHtml(item.id)}" ${activityUserFilter===item.id?'selected':''}>${escapeHtml(item.name)}</option>`).join('')}</select>`:'';
  return `<section class="welcome"><div><div class="eyebrow">${isAdmin ? 'PAINEL DO ADMINISTRADOR' : 'SEU ESPAÇO DE TRABALHO'}</div><h1>Olá, ${welcomeName} <span style="color:var(--mint)">✦</span></h1><p>Um novo dia para fazer boas ideias acontecerem.</p></div><div class="welcome-actions">${isAdmin ? `<button class="soft-btn" data-open-view="accounts">${svg('users', 14)} Ver contas</button><button class="primary-btn compact" data-open-view="create-account">${svg('plus', 14)} Nova conta</button>` : `<button class="soft-btn" id="copy-login">${svg('copy', 14)} Copiar meu login</button>`}<button class="soft-btn" data-open-view="ranking">${svg('chart', 14)} Ranking</button><button class="soft-btn" data-open-view="links">${svg('link', 14)} ${isAdmin ? 'Analisar links' : 'Meus links'}</button></div></section><section class="metrics ${isAdmin ? 'metrics-admin' : ''}">${(dashboardData?.stats || []).map(metricCard).join('')}</section><section><div class="section-title"><div><h2>Ritmo da operação</h2><p>${activityData.links||0} links enviados · ${activityData.approved||0} aprovados nesta visão</p></div>${activityFilter}</div><div class="content-grid"><article class="panel"><div class="panel-head"><h3>Movimento dos links</h3><span>Últimos 7 dias</span></div>${chartMarkup()}</article><article class="panel"><div class="panel-head"><h3>Camada de inteligência</h3><span class="module-state"><i></i> Conectada</span></div><div class="module-list"><div class="module-row"><span class="module-icon">${svg('spark', 15)}</span><span class="module-copy"><strong>Equipe em movimento</strong><small>Ranking e atividade atualizados</small></span><span class="module-state"><i></i> Ativo</span></div><div class="module-row"><span class="module-icon purple">${svg('shield', 15)}</span><span class="module-copy"><strong>Acesso protegido</strong><small>Contas geridas pelo administrador</small></span><span class="module-state"><i></i> Seguro</span></div></div></article></div><div class="access-banner"><span class="access-icon">${svg('lock', 16)}</span><span class="access-copy"><strong>${isAdmin ? 'Acesso administrativo' : 'Acesso individual'}</strong><p>${isAdmin ? 'As áreas de contas e análise de links estão disponíveis no menu.' : 'Seu login é pessoal. O administrador pode ajudar com alterações de acesso.'}</p></span>${isAdmin ? `<span class="role-pill">Administrador</span>` : `<span class="role-pill">${escapeHtml(current?.username)}</span>`}</div></section>`;
}
function renderDashboard() {
  const isAdmin = current?.role === 'admin' && !dashboardData?.impersonating;
  if (!isAdmin && !['overview', 'links', 'settings', 'ranking'].includes(activeView)) activeView = 'overview';
  const welcomeName = escapeHtml(current?.name?.split(' ')[0] || 'equipe');
  const pendingBadge = dashboardData?.pendingCount ? String(dashboardData.pendingCount) : '';
  const pageTitles = { overview: 'Visão geral', 'create-account': 'Criar conta', accounts: 'Contas registradas', rates: 'Valores por perfil', links: isAdmin ? 'Links da equipe' : 'Meus links', ranking: 'Ranking', settings: 'Configurações' };
  const page = activeView === 'overview' ? overviewView(isAdmin, welcomeName)
    : activeView === 'create-account' && isAdmin ? createAccountView()
    : activeView === 'accounts' && isAdmin ? registeredAccountsView()
    : activeView === 'rates' && isAdmin ? linkValuesView()
    : activeView === 'links' ? linkSection(isAdmin)
    : activeView === 'ranking' ? rankingView()
    : activeView === 'settings' ? settingsView()
    : overviewView(isAdmin, welcomeName);
  const navigation = isAdmin
    ? `${navItem('overview', 'Visão geral', 'grid')}${navItem('create-account', 'Criar conta', 'plus')}${navItem('accounts', 'Contas registradas', 'users', String(members.filter(member => member.role !== 'admin').length))}${navItem('rates', 'Valores dos links', 'spark')}${navItem('links', 'Links da equipe', 'link', pendingBadge)}${navItem('ranking', 'Ranking', 'chart')}${navItem('settings', 'Configurações', 'settings')}`
    : `${navItem('overview', 'Visão geral', 'grid')}${navItem('links', 'Meus links', 'link', pendingBadge)}${navItem('ranking', 'Ranking', 'chart')}${navItem('settings', 'Configurações', 'settings')}`;
  app.innerHTML = `<div class="dashboard">${dashboardData?.impersonating ? `<div class="impersonate-banner" style="grid-column:1/-1"><span>Você está visualizando o espaço de <strong>${escapeHtml(current.name)}</strong>.</span><button class="soft-btn" id="return-admin">${svg('arrow', 13)} Voltar à administração</button></div>` : ''}<aside class="sidebar"><div class="sidebar-brand">${brand()}</div><div class="side-label">Espaço de trabalho</div><nav class="nav">${navigation}</nav><div class="sidebar-bottom"><div class="workspace-card"><div class="workspace-card-head"><span class="workspace-icon">${svg('wave', 15)}</span><strong>Equipe em sintonia</strong></div><p>Seu espaço de trabalho, organizado em um só lugar.</p></div><div class="side-profile">${avatarMarkup(current)}<span class="profile-copy"><strong>${escapeHtml(current?.name)}</strong><small>${isAdmin ? 'Administrador' : 'Membro da equipe'}</small></span><button class="icon-btn" title="Sair da conta" id="logout">${svg('logout', 15)}</button></div></div></aside><main class="main"><header class="topbar"><div class="breadcrumb">EQUIPE DIGITAL&nbsp; / &nbsp;<b>${pageTitles[activeView] || 'Visão geral'}</b></div><div class="top-actions"><span class="top-time">${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(new Date())}</span><div class="notification-wrap"><button class="notification-toggle" id="notification-toggle" title="Notificações">${svg('bell', 17)}<span id="notification-count" class="notification-count" ${unreadNotifications?'':'hidden'}>${unreadNotifications>9?'9+':unreadNotifications}</span></button><div class="notification-panel" id="notification-panel">${notificationMarkup()}</div></div></div></header><div class="page">${page}</div></main></div>`;
  document.querySelector('#logout')?.addEventListener('click', logout);
  document.querySelector('#return-admin')?.addEventListener('click', returnAdmin);
  bindNotificationActions();
  document.querySelectorAll('[data-nav],[data-open-view]').forEach(button => button.addEventListener('click', () => {
    const view = button.dataset.nav || button.dataset.openView;
    if (view === 'security') return notify('Sua sessão está protegida.');
    activeView = view;
    renderDashboard();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
  document.querySelector('#create-user-form')?.addEventListener('submit', createAccount);
  document.querySelector('#admin-personal-rate-form')?.addEventListener('submit', saveAdminPersonalRate);
  document.querySelectorAll('[data-save-link-value]').forEach(button => button.addEventListener('click', () => saveLinkValue(button.dataset.saveLinkValue)));
  document.querySelector('#profile-settings-form')?.addEventListener('submit', saveProfileSettings);
  document.querySelector('#password-settings-form')?.addEventListener('submit', savePasswordSettings);
  document.querySelectorAll('input[name="site-theme"]').forEach(input => input.addEventListener('change', event => {
    const theme = event.currentTarget.value === 'light' ? 'light' : 'dark';
    localStorage.setItem('eq_theme', theme); applyUiPreferences();
    document.querySelectorAll('.theme-option').forEach(option => option.classList.toggle('selected', option.querySelector('input')?.checked));
    notify(theme === 'light' ? 'Modo claro ativado.' : 'Modo escuro ativado.');
  }));
  document.querySelector('#compact-mode')?.addEventListener('change', event => {
    localStorage.setItem('eq_compact_mode', String(event.currentTarget.checked)); applyUiPreferences();
    notify(event.currentTarget.checked ? 'Layout compacto ativado.' : 'Layout padrão ativado.');
  });
  document.querySelector('#sound-mode')?.addEventListener('change', event => { localStorage.setItem('eq_sound_notifications',String(event.currentTarget.checked)); notify(event.currentTarget.checked?'Alertas sonoros ativados.':'Alertas sonoros desativados.'); if(event.currentTarget.checked) playNotificationSound(true); });
  document.querySelector('#test-notification-sound')?.addEventListener('click', () => playNotificationSound(true));
  document.querySelector('#activity-user-filter')?.addEventListener('change',async event=>{activityUserFilter=event.currentTarget.value;await fetchInsights();renderDashboard();});
  document.querySelector('#user-search')?.addEventListener('input', event => {
    const query = event.currentTarget.value.toLowerCase().trim();
    document.querySelector('#user-rows').innerHTML = memberRows(members.filter(member => `${member.name} ${member.username} ${member.email || ''}`.toLowerCase().includes(query)));
    bindUserActions();
  });
  document.querySelector('#choose-avatar')?.addEventListener('click', () => document.querySelector('#avatar-file').click());
  document.querySelector('#avatar-file')?.addEventListener('change', uploadAvatar);
  document.querySelector('#remove-avatar')?.addEventListener('click', removeAvatar);
  document.querySelector('#export-links')?.addEventListener('click', () => {
    const target = isAdmin && selectedLinkUser === 'all' ? { name: 'Toda a equipe', username: 'equipe' } : (isAdmin ? members.find(member => member.id === selectedLinkUser) : current);
    downloadLinksText(linkItems, target || current); notify('Arquivo TXT gerado.');
  });
  document.querySelector('#link-user-filter')?.addEventListener('change', async event => { selectedLinkUser = event.currentTarget.value; await loadLinks(); });
  document.querySelector('#link-status-filter')?.addEventListener('change', event => { selectedLinkStatus = event.currentTarget.value; updateLinksUi(); });
  document.querySelectorAll('[data-payout-user]').forEach(button=>button.addEventListener('click',async()=>{const target=payoutData.balances.find(item=>item.userId===button.dataset.payoutUser);if(!target||!confirm(`Registrar pagamento ilustrativo de ${money(target.balanceCents)} para ${target.name}? Os links aprovados sairão da lista ativa.`))return;try{await api('/api/payouts',{method:'POST',body:JSON.stringify({userId:target.userId})});notify('Pagamento ilustrativo registrado.');await refreshDashboardPreservingScroll()}catch(error){notify(error.message)}}));
  document.querySelector('#submit-link-form')?.addEventListener('submit', submitLink);
  document.querySelectorAll('[data-link-copy]').forEach(button => button.addEventListener('click', async () => {
    const target = linkItems.find(link => link.id === button.dataset.linkCopy);
    if (!target) return;
    try { await navigator.clipboard.writeText(target.url); notify('Link copiado.'); } catch { notify('Não foi possível copiar automaticamente.'); }
  }));
  document.querySelectorAll('[data-link-decision]').forEach(button => button.addEventListener('click', () => decideLink(button.dataset.id, button.dataset.linkDecision)));
  document.querySelectorAll('[data-link-reanalysis]').forEach(button => button.addEventListener('click', () => requestLinkReanalysis(button.dataset.linkReanalysis)));
  document.querySelector('#copy-login')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(current.username); notify('Login copiado.'); } catch { notify(`Seu login é ${current.username}`); } });
  document.querySelector('#refresh-panel')?.addEventListener('click', async event => { event.preventDefault(); await refreshDashboardPreservingScroll(); notify('Painel atualizado.'); });
  if (activeView === 'accounts') bindUserActions();
}
applyUiPreferences();
start();
