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
    g.snakes.push({ id: p.id, name: p.name, color: p.color, body, dir: 1, q: [], alive: true, grow: 0, shield: 0, inv: null, use: false, score: 0 });
  });
  return g;
}
export function turn(g, id, d) {
  const s = g.snakes.find(s => s.id === id); if (!s || !s.alive || s.q.length > 2) return;
  const last = s.q.length ? s.q[s.q.length - 1] : s.dir;
  if (d !== last && d !== (last + 2) % 4) s.q.push(d);
}
export function useItem(g, id) { const s = g.snakes.find(s => s.id === id); if (s && s.alive) s.use = true; }
function spawn(g) {
  const occ = new Set(g.items.map(i => key(i.x, i.y)));
  g.snakes.forEach(s => s.body.forEach(c => occ.add(key(c[0], c[1]))));
  for (let tries = 0; tries < 50; tries++) {
    const x = Math.floor(rnd(g) * g.w), y = Math.floor(rnd(g) * g.h);
    if (occ.has(key(x, y))) continue;
    const r = rnd(g); let t = 'f';
    if (g.power) t = r < .6 ? 'f' : r < .7 ? 'g' : r < .8 ? 's' : r < .9 ? 'k' : 'x';
    g.items.push({ x, y, t }); return;
  }
}
export function step(g) {
  if (g.over) return g;
  g.tick_n++;
  const alive = g.snakes.filter(s => s.alive);
  // yetenek: tas birak
  alive.forEach(s => { if (s.use && s.inv === 'k') { const t = s.body[s.body.length - 1]; g.items.push({ x: t[0], y: t[1], t: 'r', ttl: 80 }); s.inv = null; } s.use = false; });
  g.items = g.items.filter(i => i.t !== 'r' || --i.ttl > 0);
  // hareket
  const moves = alive.map(s => {
    if (s.q.length) s.dir = s.q.shift();
    let x = s.body[0][0] + DX[s.dir], y = s.body[0][1] + DY[s.dir], wall = false;
    if (x < 0 || y < 0 || x >= g.w || y >= g.h) { if (g.wrap) { x = (x + g.w) % g.w; y = (y + g.h) % g.h; } else wall = true; }
    const it = g.items.find(i => i.x === x && i.y === y);
    const grows = s.grow > 0 || (it && 'fgc'.includes(it.t));
    const nb = [[x, y], ...s.body]; if (!grows) nb.pop(); else if (s.grow > 0) s.grow--;
    return { s, nb, wall, it };
  });
  const occ = new Map();
  moves.forEach(m => m.nb.forEach(c => occ.set(key(c[0], c[1]), (occ.get(key(c[0], c[1])) || 0) + 1)));
  const rocks = new Set(g.items.filter(i => i.t === 'r').map(i => key(i.x, i.y)));
  const dead = [];
  moves.forEach(m => {
    const h = key(m.nb[0][0], m.nb[0][1]);
    const hit = m.wall || occ.get(h) > 1 || rocks.has(h);
    if (hit && m.s.shield && !m.wall) { m.s.shield = 0; m.hold = true; }
    else if (hit) dead.push(m);
  });
  moves.forEach(m => {
    if (dead.includes(m) || m.hold) return;
    m.s.body = m.nb;
    const it = m.it; if (!it || it.t === 'r') return;
    g.items.splice(g.items.indexOf(it), 1);
    if (it.t === 'f' || it.t === 'c') m.s.score++;
    if (it.t === 'g') { m.s.grow += 2; m.s.score += 3; }
    if (it.t === 's') m.s.shield = 1;
    if (it.t === 'k') m.s.inv = 'k';
    if (it.t === 'x') m.s.body.splice(Math.max(1, m.s.body.length - 3));
  });
  dead.forEach(m => { // ceset -> yem
    m.s.alive = false;
    m.s.body.forEach(c => { if (rnd(g) * 100 < g.corpse && !g.items.some(i => i.x === c[0] && i.y === c[1])) g.items.push({ x: c[0], y: c[1], t: 'c' }); });
    m.s.body = [];
  });
  if (g.tick_n % g.foodEvery === 0 && g.items.filter(i => 'fgskxc'.includes(i.t) && i.t !== 'c').length < g.foodMax) spawn(g);
  const left = g.snakes.filter(s => s.alive);
  if (left.length <= (g.snakes.length > 1 ? 1 : 0)) { g.over = true; g.winner = left[0] ? left[0].name : null; }
  return g;
}
