import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { newGame, step, turn, useItem, DEF, COLORS } from './public/core.js';
const PORT = process.env.PORT || 3000, DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = path.normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[\/\\])+/, '');
  if (p === '/' || p === '\\') p = '/index.html';
  const f = path.join(DIR, p);
  if (!f.startsWith(DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('404'); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
const wss = new WebSocketServer({ server, path: '/ws' });
const rooms = new Map(); let uid = 1;
const clamp = (v, a, b, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(b, Math.max(a, Math.round(v))) : d; };
const send = (ws, o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
function cleanSettings(s = {}) {
  return { w: clamp(s.w, 12, 60, DEF.w), h: clamp(s.h, 12, 60, DEF.h), wrap: s.wrap ? 1 : 0, tick: clamp(s.tick, 50, 400, DEF.tick),
    foodMax: clamp(s.foodMax, 1, 50, DEF.foodMax), foodEvery: clamp(s.foodEvery, 1, 100, DEF.foodEvery), startLen: clamp(s.startLen, 2, 8, DEF.startLen),
    power: s.power ? 1 : 0, corpse: clamp(s.corpse, 0, 100, DEF.corpse), maxPlayers: clamp(s.maxPlayers, 2, 8, DEF.maxPlayers) };
}
const roomInfo = r => ({ id: r.id, name: r.name, lock: !!r.pw, n: r.players.length, max: r.settings.maxPlayers, playing: !!r.game, w: r.settings.w, h: r.settings.h, wrap: r.settings.wrap });
const lobbyMsg = r => ({ t: 'lobby', playing: !!r.game, id: r.id, name: r.name, owner: r.owner, settings: r.settings, players: r.players.map(p => ({ id: p.id, name: p.name, color: p.color })) });
const bcast = (r, o) => r.players.forEach(p => send(p.ws, o));
function leave(ws) {
  const r = ws.room; if (!r) return; ws.room = null;
  r.players = r.players.filter(p => p.ws !== ws);
  if (r.game) { const s = r.game.snakes.find(s => s.id === ws.pid); if (s) { s.alive = false; s.body = []; } }
  if (!r.players.length) { clearInterval(r.timer); rooms.delete(r.id); return; }
  if (r.owner === ws.pid) r.owner = r.players[0].id;
  if (!r.game) bcast(r, lobbyMsg(r));
}
function start(r) {
  r.game = newGame(r.settings, r.players.map(p => ({ id: p.id, name: p.name, color: p.color })));
  bcast(r, { t: 'start' });
  r.timer = setInterval(() => {
    step(r.game); bcast(r, { t: 'state', g: r.game });
    if (r.game.over) { clearInterval(r.timer); setTimeout(() => { r.game = null; bcast(r, lobbyMsg(r)); }, 4000); }
  }, r.settings.tick);
}
wss.on('connection', ws => {
  ws.pid = 'p' + uid++; ws.name = 'Oyuncu'; ws.room = null;
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const r = ws.room;
    if (m.t === 'hello') { ws.name = String(m.name || 'Oyuncu').slice(0, 12); send(ws, { t: 'hi', id: ws.pid }); }
    else if (m.t === 'list') send(ws, { t: 'rooms', rooms: [...rooms.values()].map(roomInfo) });
    else if (m.t === 'create' && !r) {
      const room = { id: Math.random().toString(36).slice(2, 7), name: String(m.name || ws.name + ' odası').slice(0, 20), pw: String(m.pw || '').slice(0, 20),
        owner: ws.pid, settings: cleanSettings(m.settings), players: [], game: null, timer: null };
      rooms.set(room.id, room); room.players.push({ id: ws.pid, name: ws.name, color: COLORS[0], ws }); ws.room = room; send(ws, lobbyMsg(room));
    } else if (m.t === 'join' && !r) {
      const room = rooms.get(m.id);
      if (!room) return send(ws, { t: 'err', msg: 'Oda bulunamadı' });
      if (room.pw && room.pw !== m.pw) return send(ws, { t: 'err', msg: 'Şifre yanlış' });
      if (room.game) return send(ws, { t: 'err', msg: 'Oyun başlamış' });
      if (room.players.length >= room.settings.maxPlayers) return send(ws, { t: 'err', msg: 'Oda dolu' });
      const color = COLORS.find(c => !room.players.some(p => p.color === c)) || COLORS[0];
      room.players.push({ id: ws.pid, name: ws.name, color, ws }); ws.room = room; bcast(room, lobbyMsg(room));
    } else if (m.t === 'color' && r && !r.game) {
      if (COLORS.includes(m.c) && !r.players.some(p => p.color === m.c)) { r.players.find(p => p.ws === ws).color = m.c; bcast(r, lobbyMsg(r)); }
    } else if (m.t === 'start' && r && !r.game && r.owner === ws.pid && r.players.length >= 1) start(r);
    else if (m.t === 'dir' && r && r.game) turn(r.game, ws.pid, m.d | 0);
    else if (m.t === 'use' && r && r.game) useItem(r.game, ws.pid);
    else if (m.t === 'quit' && r && r.game) { const s = r.game.snakes.find(s => s.id === ws.pid); if (s) { s.alive = false; s.body = []; } send(ws, lobbyMsg(r)); }
    else if (m.t === 'leave') leave(ws);
  });
  ws.on('close', () => leave(ws));
});
server.listen(PORT, () => console.log('Snake8 http://localhost:' + PORT));
