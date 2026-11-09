// Chế độ chạy thử không cần máy chủ: luật chơi chạy ngay trong trình duyệt,
// kèm một nhóm "sinh viên ảo" đi lại, ngồi học, đọc sách và trò chuyện.
import { LibraryCore } from '../shared/core.js';
import { AVATAR, SHOP } from '../shared/config.js';
import { LAYOUT, shelfApproach } from '../shared/layout.js';
import { DEFAULT_LIBRARIANS } from '../shared/librarians.default.js';
import { findPath } from '../shared/nav.js';

const ME = 'me';
const KEY = 'dtu-lib-demo-db-v2';
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
const rid = (n) => Array.from({ length: n }, () => '0123456789abcdef'[(Math.random() * 16) | 0]).join('');
const pick = (a) => a[(Math.random() * a.length) | 0];

export class LocalNet {
  constructor(onMsg, onStatus, grid) {
    this.onMsg = onMsg; this.onStatus = onStatus; this.grid = grid;
    let db = {};
    try { db = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { db = {}; }
    this.db = db;
    let saveT = null;
    this.core = new LibraryCore({
      db, randomId: rid, librarians: DEFAULT_LIBRARIANS, allowChosenUsername: true,
      hashPin: (p) => 'd:' + hash(p), verifyPin: (p, h) => h === 'd:' + hash(p),
      onChange: () => { if (saveT) return; saveT = setTimeout(() => { saveT = null; try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} }, 1500); },
      send: (sid, m) => {
        const copy = JSON.parse(JSON.stringify(m));
        if (sid === ME) setTimeout(() => this.onMsg(copy), 0);
        else this.bots?.receive(sid, copy);
      },
    });
    setInterval(() => this.core.flush(), 100);
    setInterval(() => this.core.tick(), 2000);
    this.bots = new Bots(this.core, grid);
  }
  async connect() { this.core.connect(ME); this.onStatus('open'); this.bots.start(); return true; }
  send(m) { this.core.message(ME, JSON.parse(JSON.stringify(m))); }
  stop() {}
}

const NAMES = ['Nguyễn Minh Anh', 'Trần Quốc Bảo', 'Lê Thảo Vy', 'Phạm Gia Huy', 'Hoàng Ngọc Hân', 'Võ Đức Thắng', 'Đặng Khánh Linh',
  'Bùi Tuấn Kiệt', 'Huỳnh Mai Phương', 'Phan Nhật Nam', 'Ngô Bảo Trâm', 'Đỗ Hải Đăng', 'Lý Thu Hà', 'Trương Văn Phúc'];
const FACULTIES = ['Khoa CNTT', 'Khoa Du lịch', 'Khoa Kinh tế', 'Khoa Y', 'Khoa Kiến trúc', 'Khoa Ngoại ngữ', 'Khoa Điện – Điện tử'];
const LINES = ['Có ai ôn Giải tích 2 không, lập nhóm học nha 📚', 'Kệ CNTT có cuốn Cấu trúc dữ liệu mới đó mọi người',
  'Phòng họp nhỏ A còn trống, nhóm mình vào thảo luận nhé', 'Chiều nay thư viện đông quá 😅', 'Ai mượn cuốn Kinh tế vi mô chưa trả kìa',
  'Cửa kính view núi đẹp ghê', 'Mai thi rồi, cố lên cả nhà!', 'Ai có bút dạ quang cho mình mượn với', 'Chúc mọi người học tốt nha ✨'];
const LIB_QUESTIONS = ['Cô ơi sách Giải tích 2 còn không ạ?', 'Thư viện mở đến mấy giờ vậy ạ?', 'Em muốn gia hạn sách được không ạ?',
  'Cho em hỏi kệ sách Kinh tế ở đâu ạ?', 'Em cần tài liệu về Trí tuệ nhân tạo, cô gợi ý giúp em với ạ'];
const REPLIES = ['Chào bạn 👋', 'Hi bạn, học môn gì vậy?', 'Ok bạn, lát mình qua bàn bạn nhé', 'Cảm ơn bạn nha!', 'Mình đang ôn thi, nói chuyện sau nha 😄'];

function randomAvatar(i) {
  const v = (k) => pick(AVATAR[k])[0];
  const gender = i % 2 ? 'm' : 'f';
  return { gender, outfit: v('outfit'), bottom: gender === 'm' ? 'pants' : pick(['skirt', 'pants', 'skirt']), skin: v('skin'),
    hair: gender === 'm' ? pick(['short', 'side']) : pick(['long', 'bob', 'ponytail', 'bun', 'long']),
    hairColor: v('hairColor'), shoes: v('shoes'), backpack: Math.random() < 0.6, bagColor: v('bagColor'), glasses: Math.random() < 0.35 };
}

class Bots {
  constructor(core, grid) { this.core = core; this.grid = grid; this.list = []; }
  booksOn(shelfId) { return this.core.db.catalog.books.filter(x => x.shelf === shelfId); }
  start(n = 14) {
    for (let i = 0; i < n; i++) {
      const sid = 'bot' + i;
      const bot = { sid, i, uid: null, x: 0, z: 0, ry: 0, path: [], mode: 'wait', wait: 1 + Math.random() * 6, goal: null, lastSend: 0 };
      this.list.push(bot);
      this.core.connect(sid);
      const role = i % 5 === 3 ? 'lecturer' : 'student';
      this.core.message(sid, { t: 'register', role, name: (role === 'lecturer' ? 'TS. ' : '') + NAMES[i % NAMES.length], username: 'BOT' + String(i).padStart(2, '0'), password: 'bt' + String(10 + i).slice(-2), faculty: pick(FACULTIES), cls: role === 'student' ? 'K' + (26 + (i % 3)) : '', avatar: randomAvatar(i) });
    }
    this.last = performance.now();
    setInterval(() => this.step(), 100);
    setInterval(() => { const b = pick(this.list); if (b.uid && Math.random() < 0.6) this.core.message(b.sid, { t: 'chat', text: pick(LINES) }); }, 38000);
  }
  receive(sid, m) {
    const bot = this.list.find(b => b.sid === sid); if (!bot) return;
    if (m.t === 'welcome') {
      bot.uid = m.you.id;
      const p = this.core.players.get(bot.uid);
      // rải bot khắp thư viện thay vì cùng xuất hiện ở cửa
      const s = pick(LAYOUT.seats.filter(q => !this.core.seats[q.id] && q.zone !== 'Sofa sảnh'));
      bot.x = p.x = s.x; bot.z = p.z = s.z;
      this.core.message(sid, { t: 'sit', seat: s.id });
      bot.mode = 'sit'; bot.wait = 20 + Math.random() * 60;
    }
    if (m.t === 'greeted' && m.from && !m.from.startsWith?.('ubot')) {
      setTimeout(() => this.core.message(sid, { t: 'greet', to: m.from }), 900 + Math.random() * 900);
    }
    if (m.t === 'dm' && m.to === bot.uid && !m.auto) {
      setTimeout(() => this.core.message(sid, { t: 'dm', to: m.from, text: m.from.startsWith('L:') ? 'Dạ em cảm ơn ạ!' : pick(REPLIES) }), 1500 + Math.random() * 1500);
    }
    if (m.t === 'gifted') setTimeout(() => this.core.message(sid, { t: 'dm', to: m.from, text: 'Cảm ơn bạn nhiều nha! 🎁' }), 1200);
  }
  step() {
    const now = performance.now(); const dt = Math.min(0.3, (now - this.last) / 1000); this.last = now;
    for (const b of this.list) {
      if (!b.uid) continue;
      if (b.mode === 'walk') {
        let move = 1.25 * dt;
        while (move > 0 && b.path.length) {
          const t = b.path[0]; const dx = t.x - b.x, dz = t.z - b.z; const d = Math.hypot(dx, dz);
          if (d <= move) { b.x = t.x; b.z = t.z; b.path.shift(); move -= d; }
          else { b.x += (dx / d) * move; b.z += (dz / d) * move; b.ry = Math.atan2(dx, dz); move = 0; }
        }
        if (now - b.lastSend > 150 || !b.path.length) {
          b.lastSend = now;
          this.core.message(b.sid, { t: 'move', x: b.x, z: b.z, ry: b.ry, a: b.path.length ? 'walk' : 'idle' });
        }
        if (!b.path.length) this.arrive(b);
        continue;
      }
      b.wait -= dt;
      if (b.wait <= 0) this.next(b);
    }
  }
  next(b) {
    const p = this.core.players.get(b.uid);
    if (b.mode === 'sit' || b.mode === 'shelf') {
      if (b.mode === 'shelf') this.core.message(b.sid, { t: 'putBack' });
      // đứng dậy: lùi khỏi ghế
      b.x = p.x - Math.sin(p.ry) * 0.5; b.z = p.z - Math.cos(p.ry) * 0.5;
    }
    const r = Math.random();
    let goal;
    // khi có người trực quầy (bạn đăng nhập tài khoản thủ thư), bot hay ghé quầy gửi yêu cầu hơn
    const liveLib = this.core.libDefs.find(d => this.core.players.has(d.id));
    if (Math.random() < (liveLib ? 0.35 : 0.06)) {
      const z = 15 + Math.random() * 5;
      goal = { kind: 'counter', lib: liveLib?.id, x: LAYOUT.COUNTER_FRONT.x + 0.2, z };
    } else if (r < 0.55) {
      const free = LAYOUT.seats.filter(q => !this.core.seats[q.id]);
      if (free.length) { const s = pick(free); goal = { kind: 'seat', seat: s, x: s.x, z: s.z }; }
    } else if (r < 0.85) {
      const sh = pick(LAYOUT.shelves); const a = shelfApproach(sh, sh.x + (Math.random() - 0.5) * sh.w, sh.z + (Math.random() - 0.5) * sh.d + (Math.random() < 0.5 ? -1 : 1));
      goal = { kind: 'shelf', shelf: sh, x: a.x, z: a.z, ry: a.ry };
    }
    if (!goal) goal = { kind: 'wander', x: 2 + Math.random() * 13, z: 13 + Math.random() * 15 };
    const path = findPath(this.grid, b.x, b.z, goal.x, goal.z);
    if (!path) { b.wait = 2; b.mode = 'wait'; return; }
    b.goal = goal; b.path = path; b.mode = 'walk';
  }
  arrive(b) {
    const g = b.goal; b.goal = null;
    if (g?.kind === 'seat' && !this.core.seats[g.seat.id]) {
      this.core.message(b.sid, { t: 'sit', seat: g.seat.id });
      b.mode = 'sit'; b.wait = 40 + Math.random() * 90;
      if (Math.random() < 0.3) {
        const sh = pick(LAYOUT.shelves.filter(s => this.booksOn(s.id).length));
        if (sh) this.core.message(b.sid, { t: 'takeBook', shelf: sh.id, book: pick(this.booksOn(sh.id)).id });
      }
      return;
    }
    if (g?.kind === 'shelf') {
      this.core.message(b.sid, { t: 'move', x: b.x, z: b.z, ry: g.ry, a: 'idle' });
      b.ry = g.ry;
      const books = this.booksOn(g.shelf.id);
      if (books.length) this.core.message(b.sid, { t: 'takeBook', shelf: g.shelf.id, book: pick(books).id });
      b.mode = 'shelf'; b.wait = 15 + Math.random() * 30; return;
    }
    if (g?.kind === 'counter') {
      b.ry = -Math.PI / 2;
      this.core.message(b.sid, { t: 'move', x: b.x, z: b.z, ry: b.ry, a: 'idle' });
      const u = this.core.db.users[b.uid];
      const r = Math.random();
      if (g.lib && r < 0.25) this.core.message(b.sid, { t: 'dm', to: g.lib, text: pick(LIB_QUESTIONS) });
      else if (u.borrowed.length && r < 0.5) this.core.message(b.sid, { t: 'return', book: pick(u.borrowed).bookId, lib: g.lib });
      else if (r < 0.8) {
        const ok = this.core.db.catalog.books.filter(x => x.borrowable && this.core.avail(x.id) > 0 && !u.borrowed.some(y => y.bookId === x.id));
        if (ok.length) this.core.message(b.sid, { t: 'borrow', book: pick(ok).id, lib: g.lib });
      } else this.core.message(b.sid, { t: 'buy', item: pick(SHOP).id, qty: 1 + ((Math.random() * 3) | 0), lib: g.lib });
      b.mode = 'wait'; b.wait = 6 + Math.random() * 10; return;
    }
    b.mode = 'wait'; b.wait = 3 + Math.random() * 8;
  }
}
