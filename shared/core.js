// Luật chơi & trạng thái thư viện. Chạy trên server (Node) và trong chế độ demo (trình duyệt).
// Giao tiếp: core.message(sid, msg) nhận lệnh, gọi send(sid, msg) để trả lời.
import { CONFIG, SHOP_BY_ID, sanitizeAvatar } from './config.js';
import { LAYOUT, SEAT_BY_ID, SHELF_BY_ID, SPAWN, ROOM } from './layout.js';
import { BOOKS, BOOK_BY_ID } from './catalog.js';

export const dayKey = (ts) => new Date(ts).toLocaleDateString('sv-SE', { timeZone: CONFIG.TZ });
const P = (n) => Math.round(n * 10);           // điểm → đơn vị 0.1
const fmt = (t) => (t / 10).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

export class LibraryCore {
  constructor({ db, send, now = () => Date.now(), hashPin, verifyPin, randomId, onChange = () => {} }) {
    this.db = db;
    this.db.users ||= {};
    this.db.mssv ||= {};
    this.db.tokens ||= {};
    this.db.books ||= {};
    for (const b of BOOKS) if (!(b.id in this.db.books)) this.db.books[b.id] = b.copies;
    this.send = send; this.now = now; this.hashPin = hashPin; this.verifyPin = verifyPin;
    this.randomId = randomId; this.onChange = onChange;
    this.sessions = new Map();   // sid -> uid | null
    this.players = new Map();    // uid -> trạng thái đang online
    this.seats = {};             // seatId -> uid
    this.chat = [];
    this.dirty = new Set();
    this.lastTick = now();
  }

  // ---------- tiện ích gửi ----------
  sidOf(uid) { return this.players.get(uid)?.sid; }
  to(uid, msg) { const sid = this.sidOf(uid); if (sid != null) this.send(sid, msg); }
  all(msg, exceptUid) { for (const p of this.players.values()) if (p.id !== exceptUid) this.send(p.sid, msg); }
  toast(uid, text, kind = 'info') { this.to(uid, { t: 'toast', text, kind }); }
  err(sid, text) { this.send(sid, { t: 'error', text }); }

  pub(p) {
    const u = this.db.users[p.id];
    return { id: p.id, name: u.name, faculty: u.faculty, avatar: u.avatar, x: p.x, z: p.z, ry: p.ry, a: p.a,
      seat: p.seat, act: { k: p.act.k, book: p.act.book, paused: p.act.paused } };
  }
  priv(uid) {
    const u = this.db.users[uid]; const p = this.players.get(uid); const today = dayKey(this.now());
    return {
      id: uid, name: u.name, mssv: u.mssv, faculty: u.faculty, cls: u.cls, avatar: u.avatar,
      points: u.points / 10, inventory: u.inventory, borrowed: u.borrowed, history: u.history.slice(0, 30),
      streak: u.streak, checkins: u.checkins,
      studyToday: u.studyDay === today ? u.studyEarned / 10 : 0,
      greetToday: u.greetDay === today ? u.greetEarned / 10 : 0,
      nextGiftAt: (u.lastGiftAt || 0) + CONFIG.GIFT_COOLDOWN_SEC * 1000,
      totalStudyMin: Math.floor((u.totalStudySec || 0) / 60),
      act: p ? { k: p.act.k, book: p.act.book, held: p.held, accum: p.act.accum, paused: p.act.paused } : null,
    };
  }
  me(uid) { this.to(uid, { t: 'me', you: this.priv(uid) }); }

  award(uid, tenths, reason) {
    const u = this.db.users[uid];
    u.points = Math.max(0, u.points + tenths);
    u.history.unshift({ ts: this.now(), d: tenths / 10, r: reason });
    u.history.length = Math.min(u.history.length, 40);
    this.onChange();
  }

  // ---------- kết nối ----------
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
      const h = this['on_' + m.t];
      if (typeof h === 'function') h.call(this, uid, m, sid);
    } catch (e) {
      console.error('core error', m.t, e);
      this.err(sid, 'Có lỗi xảy ra, thử lại sau.');
    }
  }

  // ---------- đăng ký / đăng nhập ----------
  register(sid, m) {
    const name = clean(m.name, 40), mssv = clean(m.mssv, 20).toUpperCase();
    const faculty = clean(m.faculty, 60), cls = clean(m.cls, 30), pin = String(m.pin || '');
    if (name.length < 2) return this.err(sid, 'Họ tên cần ít nhất 2 ký tự.');
    if (!/^[A-Z0-9]{4,20}$/.test(mssv)) return this.err(sid, 'MSSV chỉ gồm chữ và số, 4–20 ký tự.');
    if (!/^\d{4,6}$/.test(pin)) return this.err(sid, 'Mã PIN gồm 4–6 chữ số.');
    if (this.db.mssv[mssv]) return this.err(sid, 'MSSV này đã đăng ký. Hãy chọn "Đã có tài khoản" và nhập mã PIN.');
    const id = 'u' + this.randomId(10);
    this.db.users[id] = {
      id, name, mssv, faculty, cls, pin: this.hashPin(pin), avatar: sanitizeAvatar(m.avatar),
      points: 0, inventory: {}, borrowed: [], history: [], createdAt: this.now(),
      lastCheckin: null, streak: 0, checkins: 0, studyDay: null, studyEarned: 0,
      greetDay: null, greetEarned: 0, lastGiftAt: 0, totalStudySec: 0, greetLog: {},
    };
    this.db.mssv[mssv] = id;
    this.enter(sid, id, true);
  }
  login(sid, m) {
    const mssv = clean(m.mssv, 20).toUpperCase();
    const id = this.db.mssv[mssv];
    if (!id || !this.verifyPin(String(m.pin || ''), this.db.users[id].pin)) return this.err(sid, 'Sai MSSV hoặc mã PIN.');
    if (m.avatar) this.db.users[id].avatar = sanitizeAvatar(m.avatar);
    this.enter(sid, id, true);
  }
  resume(sid, m) {
    const id = this.db.tokens[String(m.token || '')];
    if (!id || !this.db.users[id]) return this.send(sid, { t: 'needLogin' });
    this.enter(sid, id, false);
  }

  enter(sid, uid, newToken) {
    const old = this.players.get(uid);
    if (old) { this.send(old.sid, { t: 'kicked', text: 'Tài khoản vừa đăng nhập ở nơi khác.' }); this.sessions.set(old.sid, null); this.leave(uid); }
    if (this.players.size >= CONFIG.MAX_ONLINE) return this.err(sid, 'Thư viện đang quá đông, vui lòng quay lại sau.');
    let token = null;
    if (newToken) {
      token = this.randomId(32);
      this.db.tokens[token] = uid;
      const u = this.db.users[uid];
      u.tokens = [...(u.tokens || []), token];
      while (u.tokens.length > 5) delete this.db.tokens[u.tokens.shift()];
    }
    this.sessions.set(sid, uid);
    const now = this.now();
    const p = { id: uid, sid, x: SPAWN.x + (Math.random() - 0.5), z: SPAWN.z, ry: SPAWN.ry, a: 'idle', seat: null,
      act: { k: 'idle', book: null, accum: 0, paused: false }, held: null,
      presenceOk: now, presenceAsked: 0, lastChat: 0, day: dayKey(now) };
    this.players.set(uid, p);
    const checkin = this.checkin(uid);
    this.send(sid, {
      t: 'welcome', token, you: this.priv(uid), players: [...this.players.values()].map(q => this.pub(q)),
      seats: this.seats, chat: this.chat, books: this.db.books, checkin,
    });
    this.all({ t: 'join', p: this.pub(p) }, uid);
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

  // ---------- di chuyển & chỗ ngồi ----------
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
      return this.toast(uid, free ? 'Ghế này vừa có bạn ngồi. Chọn ghế khác nhé.' : 'Thư viện đã hết chỗ ngồi. Bạn có thể đứng đọc hoặc đi dạo quanh kệ sách.', 'warn');
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
    const p = this.players.get(uid); const u = this.db.users[uid];
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
    const p = this.players.get(uid); const shelf = SHELF_BY_ID[m.shelf]; const b = BOOK_BY_ID[m.book];
    if (!shelf || !b || b.category !== shelf.category) return;
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

  // ---------- thủ thư ----------
  on_borrow(uid, m) {
    const u = this.db.users[uid]; const b = BOOK_BY_ID[m.book];
    if (!b) return;
    if (!b.borrowable) return this.toast(uid, 'Tạp chí chỉ đọc tại chỗ, không cho mượn về.', 'warn');
    if (u.borrowed.length >= CONFIG.BORROW_MAX) return this.toast(uid, `Mỗi bạn mượn tối đa ${CONFIG.BORROW_MAX} cuốn. Hãy trả bớt sách trước.`, 'warn');
    if (u.borrowed.some(x => x.bookId === b.id)) return this.toast(uid, 'Bạn đang mượn cuốn này rồi.', 'warn');
    if ((this.db.books[b.id] || 0) <= 0) return this.toast(uid, 'Cuốn này đã được mượn hết. Bạn có thể đọc tại kệ.', 'warn');
    if (u.points < P(CONFIG.BORROW_COST)) return this.toast(uid, `Cần ${CONFIG.BORROW_COST} điểm để mượn sách.`, 'warn');
    this.db.books[b.id]--;
    const now = this.now();
    u.borrowed.push({ bookId: b.id, title: b.title, at: now, due: now + CONFIG.BORROW_DAYS * 86400000 });
    this.award(uid, -P(CONFIG.BORROW_COST), `Mượn "${b.title}"`);
    this.all({ t: 'book', id: b.id, n: this.db.books[b.id] });
    this.toast(uid, `Đã mượn "${b.title}". Hạn trả sau ${CONFIG.BORROW_DAYS} ngày.`, 'ok');
    this.me(uid);
  }
  on_return(uid, m) {
    const u = this.db.users[uid]; const i = u.borrowed.findIndex(x => x.bookId === m.book);
    if (i < 0) return;
    const [rec] = u.borrowed.splice(i, 1);
    this.db.books[rec.bookId] = (this.db.books[rec.bookId] || 0) + 1;
    const p = this.players.get(uid);
    if (p.act.book === rec.bookId && p.held !== rec.bookId) this.setAct(uid, p.seat ? 'study' : 'idle', null);
    if (this.now() <= rec.due) {
      this.award(uid, P(CONFIG.RETURN_ONTIME_BONUS), `Trả đúng hạn "${rec.title}"`);
      this.toast(uid, `Đã trả sách đúng hạn, +${CONFIG.RETURN_ONTIME_BONUS} điểm.`, 'ok');
    } else {
      this.onChange();
      this.toast(uid, 'Đã trả sách (quá hạn nên không có điểm thưởng).');
    }
    this.all({ t: 'book', id: rec.bookId, n: this.db.books[rec.bookId] });
    this.me(uid);
  }
  on_buy(uid, m) {
    const u = this.db.users[uid]; const item = SHOP_BY_ID[m.item];
    const qty = Math.max(1, Math.min(10, Math.floor(+m.qty || 1)));
    if (!item) return;
    const cost = P(item.price) * qty;
    if (u.points < cost) return this.toast(uid, `Chưa đủ điểm. Cần ${fmt(cost)} điểm.`, 'warn');
    u.inventory[item.id] = (u.inventory[item.id] || 0) + qty;
    this.award(uid, -cost, `Mua ${qty} × ${item.name}`);
    this.toast(uid, `Đã mua ${qty} × ${item.name}.`, 'ok');
    this.me(uid);
  }

  // ---------- giữa sinh viên ----------
  on_greet(uid, m) {
    const target = this.players.get(m.to);
    if (!target || m.to === uid) return;
    const u = this.db.users[uid]; const now = this.now(); const today = dayKey(now);
    if (u.greetDay !== today) { u.greetDay = today; u.greetEarned = 0; u.greetLog = {}; }
    const last = u.greetLog[m.to] || 0;
    this.all({ t: 'emote', id: uid, k: 'wave', to: m.to });
    this.to(m.to, { t: 'greeted', from: uid, name: u.name });
    if (now - last < CONFIG.GREET_PAIR_COOLDOWN_SEC * 1000) {
      return this.toast(uid, `Bạn đã chào ${this.db.users[m.to].name} rồi. Sau ${Math.ceil((CONFIG.GREET_PAIR_COOLDOWN_SEC * 1000 - (now - last)) / 60000)} phút nữa chào lại mới được cộng điểm.`);
    }
    u.greetLog[m.to] = now;
    if (u.greetEarned >= P(CONFIG.GREET_DAILY_CAP)) return this.toast(uid, 'Đã đạt giới hạn điểm chào hỏi hôm nay.');
    u.greetEarned += P(CONFIG.GREET_POINTS);
    this.award(uid, P(CONFIG.GREET_POINTS), `Chào ${this.db.users[m.to].name}`);
    this.toast(uid, `Bạn đã chào ${this.db.users[m.to].name}, +${CONFIG.GREET_POINTS} điểm.`, 'ok');
    this.me(uid);
  }
  on_gift(uid, m) {
    const target = this.players.get(m.to); const item = SHOP_BY_ID[m.item];
    if (!target || m.to === uid || !item?.giftable) return;
    const u = this.db.users[uid], v = this.db.users[m.to]; const now = this.now();
    const wait = (u.lastGiftAt || 0) + CONFIG.GIFT_COOLDOWN_SEC * 1000 - now;
    if (wait > 0) return this.toast(uid, `Mỗi giờ chỉ được tặng 1 lần. Còn ${Math.ceil(wait / 60000)} phút nữa.`, 'warn');
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
    const msg = { t: 'chat', id: uid, name: this.db.users[uid].name, text, ts: now };
    this.chat.push(msg); if (this.chat.length > CONFIG.CHAT_HISTORY) this.chat.shift();
    this.all(msg);
  }
  on_dm(uid, m, sid) {
    const p = this.players.get(uid); const now = this.now();
    if (!this.players.has(m.to) || m.to === uid) return this.err(sid, 'Bạn này không còn trong thư viện.');
    const text = clean(m.text, CONFIG.CHAT_MAX_LEN); if (!text) return;
    if (now - p.lastChat < CONFIG.CHAT_MIN_INTERVAL_MS) return this.err(sid, 'Bạn gửi hơi nhanh, chờ một chút nhé.');
    p.lastChat = now;
    const msg = { t: 'dm', from: uid, fromName: this.db.users[uid].name, to: m.to, toName: this.db.users[m.to].name, text, ts: now };
    this.to(m.to, msg); this.to(uid, msg);
  }
  on_emote(uid, m) { if (['wave', 'clap', 'think'].includes(m.k)) this.all({ t: 'emote', id: uid, k: m.k }); }
  on_avatar(uid, m) {
    const u = this.db.users[uid]; u.avatar = sanitizeAvatar(m.avatar);
    this.all({ t: 'av', id: uid, avatar: u.avatar }); this.me(uid); this.onChange();
  }
  on_ping(uid, m, sid) { this.send(sid, { t: 'pong', ts: m.ts }); }

  // ---------- đồng hồ: gọi đều đặn (5 giây/lần) ----------
  tick() {
    const now = this.now(); const dt = Math.min(60, (now - this.lastTick) / 1000); this.lastTick = now;
    const today = dayKey(now);
    for (const p of this.players.values()) {
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
        if (u.studyEarned < P(CONFIG.STUDY_DAILY_CAP)) {
          u.studyEarned += P(CONFIG.STUDY_POINTS);
          this.award(p.id, P(CONFIG.STUDY_POINTS), p.act.k === 'read' ? 'Đọc sách 15 phút' : 'Học bài 15 phút');
          this.toast(p.id, `+${CONFIG.STUDY_POINTS} điểm cho 15 phút ${p.act.k === 'read' ? 'đọc sách' : 'học bài'}. Cố lên!`, 'ok');
        } else this.toast(p.id, 'Hôm nay bạn đã đạt tối đa điểm học tập. Vẫn có thể tiếp tục học nhé.');
        this.me(p.id);
      }
    }
  }

  stats() {
    return { online: this.players.size, seatsUsed: Object.keys(this.seats).length, seatsTotal: LAYOUT.seats.length, users: Object.keys(this.db.users).length };
  }
}
