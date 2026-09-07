/* ─────────────────────────────────────────────────────────────────
   VibeTable Admin Panel — vanilla JS SPA.
   Talks to the JWT-protected /api endpoints; role enforced server-side.
   ───────────────────────────────────────────────────────────────── */
'use strict';

const API = '/api';
const ITEM_TYPES = ['avatar_frame','banner','chat_bubble','theme','game_skin','game_piece','board_theme','id_color','dice_set','emote','bundle','consumable'];
const RARITIES = ['common','rare','epic','legendary'];
const GAME_STATUSES = ['active','maintenance','inactive','coming_soon'];
const RESOLVE_ACTIONS = ['dismiss','warn','mute','ban','delete'];

const state = {
  token: localStorage.getItem('vt_admin_token') || '',
  user: JSON.parse(localStorage.getItem('vt_admin_user') || 'null'),
  page: 'overview',
  userOffset: 0,
  userLimit: 25,
};

// ── Tiny helpers ────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs = {}, children = []) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) n.append(c);
  return n;
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmtNum = (n) => Number(n ?? 0).toLocaleString();

function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show ' + kind;
  clearTimeout(toast._h);
  toast._h = setTimeout(() => (t.className = 'toast'), 3600);
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const msg = (json && json.message) ? [].concat(json.message).join(', ') : `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    if (res.status === 401) logout();
    throw err;
  }
  return json ? json.data : null;
}

function openModal(contentNodes) {
  const box = $('#modalBox');
  box.replaceChildren(...[].concat(contentNodes));
  $('#modalBackdrop').classList.add('open');
}
function closeModal() { $('#modalBackdrop').classList.remove('open'); }
$('#modalBackdrop').addEventListener('click', (e) => { if (e.target.id === 'modalBackdrop') closeModal(); });

function badge(v) { return `<span class="badge ${esc(String(v).toLowerCase())}">${esc(v)}</span>`; }
function modalForm(title, fields, submitLabel, onSubmit) {
  // fields: [{name,label,type:'text|number|select|checkbox|textarea',options,value,required,step}]
  const h = el('h3', { text: title });
  const form = el('form');
  const grid = el('div', { class: 'grid-2' });
  const values = {};
  for (const f of fields) {
    const wrap = el('label', { class: 'field', style: f.full ? 'grid-column:1/-1' : '' });
    wrap.append(f.label + ' ', (() => {
      if (f.type === 'select') {
        const s = el('select', { name: f.name });
        for (const o of f.options || []) s.append(el('option', { value: o, text: o, selected: o === f.value ? 'selected' : false }));
        s.value = f.value ?? '';
        return s;
      }
      if (f.type === 'textarea') return el('textarea', { name: f.name, text: f.value || '' });
      if (f.type === 'checkbox') {
        const c = el('input', { type: 'checkbox' });
        c.checked = !!f.value;
        c.style.marginTop = '8px';
        return c;
      }
      return el('input', { type: f.type || 'text', name: f.name, value: f.value ?? '', step: f.step || null, placeholder: f.placeholder || '' });
    })());
    grid.append(wrap);
  }
  form.append(grid);
  form.append(el('div', { class: 'modal-actions' }, [
    el('button', { type: 'button', class: 'btn btn-ghost', text: 'Cancel', onclick: closeModal }),
    el('button', { type: 'submit', class: 'btn btn-purple', text: submitLabel }),
  ]));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {};
    for (const f of fields) {
      const node = form.elements[f.name];
      if (!node) continue;
      if (f.type === 'checkbox') payload[f.name] = node.checked;
      else if (f.type === 'number') { const n = parseFloat(node.value); payload[f.name] = Number.isFinite(n) ? n : 0; }
      else payload[f.name] = node.value;
    }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try { await onSubmit(payload); closeModal(); }
    catch (err) { toast(err.message, 'err'); }
    finally { btn.disabled = false; }
  });
  return [h, form];
}
function confirmModal(title, text, onOk, okLabel = 'Confirm', okClass = 'btn-red') {
  openModal([
    el('h3', { text: title }),
    el('p', { class: 'sub', text: text, style: 'color:var(--text-2);font-size:14px;line-height:1.6' }),
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn btn-ghost', text: 'Cancel', onclick: closeModal }),
      el('button', { class: 'btn ' + okClass, text: okLabel, onclick: async () => {
        try { await onOk(); closeModal(); } catch (e) { toast(e.message, 'err'); }
      } }),
    ]),
  ]);
}

// ── Auth ────────────────────────────────────────────────────────
async function login(email, password) {
  const res = await fetch(API + '/auth/email/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error((json.message && [].concat(json.message).join(', ')) || 'Sign-in failed.');
  if (json.data.user.role !== 'admin') throw new Error('This account is not an administrator.');
  state.token = json.data.tokens.accessToken;
  state.user = json.data.user;
  localStorage.setItem('vt_admin_token', state.token);
  localStorage.setItem('vt_admin_user', JSON.stringify(state.user));
}
function logout() {
  state.token = ''; state.user = null;
  localStorage.removeItem('vt_admin_token'); localStorage.removeItem('vt_admin_user');
  $('#appView').style.display = 'none'; $('#loginView').style.display = '';
}
$('#loginBtn').addEventListener('click', async () => {
  const btn = $('#loginBtn');
  btn.disabled = true; $('#loginError').textContent = '';
  try {
    await login($('#loginEmail').value.trim(), $('#loginPassword').value);
    boot();
  } catch (e) { $('#loginError').textContent = e.message; }
  finally { btn.disabled = false; }
});
$('#loginPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#loginBtn').click(); });
$('#logoutBtn').addEventListener('click', logout);

// ── Navigation ──────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    state.page = b.dataset.page;
    state.userOffset = 0;
    render();
  });
});

// ── Pages ───────────────────────────────────────────────────────
async function render() {
  const main = $('#main');
  main.replaceChildren(el('p', { class: 'empty', text: 'Loading…' }));
  try {
    if (state.page === 'overview') return pageOverview(main);
    if (state.page === 'users') return pageUsers(main);
    if (state.page === 'shop') return pageShop(main);
    if (state.page === 'games') return pageGames(main);
    if (state.page === 'seasons') return pageSeasons(main);
    if (state.page === 'moderation') return pageModeration(main);
  } catch (e) { main.replaceChildren(el('div', { class: 'panel empty', text: 'Error: ' + e.message })); }
}

/* ── Overview ── */
async function pageOverview(main) {
  const d = await api('/admin/overview');
  const stat = (label, value, cls) =>
    el('div', { class: 'stat' }, [el('div', { class: 'label', text: label }), el('div', { class: 'value ' + (cls || ''), text: fmtNum(value) })]);

  const maxPlays = Math.max(1, ...(d.topGames || []).map((g) => g.plays));
  const maxDay = Math.max(1, ...(d.matchesByDay || []).map((x) => x.matches));

  main.replaceChildren(
    head('Overview', 'Live platform analytics'),
    el('div', { class: 'stat-grid' }, [
      stat('Total users', d.users.total, 'purple'),
      stat('Active (7 days)', d.users.active7d, 'cyan'),
      stat('Active games', d.games.active, 'green'),
      stat('Matches today', d.matches.today, 'amber'),
      stat('Matches total', d.matches.total, ''),
      stat('Open reports', d.moderation.openReports, d.moderation.openReports ? 'amber' : 'green'),
      stat('Coins in circulation', '🪙 ' + fmtNum(d.economy.coinsInCirculation), 'amber'),
      stat('Pips in circulation', '💎 ' + fmtNum(d.economy.pipsInCirculation), 'cyan'),
    ]),
    el('div', { class: 'panel' }, [
      el('h3', { html: '🔥 Top games' }),
      (d.topGames.length ? d.topGames : []).map((g) =>
        el('div', { class: 'bar-row' }, [
          el('div', { class: 'name', text: g.name }),
          el('div', { class: 'bar-track' }, el('div', { class: 'bar-fill', style: `width:${(g.plays / maxPlays) * 100}%` })),
          el('div', { class: 'num', text: fmtNum(g.plays) }),
        ])),
      d.topGames.length ? null : el('div', { class: 'empty', text: 'No matches played yet.' }),
    ]),
    el('div', { class: 'panel' }, [
      el('h3', { html: '📈 Matches · last 14 days' }),
      (d.matchesByDay.length ? d.matchesByDay : []).map((x) =>
        el('div', { class: 'bar-row' }, [
          el('div', { class: 'name', text: String(x.day).slice(5) }),
          el('div', { class: 'bar-track' }, el('div', { class: 'bar-fill', style: `width:${(x.matches / maxDay) * 100}%` })),
          el('div', { class: 'num', text: fmtNum(x.matches) }),
        ])),
      d.matchesByDay.length ? null : el('div', { class: 'empty', text: 'No data yet.' }),
    ]),
  );
}

/* ── Users ── */
let usersCache = { items: [], total: 0, search: '', status: '' };
async function pageUsers(main) {
  main.replaceChildren(head('Users', 'Search, moderate and adjust player accounts'));
  const toolbar = el('div', { class: 'toolbar' });
  const search = el('input', { placeholder: 'Search email / phone / @username / name' });
  const statusSel = el('select', {}, [
    el('option', { value: '', text: 'All statuses' }),
    el('option', { value: 'active', text: 'Active' }),
    el('option', { value: 'suspended', text: 'Suspended' }),
    el('option', { value: 'banned', text: 'Banned' }),
  ]);
  search.value = usersCache.search; statusSel.value = usersCache.status;
  const go = async () => {
    usersCache.search = search.value.trim(); usersCache.status = statusSel.value; state.userOffset = 0;
    await loadUsers(main);
  };
  search.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  toolbar.append(search, statusSel, el('button', { class: 'btn btn-purple btn-sm', text: 'Search', onclick: go }));
  main.append(toolbar, el('div', { id: 'usersTable' }));
  await loadUsers(main);
}
async function loadUsers(main) {
  const params = new URLSearchParams({ limit: state.userLimit, offset: state.userOffset });
  if (usersCache.search) params.set('search', usersCache.search);
  if (usersCache.status) params.set('status', usersCache.status);
  const d = await api('/admin/users?' + params);
  usersCache = { ...usersCache, items: d.items, total: d.total };

  const rows = d.items.map((u) => el('tr', {}, [
    el('td', {}, [el('b', { text: u.displayName || u.username }), el('div', { class: 'mono', text: '@' + u.username })]),
    el('td', { class: 'mono', text: u.email || u.phone || '—' }),
    el('td', { html: badge(u.role) }),
    el('td', { html: badge(u.status) }),
    el('td', { class: 'mono', text: '🪙' + fmtNum(u.coins) + '  💎' + fmtNum(u.pips) }),
    el('td', { class: 'mono', text: 'Lv' + u.level + ' · ' + u.gamesPlayed + ' games' }),
    el('td', { class: 'row-actions' }, [
      el('button', { class: 'btn btn-ghost btn-sm', text: 'Wallet', onclick: () => walletDialog(u) }),
      el('button', { class: 'btn btn-ghost btn-sm', text: 'Ban', onclick: () => banDialog(u) }),
      u.status !== 'active'
        ? el('button', { class: 'btn btn-green btn-sm', text: 'Lift', onclick: () => lift(u) })
        : el('button', { class: 'btn btn-amber btn-sm', text: 'Suspend', onclick: () => suspend(u) }),
      u.role === 'admin'
        ? el('button', { class: 'btn btn-ghost btn-sm', text: 'Remove admin', onclick: () => setRole(u, 'moderator') })
        : el('button', { class: 'btn btn-purple btn-sm', text: 'Make admin', onclick: () => setRole(u, 'admin') }),
    ]),
  ]));

  const from = d.total ? state.userOffset + 1 : 0;
  const to = Math.min(state.userOffset + d.items.length, d.total);
  const pager = el('div', { class: 'toolbar', style: 'justify-content:space-between;margin-top:14px' }, [
    el('span', { class: 'mono', text: `${from}–${to} of ${fmtNum(d.total)}` }),
    el('div', {}, [
      el('button', { class: 'btn btn-ghost btn-sm', text: '← Prev', disabled: state.userOffset <= 0 ? 'disabled' : false, onclick: async () => { state.userOffset = Math.max(0, state.userOffset - state.userLimit); await loadUsers(main); } }),
      ' ',
      el('button', { class: 'btn btn-ghost btn-sm', text: 'Next →', disabled: to >= d.total ? 'disabled' : false, onclick: async () => { state.userOffset += state.userLimit; await loadUsers(main); } }),
    ]),
  ]);

  $('#usersTable')?.replaceChildren(el('div', { class: 'panel' }, [
    el('div', { class: 'table-wrap' }, el('table', {}, [
      el('thead', {}, el('tr', {}, ['Player','Contact','Role','Status','Wallet','Progress','Actions'].map((h) => el('th', { text: h })))),
      el('tbody', {}, rows.length ? rows : [el('tr', {}, el('td', { colspan: 7, class: 'empty', text: 'No users found.' }))]),
    ])),
    pager,
  ]));
}
function walletDialog(u) {
  openModal(modalForm(`Adjust wallet — ${u.displayName || u.username}`, [
    { name: 'currency', label: 'Currency', type: 'select', options: ['coins','pips'], value: 'coins', full: true },
    { name: 'amount', label: 'Amount (negative deducts)', type: 'number', value: 1000, step: 1 },
    { name: 'reason', label: 'Reason', type: 'text', value: 'admin adjustment', full: true },
  ], 'Apply', async (p) => {
    await api('/admin/users/grant-currency', { method: 'POST', body: { userId: u.id, currency: p.currency, amount: Math.trunc(p.amount), reason: p.reason } });
    toast('Wallet updated', 'ok'); await loadUsers($('#main'));
  }));
}
function banDialog(u) {
  openModal(modalForm(`Ban / mute — ${u.displayName || u.username}`, [
    { name: 'type', label: 'Type', type: 'select', options: ['chat','login','matchmaking','permanent'], value: 'login', full: true },
    { name: 'durationMinutes', label: 'Duration (minutes, empty = permanent)', type: 'number', value: 1440, full: false },
    { name: 'reason', label: 'Reason', type: 'text', value: 'violation', full: true },
  ], 'Ban', async (p) => {
    const body = { userId: u.id, type: p.type, reason: p.reason };
    if (p.type !== 'permanent' && p.durationMinutes > 0) body.durationMinutes = Math.trunc(p.durationMinutes);
    await api('/admin/users/ban', { method: 'POST', body });
    toast('Ban applied', 'ok'); await loadUsers($('#main'));
  }));
}
async function lift(u) {
  await api('/admin/users/lift-ban', { method: 'POST', body: { userId: u.id } });
  toast('Ban lifted', 'ok'); await loadUsers($('#main'));
}
function suspend(u) {
  confirmModal(`Suspend ${u.displayName || u.username}?`, 'The user will be unable to log in until the ban is lifted.',
    async () => {
      await api('/admin/users/ban', { method: 'POST', body: { userId: u.id, type: 'login', reason: 'suspended by admin' } });
      toast('User suspended', 'ok'); await loadUsers($('#main'));
    }, 'Suspend', 'btn-amber');
}
async function setRole(u, role) {
  await api('/moderation/roles', { method: 'POST', body: { userId: u.id, role } });
  toast(role === 'admin' ? 'Promoted to admin' : 'Role updated', 'ok'); await loadUsers($('#main'));
}

/* ── Shop ── */
let shopItems = [];
async function pageShop(main) {
  main.replaceChildren(head('Shop', 'Add, edit, price and remove catalogue items'));
  const bar = el('div', { class: 'toolbar' }, [
    el('button', { class: 'btn btn-purple', text: '+ New item', onclick: () => itemDialog(null) }),
  ]);
  main.append(bar, el('div', { id: 'shopTable' }));
  await loadShop();
}
async function loadShop() {
  shopItems = await api('/admin/shop/items');
  const rows = shopItems.map((it) => el('tr', {}, [
    el('td', {}, [el('b', { text: it.name }), it.description ? el('div', { class: 'mono', text: it.description }) : null]),
    el('td', { html: badge(it.type) }),
    el('td', { html: badge(it.rarity) }),
    el('td', {}, el('span', { class: 'badge ' + it.currency, text: (it.currency === 'coins' ? '🪙 ' : '💎 ') + fmtNum(it.price) })),
    el('td', { html: it.isAvailable ? badge('available') : badge('hidden') }),
    el('td', { class: 'mono', text: it.isUniqueOwned ? 'unique' : 'repeatable' }),
    el('td', { class: 'row-actions' }, [
      el('button', { class: 'btn btn-ghost btn-sm', text: 'Edit', onclick: () => itemDialog(it) }),
      el('button', { class: 'btn btn-red btn-sm', text: 'Delete', onclick: () =>
        confirmModal(`Delete "${it.name}"?`, 'This permanently removes the item from the catalogue.',
          async () => { await api('/admin/shop/items/' + it.id, { method: 'DELETE' }); toast('Item deleted', 'ok'); await loadShop(); },
          'Delete') }),
    ]),
  ]));
  $('#shopTable')?.replaceChildren(el('div', { class: 'panel' }, [
    el('div', { class: 'table-wrap' }, el('table', {}, [
      el('thead', {}, el('tr', {}, ['Item','Type','Rarity','Price','Status','Ownership','Actions'].map((h) => el('th', { text: h })))),
      el('tbody', {}, rows.length ? rows : [el('tr', {}, el('td', { colspan: 7, class: 'empty', text: 'Shop is empty.' }))]),
    ])),
  ]));
}
function itemDialog(it) {
  openModal(modalForm(it ? 'Edit item' : 'New shop item', [
    { name: 'name', label: 'Name', type: 'text', value: it?.name || '', full: true, required: true },
    { name: 'description', label: 'Description', type: 'text', value: it?.description || '', full: true },
    { name: 'type', label: 'Type', type: 'select', options: ITEM_TYPES, value: it?.type || 'avatar_frame' },
    { name: 'rarity', label: 'Rarity', type: 'select', options: RARITIES, value: it?.rarity || 'common' },
    { name: 'currency', label: 'Currency', type: 'select', options: ['coins','pips'], value: it?.currency || 'coins' },
    { name: 'price', label: 'Price', type: 'number', value: it?.price ?? 500, step: 1 },
    { name: 'discountPercent', label: 'Discount %', type: 'number', value: it?.discountPercent ?? 0, step: 1 },
    { name: 'stock', label: 'Stock (0 = unlimited)', type: 'number', value: it?.stock ?? 0, step: 1 },
    { name: 'isAvailable', label: 'Available in shop', type: 'checkbox', value: it ? it.isAvailable : true, full: true },
    { name: 'isUniqueOwned', label: 'Unique (one per account)', type: 'checkbox', value: it ? it.isUniqueOwned : true, full: true },
    { name: 'giftable', label: 'Giftable', type: 'checkbox', value: it ? it.giftable : true, full: true },
  ], 'Save item', async (p) => {
    const body = {
      ...p,
      price: Math.max(0, Math.trunc(p.price)),
      discountPercent: Math.max(0, Math.min(90, Math.trunc(p.discountPercent))),
      stock: Math.max(0, Math.trunc(p.stock)),
    };
    if (it) body.id = it.id;
    await api('/admin/shop/items', { method: 'POST', body });
    toast('Item saved', 'ok'); await loadShop();
  }));
}

/* ── Games ── */
let games = [];
async function pageGames(main) {
  main.replaceChildren(head('Games', 'Add games, control availability (active / maintenance / disabled)'));
  const bar = el('div', { class: 'toolbar' }, [
    el('button', { class: 'btn btn-purple', text: '+ Add game', onclick: () => gameDialog(null) }),
  ]);
  main.append(bar, el('div', { id: 'gamesTable' }));
  await loadGames();
}
async function loadGames() {
  games = await api('/admin/games');
  const rows = games.map((g) => el('tr', {}, [
    el('td', {}, [el('b', { text: g.name }), el('div', { class: 'mono', text: g.slug })]),
    el('td', { class: 'mono', text: `${g.minPlayers}–${g.maxPlayers} · ~${g.avgDurationMinutes}m` }),
    el('td', { class: 'mono', text: `bots:${g.supportsBots ? '✓' : '✗'} ranked:${g.rankedEnabled ? '✓' : '✗'}` }),
    el('td', { html: badge(g.status) }),
    el('td', { class: 'row-actions' }, [
      el('button', { class: 'btn btn-green btn-sm', text: 'Activate', onclick: () => setStatus(g, 'active') }),
      el('button', { class: 'btn btn-amber btn-sm', text: 'Maintenance', onclick: () => setStatus(g, 'maintenance') }),
      el('button', { class: 'btn btn-ghost btn-sm', text: 'Coming soon', onclick: () => setStatus(g, 'coming_soon') }),
      el('button', { class: 'btn btn-ghost btn-sm', text: 'Edit', onclick: () => gameDialog(g) }),
      el('button', { class: 'btn btn-red btn-sm', text: 'Delete', onclick: () =>
        confirmModal(`Delete "${g.name}"?`, 'Games with recorded matches cannot be deleted; disable them instead.',
          async () => { await api('/admin/games/' + encodeURIComponent(g.slug), { method: 'DELETE' }); toast('Game deleted', 'ok'); await loadGames(); },
          'Delete') }),
    ]),
  ]));
  $('#gamesTable')?.replaceChildren(el('div', { class: 'panel' }, [
    el('div', { class: 'table-wrap' }, el('table', {}, [
      el('thead', {}, el('tr', {}, ['Game','Players','Flags','Status','Actions'].map((h) => el('th', { text: h })))),
      el('tbody', {}, rows.length ? rows : [el('tr', {}, el('td', { colspan: 5, class: 'empty', text: 'No games.' }))]),
    ])),
  ]));
}
async function setStatus(g, status) {
  try {
    await api('/admin/games/status', { method: 'POST', body: { slug: g.slug, status } });
    toast(`Set to ${status}`, 'ok'); await loadGames();
  } catch (e) {
    toast(e.message + ' (a game without a playable engine cannot be activated)', 'err');
  }
}
function gameDialog(g) {
  openModal(modalForm(g ? `Edit ${g.name}` : 'Add a game', [
    { name: 'slug', label: 'Slug (unique id, e.g. "blackjack")', type: 'text', value: g?.slug || '', full: true },
    { name: 'name', label: 'Display name', type: 'text', value: g?.name || '', full: true },
    { name: 'description', label: 'Description', type: 'textarea', value: g?.description || '', full: true },
    { name: 'minPlayers', label: 'Min players', type: 'number', value: g?.minPlayers ?? 2, step: 1 },
    { name: 'maxPlayers', label: 'Max players', type: 'number', value: g?.maxPlayers ?? 6, step: 1 },
    { name: 'avgDurationMinutes', label: 'Avg minutes', type: 'number', value: g?.avgDurationMinutes ?? 10, step: 1 },
    { name: 'status', label: 'Status', type: 'select', options: GAME_STATUSES, value: g?.status || 'coming_soon' },
    { name: 'supportsBots', label: 'Supports bots', type: 'checkbox', value: g ? g.supportsBots : true, full: true },
    { name: 'rankedEnabled', label: 'Ranked enabled', type: 'checkbox', value: g ? g.rankedEnabled : true, full: true },
  ], g ? 'Save changes' : 'Add game', async (p) => {
    if (g) {
      await api('/admin/games/' + encodeURIComponent(g.slug), { method: 'PATCH', body: p });
    } else {
      await api('/admin/games', { method: 'POST', body: p });
    }
    toast('Game saved (games without an engine stay "coming soon")', 'ok');
    await loadGames();
  }));
}

/* ── Seasons ── */
async function pageSeasons(main) {
  main.replaceChildren(head('Seasons', 'Seasonal ranked leaderboards and reward rollover'));
  const bar = el('div', { class: 'toolbar' }, [
    el('button', {
      class: 'btn btn-amber', text: '⏭ Roll over season now',
      onclick: () => confirmModal('Roll over the season?',
        'This closes the active season, snapshots ranks, grants tier & game rewards to all players, and starts the next season. It cannot be undone.',
        async () => { await api('/admin/seasons/rollover', { method: 'POST', body: {} }); toast('Season rolled over; rewards granted', 'ok'); render(); },
        'Roll over', 'btn-amber'),
    }),
  ]);
  main.append(bar, el('div', { id: 'seasonsTable' }));
  const seasons = await api('/admin/seasons');
  const rows = seasons.map((s) => el('tr', {}, [
    el('td', { class: 'mono', text: '#' + s.seasonNumber }),
    el('td', { text: s.name }),
    el('td', { html: badge(s.status) }),
    el('td', { class: 'mono', text: (s.startsAt || '').slice(0, 10) }),
    el('td', { class: 'mono', text: (s.endsAt || '').slice(0, 10) }),
  ]));
  $('#seasonsTable')?.replaceChildren(el('div', { class: 'panel' }, [
    el('div', { class: 'table-wrap' }, el('table', {}, [
      el('thead', {}, el('tr', {}, ['#','Name','Status','Starts','Ends'].map((h) => el('th', { text: h })))),
      el('tbody', {}, rows.length ? rows : [el('tr', {}, el('td', { colspan: 5, class: 'empty', text: 'No seasons.' }))]),
    ])),
  ]));
}

/* ── Moderation / reports / chat ── */
async function pageModeration(main) {
  main.replaceChildren(head('Reports & Chat moderation', 'Player reports, bans, message removal and audit trail'));
  main.append(
    el('div', { class: 'toolbar', id: 'modTabs' }, [
      ['reports', 'Reports'], ['bans', 'Active bans'], ['flags', 'Auto-flagged content'], ['audit', 'Audit log'], ['errors', 'Error events'],
    ].map(([k, label], i) =>
      el('button', { class: 'btn btn-sm ' + (i === 0 ? 'btn-purple' : 'btn-ghost'), text: label, id: 'tab-' + k,
        onclick: () => { document.querySelectorAll('#modTabs .btn').forEach((b) => { b.className = 'btn btn-sm btn-ghost'; }); $('#tab-' + k).className = 'btn btn-sm btn-purple'; loadMod(k); } }))),
    el('div', { class: 'toolbar' }, [
      el('button', { class: 'btn btn-red btn-sm', text: '🗑 Delete message by ID', onclick: deleteMessageDialog }),
      el('button', { class: 'btn btn-amber btn-sm', text: '🔨 Ban user by ID', onclick: banMessageDialog }),
    ]),
    el('div', { id: 'modContent' }),
  );
  await loadMod('reports');
}
async function loadMod(kind) {
  const host = $('#modContent');
  host.replaceChildren(el('p', { class: 'empty', text: 'Loading…' }));
  if (kind === 'reports') {
    const d = await api('/moderation/reports?limit=50&status=open');
    const rows = (d.items || []).map((r) => el('tr', {}, [
      el('td', { class: 'mono', text: r.targetType }),
      el('td', { class: 'mono', text: (r.reason || '').replace(/_/g, ' ') }),
      el('td', { text: r.details || '—' }),
      el('td', { class: 'mono', text: (r.createdAt || '').slice(0, 16).replace('T', ' ') }),
      el('td', { class: 'row-actions' }, RESOLVE_ACTIONS.map((a) =>
        el('button', {
          class: 'btn btn-sm ' + (a === 'ban' ? 'btn-red' : a === 'dismiss' ? 'btn-ghost' : 'btn-amber'),
          text: a,
          onclick: () => resolveReport(r, a),
        }))),
    ]));
    host.replaceChildren(el('div', { class: 'panel' }, el('div', { class: 'table-wrap' }, el('table', {}, [
      el('thead', {}, el('tr', {}, ['Target','Reason','Details','When','Actions'].map((h) => el('th', { text: h })))),
      el('tbody', {}, rows.length ? rows : [el('tr', {}, el('td', { colspan: 5, class: 'empty', text: 'No open reports. All clear! 🎉' }))]),
    ]))));
  } else if (kind === 'bans') {
    const d = await api('/moderation/bans');
    const rows = (d.items || []).map((b) => el('tr', {}, [
      el('td', { class: 'mono', text: b.userId }),
      el('td', { html: badge(b.type) }),
      el('td', { text: b.reason || '—' }),
      el('td', { class: 'mono', text: b.expiresAt ? String(b.expiresAt).slice(0, 16).replace('T', ' ') : 'permanent' }),
      el('td', {}, el('button', { class: 'btn btn-green btn-sm', text: 'Lift', onclick: async () => {
        await api('/moderation/bans/lift', { method: 'POST', body: { userId: b.userId } }); toast('Ban lifted', 'ok'); loadMod('bans');
      } })),
    ]));
    host.replaceChildren(el('div', { class: 'panel' }, el('div', { class: 'table-wrap' }, el('table', {}, [
      el('thead', {}, el('tr', {}, ['User','Type','Reason','Expires','Actions'].map((h) => el('th', { text: h })))),
      el('tbody', {}, rows.length ? rows : [el('tr', {}, el('td', { colspan: 5, class: 'empty', text: 'No active bans.' }))]),
    ]))));
  } else if (kind === 'flags') {
    const d = await api('/moderation/flags');
    const rows = (d.items || []).map((f) => el('tr', {}, [
      el('td', { class: 'mono', text: f.targetType || 'message' }),
      el('td', { html: badge(f.verdict || 'flagged') }),
      el('td', { text: (f.reason || '').replace(/_/g, ' ') }),
      el('td', { class: 'mono', text: f.excerpt || '—' }),
      el('td', { class: 'mono', text: (f.createdAt || '').slice(0, 16).replace('T', ' ') }),
    ]));
    host.replaceChildren(el('div', { class: 'panel' }, el('div', { class: 'table-wrap' }, el('table', {}, [
      el('thead', {}, el('tr', {}, ['Target','Verdict','Reason','Excerpt','When'].map((h) => el('th', { text: h })))),
      el('tbody', {}, rows.length ? rows : [el('tr', {}, el('td', { colspan: 5, class: 'empty', text: 'No auto-flags.' }))]),
    ]))));
  } else if (kind === 'audit') {
    const d = await api('/moderation/audit');
    const rows = (d.items || []).map((a) => el('tr', {}, [
      el('td', { class: 'mono', text: (a.createdAt || '').slice(0, 16).replace('T', ' ') }),
      el('td', { class: 'mono', text: (a.action || '').replace(/_/g, ' ') }),
      el('td', { class: 'mono', text: a.targetType + ':' + String(a.targetId || '').slice(0, 8) }),
      el('td', { text: a.reason || '—' }),
    ]));
    host.replaceChildren(el('div', { class: 'panel' }, el('div', { class: 'table-wrap' }, el('table', {}, [
      el('thead', {}, el('tr', {}, ['When','Action','Target','Reason'].map((h) => el('th', { text: h })))),
      el('tbody', {}, rows.length ? rows : [el('tr', {}, el('td', { colspan: 4, class: 'empty', text: 'No audit entries.' }))]),
    ]))));
  } else if (kind === 'errors') {
    const d = await api('/moderation/errors');
    const rows = (d.items || []).map((x) => el('tr', {}, [
      el('td', { class: 'mono', text: (x.createdAt || '').slice(0, 16).replace('T', ' ') }),
      el('td', { class: 'mono', text: x.level || 'error' }),
      el('td', { text: x.message || x.name || '—' }),
    ]));
    host.replaceChildren(el('div', { class: 'panel' }, el('div', { class: 'table-wrap' }, el('table', {}, [
      el('thead', {}, el('tr', {}, ['When','Level','Message'].map((h) => el('th', { text: h })))),
      el('tbody', {}, rows.length ? rows : [el('tr', {}, el('td', { colspan: 3, class: 'empty', text: 'No tracked errors.' }))]),
    ]))));
  }
}
async function resolveReport(r, action) {
  const body = { action };
  if (action === 'mute') body.durationMinutes = 24 * 60;
  if (action === 'ban') body.durationMinutes = 7 * 24 * 60;
  body.note = action + ' via admin panel';
  await api('/moderation/reports/' + r.id + '/resolve', { method: 'POST', body });
  toast('Report handled: ' + action, 'ok');
  loadMod('reports');
}

function deleteMessageDialog() {
  openModal(modalForm('Delete a chat message', [
    { name: 'messageId', label: 'Message UUID', type: 'text', value: '', full: true, required: true },
    { name: 'reason', label: 'Reason', type: 'text', value: 'content violation', full: true },
  ], 'Delete message', async (p) => {
    await api('/moderation/messages/delete', { method: 'POST', body: { messageId: p.messageId.trim(), reason: p.reason } });
    toast('Message deleted', 'ok');
  }));
}
function banMessageDialog() {
  openModal(modalForm('Ban / mute a user directly', [
    { name: 'userId', label: 'User UUID', type: 'text', value: '', full: true, required: true },
    { name: 'type', label: 'Type', type: 'select', options: ['chat','login','matchmaking','permanent'], value: 'chat', full: true },
    { name: 'durationMinutes', label: 'Duration minutes (empty = permanent)', type: 'number', value: 1440 },
    { name: 'reason', label: 'Reason', type: 'text', value: 'moderation action', full: true },
  ], 'Apply', async (p) => {
    const body = { userId: p.userId.trim(), type: p.type, reason: p.reason };
    if (p.type !== 'permanent' && p.durationMinutes > 0) body.durationMinutes = Math.trunc(p.durationMinutes);
    await api('/moderation/bans', { method: 'POST', body });
    toast('Ban applied', 'ok'); loadMod('bans');
  }));
}

// ── Layout helper / boot ────────────────────────────────────────
function head(title, subtitle) {
  return el('div', { class: 'page-head' }, [
    el('div', {}, [el('h2', { text: title }), el('p', { text: subtitle })]),
  ]);
}
function boot() {
  if (state.token && state.user?.role === 'admin') {
    $('#loginView').style.display = 'none';
    $('#appView').style.display = '';
    $('#whoami').textContent = state.user.displayName || state.user.username || 'admin';
    render();
  } else {
    logout();
  }
}
boot();
