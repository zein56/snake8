// Ortak oyun motoru: hem tarayicida (yerel) hem sunucuda (online) calisir.
export const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
export const DEF = { w: 30, h: 30, wrap: 1, tick: 120, foodMax: 4, foodEvery: 10, startLen: 3, power: 1, corpse: 100, maxPlayers: 8 };
export const COLORS = ['#ff4d6d', '#4dd0ff', '#ffd23f', '#7dff6b', '#c77dff', '#ff9a3c', '#ffffff', '#2ee6a6'];
function rnd(g) { g.seed = (g.seed + 0x6D2B79F5) | 0; let t = g.seed; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }
const key = (x, y) => x + ',' + y;
export function newGame(s, players, seed = Date.now() | 0) {
  s = { ...DEF, ...s };
  const g = { ...s, seed, tick_n: 0, items: [], snakes: [], over: false, winner: null };
  const n = players.length, len = Math.min(s.startLen, Math.floor(s.w / 3) - 1);
  players.forEach((p, i) => {
    const y = Math.floor(s.h * (i + 1) / (n + 1)), x0 = Math.floor(s.w / 3), body = [];
    for (let k = 0; k < len; k++) body.push([x0 - k, y]);
    g.snakes.push({ id: p.id, name: p.name, color: p.color, body, dir: 1, q: [], alive: true, grow: 0, shield: 0, inv: null, use: false, score: 0, ghost: 0, magnet: 0, rev: 0, frozen: 0 });
  });
  return g;
}
export function turn(g, id, d) {
  const s = g.snakes.find(s => s.id === id); if (!s || !s.alive || s.q.length > 2) return;
  if (s.rev > 0) d = (d + 2) % 4;
  const last = s.q.length ? s.q[s.q.length - 1] : s.dir;
  if (d !== last && d !== (last + 2) % 4) s.q.push(d);
}
export function useItem(g, id) { const s = g.snakes.find(s => s.id === id); if (s && s.alive) s.use = true; }
const PICK = [['f', 50], ['g', 8], ['s', 7], ['k', 7], ['x', 7], ['h', 6], ['m', 6], ['b', 5], ['i', 4], ['v', 4]];
function corpse(g, cells) { cells.forEach(c => { if (rnd(g) * 100 < g.corpse && !g.items.some(i => i.x === c[0] && i.y === c[1])) g.items.push({ x: c[0], y: c[1], t: 'c' }); }); }
function explode(g, b) {
  const near = c => Math.abs(c[0] - b.x) <= 2 && Math.abs(c[1] - b.y) <= 2;
  g.items = g.items.filter(i => i.t !== 'r' || !near([i.x, i.y]));
  g.snakes.forEach(s => { if (!s.alive) return; const i = s.body.findIndex(near); if (i < 0) return; const lost = s.body.splice(i); corpse(g, lost); if (i === 0) { s.alive = false; s.body = []; } });
}
function spawn(g) {
  const occ = new Set(g.items.map(i => key(i.x, i.y)));
  g.snakes.forEach(s => s.body.forEach(c => occ.add(key(c[0], c[1]))));
  for (let tries = 0; tries < 50; tries++) {
    const x = Math.floor(rnd(g) * g.w), y = Math.floor(rnd(g) * g.h);
    if (occ.has(key(x, y))) continue;
    let t = 'f';
    if (g.power) { let r = rnd(g) * 100; for (const [k, w] of PICK) { if ((r -= w) < 0) { t = k; break; } } }
    g.items.push({ x, y, t }); return;
  }
}
export function step(g) {
  if (g.over) return g;
  g.tick_n++;
  g.snakes.forEach(s => { for (const k of ['ghost', 'magnet', 'rev']) if (s[k] > 0) s[k]--; });
  let alive = g.snakes.filter(s => s.alive);
  alive.forEach(s => { // yetenek kullan
    if (s.use && s.inv) {
      const t = s.body[s.body.length - 1];
      if (s.inv === 'k') g.items.push({ x: t[0], y: t[1], t: 'r', ttl: 80 });
      else if (s.inv === 'b') g.items.push({ x: t[0], y: t[1], t: 'o', ttl: 12 });
      else if (s.inv === 'i') alive.forEach(o => { if (o !== s) o.frozen = 6; });
      s.inv = null;
    }
    s.use = false;
  });
  const boom = [];
  g.items = g.items.filter(i => { if (i.t === 'r') return --i.ttl > 0; if (i.t === 'o') { if (--i.ttl > 0) return true; boom.push(i); return false; } return true; });
  boom.forEach(b => explode(g, b));
  alive = g.snakes.filter(s => s.alive);
  const moves = alive.map(s => {
    if (s.frozen > 0) { s.frozen--; return { s, nb: s.body, hold: true }; }
    if (s.q.length) s.dir = s.q.shift();
    let x = s.body[0][0] + DX[s.dir], y = s.body[0][1] + DY[s.dir], wall = false;
    if (x < 0 || y < 0 || x >= g.w || y >= g.h) { if (g.wrap) { x = (x + g.w) % g.w; y = (y + g.h) % g.h; } else wall = true; }
    const it = g.items.find(i => i.x === x && i.y === y);
    const grows = s.grow > 0 || (it && 'fgc'.includes(it.t));
    const nb = [[x, y], ...s.body]; if (!grows) nb.pop(); else if (s.grow > 0) s.grow--;
    return { s, nb, wall, it };
  });
  // kendi govdesi engel degil; sadece baska yilanlar (hayaletler sayilmaz)
  const occ = new Map();
  moves.forEach(m => { if (m.s.ghost > 0) return; m.nb.forEach(c => { const k = key(c[0], c[1]); if (!occ.has(k)) occ.set(k, new Set()); occ.get(k).add(m.s); }); });
  const rocks = new Set(g.items.filter(i => i.t === 'r').map(i => key(i.x, i.y)));
  const dead = [];
  moves.forEach(m => {
    if (m.hold) return;
    const h = key(m.nb[0][0], m.nb[0][1]), o = occ.get(h);
    let hit = m.wall || rocks.has(h) || (o && [...o].some(x => x !== m.s));
    if (m.s.ghost > 0 && !m.wall) hit = false;
    if (hit && m.s.shield && !m.wall) { m.s.shield = 0; m.hold = true; }
    else if (hit) dead.push(m);
  });
  moves.forEach(m => {
    if (dead.includes(m) || m.hold) return;
    m.s.body = m.nb;
    const it = m.it; if (!it || it.t === 'r' || it.t === 'o') return;
    g.items.splice(g.items.indexOf(it), 1);
    const s = m.s;
    if (it.t === 'f' || it.t === 'c') s.score++;
    if (it.t === 'g') { s.grow += 2; s.score += 3; }
    if (it.t === 's') s.shield = 1;
    if (it.t === 'k' || it.t === 'b' || it.t === 'i') s.inv = it.t;
    if (it.t === 'x') s.body.splice(Math.max(1, s.body.length - 3));
    if (it.t === 'h') s.ghost = 30;
    if (it.t === 'm') s.magnet = 40;
    if (it.t === 'v') s.rev = 25;
  });
  dead.forEach(m => { m.s.alive = false; corpse(g, m.s.body); m.s.body = []; });
  g.snakes.forEach(s => { // miknatis
    if (!s.alive || !(s.magnet > 0)) return;
    const [hx, hy] = s.body[0];
    g.items.forEach(i => {
      if (!'fgc'.includes(i.t)) return;
      const dx = hx - i.x, dy = hy - i.y; if (Math.abs(dx) + Math.abs(dy) > 5 || (!dx && !dy)) return;
      let nx = i.x, ny = i.y; if (Math.abs(dx) >= Math.abs(dy)) nx += Math.sign(dx); else ny += Math.sign(dy);
      if ((nx !== hx || ny !== hy) && !g.items.some(o => o.x === nx && o.y === ny)) { i.x = nx; i.y = ny; }
    });
  });
  if (g.tick_n % g.foodEvery === 0 && g.items.filter(i => !'rco'.includes(i.t)).length < g.foodMax) spawn(g);
  const left = g.snakes.filter(s => s.alive);
  if (left.length <= (g.snakes.length > 1 ? 1 : 0)) { g.over = true; g.winner = left[0] ? left[0].name : null; }
  return g;
}
