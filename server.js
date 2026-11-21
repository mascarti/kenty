// КЕНТОФОН — звонилка по ID
// Аккаунты (логин + пароль + ник), 6-значный ID, контакты, сигналинг для WebRTC-звонков.
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
const RING_TIMEOUT = 45_000; // сколько звонит, пока не сбросится
const LOST_GRACE = 20_000; // сколько ждём, если у человека отвалился интернет посреди звонка

// ---------- хранилище ----------
let db = { secret: null, users: {} };
try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { /* первый запуск */ }
db.users = db.users || {};
if (!process.env.SECRET && !db.secret) db.secret = crypto.randomBytes(32).toString('hex');
const SECRET = process.env.SECRET || db.secret;

const byLogin = new Map();
for (const u of Object.values(db.users)) byLogin.set(u.login.toLowerCase(), u.id);

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE + '.tmp', JSON.stringify(db));
      fs.renameSync(DATA_FILE + '.tmp', DATA_FILE);
    } catch (e) { console.error('Не смог сохранить базу:', e.message); }
  }, 300);
}
save();

// ---------- пароли и токены ----------
const hashPass = (pass, salt) => crypto.scryptSync(String(pass), salt, 32).toString('hex');
const sign = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
const safeEq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// В токене лежит подписанная копия аккаунта. Если бесплатный хостинг сотрёт базу
// (Render так делает при перезапуске), аккаунт восстановится, как только человек откроет сайт.
function makeToken(u) {
  const body = Buffer.from(JSON.stringify({ id: u.id, login: u.login, nick: u.nick, salt: u.salt, hash: u.hash })).toString('base64url');
  return body + '.' + sign(body);
}
function userFromToken(token) {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig || !safeEq(sig, sign(body))) return null;
  let p;
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
  if (!p || !p.id || !p.login) return null;
  let u = db.users[p.id];
  if (!u) {
    const owner = byLogin.get(p.login.toLowerCase());
    if (owner && owner !== p.id) return null;
    u = db.users[p.id] = { id: p.id, login: p.login, nick: p.nick || p.login, salt: p.salt, hash: p.hash, contacts: [], created: Date.now() };
    byLogin.set(p.login.toLowerCase(), p.id);
    save();
    console.log('Восстановил аккаунт из токена:', p.id);
  }
  return u;
}

function newId() {
  let id;
  do { id = String(crypto.randomInt(100000, 1000000)); } while (db.users[id]);
  return id;
}
const pub = (u) => ({ id: u.id, nick: u.nick, login: u.login });
const cleanNick = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 24);
const cleanId = (id) => String(id || '').replace(/\D/g, '').slice(0, 6);

// простая защита от перебора паролей
const hits = new Map();
function tooMany(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 10 * 60_000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 30;
}

// ---------- ICE (STUN/TURN) ----------
const iceServers = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
];
if (process.env.TURN_URL) {
  iceServers.push({
    urls: process.env.TURN_URL.split(',').map((s) => s.trim()).filter(Boolean),
    username: process.env.TURN_USERNAME || '',
    credential: process.env.TURN_CREDENTIAL || '',
  });
}

// ---------- HTTP ----------
const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (req, res) => res.send('ok'));
app.get('/api/ice', (req, res) => res.json({ iceServers }));

app.post('/api/register', (req, res) => {
  if (tooMany(req.ip)) return res.status(429).json({ error: 'Слишком много попыток, подожди пару минут' });
  const login = String(req.body?.login || '').trim();
  const password = String(req.body?.password || '');
  const nick = cleanNick(req.body?.nick) || login;
  if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(login)) return res.status(400).json({ error: 'Логин: 3–24 символа, латиница, цифры, _ . -' });
  if (password.length < 4) return res.status(400).json({ error: 'Пароль минимум 4 символа' });
  if (byLogin.has(login.toLowerCase())) return res.status(409).json({ error: 'Такой логин уже занят' });
  const salt = crypto.randomBytes(16).toString('hex');
  const u = { id: newId(), login, nick, salt, hash: hashPass(password, salt), contacts: [], created: Date.now() };
  db.users[u.id] = u;
  byLogin.set(login.toLowerCase(), u.id);
  save();
  res.json({ token: makeToken(u), me: pub(u) });
});

app.post('/api/login', (req, res) => {
  if (tooMany(req.ip)) return res.status(429).json({ error: 'Слишком много попыток, подожди пару минут' });
  const login = String(req.body?.login || '').trim().toLowerCase();
  const u = db.users[byLogin.get(login)];
  if (!u || !safeEq(hashPass(req.body?.password, u.salt), u.hash)) return res.status(401).json({ error: 'Неверный логин или пароль' });
  res.json({ token: makeToken(u), me: pub(u) });
});

// ---------- realtime ----------
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 20_000, pingTimeout: 20_000 });

const online = new Map(); // userId -> Set(socketId)
const calls = new Map(); // callId -> { id, from, to, video, state, timer }
const busy = new Map(); // userId -> callId
const lostTimers = new Map(); // userId -> timeout

const room = (id) => 'u:' + id;
const isOnline = (id) => online.has(id);

function contactView(id) {
  const c = db.users[id];
  return { id, nick: c ? c.nick : null, online: isOnline(id) };
}
// всем, у кого этот человек в контактах
function toFans(uid, event, payload) {
  for (const oid of online.keys()) {
    if (db.users[oid]?.contacts.includes(uid)) io.to(room(oid)).emit(event, payload);
  }
}
function addContact(u, id) {
  if (!id || id === u.id || u.contacts.includes(id) || u.contacts.length >= 300) return false;
  u.contacts.push(id);
  return true;
}
function endCall(call, reason) {
  if (!calls.has(call.id)) return;
  clearTimeout(call.timer);
  calls.delete(call.id);
  if (busy.get(call.from) === call.id) busy.delete(call.from);
  if (busy.get(call.to) === call.id) busy.delete(call.to);
  io.to(room(call.from)).to(room(call.to)).emit('call:ended', { callId: call.id, reason });
}

io.use((socket, next) => {
  const u = userFromToken(socket.handshake.auth?.token);
  if (!u) return next(new Error('auth'));
  socket.data.uid = u.id;
  next();
});

io.on('connection', (socket) => {
  const uid = socket.data.uid;
  const me = db.users[uid];
  socket.join(room(uid));
  clearTimeout(lostTimers.get(uid));
  lostTimers.delete(uid);
  if (!online.has(uid)) {
    online.set(uid, new Set());
    toFans(uid, 'presence', { id: uid, nick: me.nick, online: true });
  }
  online.get(uid).add(socket.id);

  // клиент присылает свои контакты из памяти телефона — так список не теряется
  socket.on('hello', (data, ack) => {
    const ids = Array.isArray(data?.contacts) ? data.contacts : [];
    let changed = false;
    for (const raw of ids.slice(0, 300)) changed = addContact(me, cleanId(raw)) || changed;
    if (changed) save();
    const active = [...calls.values()].find((c) => c.state === 'ringing' && c.to === uid);
    if (active) socket.emit('call:incoming', { callId: active.id, from: { id: active.from, nick: db.users[active.from]?.nick }, video: active.video });
    ack?.({ me: pub(me), token: makeToken(me), contacts: me.contacts.map(contactView) });
  });

  socket.on('find', (data, ack) => {
    const id = cleanId(data?.id);
    const u = db.users[id];
    if (!u) return ack?.({ error: 'Никого с таким ID. Проверь цифры или пусть друг сначала зайдёт на сайт' });
    if (id === uid) return ack?.({ error: 'Это твой собственный ID 🙂' });
    ack?.({ user: { id, nick: u.nick, online: isOnline(id), added: me.contacts.includes(id) } });
  });

  socket.on('add', (data, ack) => {
    const id = cleanId(data?.id);
    const other = db.users[id];
    if (!other || id === uid) return ack?.({ error: 'Не получилось добавить' });
    addContact(me, id);
    if (addContact(other, uid)) io.to(room(id)).emit('contact:new', contactView(uid));
    save();
    ack?.({ contact: contactView(id) });
  });

  socket.on('remove', (data, ack) => {
    const id = cleanId(data?.id);
    me.contacts = me.contacts.filter((c) => c !== id);
    save();
    ack?.({ ok: true });
  });

  socket.on('nick', (data, ack) => {
    const nick = cleanNick(data?.nick);
    if (!nick) return ack?.({ error: 'Ник не может быть пустым' });
    me.nick = nick;
    save();
    toFans(uid, 'presence', { id: uid, nick, online: true });
    ack?.({ me: pub(me), token: makeToken(me) });
  });

  // ---- звонки ----
  socket.on('call:start', (data, ack) => {
    const to = cleanId(data?.to);
    if (!db.users[to] || to === uid) return ack?.({ error: 'Некому звонить' });
    if (!isOnline(to)) return ack?.({ error: (db.users[to].nick || 'Друг') + ' сейчас не в сети' });
    if (busy.has(to)) return ack?.({ error: (db.users[to].nick || 'Друг') + ' сейчас разговаривает' });
    if (busy.has(uid)) endCall(calls.get(busy.get(uid)) || { id: '' }, 'ended');
    const call = { id: crypto.randomUUID(), from: uid, to, video: !!data?.video, state: 'ringing' };
    call.timer = setTimeout(() => endCall(call, 'noanswer'), RING_TIMEOUT);
    calls.set(call.id, call);
    busy.set(uid, call.id);
    busy.set(to, call.id);
    io.to(room(to)).emit('call:incoming', { callId: call.id, from: { id: uid, nick: me.nick }, video: call.video });
    ack?.({ callId: call.id });
  });

  socket.on('call:accept', (data, ack) => {
    const call = calls.get(data?.callId);
    if (!call || call.to !== uid || call.state !== 'ringing') return ack?.({ error: 'Звонок уже закончился' });
    call.state = 'active';
    clearTimeout(call.timer);
    socket.to(room(uid)).emit('call:gone', { callId: call.id }); // на других вкладках перестаёт звонить
    io.to(room(call.from)).emit('call:accepted', { callId: call.id });
    ack?.({ ok: true });
  });

  socket.on('call:decline', (data) => {
    const call = calls.get(data?.callId);
    if (call && call.to === uid && call.state === 'ringing') endCall(call, 'declined');
  });

  socket.on('call:end', (data) => {
    const call = calls.get(data?.callId);
    if (call && (call.from === uid || call.to === uid)) endCall(call, call.state === 'ringing' && call.from === uid ? 'cancelled' : 'ended');
  });

  socket.on('signal', (data) => {
    const call = calls.get(data?.callId);
    if (!call || call.state !== 'active') return;
    const peer = call.from === uid ? call.to : call.to === uid ? call.from : null;
    if (peer) io.to(room(peer)).emit('signal', { callId: call.id, data: data.data });
  });

  socket.on('disconnect', () => {
    const set = online.get(uid);
    if (!set) return;
    set.delete(socket.id);
    if (set.size) return;
    online.delete(uid);
    toFans(uid, 'presence', { id: uid, nick: me.nick, online: false });
    // даём 20 секунд на переподключение, звук между телефонами при этом не рвётся
    lostTimers.set(uid, setTimeout(() => {
      lostTimers.delete(uid);
      if (isOnline(uid)) return;
      const callId = busy.get(uid);
      if (callId && calls.has(callId)) endCall(calls.get(callId), 'lost');
    }, LOST_GRACE));
  });
});

server.listen(PORT, () => console.log('КЕНТОФОН запущен на порту ' + PORT));
