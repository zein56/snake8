import { newGame, step, turn, useItem, DEF, COLORS } from './core.js';
const $ = (s, r = document) => r.querySelector(s);
const h = (tag, p = {}, ...kids) => { const e = document.createElement(tag); for (const k in p) k === 'class' ? e.className = p[k] : k.startsWith('on') ? e.addEventListener(k.slice(2), p[k]) : e[k] = p[k]; kids.flat().forEach(c => e.append(c)); return e; };
const app = $('#app'); let gameOnline = false, cur = null, ws = null, me = null, mode = 'menu', ctrls = [], lg = null, loopT = null, curSettings = { ...DEF }, rooms = [], roomTimer = null, lastBack = null;
const toast = m => { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 2500); };
const store = { get: k => { try { return localStorage.getItem(k) } catch { return null } }, set: (k, v) => { try { localStorage.setItem(k, v) } catch { } } };
let myName = store.get('s8name') || '';
try { Object.assign(curSettings, JSON.parse(store.get('s8set') || '{}')); } catch { }

function show(el, back) { clearInterval(roomTimer); app.replaceChildren(el); cur = el; lastBack = back || null; mode = el.id === 'game' ? 'game' : 'menu'; if (mode === 'menu') setTimeout(() => (el.querySelector('input,button') || {}).focus?.(), 30); }
const screen = (id, ...k) => h('div', { class: 'screen', id }, ...k);
const btn = (t, f, c = '') => h('button', { class: c, onclick: f }, t);

// ---------- ag ----------
function connect() {
  return new Promise((ok, no) => {
    if (ws && ws.readyState === 1) return ok();
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    ws.onopen = () => { send({ t: 'hello', name: myName }); ok(); };
    ws.onerror = () => { toast('Sunucuya bağlanılamadı'); no(); };
    ws.onclose = () => { if (mode !== 'menu' || cur?.id !== 'home') { toast('Bağlantı koptu'); stopLocal(); home(); } };
    ws.onmessage = e => onMsg(JSON.parse(e.data));
  });
}
const send = o => ws && ws.readyState === 1 && ws.send(JSON.stringify(o));
function onMsg(m) {
  if (m.t === 'hi') me = m.id;
  else if (m.t === 'rooms') { rooms = m.rooms; if (cur?.id === 'rooms') drawRooms(); }
  else if (m.t === 'lobby') lobby(m);
  else if (m.t === 'start') gameScreen(true);
  else if (m.t === 'state') { lg = m.g; draw(lg); hud(lg); if (lg.over) overlay(lg); }
  else if (m.t === 'err') toast(m.msg);
}

// ---------- ekranlar ----------
function nameScreen() {
  const i = h('input', { type: 'text', maxLength: 12, placeholder: 'Takma adın', value: myName });
  const go = () => { myName = i.value.trim().slice(0, 12); if (!myName) return toast('Bir isim yaz'); store.set('s8name', myName); home(); };
  show(screen('name', h('h1', {}, 'SNAKE-8'), h('div', { class: 'panel' }, h('p', {}, 'Oyuna girmek için bir isim seç.'), i), btn('Gir', go, 'primary big')));
  i.addEventListener('keydown', e => e.key === 'Enter' && go());
}
function home() {
  stopLocal(); if (ws && ws.readyState === 1) send({ t: 'leave' });
  show(screen('home', h('h1', {}, 'SNAKE-8'), h('p', { class: 'muted' }, 'Merhaba, ' + myName),
    btn('Oyun kur', () => settings('online'), 'primary big'), btn('Oyunlara katıl', rooms_, 'big'), btn('Yerel oyun', () => settings('local'), 'big'),
    btn('İsmi değiştir', nameScreen)));
}
const FIELDS = [['w', 'Genişlik', 12, 60, 10], ['h', 'Yükseklik', 12, 60, 10], ['tick', 'Adım süresi (ms)', 50, 400, 10], ['foodMax', 'Aynı anda yem', 1, 50, 1], ['foodEvery', 'Yem aralığı (adım)', 1, 100, 1], ['startLen', 'Başlangıç boyu', 2, 8, 1], ['corpse', 'Ceset yem %', 0, 100, 10], ['maxPlayers', 'Oyuncu sınırı', 2, 8, 1]];
const DEVS = [['wasd', 'Klavye WASD'], ['arrows', 'Klavye Oklar'], ['ijkl', 'Klavye IJKL'], ['pad0', 'Kol 1'], ['pad1', 'Kol 2'], ['pad2', 'Kol 3'], ['pad3', 'Kol 4'], ['touch', 'Dokunmatik']];
function settings(m) {
  const s = curSettings, inp = {};
  const rows = FIELDS.filter(f => m === 'online' || f[0] !== 'maxPlayers').map(([k, l, a, b, st]) => (inp[k] = h('input', { type: 'number', min: a, max: b, step: st, value: s[k] }), h('label', {}, l, inp[k])));
  const wrap = h('select', {}, h('option', { value: 1 }, 'Geçişli (karşıdan çıkar)'), h('option', { value: 0 }, 'Kapalı (çarpan ölür)')); wrap.value = s.wrap;
  const pw = h('input', { type: 'checkbox', checked: !!s.power });
  const roomName = h('input', { type: 'text', placeholder: 'Oda adı', maxLength: 20, value: myName + ' odası' }), roomPw = h('input', { type: 'password', placeholder: 'Şifre (isteğe bağlı)', maxLength: 20 });
  const cnt = h('select', {}, [1, 2, 3, 4].map(n => h('option', { value: n }, n + ' oyuncu'))), plist = h('div', { class: 'screen' });
  const lp = (() => { try { return JSON.parse(store.get('s8lp')) } catch { } })() || { n: 1, devs: ['wasd', 'arrows', 'pad0', 'pad1'] };
  const drawPl = () => { plist.replaceChildren(...[...Array(+cnt.value)].map((_, i) => { const d = h('select', { id: 'dev' + i }, DEVS.map(([v, t]) => h('option', { value: v }, t))); d.value = lp.devs[i]; d.onchange = () => { lp.devs[i] = d.value; store.set('s8lp', JSON.stringify(lp)); }; return h('label', {}, h('span', {}, h('i', { class: 'chip', style: 'background:' + COLORS[i] }), i ? 'Oyuncu ' + (i + 1) : myName), d); })); };
  cnt.value = lp.n; cnt.onchange = () => { lp.n = +cnt.value; store.set('s8lp', JSON.stringify(lp)); drawPl(); }; drawPl();
  const read = () => { const o = { wrap: +wrap.value, power: pw.checked ? 1 : 0 }; for (const k in inp) o[k] = +inp[k].value; curSettings = { ...DEF, ...curSettings, ...o }; store.set('s8set', JSON.stringify(curSettings)); return curSettings; };
  [...Object.values(inp), wrap, pw].forEach(e => e.addEventListener('change', read));
  const go = async () => {
    const o = read();
    if (m === 'local') { const pl = [...Array(+cnt.value)].map((_, i) => ({ id: 'L' + i, name: i ? 'Oyuncu ' + (i + 1) : myName, color: COLORS[i], dev: $('#dev' + i).value })); startLocal(o, pl); }
    else { try { await connect(); } catch { return; } send({ t: 'create', name: roomName.value, pw: roomPw.value, settings: o }); }
  };
  show(screen('settings', h('h2', {}, m === 'online' ? 'Oyun kur' : 'Yerel oyun'),
    h('div', { class: 'panel screen' }, m === 'online' ? [roomName, roomPw] : [h('label', {}, 'Oyuncu sayısı', cnt), plist]),
    h('div', { class: 'panel screen' }, rows, h('label', {}, 'Duvarlar', wrap), h('label', {}, 'Güçlendiriciler', pw)),
    h('div', { class: 'row' }, btn('Geri', home), btn(m === 'online' ? 'Odayı aç' : 'Başlat', go, 'primary'))), home);
}
async function rooms_() {
  try { await connect(); } catch { return; }
  const list = h('div', { class: 'screen', id: 'rl' });
  show(screen('rooms', h('h2', {}, 'Açık oyunlar'), list, h('div', { class: 'row' }, btn('Geri', home), btn('Yenile', () => send({ t: 'list' })))), home);
  send({ t: 'list' }); roomTimer = setInterval(() => send({ t: 'list' }), 2000);
}
function drawRooms() {
  const l = $('#rl'); if (!l) return;
  l.replaceChildren(...(rooms.length ? rooms.map(r => h('button', { class: 'room', disabled: r.playing || r.n >= r.max, onclick: () => { const pw = r.lock ? prompt('Şifre') : ''; send({ t: 'join', id: r.id, pw }); } },
    h('span', {}, (r.lock ? '🔒 ' : '') + r.name), h('span', {}, r.n + '/' + r.max + ' ' + r.w + 'x' + r.h + (r.playing ? ' ▶' : '')))) : [h('p', { class: 'muted' }, 'Açık oda yok. Yeni bir oyun kur!')]));
}
function lobby(m) {
  const mine = m.players.find(p => p.id === me), isOwner = m.owner === me;
  const sw = COLORS.map(c => h('button', { class: 'sw', style: 'background:' + c + (mine && mine.color === c ? ';border-color:#fff' : ''), disabled: m.players.some(p => p.color === c), onclick: () => send({ t: 'color', c }) }));
  const s = m.settings;
  show(screen('lobby', h('h2', {}, m.name), m.playing ? h('p', { class: 'muted' }, 'Oyun sürüyor, bitince tekrar başlatılır.') : '', h('p', { class: 'muted' }, `${s.w}x${s.h} · ${s.wrap ? 'geçişli' : 'kapalı'} · ${s.tick}ms · ${s.power ? 'güçlendirici açık' : 'güçlendirici yok'}`),
    h('div', { class: 'panel screen' }, m.players.map(p => h('span', {}, h('i', { class: 'chip', style: 'background:' + p.color }), p.name + (p.id === m.owner ? ' ★' : '')))),
    h('div', { class: 'row' }, sw),
    h('div', { class: 'row' }, btn('Ayrıl', home), isOwner ? h('button', { class: 'primary', disabled: !!m.playing, onclick: () => send({ t: 'start' }) }, 'Başlat') : h('p', { class: 'muted' }, 'Kurucunun başlatması bekleniyor'))), home);
}

// ---------- oyun ----------
function gameScreen(online) { gameOnline = online;
  const cv = h('canvas', { id: 'cv' }), ov = h('div', { id: 'over' });
  const dp = h('div', { id: 'dpad' }, [['u', 0, '▲'], ['l', 3, '◀'], ['r', 1, '▶'], ['d', 2, '▼']].map(([c, d, t]) => h('button', { class: c, onpointerdown: e => { e.preventDefault(); dispatch('touch', d); } }, t)));
  const ub = h('button', { id: 'usebtn', onpointerdown: e => { e.preventDefault(); dispatch('touch', 'u'); } }, 'YETENEK');
  show(h('div', { id: 'game' }, h('div', { id: 'hud' }), h('div', { id: 'cv-wrap' }, cv, ov, h('button', { id: 'xbtn', onclick: exitGame }, '✕')), h('div', { id: 'pad' }, dp, ub)));
  let sx, sy; cv.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  cv.addEventListener('touchend', e => { const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return; dispatch('touch', Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0)); }, { passive: true });
  if (online) ctrls = [{ devs: ['wasd', 'arrows', 'pad', 'touch'], act: a => a === 'u' ? send({ t: 'use' }) : send({ t: 'dir', d: a }) }];
}
function startLocal(set, pl) {
  stopLocal(); gameScreen(false);
  lg = newGame(set, pl); ctrls = pl.map(p => ({ devs: [p.dev], act: a => a === 'u' ? useItem(lg, p.id) : turn(lg, p.id, a) }));
  draw(lg); hud(lg);
  loopT = setInterval(() => { step(lg); draw(lg); hud(lg); if (lg.over) { clearInterval(loopT); overlay(lg, () => startLocal(set, pl)); } }, set.tick);
}
function exitGame() { if (gameOnline) send({ t: 'quit' }); else { stopLocal(); settings('local'); } }
function stopLocal() { clearInterval(loopT); loopT = null; ctrls = []; lg = null; }
function overlay(g, again) {
  const o = $('#over'); if (!o || o.style.display === 'flex') return;
  o.replaceChildren(h('h2', {}, g.winner ? 'Kazanan: ' + g.winner : 'Berabere!'), again ? btn('Tekrar oyna', again, 'primary') : h('p', { class: 'muted' }, 'Lobiye dönülüyor...'), btn(gameOnline ? 'Lobiye dön' : 'Ayarlara dön', exitGame));
  o.style.display = 'flex'; (o.querySelector('button') || {}).focus?.();
}
function hud(g) { const e = $('#hud'); if (!e) return; e.replaceChildren(...g.snakes.map(s => h('span', { class: s.alive ? '' : 'dead' }, h('i', { class: 'chip', style: 'background:' + s.color }), `${s.name} ${s.alive ? s.body.length : 0}${s.shield ? ' 🛡' : ''}${s.ghost > 0 ? ' 👻' : ''}${s.magnet > 0 ? ' 🧲' : ''}${s.rev > 0 ? ' 🔀' : ''}${s.frozen > 0 ? ' ❄' : ''}${s.inv ? ' [' + { k: '🪨', b: '💣', i: '❄' }[s.inv] + ']' : ''}`))); }
const GL = { g: '★', s: 'S', k: '▲', x: '☠', h: '👻', m: '🧲', b: '💣', i: '❄', v: '🔀', o: '💣' }, IC = { f: '#ff4d6d', g: '#ffd23f', s: '#4dd0ff', k: '#9aa0b4', x: '#a05cff', r: '#6b6f85', h: '#c8c8ff', m: '#ff8a3c', b: '#555', i: '#9be7ff', v: '#e05cff', o: '#ff4d6d' };
function draw(g) {
  const cv = $('#cv'); if (!cv) return; const w = $('#cv-wrap'), c = Math.max(4, Math.floor(Math.min((w.clientWidth - 8) / g.w, (w.clientHeight - 8) / g.h)));
  if (cv.width !== g.w * c) { cv.width = g.w * c; cv.height = g.h * c; }
  const x = cv.getContext('2d'); x.fillStyle = '#0b0820'; x.fillRect(0, 0, cv.width, cv.height);
  x.fillStyle = '#ffffff0a'; for (let i = 0; i < g.w; i++) for (let j = 0; j < g.h; j++) if ((i + j) % 2) x.fillRect(i * c, j * c, c, c);
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = 'bold ' + Math.floor(c * .8) + 'px monospace';
  g.items.forEach(i => {
    if (i.t === 'c') { x.fillStyle = '#ffffff55'; x.fillRect(i.x * c + c * .3, i.y * c + c * .3, c * .4, c * .4); return; }
    x.fillStyle = IC[i.t]; x.fillRect(i.x * c + 1, i.y * c + 1, c - 2, c - 2);
    if (GL[i.t]) { x.fillStyle = '#14102b'; x.fillText(GL[i.t], i.x * c + c / 2, i.y * c + c / 2 + 1); }
  });
  g.snakes.forEach(s => s.body.forEach((p, i) => { x.globalAlpha = s.ghost > 0 ? .45 : 1;
    x.fillStyle = s.color; x.fillRect(p[0] * c, p[1] * c, c - 1, c - 1);
    if (!i) { x.fillStyle = '#000a'; x.fillRect(p[0] * c + c * .25, p[1] * c + c * .25, c * .2, c * .2); x.fillRect(p[0] * c + c * .55, p[1] * c + c * .25, c * .2, c * .2); if (s.shield) { x.strokeStyle = '#4dd0ff'; x.lineWidth = 2; x.strokeRect(p[0] * c, p[1] * c, c, c); } if (s.id === me) { x.fillStyle = '#fff'; x.fillRect(p[0] * c + c * .4, p[1] * c + c * .65, c * .2, c * .2); } }
  }));
  x.globalAlpha = 1;
}
addEventListener('resize', () => lg && draw(lg));

// ---------- girdi (klavye + kol + dokunma) ----------
const KEYS = { wasd: { w: 0, d: 1, s: 2, a: 3, q: 'u' }, arrows: { arrowup: 0, arrowright: 1, arrowdown: 2, arrowleft: 3, enter: 'u', ' ': 'u' }, ijkl: { i: 0, l: 1, k: 2, j: 3, o: 'u' } };
function dispatch(dev, a) { ctrls.forEach(c => { if (c.devs.includes(dev) || (dev.startsWith('pad') && c.devs.includes('pad'))) c.act(a); }); }
function nav(d) {
  const els = [...cur.querySelectorAll('button,input,select')].filter(e => e.offsetParent && !e.disabled), a = document.activeElement;
  if ((d === 1 || d === 3) && a && (a.type === 'number' || a.tagName === 'SELECT')) { if (a.type === 'number') { d === 1 ? a.stepUp() : a.stepDown(); } else a.selectedIndex = Math.min(a.options.length - 1, Math.max(0, a.selectedIndex + (d === 1 ? 1 : -1))); a.dispatchEvent(new Event('change')); return; }
  if (!els.includes(a)) return els[0]?.focus();
  const r = a.getBoundingClientRect(), cx = r.x + r.width / 2, cy = r.y + r.height / 2; let best, bs = 1e9;
  els.forEach(e => { if (e === a) return; const q = e.getBoundingClientRect(), dx = q.x + q.width / 2 - cx, dy = q.y + q.height / 2 - cy;
    const ok = [dy < -4, dx > 4, dy > 4, dx < -4][d], p = d % 2 ? Math.abs(dx) : Math.abs(dy), s2 = d % 2 ? Math.abs(dy) : Math.abs(dx); if (ok && p + 2 * s2 < bs) { bs = p + 2 * s2; best = e; } });
  best?.focus();
}
const back = () => lastBack && lastBack(), act = () => { const a = document.activeElement; if (a && a.tagName === 'BUTTON') a.click(); };
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (mode === 'game') { for (const dev in KEYS) if (k in KEYS[dev]) { e.preventDefault(); dispatch(dev, KEYS[dev][k]); } if (k === 'escape') exitGame(); return; }
  const typing = e.target.type === 'text' || e.target.type === 'password';
  const m = { arrowup: 0, arrowright: 1, arrowdown: 2, arrowleft: 3 }[k];
  if (m !== undefined && !(typing && (m === 1 || m === 3))) { e.preventDefault(); nav(m); }
  else if (k === 'escape') back();
  else if (k === 'enter' && typing) { const p = cur.querySelector('.primary'); p && p.click(); }
});
const prev = {};
function poll() {
  [...(navigator.getGamepads?.() || [])].forEach(p => {
    if (!p) return; const b = i => p.buttons[i]?.pressed, ax = p.axes;
    const d = b(12) ? 0 : b(15) ? 1 : b(13) ? 2 : b(14) ? 3 : Math.abs(ax[0]) > .6 && Math.abs(ax[0]) >= Math.abs(ax[1]) ? (ax[0] > 0 ? 1 : 3) : Math.abs(ax[1]) > .6 ? (ax[1] > 0 ? 2 : 0) : -1;
    const st = prev[p.index] || (prev[p.index] = { d: -1, a: false, b: false });
    if (d !== st.d && d >= 0) mode === 'game' ? dispatch('pad' + p.index, d) : nav(d);
    if (b(0) && !st.a) mode === 'game' ? dispatch('pad' + p.index, 'u') : act();
    if (b(1) && !st.b && mode === 'menu') back();
    if (b(9) && !st.s && mode === 'game') exitGame();
    st.d = d; st.a = b(0); st.b = b(1); st.s = b(9);
  });
  requestAnimationFrame(poll);
}
poll();
document.addEventListener('visibilitychange', () => { if (document.hidden && loopT) { /* yerelde sekme gizlenince tarayici zaten yavaslatir */ } });
nameScreen(); if (myName) home();
