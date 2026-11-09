// Luật chơi & trạng thái thư viện. Chạy trên server (Node) và trong chế độ chạy thử (trình duyệt).
// Giao tiếp: core.message(sid, msg) nhận lệnh, gọi send(sid, msg) để trả lời.
import { CONFIG, SHOP_BY_ID, sanitizeAvatar, makeUsername, validPassword } from './config.js';
import { LAYOUT, SEAT_BY_ID, SHELF_BY_ID, SPAWN, ROOM } from './layout.js';
import { seedCatalog, normalizeBook } from './catalog.js';

export const DB_VERSION = 2;
export const dayKey = (ts) => new Date(ts).toLocaleDateString('sv-SE', { timeZone: CONFIG.TZ });
const P = (n) => Math.round(n * 10);           // điểm → đơn vị 0.1
const fmt = (t) => (t / 10).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const isLib = (uid) => typeof uid === 'string' && uid.startsWith('L:');

export class LibraryCore {
  constructor({ db, send, now = () => Date.now(), hashPin, verifyPin, randomId, onChange = () => {}, librarians = [], allowChosenUsername = false }) {
    this.db = db;
    db.version ||= DB_VERSION;
    db.users ||= {}; db.unames ||= {}; db.tokens ||= {}; db.libInbox ||= {};
    db.catalog ||= seedCatalog();
    this.send = send; this.now = now; this.hashPin = hashPin; this.verifyPin = verifyPin;
    this.randomId = randomId; this.onChange = onChange; this.allowChosenUsername = allowChosenUsername;
    this.sessions = new Map();   // sid -> uid | null
    this.players = new Map();    // uid -> trạng thái đang online
    this.seats = {};             // seatId -> uid
    this.chat = [];
    this.dirty = new Set();
    this.reqs = [];              // yêu cầu đang chờ thủ thư duyệt
    this.fails = new Map();      // username -> { n, until }
    this.catDirty = false;
    this.lastTick = now();
    this.libUsers = {};
    this.indexCatalog();
    this.setLibrarians(librarians);
  }

  // ================= Tài khoản thủ thư (đọc từ file riêng) =================
  setLibrarians(defs) {
    const ok = [];
    for (const d of Array.isArray(defs) ? defs : []) {
      if (!d || !/^[a-z0-9_-]{1,20}$/i.test(d.id) || !d.username || !d.password || !d.name) { console.warn('Bỏ qua tài khoản thủ thư không hợp lệ:', d?.id); continue; }
      ok.push({ id: 'L:' + d.id, username: String(d.username).trim().toLowerCase(), password: String(d.password), name: clean(d.name, 40),
        post: d.post === 1 ? 1 : 0, avatar: sanitizeAvatar({ bagColor: '#1d1d1f', ...d.avatar }) });
    }
    const old = this.libUsers;
    this.libDefs = ok;
    this.libUsers = {};
    for (const d of ok) {
      const prev = old[d.id];
      this.libUsers[d.id] = { id: d.id, role: 'librarian', name: d.name, username: d.username, avatar: d.avatar, post: d.post,
        faculty: 'Thủ thư', cls: '', points: 0, inventory: {}, borrowed: [], history: [], streak: 0, checkins: 0, totalStudySec: prev?.totalStudySec || 0 };
    }
    // thủ thư bị xóa khỏi file hoặc đổi mật khẩu khi đang online → đăng xuất
    for (const [uid, p] of this.players) {
      if (!isLib(uid)) continue;
      const d = ok.find(x => x.id === uid);
      if (!d || d.password !== p.libPassword) { this.send(p.sid, { t: 'kicked', text: 'Tài khoản thủ thư vừa được cập nhật. Vui lòng đăng nhập lại.' }); this.sessions.set(p.sid, null); this.leave(uid); }
      else { p.libPassword = d.password; }
    }
    this.broadcastLibs();
  }
  libList() {
    return this.libDefs.map(d => ({ id: d.id, name: d.name, avatar: d.avatar, post: d.post, online: this.players.has(d.id) }));
  }
  broadcastLibs() { if (this.players) this.all({ t: 'libs', libs: this.libList() }); }
  u(uid) { return this.db.users[uid] || this.libUsers[uid]; }

  // ================= Danh mục sách =================
  indexCatalog() {
    this.bookIdx = new Map(this.db.catalog.books.map(b => [b.id, b]));
    this.loans = {};
    for (const u of Object.values(this.db.users)) for (const r of u.borrowed || []) this.loans[r.bookId] = (this.loans[r.bookId] || 0) + 1;
  }
  avail(id) { const b = this.bookIdx.get(id); return b ? b.copies - (this.loans[id] || 0) : 0; }
  availMap() { const o = {}; for (const b of this.db.catalog.books) o[b.id] = this.avail(b.id); return o; }
  catalogChanged() { this.indexCatalog(); this.catDirty = true; this.onChange(); }
  bookUpdate(id) { this.all({ t: 'book', id, n: this.avail(id) }); this.loansDirty = true; }

  // ================= Tiện ích gửi =================
  sidOf(uid) { return this.players.get(uid)?.sid; }
  to(uid, msg) { const sid = this.sidOf(uid); if (sid != null) this.send(sid, msg); }
  all(msg, exceptUid) { for (const p of this.players.values()) if (p.id !== exceptUid) this.send(p.sid, msg); }
  toast(uid, text, kind = 'info') { this.to(uid, { t: 'toast', text, kind }); }
  err(sid, text) { this.send(sid, { t: 'error', text }); }
  admin(uid, ok, text, op) { this.to(uid, { t: 'adminResult', ok, text, op }); }

  pub(p) {
    const u = this.u(p.id);
    return { id: p.id, name: u.name, role: u.role, faculty: u.faculty, avatar: u.avatar, x: p.x, z: p.z, ry: p.ry, a: p.a,
      seat: p.seat, act: { k: p.act.k, book: p.act.book, paused: p.act.paused } };
  }
  priv(uid) {
    const u = this.u(uid); const p = this.players.get(uid); const today = dayKey(this.now());
    const base = {
      id: uid, role: u.role, name: u.name, username: u.username, faculty: u.faculty, cls: u.cls, avatar: u.avatar,
      act: p ? { k: p.act.k, book: p.act.book, held: p.held, accum: p.act.accum, paused: p.act.paused } : null,
    };
    if (u.role === 'librarian') return { ...base, pendingCount: this.reqs.filter(r => r.lib === uid).length };
    return {
      ...base,
      points: u.points / 10, inventory: u.inventory, borrowed: u.borrowed, history: u.history.slice(0, 30),
      streak: u.streak, checkins: u.checkins,
      studyToday: u.studyDay === today ? u.studyEarned / 10 : 0,
      greetToday: u.greetDay === today ? u.greetEarned / 10 : 0,
      nextGreetAt: (u.lastGreetAt || 0) + CONFIG.GREET_COOLDOWN_SEC * 1000,
      nextGiftAt: (u.lastGiftAt || 0) + CONFIG.GIFT_COOLDOWN_SEC * 1000,
      totalStudyMin: Math.floor((u.totalStudySec || 0) / 60),
      pending: this.reqs.filter(r => r.uid === uid).map(r => ({ id: r.id, type: r.type, book: r.book, item: r.item, qty: r.qty, lib: r.lib, libName: this.u(r.lib)?.name, ts: r.ts })),
    };
  }
  me(uid) { if (this.players.has(uid)) this.to(uid, { t: 'me', you: this.priv(uid) }); }

  award(uid, tenths, reason) {
    const u = this.db.users[uid]; if (!u) return;
    u.points = Math.max(0, u.points + tenths);
    u.history.unshift({ ts: this.now(), d: tenths / 10, r: reason });
    u.history.length = Math.min(u.history.length, 40);
    this.onChange();
  }

  // ================= Kết nối =================
  connect(sid) { this.sessions.set(sid, null); }
  disconnect(sid) {
    const uid = this.sessions.get(sid);
    this.sessions.delete(sid);
    if (uid && this.players.get(uid)?.sid === sid) this.leave(uid);
  }
  leave(uid) {
    const p = this.players.get(uid); if (!p) return;
    if (p.seat) delete this.seats[p.seat];
    this.players.delete(uid);
    this.dirty.delete(uid);
    this.all({ t: 'leave', id: uid, seat: p.seat });
    if (isLib(uid)) {
      // thủ thư rời đi: hệ thống tự xử lý các yêu cầu còn chờ
      for (const r of this.reqs.filter(r => r.lib === uid)) this.resolveReq(r, true, null, true);
      this.broadcastLibs();
    } else {
      const mine = this.reqs.filter(r => r.uid === uid);
      if (mine.length) { this.reqs = this.reqs.filter(r => r.uid !== uid); for (const l of new Set(mine.map(r => r.lib))) this.sendReqs(l); }
    }
    this.onChange();
  }

  message(sid, m) {
    if (!m || typeof m.t !== 'string' || !this.sessions.has(sid)) return;
    const uid = this.sessions.get(sid);
    try {
      if (!uid) {
        if (m.t === 'register') return this.register(sid, m);
        if (m.t === 'login') return this.login(sid, m);
        if (m.t === 'resume') return this.resume(sid, m);
        return;
      }
      if (m.t.startsWith('lib_') && !isLib(uid)) return;
      const h = this['on_' + m.t];
      if (typeof h === 'function') h.call(this, uid, m, sid);
    } catch (e) {
      console.error('core error', m.t, e);
      this.err(sid, 'Có lỗi xảy ra, thử lại sau.');
    }
  }

  // ================= Đăng ký / đăng nhập =================
  newUsername(wanted) {
    const taken = (n) => this.db.unames[n] || this.libDefs.some(d => d.username === n.toLowerCase());
    if (wanted) { const n = clean(wanted, 12).toUpperCase(); if (/^[A-Z0-9]{4,12}$/.test(n) && !taken(n)) return n; }
    for (;;) { const n = makeUsername(); if (!taken(n)) return n; }
  }
  register(sid, m) {
    const role = m.role === 'lecturer' ? 'lecturer' : 'student';
    const name = clean(m.name, 40), faculty = clean(m.faculty, 60), cls = role === 'student' ? clean(m.cls, 30) : '';
    const pass = String(m.password || '');
    if (name.length < 2) return this.err(sid, 'Họ tên cần ít nhất 2 ký tự.');
    if (!validPassword(pass)) return this.err(sid, `Mật khẩu gồm đúng ${CONFIG.PASSWORD_LEN} ký tự, có cả chữ và số (không dấu).`);
    let existing = null;
    if (this.allowChosenUsername && m.username) existing = this.db.unames[String(m.username).toUpperCase()];
    if (existing) return this.login(sid, { username: m.username, password: pass });
    const username = this.newUsername(this.allowChosenUsername ? m.username : null);
    const id = 'u' + this.randomId(10);
    this.db.users[id] = {
      id, role, name, username, faculty, cls, pass: this.hashPin(pass), avatar: sanitizeAvatar(m.avatar),
      points: 0, inventory: {}, borrowed: [], history: [], createdAt: this.now(),
      lastCheckin: null, streak: 0, checkins: 0, studyDay: null, studyEarned: 0,
      greetDay: null, greetEarned: 0, lastGreetAt: 0, lastGiftAt: 0, totalStudySec: 0,
    };
    this.db.unames[username] = id;
    this.enter(sid, id, true, { username });
  }
  login(sid, m) {
    const raw = clean(m.username, 30); const key = raw.toLowerCase(); const pass = String(m.password || '');
    const f = this.fails.get(key);
    if (f && f.until > this.now()) return this.err(sid, `Đăng nhập sai quá nhiều lần. Thử lại sau ${Math.ceil((f.until - this.now()) / 60000)} phút.`);
    const lib = this.libDefs.find(d => d.username === key);
    let uid = null;
    if (lib) { if (pass === lib.password) uid = lib.id; }
    else {
      const id = this.db.unames[raw.toUpperCase()];
      if (id && this.verifyPin(pass, this.db.users[id].pass)) uid = id;
    }
    if (!uid) {
      const n = (f && f.until <= this.now() && f.until ? 0 : f?.n || 0) + 1;
      this.fails.set(key, { n, until: n >= CONFIG.LOGIN_MAX_FAIL ? this.now() + CONFIG.LOGIN_LOCK_SEC * 1000 : 0 });
      return this.err(sid, n >= CONFIG.LOGIN_MAX_FAIL ? `Sai ${n} lần liên tiếp. Tài khoản tạm khóa đăng nhập ${CONFIG.LOGIN_LOCK_SEC / 60} phút.` : 'Sai tên đăng nhập hoặc mật khẩu.');
    }
    this.fails.delete(key);
    if (m.avatar && !isLib(uid)) this.db.users[uid].avatar = sanitizeAvatar(m.avatar);
    this.enter(sid, uid, true);
  }
  resume(sid, m) {
    const id = this.db.tokens[String(m.token || '')];
    if (!id || !this.u(id)) return this.send(sid, { t: 'needLogin' });
    if (isLib(id)) {
      // token thủ thư chỉ còn hiệu lực khi mật khẩu trong file chưa đổi
      const d = this.libDefs.find(x => x.id === id); const tok = this.db.tokens['pw:' + m.token];
      if (!d || tok !== this.hashLibPw(d.password)) return this.send(sid, { t: 'needLogin' });
    }
    this.enter(sid, id, false);
  }
  hashLibPw(pw) { let h = 7; for (const c of pw) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h.toString(36); }

  enter(sid, uid, newToken, created = null) {
    const old = this.players.get(uid);
    if (old) { this.send(old.sid, { t: 'kicked', text: 'Tài khoản vừa đăng nhập ở nơi khác.' }); this.sessions.set(old.sid, null); this.leave(uid); }
    if (this.players.size >= CONFIG.MAX_ONLINE) return this.err(sid, 'Thư viện đang quá đông, vui lòng quay lại sau.');
    let token = null;
    if (newToken) {
      token = this.randomId(32);
      this.db.tokens[token] = uid;
      const list = (this.db.tokens['list:' + uid] ||= []);
      list.push(token);
      while (list.length > 5) { const t = list.shift(); delete this.db.tokens[t]; delete this.db.tokens['pw:' + t]; }
      if (isLib(uid)) this.db.tokens['pw:' + token] = this.hashLibPw(this.libDefs.find(d => d.id === uid).password);
      this.onChange();
    }
    this.sessions.set(sid, uid);
    const now = this.now();
    const lib = isLib(uid) ? this.libDefs.find(d => d.id === uid) : null;
    const spawn = lib ? LAYOUT.LIB_POSTS[lib.post] : { x: SPAWN.x + (Math.random() - 0.5), z: SPAWN.z, ry: SPAWN.ry };
    const p = { id: uid, sid, x: spawn.x, z: spawn.z, ry: spawn.ry, a: 'idle', seat: null,
      act: { k: 'idle', book: null, accum: 0, paused: false }, held: null, libPassword: lib?.password,
      presenceOk: now, presenceAsked: 0, lastChat: 0, day: dayKey(now) };
    this.players.set(uid, p);
    const checkin = lib ? null : this.checkin(uid);
    this.send(sid, {
      t: 'welcome', token, created, you: this.priv(uid), players: [...this.players.values()].map(q => this.pub(q)),
      seats: this.seats, chat: this.chat, catalog: this.db.catalog, avail: this.availMap(), libs: this.libList(), checkin,
    });
    this.all({ t: 'join', p: this.pub(p) }, uid);
    if (lib) {
      this.broadcastLibs();
      this.sendReqs(uid);
      const inbox = this.db.libInbox[uid] || [];
      for (const msg of inbox) this.send(sid, msg);
      if (inbox.length) { this.toast(uid, `Có ${inbox.length} tin nhắn gửi tới khi bạn vắng mặt.`); this.db.libInbox[uid] = []; }
    }
    this.onChange();
  }

  checkin(uid) {
    const u = this.db.users[uid]; const today = dayKey(this.now());
    if (u.lastCheckin === today) return null;
    const yesterday = dayKey(this.now() - 86400000);
    u.streak = u.lastCheckin === yesterday ? u.streak + 1 : 1;
    const first = !u.lastCheckin;
    u.lastCheckin = today; u.checkins = (u.checkins || 0) + 1;
    const pts = first ? CONFIG.START_POINTS : CONFIG.CHECKIN_POINTS;
    this.award(uid, P(pts), first ? 'Check-in lần đầu' : `Check-in ngày ${today}`);
    return { first, points: pts, streak: u.streak };
  }

  // ================= Di chuyển & chỗ ngồi =================
  on_move(uid, m) {
    const p = this.players.get(uid);
    const x = +m.x, z = +m.z, ry = +m.ry;
    if (![x, z, ry].every(Number.isFinite)) return;
    p.x = Math.max(0, Math.min(ROOM.w, x)); p.z = Math.max(0, Math.min(ROOM.d + 1, z)); p.ry = ry;
    p.a = ['idle', 'walk', 'run'].includes(m.a) ? m.a : 'idle';
    if (p.seat) this.standUp(uid, false);
    if (p.act.k === 'study' || (p.act.k === 'read' && p.a !== 'idle')) this.setAct(uid, 'idle', p.act.k === 'read' ? p.act.book : null);
    this.dirty.add(uid);
  }
  flush() {
    if (this.catDirty) { this.catDirty = false; this.all({ t: 'catalog', catalog: this.db.catalog, avail: this.availMap() }); }
    if (this.loansDirty) {
      this.loansDirty = false;
      const libs = this.libDefs.filter(d => this.players.has(d.id));
      if (libs.length) { const list = this.loanList(); for (const d of libs) this.to(d.id, { t: 'loans', list }); }
    }
    if (!this.dirty.size) return;
    const l = [];
    for (const id of this.dirty) { const p = this.players.get(id); if (p) l.push([id, +p.x.toFixed(2), +p.z.toFixed(2), +p.ry.toFixed(2), p.a]); }
    this.dirty.clear();
    if (l.length) this.all({ t: 'st', l });
  }
  on_sit(uid, m) {
    const p = this.players.get(uid); const s = SEAT_BY_ID[m.seat];
    if (!s) return;
    const owner = this.seats[s.id];
    if (owner && owner !== uid) {
      const free = LAYOUT.seats.filter(q => !this.seats[q.id]).length;
      this.to(uid, { t: 'sitFail', seat: s.id });
      return this.toast(uid, free ? 'Ghế này vừa có người ngồi. Chọn ghế khác nhé.' : 'Thư viện đã hết chỗ ngồi. Bạn có thể đứng đọc hoặc đi dạo quanh kệ sách.', 'warn');
    }
    if (p.seat && p.seat !== s.id) delete this.seats[p.seat];
    this.seats[s.id] = uid; p.seat = s.id; p.x = s.x; p.z = s.z; p.ry = s.ry; p.a = 'sit';
    this.all({ t: 'seat', seat: s.id, id: uid });
    this.setAct(uid, p.held ? 'read' : 'study', p.held);
  }
  standUp(uid, announceIdle = true) {
    const p = this.players.get(uid); if (!p.seat) return;
    const seat = p.seat; delete this.seats[seat]; p.seat = null; p.a = 'idle';
    this.all({ t: 'seat', seat, id: null });
    if (announceIdle) this.setAct(uid, 'idle', p.held);
  }
  on_stand(uid) { this.standUp(uid, true); }

  setAct(uid, k, book) {
    const p = this.players.get(uid);
    const changed = p.act.k !== k || p.act.book !== (book || null);
    p.act.k = k; p.act.book = book || null;
    if (k === 'idle') p.act.paused = false;
    if (changed) { this.all({ t: 'act', id: uid, act: { k, book: p.act.book, paused: p.act.paused } }); this.me(uid); }
  }
  on_activity(uid, m) {
    const p = this.players.get(uid); const u = this.u(uid);
    if (m.k === 'study') {
      if (!p.seat) return this.toast(uid, 'Hãy ngồi vào một ghế để học bài.', 'warn');
      return this.setAct(uid, 'study', null);
    }
    if (m.k === 'read') {
      const book = String(m.book || p.held || '');
      const ok = book && (book === p.held || u.borrowed.some(b => b.bookId === book));
      if (!ok) return this.toast(uid, 'Bạn cần lấy sách trên kệ hoặc mượn sách ở quầy thủ thư trước.', 'warn');
      return this.setAct(uid, 'read', book);
    }
    this.setAct(uid, 'idle', p.held);
  }
  on_takeBook(uid, m) {
    const p = this.players.get(uid); const shelf = SHELF_BY_ID[m.shelf]; const b = this.bookIdx.get(m.book);
    if (!shelf || !b || b.shelf !== shelf.id) return;
    p.held = b.id;
    this.setAct(uid, 'read', b.id);
    this.toast(uid, `Bạn đang đọc "${b.title}". Có thể đứng đọc tại kệ hoặc mang về chỗ ngồi.`);
    this.me(uid);
  }
  on_putBack(uid) {
    const p = this.players.get(uid); if (!p.held) return;
    const was = p.held; p.held = null;
    if (p.act.book === was) this.setAct(uid, p.seat ? 'study' : 'idle', null);
    this.me(uid);
  }
  on_presence(uid) {
    const p = this.players.get(uid);
    p.presenceOk = this.now(); p.presenceAsked = 0;
    if (p.act.paused) { p.act.paused = false; this.all({ t: 'act', id: uid, act: { k: p.act.k, book: p.act.book, paused: false } }); }
    this.me(uid);
  }

  // ================= Quầy thủ thư: mượn, trả, mua =================
  // Người chơi chọn thủ thư. Thủ thư đang online → gửi yêu cầu chờ duyệt; vắng mặt → hệ thống tự xử lý.
  pickLib(id) {
    if (id && this.libUsers[id]) return id;
    return this.libDefs.find(d => this.players.has(d.id))?.id || this.libDefs[0]?.id || null;
  }
  checkBorrow(uid, bookId) {
    const u = this.db.users[uid]; const b = this.bookIdx.get(bookId);
    if (!u) return 'Thủ thư không mượn sách được.';
    if (!b) return 'Không tìm thấy sách này.';
    if (!b.borrowable) return 'Sách này chỉ đọc tại chỗ, không cho mượn về.';
    if (u.borrowed.length >= CONFIG.BORROW_MAX) return `Mỗi người mượn tối đa ${CONFIG.BORROW_MAX} cuốn. Hãy trả bớt sách trước.`;
    if (u.borrowed.some(x => x.bookId === b.id)) return 'Bạn đang mượn cuốn này rồi.';
    if (this.avail(b.id) <= 0) return 'Cuốn này đã được mượn hết. Bạn có thể đọc tại kệ.';
    if (u.points < P(CONFIG.BORROW_COST)) return `Cần ${CONFIG.BORROW_COST} điểm để mượn sách.`;
    return null;
  }
  checkReturn(uid, bookId) {
    const u = this.db.users[uid];
    return u?.borrowed.some(x => x.bookId === bookId) ? null : 'Bạn không mượn cuốn này.';
  }
  checkBuy(uid, itemId, qty) {
    const u = this.db.users[uid]; const item = SHOP_BY_ID[itemId];
    if (!u || !item) return 'Không có món này.';
    const cost = P(item.price) * qty;
    if (u.points < cost) return `Chưa đủ điểm. Cần ${fmt(cost)} điểm.`;
    return null;
  }
  doBorrow(uid, bookId, by) {
    const e = this.checkBorrow(uid, bookId); if (e) return e;
    const u = this.db.users[uid]; const b = this.bookIdx.get(bookId); const now = this.now();
    u.borrowed.push({ bookId: b.id, title: b.title, at: now, due: now + CONFIG.BORROW_DAYS * 86400000, by });
    this.loans[b.id] = (this.loans[b.id] || 0) + 1;
    this.award(uid, -P(CONFIG.BORROW_COST), `Mượn "${b.title}" (${by})`);
    this.bookUpdate(b.id);
    this.toast(uid, `${by} đã cho bạn mượn "${b.title}". Hạn trả sau ${CONFIG.BORROW_DAYS} ngày.`, 'ok');
    this.me(uid);
    return null;
  }
  doReturn(uid, bookId, by) {
    const u = this.db.users[uid]; const i = u?.borrowed.findIndex(x => x.bookId === bookId) ?? -1;
    if (i < 0) return 'Người này không còn mượn cuốn sách đó.';
    const [rec] = u.borrowed.splice(i, 1);
    this.loans[rec.bookId] = Math.max(0, (this.loans[rec.bookId] || 0) - 1);
    const p = this.players.get(uid);
    if (p && p.act.book === rec.bookId && p.held !== rec.bookId) this.setAct(uid, p.seat ? 'study' : 'idle', null);
    if (this.now() <= rec.due) {
      this.award(uid, P(CONFIG.RETURN_ONTIME_BONUS), `Trả đúng hạn "${rec.title}"`);
      this.toast(uid, `${by} đã nhận sách. Trả đúng hạn, +${CONFIG.RETURN_ONTIME_BONUS} điểm.`, 'ok');
    } else {
      u.history.unshift({ ts: this.now(), d: 0, r: `Trả quá hạn "${rec.title}"` }); this.onChange();
      this.toast(uid, `${by} đã nhận sách (quá hạn nên không có điểm thưởng).`);
    }
    this.bookUpdate(rec.bookId);
    this.me(uid);
    return null;
  }
  doBuy(uid, itemId, qty, by) {
    const e = this.checkBuy(uid, itemId, qty); if (e) return e;
    const u = this.db.users[uid]; const item = SHOP_BY_ID[itemId];
    u.inventory[item.id] = (u.inventory[item.id] || 0) + qty;
    this.award(uid, -P(item.price) * qty, `Mua ${qty} × ${item.name} (${by})`);
    this.toast(uid, `${by} đã bán cho bạn ${qty} × ${item.name}.`, 'ok');
    this.me(uid);
    return null;
  }

  counterAction(uid, type, m) {
    if (isLib(uid)) return;
    const qty = Math.max(1, Math.min(10, Math.floor(+m.qty || 1)));
    const pre = type === 'borrow' ? this.checkBorrow(uid, m.book) : type === 'return' ? this.checkReturn(uid, m.book) : this.checkBuy(uid, m.item, qty);
    if (pre) return this.toast(uid, pre, 'warn');
    const lib = this.pickLib(m.lib);
    if (!lib) {
      const e = type === 'borrow' ? this.doBorrow(uid, m.book, 'Thư viện') : type === 'return' ? this.doReturn(uid, m.book, 'Thư viện') : this.doBuy(uid, m.item, qty, 'Thư viện');
      if (e) this.toast(uid, e, 'warn');
      return;
    }
    const libName = this.u(lib).name;
    if (!this.players.has(lib)) {
      const by = libName;
      const e = type === 'borrow' ? this.doBorrow(uid, m.book, by) : type === 'return' ? this.doReturn(uid, m.book, by) : this.doBuy(uid, m.item, qty, by);
      if (e) this.toast(uid, e, 'warn');
      return;
    }
    // thủ thư đang trực tiếp → tạo yêu cầu
    const mine = this.reqs.filter(r => r.uid === uid);
    if (mine.length >= CONFIG.LIB_MAX_PENDING) return this.toast(uid, `Bạn đang có ${mine.length} yêu cầu chờ duyệt. Đợi thủ thư xử lý xong nhé.`, 'warn');
    if (mine.some(r => r.type === type && (r.book || r.item) === (m.book || m.item))) return this.toast(uid, 'Yêu cầu này đang chờ thủ thư duyệt.', 'warn');
    const r = { id: 'r' + this.randomId(8), uid, lib, type, book: type === 'buy' ? null : m.book, item: type === 'buy' ? m.item : null, qty: type === 'buy' ? qty : 1, ts: this.now() };
    this.reqs.push(r);
    this.toast(uid, `Đã gửi yêu cầu tới ${libName}. Chờ thủ thư duyệt nhé.`);
    this.to(lib, { t: 'reqNew', req: this.reqView(r) });
    this.sendReqs(lib); this.me(uid);
  }
  on_borrow(uid, m) { this.counterAction(uid, 'borrow', m); }
  on_return(uid, m) { this.counterAction(uid, 'return', m); }
  on_buy(uid, m) { this.counterAction(uid, 'buy', m); }
  on_reqCancel(uid, m) {
    const r = this.reqs.find(x => x.id === m.id && x.uid === uid); if (!r) return;
    this.reqs = this.reqs.filter(x => x !== r);
    this.toast(uid, 'Đã hủy yêu cầu.'); this.sendReqs(r.lib); this.me(uid);
  }

  reqView(r) {
    const u = this.db.users[r.uid]; const b = r.book ? this.bookIdx.get(r.book) : null; const it = r.item ? SHOP_BY_ID[r.item] : null;
    const title = b?.title || u?.borrowed.find(x => x.bookId === r.book)?.title || r.book;
    return { id: r.id, type: r.type, ts: r.ts, uid: r.uid, name: u?.name, username: u?.username, role: u?.role, points: (u?.points || 0) / 10,
      book: r.book, title, item: r.item, itemName: it?.name, qty: r.qty,
      problem: r.type === 'borrow' ? this.checkBorrow(r.uid, r.book) : r.type === 'return' ? this.checkReturn(r.uid, r.book) : this.checkBuy(r.uid, r.item, r.qty) };
  }
  sendReqs(lib) { if (this.players.has(lib)) { this.to(lib, { t: 'reqs', list: this.reqs.filter(r => r.lib === lib).map(r => this.reqView(r)) }); this.me(lib); } }

  resolveReq(r, ok, note, auto = false) {
    this.reqs = this.reqs.filter(x => x !== r);
    const name = this.u(r.lib)?.name || 'Thủ thư';
    const by = auto ? `${name} (tự động)` : name;
    const what = r.type === 'buy' ? `${r.qty} × ${SHOP_BY_ID[r.item]?.name}` : `"${this.bookIdx.get(r.book)?.title || r.book}"`;
    let e = null;
    if (ok) {
      e = r.type === 'borrow' ? this.doBorrow(r.uid, r.book, by) : r.type === 'return' ? this.doReturn(r.uid, r.book, by) : this.doBuy(r.uid, r.item, r.qty, by);
      if (e) this.toast(r.uid, `Yêu cầu ${what} không thực hiện được: ${e}`, 'warn');
    } else {
      this.toast(r.uid, `${name} từ chối yêu cầu ${what}${note ? `: ${note}` : '.'}`, 'warn');
      if (note) { const dm = { t: 'dm', from: r.lib, fromName: name, to: r.uid, toName: this.u(r.uid)?.name, text: note, ts: this.now() }; this.to(r.uid, dm); this.to(r.lib, dm); }
    }
    this.me(r.uid); this.sendReqs(r.lib);
    return e;
  }
  on_lib_req(uid, m) {
    const r = this.reqs.find(x => x.id === m.id && x.lib === uid);
    if (!r) return this.admin(uid, false, 'Yêu cầu này không còn nữa (người chơi đã hủy hoặc rời đi).', 'req');
    const e = this.resolveReq(r, !!m.ok, clean(m.note, 160));
    this.admin(uid, !e, e ? `Không thực hiện được: ${e}` : m.ok ? 'Đã duyệt yêu cầu.' : 'Đã từ chối yêu cầu.', 'req');
  }

  // Thủ thư: xem toàn bộ sách đang cho mượn và thu hồi
  loanList() {
    const now = this.now(); const out = [];
    for (const u of Object.values(this.db.users)) for (const r of u.borrowed) out.push({ uid: u.id, name: u.name, username: u.username, role: u.role,
      online: this.players.has(u.id), bookId: r.bookId, title: this.bookIdx.get(r.bookId)?.title || r.title, at: r.at, due: r.due, overdue: now > r.due });
    return out.sort((a, b) => a.due - b.due);
  }
  on_lib_loans(uid) { this.to(uid, { t: 'loans', list: this.loanList() }); }
  on_lib_recall(uid, m) {
    const u = this.db.users[m.uid]; const i = u?.borrowed.findIndex(x => x.bookId === m.book) ?? -1;
    if (i < 0) return this.admin(uid, false, 'Không tìm thấy lượt mượn này.', 'recall');
    const [rec] = u.borrowed.splice(i, 1);
    this.loans[rec.bookId] = Math.max(0, (this.loans[rec.bookId] || 0) - 1);
    const lib = this.u(uid);
    const reason = clean(m.note, 120);
    u.history.unshift({ ts: this.now(), d: 0, r: `${lib.name} thu hồi "${rec.title}"${reason ? ` – ${reason}` : ''}` });
    const p = this.players.get(m.uid);
    if (p && p.act.book === rec.bookId && p.held !== rec.bookId) this.setAct(m.uid, p.seat ? 'study' : 'idle', null);
    this.toast(m.uid, `${lib.name} đã thu hồi sách "${rec.title}"${reason ? `: ${reason}` : '.'}`, 'warn');
    this.me(m.uid); this.bookUpdate(rec.bookId); this.onChange();
    this.admin(uid, true, `Đã thu hồi "${rec.title}" của ${u.name}.`, 'recall');
    this.on_lib_loans(uid);
  }

  // Thủ thư: quản lý sách, phân loại, kệ
  on_lib_bookSave(uid, m) {
    const cat = this.db.catalog;
    const r = normalizeBook(m.book || {}, cat);
    if (r.error) return this.admin(uid, false, r.error, 'book');
    const b = r.book; const orig = m.originalId ? String(m.originalId) : null;
    const loaned = (id) => this.loans[id] || 0;
    if (orig && orig !== b.id) {
      if (loaned(orig)) return this.admin(uid, false, 'Không đổi mã được vì sách đang có người mượn.', 'book');
      if (this.bookIdx.has(b.id)) return this.admin(uid, false, `Mã ${b.id} đã có sách khác dùng.`, 'book');
    } else if (!orig && this.bookIdx.has(b.id)) return this.admin(uid, false, `Mã ${b.id} đã tồn tại. Chọn mã khác hoặc sửa sách đó.`, 'book');
    if (b.copies < loaned(orig || b.id)) return this.admin(uid, false, `Đang có ${loaned(orig || b.id)} cuốn được mượn, số lượng không thể nhỏ hơn.`, 'book');
    const i = orig ? cat.books.findIndex(x => x.id === orig) : -1;
    if (i >= 0) cat.books[i] = b; else cat.books.push(b);
    this.catalogChanged();
    this.admin(uid, true, orig ? `Đã cập nhật "${b.title}".` : `Đã thêm "${b.title}" vào kệ ${b.shelf}.`, 'book');
  }
  on_lib_bookDelete(uid, m) {
    const cat = this.db.catalog; const b = this.bookIdx.get(m.id);
    if (!b) return this.admin(uid, false, 'Không tìm thấy sách.', 'book');
    if (this.loans[b.id]) return this.admin(uid, false, `Đang có ${this.loans[b.id]} người mượn "${b.title}". Thu hồi hoặc chờ trả trước khi xóa.`, 'book');
    cat.books = cat.books.filter(x => x.id !== b.id);
    for (const p of this.players.values()) if (p.held === b.id) { p.held = null; this.setAct(p.id, p.seat ? 'study' : 'idle', null); this.me(p.id); }
    this.catalogChanged();
    this.admin(uid, true, `Đã xóa "${b.title}".`, 'book');
  }
  on_lib_catSave(uid, m) {
    const cat = this.db.catalog; const name = clean(m.name, 60);
    if (name.length < 2) return this.admin(uid, false, 'Tên phân loại quá ngắn.', 'cat');
    if (cat.categories.some(c => c.name.toLowerCase() === name.toLowerCase() && c.id !== m.id)) return this.admin(uid, false, 'Đã có phân loại trùng tên.', 'cat');
    if (m.id) {
      const c = cat.categories.find(x => x.id === m.id); if (!c) return this.admin(uid, false, 'Không tìm thấy phân loại.', 'cat');
      c.name = name;
    } else {
      let n = cat.categories.length + 1; let id;
      do id = 'C' + String(n++).padStart(2, '0'); while (cat.categories.some(c => c.id === id));
      cat.categories.push({ id, name });
    }
    this.catalogChanged();
    this.admin(uid, true, m.id ? 'Đã đổi tên phân loại.' : `Đã thêm phân loại "${name}".`, 'cat');
  }
  on_lib_catDelete(uid, m) {
    const cat = this.db.catalog; const used = cat.books.filter(b => b.category === m.id).length;
    if (used) return this.admin(uid, false, `Còn ${used} đầu sách thuộc phân loại này. Chuyển chúng sang phân loại khác trước.`, 'cat');
    cat.categories = cat.categories.filter(c => c.id !== m.id);
    this.catalogChanged();
    this.admin(uid, true, 'Đã xóa phân loại.', 'cat');
  }
  on_lib_shelfLabel(uid, m) {
    if (!SHELF_BY_ID[m.shelf]) return;
    this.db.catalog.shelfLabels[m.shelf] = clean(m.label, 40);
    this.catalogChanged();
    this.admin(uid, true, `Đã đặt tên kệ ${m.shelf}.`, 'shelf');
  }
  on_lib_import(uid, m) {
    const rows = Array.isArray(m.rows) ? m.rows.slice(0, 2000) : [];
    const cat = this.db.catalog; const errors = []; let added = 0, updated = 0;
    rows.forEach((row, i) => {
      const r = normalizeBook(row, cat);
      if (r.error) return errors.push({ row: i + 1, error: r.error });
      const b = r.book; const j = cat.books.findIndex(x => x.id === b.id);
      if (b.copies < (this.loans[b.id] || 0)) return errors.push({ row: i + 1, error: `${b.id}: số lượng nhỏ hơn số đang cho mượn.` });
      if (j >= 0) { cat.books[j] = b; updated++; } else { cat.books.push(b); added++; }
      this.bookIdx.set(b.id, b);
    });
    if (added || updated) this.catalogChanged();
    this.to(uid, { t: 'importResult', added, updated, errors: errors.slice(0, 50), errorCount: errors.length });
  }

  // ================= Giữa người chơi =================
  on_greet(uid, m) {
    const target = this.players.get(m.to);
    if (!target || m.to === uid) return;
    const u = this.u(uid); const now = this.now(); const today = dayKey(now);
    this.all({ t: 'emote', id: uid, k: 'wave', to: m.to });
    this.to(m.to, { t: 'greeted', from: uid, name: u.name });
    if (isLib(uid)) return;
    if (u.greetDay !== today) { u.greetDay = today; u.greetEarned = 0; }
    const wait = (u.lastGreetAt || 0) + CONFIG.GREET_COOLDOWN_SEC * 1000 - now;
    const tname = this.u(m.to).name;
    if (wait > 0) return this.toast(uid, `Bạn đã chào ${tname}. Điểm chào hỏi được cộng ${Math.round(CONFIG.GREET_COOLDOWN_SEC / 60)} phút/lần, còn ${Math.ceil(wait / 1000)} giây nữa.`);
    if (u.greetEarned >= P(CONFIG.GREET_DAILY_CAP)) return this.toast(uid, 'Đã đạt giới hạn điểm chào hỏi hôm nay.');
    u.lastGreetAt = now;
    u.greetEarned += P(CONFIG.GREET_POINTS);
    this.award(uid, P(CONFIG.GREET_POINTS), `Chào ${tname}`);
    this.toast(uid, `Bạn đã chào ${tname}, +${CONFIG.GREET_POINTS} điểm.`, 'ok');
    this.me(uid);
  }
  on_gift(uid, m) {
    const target = this.players.get(m.to); const item = SHOP_BY_ID[m.item];
    if (!target || m.to === uid || !item?.giftable || isLib(uid)) return;
    const u = this.db.users[uid], v = this.u(m.to); const now = this.now();
    const wait = (u.lastGiftAt || 0) + CONFIG.GIFT_COOLDOWN_SEC * 1000 - now;
    if (wait > 0) return this.toast(uid, `Mỗi ${Math.round(CONFIG.GIFT_COOLDOWN_SEC / 60)} phút chỉ được tặng 1 lần. Còn ${Math.ceil(wait / 1000)} giây nữa.`, 'warn');
    if (CONFIG.GIFT_REQUIRES_ITEM) {
      if (!(u.inventory[item.id] > 0)) return this.toast(uid, `Bạn chưa có ${item.name}. Mua ở quầy thủ thư trước nhé.`, 'warn');
      u.inventory[item.id]--;
    }
    v.inventory[item.id] = (v.inventory[item.id] || 0) + 1;
    u.lastGiftAt = now;
    this.award(uid, P(CONFIG.GIFT_POINTS), `Tặng ${item.name} cho ${v.name}`);
    this.all({ t: 'emote', id: uid, k: 'gift', to: m.to, item: item.id });
    this.to(m.to, { t: 'gifted', from: uid, name: u.name, item: item.id });
    this.toast(uid, `Đã tặng ${item.name} cho ${v.name}, +${CONFIG.GIFT_POINTS} điểm.`, 'ok');
    this.me(uid); this.me(m.to);
  }
  on_chat(uid, m, sid) {
    const p = this.players.get(uid); const now = this.now();
    const text = clean(m.text, CONFIG.CHAT_MAX_LEN); if (!text) return;
    if (now - p.lastChat < CONFIG.CHAT_MIN_INTERVAL_MS) return this.err(sid, 'Bạn gửi hơi nhanh, chờ một chút nhé.');
    p.lastChat = now;
    const u = this.u(uid);
    const msg = { t: 'chat', id: uid, name: u.name, role: u.role, text, ts: now };
    this.chat.push(msg); if (this.chat.length > CONFIG.CHAT_HISTORY) this.chat.shift();
    this.all(msg);
  }
  on_dm(uid, m, sid) {
    const p = this.players.get(uid); const now = this.now();
    const target = this.u(m.to);
    if (!target || m.to === uid) return this.err(sid, 'Không tìm thấy người nhận.');
    const online = this.players.has(m.to);
    if (!online && !isLib(m.to)) return this.err(sid, 'Bạn này không còn trong thư viện.');
    const text = clean(m.text, CONFIG.CHAT_MAX_LEN); if (!text) return;
    if (now - p.lastChat < CONFIG.CHAT_MIN_INTERVAL_MS) return this.err(sid, 'Bạn gửi hơi nhanh, chờ một chút nhé.');
    p.lastChat = now;
    const msg = { t: 'dm', from: uid, fromName: this.u(uid).name, to: m.to, toName: target.name, text, ts: now };
    this.to(uid, msg);
    if (online) return this.to(m.to, msg);
    // nhắn cho thủ thư đang vắng: lưu hộp thư + trả lời tự động
    const box = (this.db.libInbox[m.to] ||= []); box.push(msg); if (box.length > 50) box.shift(); this.onChange();
    const auto = { t: 'dm', from: m.to, fromName: target.name, to: uid, toName: this.u(uid).name, ts: now + 1, auto: true,
      text: `[Tự động] ${target.name} hiện không trực tuyến, sẽ đọc tin nhắn khi quay lại. Bạn vẫn có thể mượn, trả sách và mua đồ dùng ngay tại quầy.` };
    this.to(uid, auto);
  }
  on_emote(uid, m) { if (['wave', 'clap', 'think'].includes(m.k)) this.all({ t: 'emote', id: uid, k: m.k }); }
  on_avatar(uid, m) {
    if (isLib(uid)) return this.toast(uid, 'Ngoại hình thủ thư được đặt trong file config/librarians.json.');
    const u = this.db.users[uid]; u.avatar = sanitizeAvatar(m.avatar);
    this.all({ t: 'av', id: uid, avatar: u.avatar }); this.me(uid); this.onChange();
  }
  on_ping(uid, m, sid) { this.send(sid, { t: 'pong', ts: m.ts }); }

  // ================= Đồng hồ: gọi đều đặn (vài giây/lần) =================
  tick() {
    const now = this.now(); const dt = Math.min(60, (now - this.lastTick) / 1000); this.lastTick = now;
    const today = dayKey(now);
    // yêu cầu quá hạn chờ → hệ thống tự xử lý
    for (const r of this.reqs.filter(r => now - r.ts > CONFIG.LIB_REQUEST_TIMEOUT_SEC * 1000)) {
      this.resolveReq(r, true, null, true);
      this.toast(r.lib, `Yêu cầu của ${this.u(r.uid)?.name} chờ quá ${CONFIG.LIB_REQUEST_TIMEOUT_SEC / 60} phút nên hệ thống đã tự xử lý.`);
    }
    for (const p of this.players.values()) {
      if (isLib(p.id)) continue;
      const u = this.db.users[p.id];
      if (p.day !== today) { p.day = today; const c = this.checkin(p.id); if (c) { this.to(p.id, { t: 'checkin', ...c }); this.me(p.id); } }
      const active = p.act.k === 'study' || p.act.k === 'read';
      if (!active) { p.presenceOk = now; p.presenceAsked = 0; continue; }
      if (!p.presenceAsked && now - p.presenceOk > CONFIG.PRESENCE_CHECK_SEC * 1000) {
        p.presenceAsked = now; this.to(p.id, { t: 'presence', timeout: CONFIG.PRESENCE_TIMEOUT_SEC });
      } else if (p.presenceAsked && !p.act.paused && now - p.presenceAsked > CONFIG.PRESENCE_TIMEOUT_SEC * 1000) {
        p.act.paused = true;
        this.all({ t: 'act', id: p.id, act: { k: p.act.k, book: p.act.book, paused: true } });
        this.toast(p.id, 'Tạm dừng tính điểm vì bạn chưa xác nhận còn đang học.', 'warn'); this.me(p.id);
      }
      if (p.act.paused) continue;
      p.act.accum += dt; u.totalStudySec = (u.totalStudySec || 0) + dt;
      if (p.act.accum >= CONFIG.STUDY_INTERVAL_SEC) {
        p.act.accum -= CONFIG.STUDY_INTERVAL_SEC;
        if (u.studyDay !== today) { u.studyDay = today; u.studyEarned = 0; }
        const mins = Math.round(CONFIG.STUDY_INTERVAL_SEC / 60);
        if (u.studyEarned < P(CONFIG.STUDY_DAILY_CAP)) {
          u.studyEarned += P(CONFIG.STUDY_POINTS);
          this.award(p.id, P(CONFIG.STUDY_POINTS), p.act.k === 'read' ? `Đọc sách ${mins} phút` : `Học bài ${mins} phút`);
          this.toast(p.id, `+${CONFIG.STUDY_POINTS} điểm cho ${mins} phút ${p.act.k === 'read' ? 'đọc sách' : 'học bài'}. Cố lên!`, 'ok');
        } else this.toast(p.id, 'Hôm nay bạn đã đạt tối đa điểm học tập. Vẫn có thể tiếp tục học nhé.');
        this.me(p.id);
      }
    }
  }

  stats() {
    return { online: this.players.size, seatsUsed: Object.keys(this.seats).length, seatsTotal: LAYOUT.seats.length, users: Object.keys(this.db.users).length,
      librariansOnline: this.libDefs.filter(d => this.players.has(d.id)).map(d => d.name) };
  }
}
