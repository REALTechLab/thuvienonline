// Thư viện DTU Online — client
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CONFIG, SHOP, SHOP_BY_ID, AVATAR, DEFAULT_AVATAR, ROLES, sanitizeAvatar, validPassword, suggestPassword } from '../shared/config.js';
import { LAYOUT, SEAT_BY_ID, SHELF_BY_ID, SPAWN, ROOM, shelfApproach, distToShelf, roomAt } from '../shared/layout.js';
import { buildGrid, findPath, slideMove, isBlocked, nearestFree } from '../shared/nav.js';
import { buildWorld } from './world.js';
import { Avatar } from './avatar.js';
import { WSNet } from './net.js';
import { createAdmin } from './admin.js';

// ================= Tiện ích =================
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pts = (n) => (+n).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const hhmm = (ts) => new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
const ddmm = (ts) => new Date(ts).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(-1)[0][0]?.toUpperCase() || '?';
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} }, del(k) { try { localStorage.removeItem(k); } catch {} } };
const DEMO = window.LIB_DEMO === true || new URLSearchParams(location.search).has('demo');
const TOKEN_KEY = DEMO ? 'dtu-lib-demo-token' : 'dtu-lib-token';
const TABLE_H = { wood: 0.76, meeting: 0.77, ghost: 0.735, office: 0.755 };
const FACULTY_LIST = ['Khoa Công nghệ thông tin', 'Khoa Điện – Điện tử', 'Khoa Xây dựng', 'Khoa Kiến trúc', 'Khoa Kinh tế', 'Khoa Quản trị kinh doanh', 'Khoa Kế toán', 'Khoa Du lịch', 'Khoa Y', 'Khoa Dược', 'Khoa Điều dưỡng', 'Khoa Ngoại ngữ', 'Khoa Luật', 'Khoa Khoa học xã hội & Nhân văn', 'Khoa Môi trường & Khoa học tự nhiên', 'Khác'];

// ================= Giao diện =================
$('#ui').innerHTML = `
<div id="loading" class="screen"><div class="loader"><div class="crest">DTU</div><div class="bar"><i></i></div><p id="load-text">Đang dựng không gian thư viện…</p></div></div>

<div id="auth" class="screen" hidden>
  <div class="auth-wrap">
    <section class="auth-brand">
      <div class="eyebrow">Đại học Duy Tân · Thư viện 03 Quang Trung</div>
      <h1>Thư viện <em>Online</em></h1>
      <p>Vào thư viện từ bất cứ đâu: chọn chỗ ngồi cạnh cửa kính, đọc sách ngay tại kệ, mượn trả với thủ thư và tích điểm cùng bạn bè.</p>
      <ul class="rules">
        <li><span>Check-in lần đầu</span><b>${CONFIG.START_POINTS} điểm</b></li>
        <li><span>Check-in mỗi ngày</span><b>+${CONFIG.CHECKIN_POINTS}</b></li>
        <li><span>Ngồi học / đọc sách mỗi ${CONFIG.STUDY_INTERVAL_SEC / 60} phút</span><b>+${CONFIG.STUDY_POINTS}</b></li>
        <li><span>Chào hỏi (${CONFIG.GREET_COOLDOWN_SEC / 60} phút/lần)</span><b>+${CONFIG.GREET_POINTS}</b></li>
        <li><span>Tặng giấy A4 hoặc bút (${CONFIG.GIFT_COOLDOWN_SEC / 60} phút/lần)</span><b>+${CONFIG.GIFT_POINTS}</b></li>
        <li><span>Mượn 1 cuốn sách</span><b>−${CONFIG.BORROW_COST}</b></li>
      </ul>
    </section>
    <section class="auth-card">
      <div class="card-head"><div><div class="eyebrow">Thẻ thư viện</div><strong id="card-title">Đăng ký thẻ thư viện</strong></div><span class="card-no">DTU-LIB</span></div>
      <div class="tabs" role="tablist">
        <button id="tab-new" role="tab" aria-selected="true">Đăng ký mới</button>
        <button id="tab-login" role="tab" aria-selected="false">Đã có tài khoản</button>
      </div>
      <form id="form-new" class="form" autocomplete="off">
        <div class="field"><span class="lbl">Bạn là</span>
          <div class="seg" role="radiogroup" aria-label="Loại người dùng">
            <button type="button" role="radio" data-role="student" aria-checked="true">🎓 Sinh viên</button>
            <button type="button" role="radio" data-role="lecturer" aria-checked="false">👩‍🏫 Giảng viên</button>
          </div>
        </div>
        <div class="field"><label for="f-name">Họ và tên</label><input id="f-name" required maxlength="40" placeholder="Nguyễn Văn An"></div>
        <div class="row2">
          <div class="field"><label for="f-fac" id="f-fac-lbl">Khoa</label><select id="f-fac">${FACULTY_LIST.map(f => `<option>${f}</option>`).join('')}</select></div>
          <div class="field" id="f-cls-wrap"><label for="f-cls">Lớp</label><input id="f-cls" maxlength="30" placeholder="K27 TPM 3"></div>
        </div>
        <div class="row2">
          <div class="field"><label for="f-pw">Mật khẩu</label>
            <div class="pw-row"><input id="f-pw" required maxlength="${CONFIG.PASSWORD_LEN}" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="vd. ab12"><button type="button" class="btn small" id="f-pw-gen" title="Tạo mật khẩu ngẫu nhiên">🎲</button></div>
          </div>
          <div class="field"><label for="f-pw2">Nhập lại mật khẩu</label><input id="f-pw2" required maxlength="${CONFIG.PASSWORD_LEN}" autocapitalize="off" autocomplete="off" spellcheck="false"></div>
        </div>
        <small style="color:var(--ink-3)">Mật khẩu gồm đúng ${CONFIG.PASSWORD_LEN} ký tự, có cả chữ và số, không dấu, phân biệt hoa thường. <b>Tên đăng nhập ${CONFIG.USERNAME_LEN} ký tự sẽ do hệ thống tạo</b> sau khi bạn chọn xong ngoại hình.</small>
        <p class="form-error" id="err-new"></p>
        <div class="actions"><button class="btn primary" type="submit">Tiếp tục: chọn ngoại hình →</button></div>
      </form>
      <div id="step-avatar" class="form" hidden>
        <div id="builder-new"></div>
        <p class="form-error" id="err-av"></p>
        <div class="actions"><button class="btn ghost" id="av-back" type="button">← Quay lại</button><button class="btn primary" id="av-go" type="button">Vào thư viện</button></div>
      </div>
      <form id="form-login" class="form" hidden autocomplete="off">
        <div class="field"><label for="l-user">Tên đăng nhập</label><input id="l-user" required maxlength="30" autocapitalize="characters" autocomplete="username" spellcheck="false" placeholder="vd. K7M2QA"></div>
        <div class="field"><label for="l-pw">Mật khẩu</label><input id="l-pw" required type="password" maxlength="40" autocapitalize="off" autocomplete="current-password"></div>
        <small style="color:var(--ink-3)">Thủ thư đăng nhập bằng tài khoản được thư viện cấp.</small>
        <p class="form-error" id="err-login"></p>
        <div class="actions"><button class="btn primary" type="submit">Vào thư viện</button></div>
      </form>
    </section>
  </div>
</div>

<div id="hud" hidden>
  <div class="me-card" id="me-card"></div>
  <div class="top-right">
    <div class="stats"><span class="pill" id="seat-pill"><span class="dot"></span><span id="seat-free">—</span></span><button class="pill" id="online-pill" style="border:0">👥 <span id="online-count">0</span></button></div>
    <div class="map-wrap"><canvas id="minimap" width="156" height="180" aria-label="Sơ đồ thư viện, bấm để đi tới"></canvas><div class="cap"><span>Cửa kính ↑</span><span>Cửa chính ↓</span></div></div>
  </div>
  <div id="activity" hidden></div>
  <div id="chat">
    <div class="chat-tabs" id="chat-tabs"></div>
    <div class="chat-log" id="chat-log" aria-live="polite"></div>
    <form class="chat-form" id="chat-form"><input id="chat-input" maxlength="${CONFIG.CHAT_MAX_LEN}" placeholder="Nhắn cho cả thư viện… (Enter)" autocomplete="off"><button class="btn primary small" type="submit">Gửi</button></form>
  </div>
  <div id="context" hidden></div>
  <nav class="dock" aria-label="Chức năng">
    <button id="d-seat" data-for="reader"><span class="ic">🪑</span><span class="lb">Tìm ghế</span></button>
    <button id="d-lib" data-for="reader"><span class="ic">🛎️</span><span class="lb">Thủ thư</span></button>
    <button id="d-bag" data-for="reader"><span class="ic">🎒</span><span class="lb">Túi đồ</span></button>
    <button id="d-wear" data-for="reader"><span class="ic">👕</span><span class="lb">Trang phục</span></button>
    <button id="d-req" data-for="lib" hidden><span class="ic">🛎️</span><span class="lb">Yêu cầu</span><span class="dock-badge" id="req-badge" hidden>0</span></button>
    <button id="d-books" data-for="lib" hidden><span class="ic">🗂️</span><span class="lb">Quản lý sách</span></button>
    <button id="d-post" data-for="lib" hidden><span class="ic">📍</span><span class="lb">Về quầy</span></button>
    <button id="d-view"><span class="ic">🗺️</span><span class="lb">Toàn cảnh</span></button>
    <button id="d-help"><span class="ic">❔</span><span class="lb">Hướng dẫn</span></button>
  </nav>
</div>
<div id="panel" class="panel" hidden></div>
<div id="modal" hidden></div>
<div id="toasts"></div>
<div id="net-status" hidden>Mất kết nối, đang thử lại…</div>
`;

// ================= Toast & hộp thoại =================
function toast(text, kind = 'info', ms = 3800) {
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = text;
  $('#toasts').appendChild(el);
  while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
  setTimeout(() => el.remove(), ms);
}
function modal(html, bind) {
  const m = $('#modal'); m.innerHTML = `<div class="dialog" role="dialog" aria-modal="true">${html}</div>`; m.hidden = false;
  bind?.(m.firstElementChild, () => { m.hidden = true; m.innerHTML = ''; });
}

// ================= Three.js =================
const canvas = $('#view');
const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
const quality = store.get('dtu-lib-quality') || (mobile ? 'low' : 'high');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'high' ? 2 : 1.25));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = quality === 'high'; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#dfe9ef');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 220);
camera.position.set(SPAWN.x, 3.0, SPAWN.z + 4.2);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.12; controls.enablePan = false;
controls.minDistance = 2.2; controls.maxDistance = 16; controls.maxPolarAngle = 1.48;
controls.target.set(SPAWN.x, 1.2, SPAWN.z);
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
const world = buildWorld(scene, renderer, { quality });
const grid = buildGrid();

// Thủ thư tự động (NPC): hiện khi thủ thư đó không online, ẩn khi có người đăng nhập tài khoản thủ thư
const npcs = new Map(); // libId -> Avatar
function syncLibrarians() {
  for (const [id, av] of npcs) if (!S.libs.some(l => l.id === id)) { scene.remove(av.root); av.dispose(); npcs.delete(id); }
  for (const l of S.libs) {
    let av = npcs.get(l.id);
    const key = JSON.stringify(l.avatar) + l.name + l.post;
    if (av && av.key !== key) { scene.remove(av.root); av.dispose(); npcs.delete(l.id); av = null; }
    if (!av) {
      av = new Avatar(l.avatar, { name: `Thủ thư · ${l.name}`, isStaff: true });
      const pos = LAYOUT.LIB_POSTS[l.post] || LAYOUT.LIB_POSTS[0];
      av.root.position.set(pos.x, 0, pos.z); av.root.rotation.y = pos.ry;
      av.isLibrarian = true; av.libId = l.id; av.key = key; scene.add(av.root); npcs.set(l.id, av);
    }
    av.root.visible = !l.online;
  }
  refreshTargets();
}

// ================= Trạng thái =================
const S = {
  myId: null, you: null, token: store.get(TOKEN_KEY), started: false,
  players: new Map(), seats: {}, chat: [], dms: new Map(), chatTab: 'all',
  catalog: { categories: [], books: [], shelfLabels: {} }, avail: {}, libs: [], reqs: [], loans: [], libSel: null,
  panel: null, view: 'follow', act: { k: 'idle', accum: 0, paused: false, at: 0, book: null, held: null },
  presenceDeadline: 0,
};
const me = { x: SPAWN.x, z: SPAWN.z, ry: SPAWN.ry, state: 'idle', seat: null, path: [], onArrive: null, sendT: 0, sentIdle: true, avatar: null };
const keys = {};
const isLibrarian = () => S.you?.role === 'librarian';

// ================= Danh mục sách (do thủ thư quản lý, đồng bộ từ máy chủ) =================
let bookIdx = new Map(), catIdx = new Map();
function setCatalog(catalog, avail) {
  S.catalog = catalog; if (avail) S.avail = avail;
  bookIdx = new Map(catalog.books.map(b => [b.id, b]));
  catIdx = new Map(catalog.categories.map(c => [c.id, c]));
  for (const sh of LAYOUT.shelves) world.setShelfLabel(sh.id, shelfName(sh.id));
}
const bookById = (id) => bookIdx.get(id);
const catName = (id) => catIdx.get(id)?.name || 'Chưa phân loại';
const booksOnShelf = (sid) => S.catalog.books.filter(b => b.shelf === sid);
function shelfName(sid) {
  const label = S.catalog.shelfLabels?.[sid];
  if (label) return label;
  const count = {}; for (const b of booksOnShelf(sid)) count[b.category] = (count[b.category] || 0) + 1;
  const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  return top ? catName(top[0]) : '';
}
const displayName = (p) => p.role === 'lecturer' ? `GV. ${p.name}` : p.role === 'librarian' ? `Thủ thư · ${p.name}` : p.name;
const roleLabel = (r) => ROLES[r] || 'Sinh viên';

// ================= Mạng =================
let net;
function onStatus(st) {
  $('#net-status').hidden = st === 'open' || !S.started;
  if (st === 'open' && S.started && S.token) net.send({ t: 'resume', token: S.token });
}
async function startNet() {
  if (!DEMO) {
    net = new WSNet(handle, onStatus);
    $('#load-text').textContent = 'Đang kết nối máy chủ thư viện…';
    if (await net.connect()) return 'ws';
    net.stop();
  }
  $('#load-text').textContent = 'Chế độ chạy thử: không có máy chủ, dữ liệu lưu trên trình duyệt này';
  const { LocalNet } = await import('./demo.js');
  net = new LocalNet(handle, onStatus, grid);
  await net.connect();
  const tag = document.createElement('div'); tag.className = 'demo-tag';
  tag.textContent = 'Chế độ chạy thử · người khác là nhân vật ảo · thử vai thủ thư: coquynh / quynh2026';
  $('#hud').appendChild(tag);
  return 'demo';
}

// ================= Đăng nhập / đăng ký =================
let builderNew = null;
function showAuth(mode = 'new') {
  $('#loading').hidden = true; $('#auth').hidden = false; $('#hud').hidden = true;
  setAuthTab(mode);
}
function setAuthTab(mode) {
  $('#tab-new').setAttribute('aria-selected', mode !== 'login');
  $('#tab-login').setAttribute('aria-selected', mode === 'login');
  $('#form-new').hidden = mode !== 'new';
  $('#step-avatar').hidden = mode !== 'avatar';
  $('#form-login').hidden = mode !== 'login';
  $('#card-title').textContent = mode === 'login' ? 'Đăng nhập thẻ thư viện' : mode === 'avatar' ? 'Chọn ngoại hình của bạn' : 'Đăng ký thẻ thư viện';
  if (mode === 'avatar' && !builderNew) builderNew = createBuilder($('#builder-new'), DEFAULT_AVATAR);
}
$('#tab-new').onclick = () => setAuthTab('new');
$('#tab-login').onclick = () => setAuthTab('login');
let regRole = 'student';
document.querySelectorAll('[data-role]').forEach(b => (b.onclick = () => {
  regRole = b.dataset.role;
  document.querySelectorAll('[data-role]').forEach(x => x.setAttribute('aria-checked', x === b));
  $('#f-cls-wrap').hidden = regRole === 'lecturer';
  $('#f-fac-lbl').textContent = regRole === 'lecturer' ? 'Khoa / Bộ môn' : 'Khoa';
}));
$('#f-pw-gen').onclick = () => { const p = suggestPassword(); $('#f-pw').value = p; $('#f-pw2').value = p; $('#f-pw').type = 'text'; };
$('#form-new').onsubmit = (e) => {
  e.preventDefault();
  const name = $('#f-name').value.trim(), pw = $('#f-pw').value, pw2 = $('#f-pw2').value;
  const err = $('#err-new');
  if (name.length < 2) return (err.textContent = 'Nhập họ tên đầy đủ.');
  if (!validPassword(pw)) return (err.textContent = `Mật khẩu phải đúng ${CONFIG.PASSWORD_LEN} ký tự, có cả chữ và số (a–z, 0–9, không dấu).`);
  if (pw !== pw2) return (err.textContent = 'Hai lần nhập mật khẩu chưa giống nhau.');
  err.textContent = ''; setAuthTab('avatar');
};
$('#av-back').onclick = () => setAuthTab('new');
$('#av-go').onclick = () => {
  $('#err-av').textContent = '';
  net.send({ t: 'register', role: regRole, name: $('#f-name').value.trim(), cls: regRole === 'student' ? $('#f-cls').value.trim() : '', faculty: $('#f-fac').value, password: $('#f-pw').value, avatar: builderNew.get() });
};
$('#form-login').onsubmit = (e) => {
  e.preventDefault(); $('#err-login').textContent = '';
  net.send({ t: 'login', username: $('#l-user').value.trim(), password: $('#l-pw').value });
};

function showCredentials(username, password, then) {
  modal(`<div class="eyebrow" style="color:var(--maroon)">Quan trọng · lưu lại ngay</div>
    <h3>Thông tin đăng nhập của bạn</h3>
    <p>Hãy chép lại hoặc chụp màn hình. Bạn cần <b>cả hai</b> để đăng nhập lần sau hoặc trên máy khác. Thư viện không gửi lại thông tin này.</p>
    <div class="cred"><div><span>Tên đăng nhập</span><b id="cr-u">${esc(username)}</b></div><div><span>Mật khẩu</span><b id="cr-p">${esc(password)}</b></div></div>
    <button class="btn" id="cr-copy" type="button">Sao chép cả hai</button>
    <label class="check"><input type="checkbox" id="cr-ok"> Tôi đã lưu tên đăng nhập và mật khẩu</label>
    <button class="btn primary" id="cr-go" disabled>Vào thư viện</button>`, (d, close) => {
    $('#cr-ok', d).onchange = (e) => { $('#cr-go', d).disabled = !e.target.checked; };
    $('#cr-copy', d).onclick = async () => {
      const text = `Thư viện DTU Online\nTên đăng nhập: ${username}\nMật khẩu: ${password}`;
      try { await navigator.clipboard.writeText(text); toast('Đã sao chép.', 'ok'); }
      catch { const r = document.createRange(); r.selectNodeContents($('.cred', d)); getSelection().removeAllRanges(); getSelection().addRange(r); toast('Hãy nhấn Ctrl+C để sao chép phần đã chọn.'); }
    };
    $('#cr-go', d).onclick = () => { close(); then?.(); };
  });
}

// ================= Dựng nhân vật (xem trước) =================
const OUTFIT_DOTS = { dtu: 'linear-gradient(90deg,#7d1a2c 30%,#f3eeee 30% 70%,#7d1a2c 70%)', black: 'linear-gradient(135deg,#1f2126 60%,#8d9097 60%)', blue: 'linear-gradient(135deg,#2c40a3 60%,#25326c 60%)', casual: 'linear-gradient(135deg,#e8e2d6 60%,#3d5a80 60%)' };
function createBuilder(container, initial) {
  let av = sanitizeAvatar(initial);
  container.innerHTML = `<div class="builder"><div class="preview"><canvas></canvas><div class="turn">Kéo để xoay nhân vật</div></div><div class="opts"></div></div>`;
  const cv = container.querySelector('canvas'), opts = container.querySelector('.opts');
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight('#ffffff', '#b9a68f', 2.0));
  const dl = new THREE.DirectionalLight('#fff4e5', 2.2); dl.position.set(2, 3, 3); sc.add(dl);
  const cam = new THREE.PerspectiveCamera(30, 0.75, 0.1, 20); cam.position.set(0, 1.12, 3.6); cam.lookAt(0, 0.95, 0);
  let a = new Avatar(av, {}); a.root.remove(a.label); sc.add(a.root); a.root.rotation.y = 0.35;
  let drag = null, spin = 0.35;
  cv.addEventListener('pointerdown', e => { drag = e.clientX; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => { if (drag != null) { spin += (e.clientX - drag) * 0.012; drag = e.clientX; } });
  cv.addEventListener('pointerup', () => { drag = null; });
  let last = performance.now(), alive = true;
  const loop = (now) => {
    if (!alive) return;
    if (!document.body.contains(cv)) { alive = false; r.dispose(); r.forceContextLoss(); return; }
    const w = cv.clientWidth, h = cv.clientHeight;
    if (w && h && (cv.width !== Math.floor(w * r.getPixelRatio()) || cv.height !== Math.floor(h * r.getPixelRatio()))) { r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (drag == null) spin += dt * 0.35;
    a.root.rotation.y = spin; a.update(dt, now / 1000);
    if (w && h) r.render(sc, cam);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const chips = (key, list) => `<div class="chips">${list.map(([v, l]) => `<button type="button" class="chip" data-k="${key}" data-v="${v}" aria-pressed="${av[key] === v}">${l}</button>`).join('')}</div>`;
  const sw = (key, list) => `<div class="chips">${list.map(([v, l]) => `<button type="button" class="swatch" title="${l}" aria-label="${l}" data-k="${key}" data-v="${v}" style="background:${v}" aria-pressed="${av[key] === v}"></button>`).join('')}</div>`;
  const render = () => {
    opts.innerHTML = `
      <div class="opt"><h4>Giới tính</h4>${chips('gender', AVATAR.gender)}</div>
      <div class="opt"><h4>Trang phục</h4><div class="chips outfit-card">${AVATAR.outfit.map(([v, l]) => `<button type="button" class="chip" data-k="outfit" data-v="${v}" aria-pressed="${av.outfit === v}"><span class="dot" style="background:${OUTFIT_DOTS[v]}"></span>${l}</button>`).join('')}</div></div>
      ${av.gender === 'f' ? `<div class="opt"><h4>Trang phục dưới</h4>${chips('bottom', AVATAR.bottom)}</div>` : ''}
      <div class="opt"><h4>Kiểu tóc</h4>${chips('hair', AVATAR.hair)}</div>
      <div class="opt"><h4>Màu tóc</h4>${sw('hairColor', AVATAR.hairColor)}</div>
      <div class="opt"><h4>Màu da</h4>${sw('skin', AVATAR.skin)}</div>
      <div class="opt"><h4>Giày dép</h4>${chips('shoes', AVATAR.shoes)}</div>
      <div class="opt"><h4>Phụ kiện</h4><div class="chips">
        <button type="button" class="chip" data-t="glasses" aria-pressed="${av.glasses}">👓 Đeo kính</button>
        <button type="button" class="chip" data-t="backpack" aria-pressed="${av.backpack}">🎒 Mang balo</button></div></div>
      ${av.backpack ? `<div class="opt"><h4>Màu balo</h4>${sw('bagColor', AVATAR.bagColor)}</div>` : ''}`;
  };
  opts.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.t) av[b.dataset.t] = !av[b.dataset.t];
    else if (b.dataset.k) {
      av[b.dataset.k] = b.dataset.v;
      if (b.dataset.k === 'gender') { av.bottom = av.gender === 'f' ? 'skirt' : 'pants'; if (av.gender === 'm' && !['short', 'side'].includes(av.hair)) av.hair = 'short'; if (av.gender === 'f' && ['short'].includes(av.hair)) av.hair = 'long'; }
    } else return;
    av = sanitizeAvatar(av);
    const scroll = opts.scrollTop; render(); opts.scrollTop = scroll;
    sc.remove(a.root); a.dispose(); a = new Avatar(av, {}); a.root.remove(a.label); sc.add(a.root);
  });
  render();
  return { get: () => ({ ...av }) };
}

// ================= Người chơi =================
function addPlayer(p) {
  if (p.id === S.myId) return;
  removePlayer(p.id);
  const av = new Avatar(p.avatar, { name: displayName(p), isStaff: p.role === 'librarian', isLecturer: p.role === 'lecturer' });
  av.playerId = p.id;
  av.root.position.set(p.x, 0, p.z); av.root.rotation.y = p.ry;
  scene.add(av.root);
  const pl = { ...p, av, tx: p.x, tz: p.z, tr: p.ry };
  S.players.set(p.id, pl);
  applyRemoteSeat(pl);
  av.activity = p.act?.k || 'idle';
  refreshTargets();
}
function removePlayer(id) {
  const pl = S.players.get(id); if (!pl) return;
  scene.remove(pl.av.root); pl.av.dispose(); S.players.delete(id); refreshTargets();
}
function applyRemoteSeat(pl) {
  const s = pl.seat ? SEAT_BY_ID[pl.seat] : null;
  if (s) {
    pl.av.state = 'sit'; pl.av.seatH = s.h; pl.av.seatType = s.type; pl.av.tableH = TABLE_H[s.type];
    pl.tx = s.x; pl.tz = s.z; pl.tr = s.ry;
    pl.av.root.position.set(s.x, 0, s.z); pl.av.root.rotation.y = s.ry;
  } else if (pl.av.state === 'sit') pl.av.state = 'idle';
}
let clickTargets = [];
function refreshTargets() {
  clickTargets = [...[...S.players.values()].map(p => p.av.hitbox), ...[...npcs.values()].filter(a => a.root.visible).map(a => a.hitbox), world.seatHit, ...world.shelfHits, world.counterHit, world.floor];
}

function ensureMe(you, pub) {
  if (!me.avatar) {
    me.avatar = new Avatar(you.avatar, { name: displayName(you), isSelf: true });
    scene.add(me.avatar.root);
  } else {
    me.avatar.setAvatar(you.avatar); me.avatar.setName(displayName(you));
  }
  if (pub) { me.x = pub.x; me.z = pub.z; me.ry = pub.ry; }
  me.seat = null; me.state = 'idle'; me.path = [];
  me.avatar.root.position.set(me.x, 0, me.z);
}

// ================= Xử lý tin nhắn từ máy chủ =================
function handle(m) {
  switch (m.t) {
    case 'needLogin': S.token = null; store.del(TOKEN_KEY); if (!S.started) showAuth('new'); else showAuth('login'); break;
    case 'error': {
      const open = !$('#auth').hidden;
      if (open) { const target = !$('#form-login').hidden ? '#err-login' : !$('#step-avatar').hidden ? '#err-av' : '#err-new'; $(target).textContent = m.text; }
      else toast(m.text, 'warn');
      break;
    }
    case 'welcome': onWelcome(m); break;
    case 'kicked': S.token = null; net.stop?.(); modal(`<h3>Bạn đã rời thư viện</h3><p>${esc(m.text)}</p><button class="btn primary" id="rl">Tải lại trang</button>`, (d) => { $('#rl', d).onclick = () => location.reload(); }); break;
    case 'join': addPlayer(m.p); sysChat(`${displayName(m.p)} vừa vào thư viện.`); updateStats(); renderOnlineIfOpen(); break;
    case 'leave': {
      const pl = S.players.get(m.id); if (pl) sysChat(`${displayName(pl)} đã rời thư viện.`);
      if (m.seat && S.seats[m.seat] === m.id) delete S.seats[m.seat];
      removePlayer(m.id); updateStats(); renderOnlineIfOpen(); break;
    }
    case 'st':
      for (const [id, x, z, ry, a] of m.l) {
        if (id === S.myId) continue;
        const pl = S.players.get(id); if (!pl) continue;
        pl.tx = x; pl.tz = z; pl.tr = ry; pl.a = a;
        if (!pl.seat) pl.av.state = a;
      }
      break;
    case 'seat': onSeat(m.seat, m.id); break;
    case 'sitFail': if (me.state !== 'sit') { me.pendingSeat = null; } break;
    case 'act': {
      if (m.id === S.myId) break;
      const pl = S.players.get(m.id); if (!pl) break;
      pl.act = m.act; pl.av.activity = m.act.k; break;
    }
    case 'me': setYou(m.you); break;
    case 'toast': toast(m.text, m.kind); break;
    case 'book': S.avail[m.id] = m.n; refreshPanel(); break;
    case 'catalog': setCatalog(m.catalog, m.avail); refreshPanel(); break;
    case 'libs': S.libs = m.libs; syncLibrarians(); refreshPanel(); break;
    case 'reqs': S.reqs = m.list; admin.onReqs(); break;
    case 'reqNew': toast(`🛎️ ${displayName(m.req)}: ${m.req.type === 'borrow' ? 'xin mượn' : m.req.type === 'return' ? 'trả' : 'mua'} ${m.req.title || `${m.req.qty} × ${m.req.itemName}`}`, 'info', 6000); break;
    case 'loans': S.loans = m.list; refreshPanel(); break;
    case 'adminResult': toast(m.text, m.ok ? 'ok' : 'warn', m.ok ? 3800 : 6000); admin.onResult(m); break;
    case 'importResult': admin.onImport(m); break;
    case 'chat': S.chat.push(m); if (S.chat.length > 120) S.chat.shift(); speak(m.id, m.text); renderChat(); break;
    case 'dm': onDm(m); break;
    case 'emote': {
      const av = m.id === S.myId ? me.avatar : S.players.get(m.id)?.av;
      av?.playEmote(m.k);
      if (m.k === 'wave') av?.say('👋 Xin chào!', 'emote');
      if (m.k === 'gift') av?.say(`🎁 Tặng ${SHOP_BY_ID[m.item]?.name || 'quà'}`, 'emote');
      break;
    }
    case 'greeted': toast(`${m.name} chào bạn 👋`, 'info'); sysChat(`${m.name} vừa chào bạn. Bấm vào bạn ấy để chào lại.`); break;
    case 'gifted': toast(`${m.name} tặng bạn ${SHOP_BY_ID[m.item]?.name} 🎁`, 'ok'); sysChat(`${m.name} đã tặng bạn ${SHOP_BY_ID[m.item]?.name}.`); break;
    case 'av': {
      if (m.id === S.myId) break;
      const pl = S.players.get(m.id); if (pl) { pl.avatar = m.avatar; pl.av.setAvatar(m.avatar); pl.av.playerId = pl.id; refreshTargets(); }
      break;
    }
    case 'presence': onPresence(m.timeout); break;
    case 'checkin': toast(`Check-in ngày mới: +${m.points} điểm · chuỗi ${m.streak} ngày`, 'ok', 6000); break;
  }
}

function onWelcome(m) {
  S.myId = m.you.id;
  if (m.token) { S.token = m.token; store.set(TOKEN_KEY, m.token); }
  for (const id of [...S.players.keys()]) removePlayer(id);
  S.seats = m.seats || {}; S.chat = m.chat || [];
  S.libs = m.libs || []; S.reqs = []; setCatalog(m.catalog, m.avail);
  const mine = m.players.find(p => p.id === S.myId);
  setYou(m.you, true);
  ensureMe(m.you, mine);
  for (const p of m.players) addPlayer(p);
  syncLibrarians();
  const lib = m.you.role === 'librarian';
  document.querySelectorAll('.dock [data-for]').forEach(b => { b.hidden = (b.dataset.for === 'lib') !== lib; });
  $('#seat-pill').hidden = false;
  $('#loading').hidden = true; $('#auth').hidden = true; $('#hud').hidden = false;
  if (!S.started) {
    S.started = true;
    controls.target.set(me.x, 1.2, me.z); camera.position.set(me.x, 2.9, me.z + 4.4);
  }
  const welcomeFirst = () => modal(`<div class="eyebrow" style="color:var(--maroon)">Check-in thư viện</div><div class="stamp">+${m.checkin.points} điểm</div><h3>Chào mừng ${esc(displayName(m.you))}!</h3><p>Bạn vừa check-in lần đầu. Tìm một chỗ ngồi để bắt đầu học, hoặc ghé quầy thủ thư để mượn sách và mua đồ dùng.</p><button class="btn primary" id="ok">Bắt đầu</button>`, (d, close) => { $('#ok', d).onclick = close; });
  if (lib) {
    toast(`Chào ${m.you.name}! Bạn đang trực quầy ở chế độ trực tiếp. Yêu cầu của bạn đọc sẽ hiện ở nút "Yêu cầu".`, 'ok', 7000);
  } else if (m.created) {
    showCredentials(m.created.username, $('#f-pw').value, m.checkin?.first ? welcomeFirst : null);
    $('#f-pw').value = $('#f-pw2').value = '';
  } else if (m.checkin?.first) {
    welcomeFirst();
  } else if (m.checkin) toast(`Check-in hôm nay: +${m.checkin.points} điểm · chuỗi ${m.checkin.streak} ngày liên tiếp`, 'ok', 6000);
  else if (!lib) toast(`Chào mừng trở lại, ${m.you.name}!`);
  renderChat(); updateStats(); world.setSeatColors(S.seats, S.myId);
}

function setYou(you, initial) {
  const prevAv = S.you && JSON.stringify(S.you.avatar);
  S.you = you;
  if (you.act) S.act = { ...you.act, at: performance.now() };
  if (!initial && me.avatar && prevAv !== JSON.stringify(you.avatar)) me.avatar.setAvatar(you.avatar);
  if (me.avatar) me.avatar.activity = S.act.k;
  if (S.act.k === 'idle' && S.presenceDeadline) closePresence();
  renderMe(); renderActivity(); refreshPanel();
  if (you.role === 'librarian') { const n = you.pendingCount || 0; $('#req-badge').textContent = n; $('#req-badge').hidden = !n; }
}

function onSeat(seatId, id) {
  const prev = S.seats[seatId];
  if (id) S.seats[seatId] = id; else delete S.seats[seatId];
  if (id === S.myId) {
    const s = SEAT_BY_ID[seatId];
    me.seat = seatId; me.state = 'sit'; me.path = []; me.onArrive = null;
    me.x = s.x; me.z = s.z; me.ry = s.ry;
    Object.assign(me.avatar, { seatH: s.h, seatType: s.type, tableH: TABLE_H[s.type] });
    world.target.visible = false;
  } else if (id) {
    const pl = S.players.get(id); if (pl) { pl.seat = seatId; applyRemoteSeat(pl); }
  } else if (prev) {
    if (prev === S.myId) { if (me.seat === seatId) { me.seat = null; if (me.state === 'sit') me.state = 'idle'; } }
    else { const pl = S.players.get(prev); if (pl && pl.seat === seatId) { pl.seat = null; applyRemoteSeat(pl); } }
  }
  updateStats(); world.setSeatColors(S.seats, S.myId); renderActivity();
}

function speak(id, text) {
  const av = id === S.myId ? me.avatar : S.players.get(id)?.av;
  av?.say(text);
}

// ================= Di chuyển =================
const target = world.target;
function walkTo(x, z, onArrive) {
  if (me.state === 'sit') standUp();
  const p = findPath(grid, me.x, me.z, x, z);
  if (!p) { toast('Không tìm được đường tới đó.', 'warn'); return false; }
  me.path = p; me.onArrive = onArrive || null;
  const end = p[p.length - 1]; target.position.set(end.x, 0.02, end.z); target.visible = true;
  return true;
}
function standUp() {
  if (!me.seat) return;
  const s = SEAT_BY_ID[me.seat];
  net.send({ t: 'stand' });
  delete S.seats[me.seat];
  const back = nearestFree(grid, s.x - Math.sin(s.ry) * 0.55, s.z - Math.cos(s.ry) * 0.55, 2) || { x: s.x, z: s.z };
  me.x = back.x; me.z = back.z; me.seat = null; me.state = 'idle';
  world.setSeatColors(S.seats, S.myId); updateStats();
}
function sendMove(a) { net.send({ t: 'move', x: +me.x.toFixed(3), z: +me.z.toFixed(3), ry: +me.ry.toFixed(3), a }); }

function freeSeats() { return LAYOUT.seats.filter(s => !S.seats[s.id]); }
function goSeat(s) {
  const owner = S.seats[s.id];
  if (owner === S.myId) return;
  if (owner) {
    const name = S.players.get(owner)?.name;
    return toast(freeSeats().length ? `Ghế ${s.id} đã có ${name || 'bạn khác'} ngồi. Chọn ghế khác nhé.` : 'Thư viện đã hết chỗ ngồi. Bạn có thể đứng đọc tại kệ hoặc đi dạo.', 'warn');
  }
  walkTo(s.x, s.z, () => {
    if (S.seats[s.id]) return toast('Ghế này vừa có người ngồi mất rồi.', 'warn');
    if (Math.hypot(me.x - s.x, me.z - s.z) < 1.6) net.send({ t: 'sit', seat: s.id });
  });
}
function goNearestSeat() {
  const free = freeSeats();
  if (!free.length) return toast('Thư viện đã hết chỗ ngồi. Bạn có thể đứng đọc tại kệ hoặc đi dạo quanh thư viện.', 'warn', 6000);
  world.markers.visible = true; clearTimeout(goNearestSeat.t); goNearestSeat.t = setTimeout(() => { world.markers.visible = false; }, 9000);
  // ưu tiên chỗ có bàn học, sau đó sofa, cuối cùng phòng họp
  const rank = (s) => (roomAt(s.x, s.z) ? 40 : s.type === 'sofa' || s.type === 'armchair' ? 15 : 0) + Math.hypot(s.x - me.x, s.z - me.z);
  const best = free.slice().sort((a, b) => rank(a) - rank(b))[0];
  toast(`Còn ${free.length} ghế trống. Đang đi tới ghế gần nhất (${best.zone}).`);
  goSeat(best);
}
function goShelf(shelf, pt) {
  const a = shelfApproach(shelf, pt?.x ?? me.x, pt?.z ?? me.z);
  const open = () => { me.ry = a.ry; sendMove('idle'); openShelf(shelf); };
  if (Math.hypot(me.x - a.x, me.z - a.z) < 0.6 && me.state !== 'sit') return open();
  walkTo(a.x, a.z, open);
}
function goCounter(libId) {
  if (isLibrarian()) return goPost();
  const z = Math.max(14.6, Math.min(20.6, me.z));
  const open = () => { me.ry = -Math.PI / 2; sendMove('idle'); openLibrarian(libId); };
  if (nearCounter()) return open();
  walkTo(LAYOUT.COUNTER_FRONT.x, z, open);
}
function goPost() {
  const lib = S.libs.find(l => l.id === S.myId); const pos = LAYOUT.LIB_POSTS[lib?.post || 0];
  walkTo(pos.x, pos.z, () => { me.ry = pos.ry; sendMove('idle'); });
}
const nearCounter = () => me.state !== 'sit' && me.x > 3.5 && me.x < 5.6 && me.z > 13.8 && me.z < 21.4;

// ================= Chuột / chạm =================
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
let down = null;
function pick(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  for (const h of ray.intersectObjects(clickTargets, false)) {
    const o = h.object;
    if (o.userData.avatar) return { kind: 'avatar', av: o.userData.avatar, h };
    if (o === world.seatHit) return { kind: 'seat', seat: LAYOUT.seats[h.instanceId], h };
    if (o.userData.shelf) return { kind: 'shelf', shelf: o.userData.shelf, h };
    if (o.userData.counter) return { kind: 'counter', h };
    if (o === world.floor) return { kind: 'floor', h };
  }
  return null;
}
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down || !S.started) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); const dt = performance.now() - down.t; down = null;
  if (moved > 7 || dt > 600 || e.button !== 0) return;
  const p = pick(e); if (!p) return;
  if (p.kind === 'avatar') {
    if (p.av.isLibrarian) { if (isLibrarian()) toast(`${S.libs.find(l => l.id === p.av.libId)?.name} đang ở chế độ tự động (chưa đăng nhập).`); else goCounter(p.av.libId); }
    else if (p.av.playerId) { const pl = S.players.get(p.av.playerId); if (pl?.role === 'librarian' && !isLibrarian()) goCounter(pl.id); else openPlayer(p.av.playerId); }
  }
  else if (p.kind === 'seat') goSeat(p.seat);
  else if (p.kind === 'shelf') goShelf(p.shelf, p.h.point);
  else if (p.kind === 'counter') goCounter();
  else if (p.kind === 'floor') walkTo(p.h.point.x, p.h.point.z);
});
let hoverT = 0;
canvas.addEventListener('pointermove', (e) => {
  if (!S.started || down || performance.now() - hoverT < 50) return; hoverT = performance.now();
  const p = pick(e);
  canvas.style.cursor = p && p.kind !== 'floor' ? 'pointer' : 'default';
  if (p?.kind === 'seat') {
    const s = p.seat; const owner = S.seats[s.id];
    world.hover.visible = true; world.hover.position.set(s.x, s.h + 0.1, s.z);
    world.hover.material.color.set(!owner ? '#2f9e5f' : owner === S.myId ? '#2c40a3' : '#c0392b');
    canvas.title = owner ? `Ghế ${s.id} · ${S.players.get(owner)?.name || 'Có người'}` : `Ghế ${s.id} · ${s.zone} · Trống – bấm để ngồi`;
  } else {
    world.hover.visible = false;
    canvas.title = p?.kind === 'shelf' ? `Kệ ${p.shelf.id} · ${shelfName(p.shelf.id) || 'kệ trống'}` : p?.kind === 'counter' || p?.av?.isLibrarian ? 'Quầy thủ thư' : p?.kind === 'avatar' ? (S.players.get(p.av.playerId) ? displayName(S.players.get(p.av.playerId)) : '') : '';
  }
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ================= Bàn phím =================
const typing = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
addEventListener('keydown', (e) => {
  if (!S.started) return;
  if (e.key === 'Escape') { if (!$('#modal').hidden && S.presenceDeadline === 0) { $('#modal').hidden = true; } closePanel(); document.activeElement?.blur?.(); return; }
  if (typing()) return;
  if (e.key === 'Enter') { e.preventDefault(); $('#chat').classList.remove('min'); $('#chat-input').focus(); return; }
  if (e.key === 'e' || e.key === 'E') { $('#context .ctx')?.click(); return; }
  keys[e.code] = true;
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// ================= Vòng lặp chính =================
const clock = new THREE.Clock();
const tmp = new THREE.Vector3(), fwd = new THREE.Vector3();
let ctxT = 0, mapT = 0, actT = 0;
function angleLerp(a, b, t) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }

function updateMe(dt, now) {
  if (!me.avatar) return;
  const kx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  const kz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const run = keys.ShiftLeft || keys.ShiftRight;
  let moving = false;
  if (kx || kz) {
    if (me.state === 'sit') standUp();
    me.path = []; me.onArrive = null; target.visible = false;
    camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const rx = -fwd.z, rz = fwd.x;
    let dx = fwd.x * kz + rx * kx, dz = fwd.z * kz + rz * kx; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    const sp = (run ? 3.6 : 2.1) * dt;
    const start = isBlocked(grid, me.x, me.z) ? nearestFree(grid, me.x, me.z, 1) : null;
    if (start) { me.x = start.x; me.z = start.z; }
    const n = slideMove(grid, me.x, me.z, me.x + dx * sp, me.z + dz * sp);
    moving = n.x !== me.x || n.z !== me.z;
    me.x = n.x; me.z = n.z; me.ry = angleLerp(me.ry, Math.atan2(dx, dz), Math.min(1, dt * 12));
    me.state = run ? 'run' : 'walk';
  } else if (me.path.length) {
    let step = 2.1 * dt;
    while (step > 0 && me.path.length) {
      const t = me.path[0]; const dx = t.x - me.x, dz = t.z - me.z; const d = Math.hypot(dx, dz);
      if (d <= step) { me.x = t.x; me.z = t.z; me.path.shift(); step -= d; }
      else { me.x += (dx / d) * step; me.z += (dz / d) * step; me.ry = angleLerp(me.ry, Math.atan2(dx, dz), Math.min(1, dt * 10)); step = 0; }
    }
    moving = true; me.state = 'walk';
    if (!me.path.length) {
      target.visible = false; me.state = 'idle'; moving = false;
      const cb = me.onArrive; me.onArrive = null; sendMove('idle'); me.sentIdle = true; cb?.();
    }
  } else if (me.state === 'walk' || me.state === 'run') me.state = 'idle';

  if (moving) {
    me.sentIdle = false;
    if (now - me.sendT > 100) { me.sendT = now; sendMove(me.state); }
  } else if (!me.sentIdle && me.state !== 'sit') { me.sentIdle = true; sendMove('idle'); }

  const av = me.avatar;
  av.state = me.state === 'sit' ? 'sit' : me.state;
  av.root.position.x = me.x; av.root.position.z = me.z;
  av.root.rotation.y = me.state === 'sit' ? me.ry : angleLerp(av.root.rotation.y, me.ry, Math.min(1, dt * 14));
}

function updateCamera(dt) {
  if (S.view === 'follow') {
    tmp.set(me.x, me.state === 'sit' ? 0.95 : 1.25, me.z).sub(controls.target).multiplyScalar(Math.min(1, dt * 6));
    controls.target.add(tmp); camera.position.add(tmp);
  }
  controls.update();
  world.ceiling.visible = camera.position.y < ROOM.h - 0.12;
}

function frame() {
  const dt = Math.min(0.05, clock.getDelta()); const now = performance.now(); const t = now / 1000;
  if (S.started) {
    updateMe(dt, now);
    for (const pl of S.players.values()) {
      const r = pl.av.root;
      if (!pl.seat) {
        const d = Math.hypot(pl.tx - r.position.x, pl.tz - r.position.z);
        if (d > 4) r.position.set(pl.tx, 0, pl.tz);
        else { r.position.x += (pl.tx - r.position.x) * Math.min(1, dt * 8); r.position.z += (pl.tz - r.position.z) * Math.min(1, dt * 8); }
        if (d < 0.02 && pl.av.state !== 'idle' && pl.a === 'idle') pl.av.state = 'idle';
      }
      r.rotation.y = angleLerp(r.rotation.y, pl.tr, Math.min(1, dt * 10));
      pl.av.update(dt, t);
    }
    if (me.avatar) me.avatar.update(dt, t);
    if (now - ctxT > 200) { ctxT = now; renderContext(); }
    if (now - mapT > 200) { mapT = now; drawMap(); }
    if (now - actT > 500) { actT = now; tickActivity(); }
  }
  for (const a of npcs.values()) if (a.root.visible) a.update(dt, t);
  updateCamera(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

// ================= HUD =================
function renderMe() {
  const y = S.you; if (!y) return;
  if (y.role === 'librarian') {
    $('#me-card').innerHTML = `
    <div class="me-top">
      <div class="me-badge" style="background:var(--blue)">${esc(initials(y.name))}</div>
      <div style="min-width:0"><div class="me-name">${esc(y.name)}</div><div class="me-sub">Thủ thư · ${esc(y.username)}</div></div>
      <div class="me-pts"><b style="color:var(--blue)">${y.pendingCount || 0}</b><span>chờ duyệt</span></div>
    </div>
    <div class="me-meta"><div>🟢 Đang trực tiếp · bạn đọc thấy bạn ở quầy và gửi yêu cầu cho bạn</div></div>`;
    return;
  }
  $('#me-card').innerHTML = `
    <div class="me-top">
      <div class="me-badge">${esc(initials(y.name))}</div>
      <div style="min-width:0"><div class="me-name">${esc(displayName(y))}</div><div class="me-sub">${esc(y.username)} · ${y.role === 'lecturer' ? 'Giảng viên' : esc(y.cls || 'Sinh viên')}</div></div>
      <div class="me-pts"><b>${pts(y.points)}</b><span>điểm</span></div>
    </div>
    <div class="me-meta">
      <div>🔥 <b>${y.streak}</b> ngày</div>
      <div>📖 <b>${y.borrowed.length}</b>/${CONFIG.BORROW_MAX}</div>
      <div>⏱ <b>${pts(y.studyToday)}</b>/${CONFIG.STUDY_DAILY_CAP} đ</div>
    </div>`;
}
function updateStats() {
  const used = Object.keys(S.seats).length, total = LAYOUT.seats.length, free = total - used;
  $('#seat-free').textContent = free ? `Ghế trống ${free}/${total}` : `Hết chỗ ngồi (${total})`;
  $('#seat-pill').classList.toggle('full', !free);
  $('#online-count').textContent = S.players.size + (S.myId ? 1 : 0);
}
$('#online-pill').onclick = () => openOnline();

function renderActivity() {
  const el = $('#activity');
  const seat = me.seat ? SEAT_BY_ID[me.seat] : null;
  const a = S.act; const held = a.held ? bookById(a.held) : null;
  const reading = a.k === 'read'; const studying = a.k === 'study';
  if (isLibrarian() || (!seat && !reading && !held)) { el.hidden = true; return; }
  el.hidden = false;
  const book = a.book ? bookById(a.book) : null;
  const title = seat
    ? `${reading ? '📖 Đang đọc' : studying ? '📚 Đang học bài' : '🪑 Đang ngồi'} · ${seat.zone} (${seat.id})`
    : reading ? '📖 Đang đứng đọc' : `📕 Đang cầm sách`;
  el.innerHTML = `
    <div class="act-row"><div class="act-title" title="${esc(title)}">${title}</div><span class="act-time" id="act-time"></span></div>
    ${book ? `<div style="font-size:12.5px;color:var(--ink-2);margin-top:-4px">«${esc(book.title)}»</div>` : ''}
    <div class="progress" aria-hidden="true"><i id="act-bar"></i></div>
    <div id="act-paused" class="paused" hidden>Tạm dừng tính điểm. <button class="btn small" id="act-resume">Tôi vẫn đang học</button></div>
    <div class="act-btns">
      ${seat ? `<button class="btn small ${studying ? 'primary' : ''}" id="act-study">📚 Học bài</button>` : ''}
      <button class="btn small ${reading ? 'primary' : ''}" id="act-read">📖 Đọc sách</button>
      ${held ? `<button class="btn small" id="act-put">↩ Trả sách về kệ</button>` : ''}
      ${seat ? `<button class="btn small ghost" id="act-stand">Đứng dậy</button>` : ''}
    </div>`;
  $('#act-study')?.addEventListener('click', () => net.send({ t: 'activity', k: 'study' }));
  $('#act-read').onclick = () => openReadPicker();
  $('#act-put')?.addEventListener('click', () => net.send({ t: 'putBack' }));
  $('#act-stand')?.addEventListener('click', () => { standUp(); sendMove('idle'); renderActivity(); });
  $('#act-resume').onclick = () => { net.send({ t: 'presence' }); closePresence(); };
  tickActivity();
}
function tickActivity() {
  const a = S.act; const bar = $('#act-bar'); if (!bar) return;
  const active = (a.k === 'study' || a.k === 'read') && !a.paused;
  const I = CONFIG.STUDY_INTERVAL_SEC;
  const acc = Math.min(I, (a.accum || 0) + (active ? (performance.now() - a.at) / 1000 : 0));
  bar.style.width = (acc / I) * 100 + '%';
  $('#act-time').textContent = active ? `${mmss(acc)} / ${mmss(I)}` : (a.k === 'idle' ? 'chưa tính điểm' : '');
  $('#act-paused').hidden = !a.paused;
}

function renderContext() {
  const el = $('#context'); const items = [];
  if (me.state !== 'sit') {
    if (nearCounter() && !isLibrarian()) items.push(['🛎️ Gặp thủ thư', () => goCounter()]);
    let best = null, bd = 1.0;
    for (const sh of LAYOUT.shelves) { const d = distToShelf(sh, me.x, me.z); if (d < bd) { bd = d; best = sh; } }
    if (best) items.push([`📚 Xem kệ ${best.id} · ${shelfName(best.id) || 'kệ trống'}`, () => goShelf(best, { x: me.x, z: me.z })]);
    let seat = null, sd = 1.3;
    for (const s of LAYOUT.seats) { if (S.seats[s.id]) continue; const d = Math.hypot(s.x - me.x, s.z - me.z); if (d < sd) { sd = d; seat = s; } }
    if (seat) items.push([`🪑 Ngồi xuống (${seat.zone})`, () => goSeat(seat)]);
  }
  const key = items.map(i => i[0]).join('|');
  if (key === el.dataset.key) return;
  el.dataset.key = key; el.hidden = !items.length;
  el.innerHTML = items.map(([l], i) => `<button class="ctx" data-i="${i}">${esc(l)}${i === 0 ? ' <kbd>E</kbd>' : ''}</button>`).join('');
  el.querySelectorAll('.ctx').forEach(b => (b.onclick = () => items[+b.dataset.i][1]()));
}

// Sơ đồ nhỏ
const mapCv = $('#minimap'); const mg = mapCv.getContext('2d');
const MW = 156, MH = 180; mapCv.width = MW * 2; mapCv.height = MH * 2; mg.scale(2, 2);
const mx = (x) => (x / ROOM.w) * MW, mz = (z) => (z / ROOM.d) * MH;
const mapBg = document.createElement('canvas'); mapBg.width = MW * 2; mapBg.height = MH * 2;
{
  const g = mapBg.getContext('2d'); g.scale(2, 2);
  g.fillStyle = '#f4f1ec'; g.fillRect(0, 0, MW, MH);
  g.fillStyle = '#e4d9c7'; for (const r of LAYOUT.rooms) g.fillRect(mx(r.x1), mz(r.z1), mx(r.x2) - mx(r.x1), mz(r.z2) - mz(r.z1));
  for (const b of LAYOUT.blocks) { g.fillStyle = '#b9b2a8'; g.fillRect(mx(b.x - b.w / 2), mz(b.z - b.d / 2), Math.max(1, mx(b.w)), Math.max(1, mz(b.d))); }
  g.fillStyle = '#b07a46'; for (const s of LAYOUT.shelves) g.fillRect(mx(s.x - s.w / 2), mz(s.z - s.d / 2), mx(s.w), mz(s.d));
  g.fillStyle = '#2c40a3'; const c = LAYOUT.COUNTER; g.fillRect(mx(c.x - c.w / 2), mz(c.z - c.d / 2), mx(c.w), mz(c.d));
  g.fillStyle = '#8fc0e6'; g.fillRect(0, 0, MW, 2); g.fillRect(MW - 2, 0, 2, mz(10.4));
  g.fillStyle = '#8c1d2f'; g.fillRect(mx(12.4), MH - 3, mx(2), 3);
}
function drawMap() {
  mg.drawImage(mapBg, 0, 0, MW, MH);
  for (const s of LAYOUT.seats) { mg.fillStyle = S.seats[s.id] ? '#c0392b' : '#2f9e5f'; mg.fillRect(mx(s.x) - 1, mz(s.z) - 1, 2, 2); }
  mg.fillStyle = '#1d1916';
  for (const p of S.players.values()) { mg.beginPath(); mg.arc(mx(p.av.root.position.x), mz(p.av.root.position.z), 2.2, 0, Math.PI * 2); mg.fill(); }
  mg.save(); mg.translate(mx(me.x), mz(me.z)); mg.rotate(-me.ry + Math.PI);
  mg.fillStyle = '#8c1d2f'; mg.beginPath(); mg.moveTo(0, -5); mg.lineTo(3.6, 3.6); mg.lineTo(-3.6, 3.6); mg.closePath(); mg.fill(); mg.restore();
}
mapCv.addEventListener('click', (e) => {
  const r = mapCv.getBoundingClientRect();
  walkTo(((e.clientX - r.left) / r.width) * ROOM.w, ((e.clientY - r.top) / r.height) * ROOM.d);
});

// ================= Bảng chức năng =================
function openPanel(def) {
  S.panel = { tab: def.tabs?.[0]?.[0], ...def };
  renderPanel();
}
function renderPanel() {
  const P = S.panel; const el = $('#panel'); if (!P) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<div class="panel-head"><div style="min-width:0"><div class="eyebrow">${esc(P.eyebrow || '')}</div><h2>${esc(P.title)}</h2></div><button class="x" aria-label="Đóng">×</button></div>
    ${P.tabs ? `<div class="panel-tabs" role="tablist">${P.tabs.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${P.tab === k}">${l}</button>`).join('')}</div>` : '<div></div>'}
    <div class="panel-body"></div>`;
  $('.x', el).onclick = closePanel;
  el.querySelectorAll('[data-tab]').forEach(b => (b.onclick = () => { P.tab = b.dataset.tab; renderPanel(); }));
  const body = $('.panel-body', el);
  const scroll = P.scroll || 0; P.render(body, P.tab); body.scrollTop = scroll;
  body.onscroll = () => { P.scroll = body.scrollTop; };
}
function refreshPanel() { if (S.panel && !S.panel.static) renderPanel(); }
function closePanel() { S.panel = null; $('#panel').hidden = true; $('#panel').innerHTML = ''; document.querySelectorAll('.dock button').forEach(b => b.setAttribute('aria-pressed', 'false')); }

function bookRow(b, action, opts = {}) {
  if (!b) return '';
  const n = S.avail[b.id] ?? b.copies;
  return `<div class="item"><span class="code">${esc(b.id)}</span><div style="min-width:0"><div class="t">${esc(b.title)}</div><div class="s">${b.author ? esc(b.author) + ' · ' : ''}${esc(catName(b.category))}${opts.noShelf ? '' : ` · kệ ${esc(b.shelf)}`} · ${b.borrowable ? `còn ${n}/${b.copies} cuốn để mượn` : 'chỉ đọc tại chỗ'}</div></div>${action}</div>`;
}
const reqLabel = (r) => r.type === 'borrow' ? `Mượn «${bookById(r.book)?.title || r.book}»` : r.type === 'return' ? `Trả «${bookById(r.book)?.title || r.book}»` : `Mua ${r.qty} × ${SHOP_BY_ID[r.item]?.name}`;

// Quầy thủ thư (phía bạn đọc). Thủ thư online → yêu cầu chờ duyệt; vắng → hệ thống tự xử lý ngay.
function openLibrarian(libId, tab) {
  if (libId && S.libs.some(l => l.id === libId)) S.libSel = libId;
  if (!S.libSel || !S.libs.some(l => l.id === S.libSel)) S.libSel = (S.libs.find(l => l.online) || S.libs[0])?.id || null;
  const npc = npcs.get(S.libSel);
  if (npc?.root.visible) { npc.playEmote('wave'); npc.say('Chào bạn! Mình giúp gì được nè?', 'emote'); }
  openPanel({
    kind: 'lib', eyebrow: 'Quầy thủ thư', title: 'Mượn – trả sách · Đồ dùng học tập',
    tabs: [['borrow', 'Mượn sách'], ['return', 'Trả sách'], ['shop', 'Đồ dùng học tập'], ['hist', 'Lịch sử điểm']],
    filter: '', cat: 'all',
    render(body, t) {
      const y = S.you; const L = S.libs.find(l => l.id === S.libSel);
      const live = !!L?.online;
      const verb = live ? 'Gửi yêu cầu' : '';
      const pend = (type, key) => y.pending.find(r => r.type === type && (r.book || r.item) === key);
      const libPick = `<div class="lib-pick">${S.libs.map(l => `<button type="button" class="lib-chip" data-lib="${l.id}" aria-pressed="${l.id === S.libSel}"><span class="st ${l.online ? 'on' : ''}"></span>${esc(l.name)}<small>${l.online ? 'Trực tiếp' : 'Tự động'}</small></button>`).join('')}</div>`;
      const intro = live
        ? `<b>${esc(L.name)}</b> đang trực tiếp. Yêu cầu của bạn được gửi tới thủ thư duyệt; nếu sau ${CONFIG.LIB_REQUEST_TIMEOUT_SEC / 60} phút chưa có phản hồi, hệ thống sẽ tự xử lý.`
        : `${esc(L?.name || 'Thủ thư')} đang ở chế độ tự động: yêu cầu được xử lý ngay.`;
      const greetText = t === 'borrow' ? `Mỗi cuốn mượn mất <b>${CONFIG.BORROW_COST} điểm</b>, hạn ${CONFIG.BORROW_DAYS} ngày. Trả đúng hạn được tặng lại <b>${CONFIG.RETURN_ONTIME_BONUS}</b> điểm. Bạn đang có <b>${pts(y.points)}</b> điểm.` : t === 'return' ? 'Bạn muốn trả cuốn nào? Đọc xong nhớ trả đúng hạn nhé.' : t === 'shop' ? 'Đồ dùng ở đây đổi bằng điểm. Giấy A4 và bút có thể tặng cho bạn bè trong thư viện.' : 'Đây là các lần cộng, trừ điểm gần nhất của bạn.';
      const pendBox = y.pending.length ? `<div class="pending"><div class="eyebrow">Đang chờ duyệt</div>${y.pending.map(r => `<div class="prow"><span>${esc(reqLabel(r))} · <i>${esc(r.libName || '')}</i></span><button class="btn small ghost" data-cancel="${r.id}">Hủy</button></div>`).join('')}</div>` : '';
      const head = libPick + `<div class="greet"><div class="av" style="${live ? '' : 'background:var(--ink-3)'}">${esc(initials(L?.name || 'T'))}</div><div class="bub">${intro}<br>${greetText}</div></div>
        <div class="actions" style="justify-content:flex-start;margin:-4px 0 10px"><button class="btn small" id="lib-dm">💬 Nhắn tin cho ${esc(L?.name || 'thủ thư')}</button></div>` + pendBox;
      if (t === 'borrow') {
        const P = S.panel;
        const list = S.catalog.books.filter(b => (P.cat === 'all' || b.category === P.cat) && (!P.filter || (b.title + b.id + (b.author || '')).toLowerCase().includes(P.filter.toLowerCase())));
        body.innerHTML = head + `<div class="row2" style="margin-bottom:6px"><div class="field"><label for="lib-q">Tìm sách</label><input id="lib-q" value="${esc(P.filter)}" placeholder="Tên sách, tác giả hoặc mã"></div>
          <div class="field"><label for="lib-c">Phân loại</label><select id="lib-c"><option value="all">Tất cả</option>${S.catalog.categories.map(c => `<option value="${c.id}" ${P.cat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div></div>
          <div class="list">${list.map(b => {
            const has = y.borrowed.some(x => x.bookId === b.id); const n = S.avail[b.id] ?? b.copies;
            if (has) return bookRow(b, '<span class="s">Đang mượn</span>');
            if (pend('borrow', b.id)) return bookRow(b, '<span class="s">Chờ duyệt</span>');
            return bookRow(b, `<button class="btn small primary" data-borrow="${b.id}" ${!b.borrowable || n <= 0 || y.points < CONFIG.BORROW_COST || y.borrowed.length >= CONFIG.BORROW_MAX ? 'disabled' : ''}>${verb || 'Mượn'}</button>`);
          }).join('') || '<div class="empty">Không tìm thấy sách phù hợp.</div>'}</div>`;
        const q = $('#lib-q', body);
        q.oninput = () => { P.filter = q.value; const pos = q.selectionStart; renderPanel(); const nq = $('#lib-q'); nq.focus(); nq.setSelectionRange(pos, pos); };
        $('#lib-c', body).onchange = (e) => { P.cat = e.target.value; renderPanel(); };
        body.querySelectorAll('[data-borrow]').forEach(b => (b.onclick = () => net.send({ t: 'borrow', book: b.dataset.borrow, lib: S.libSel })));
      } else if (t === 'return') {
        body.innerHTML = head + (y.borrowed.length ? `<div class="list">${y.borrowed.map(r => {
          const late = Date.now() > r.due;
          return `<div class="item"><span class="code">${esc(r.bookId)}</span><div style="min-width:0"><div class="t">${esc(bookById(r.bookId)?.title || r.title)}</div><div class="s" style="${late ? 'color:#b42318' : ''}">Mượn ${ddmm(r.at)}${r.by ? ` · ${esc(r.by)}` : ''} · hạn trả ${ddmm(r.due)}${late ? ' · quá hạn' : ''}</div></div>${pend('return', r.bookId) ? '<span class="s">Chờ duyệt</span>' : `<button class="btn small" data-ret="${r.bookId}">${live ? 'Gửi trả' : 'Trả sách'}</button>`}</div>`;
        }).join('')}</div>` : '<div class="empty">Bạn chưa mượn cuốn nào.</div>');
        body.querySelectorAll('[data-ret]').forEach(b => (b.onclick = () => net.send({ t: 'return', book: b.dataset.ret, lib: S.libSel })));
      } else if (t === 'shop') {
        body.innerHTML = head + `<div class="list">${SHOP.map(i => `<div class="item"><span class="ic">${i.icon}</span><div style="min-width:0"><div class="t">${esc(i.name)}</div><div class="s">${pts(i.price)} điểm · bạn đang có ${y.inventory[i.id] || 0}${i.giftable ? ' · tặng được' : ''}</div></div>${pend('buy', i.id) ? '<span class="s">Chờ duyệt</span>' : `<div style="display:flex;gap:4px"><button class="btn small primary" data-buy="${i.id}" data-q="1" ${y.points < i.price ? 'disabled' : ''}>${live ? 'Xin mua 1' : 'Mua 1'}</button><button class="btn small" data-buy="${i.id}" data-q="5" ${y.points < i.price * 5 ? 'disabled' : ''}>×5</button></div>`}</div>`).join('')}</div>`;
        body.querySelectorAll('[data-buy]').forEach(b => (b.onclick = () => net.send({ t: 'buy', item: b.dataset.buy, qty: +b.dataset.q, lib: S.libSel })));
      } else {
        body.innerHTML = head + (y.history.length ? `<div class="list hist">${y.history.map(h => `<div class="item"><span class="code">${hhmm(h.ts)}</span><div style="min-width:0"><div class="t" style="font-weight:500">${esc(h.r)}</div><div class="s">${ddmm(h.ts)}</div></div><span class="${h.d > 0 ? 'plus' : h.d < 0 ? 'minus' : 's'}">${h.d > 0 ? '+' : h.d < 0 ? '−' : ''}${pts(Math.abs(h.d))}</span></div>`).join('')}</div>` : '<div class="empty">Chưa có giao dịch.</div>');
      }
      body.querySelectorAll('[data-lib]').forEach(b => (b.onclick = () => { S.libSel = b.dataset.lib; renderPanel(); }));
      body.querySelectorAll('[data-cancel]').forEach(b => (b.onclick = () => net.send({ t: 'reqCancel', id: b.dataset.cancel })));
      $('#lib-dm', body).onclick = () => { if (L) { openDm(L.id, L.name); } };
    },
  });
  if (tab) { S.panel.tab = tab; renderPanel(); }
}

function openShelf(shelf) {
  openPanel({
    kind: 'shelf', eyebrow: `Kệ ${shelf.id}${shelf.kind === 'rack' ? ' · kệ trưng bày' : ''}`, title: shelfName(shelf.id) || 'Kệ trống',
    render(body) {
      const held = S.act.held; const books = booksOnShelf(shelf.id);
      const reader = !isLibrarian();
      body.innerHTML = (reader ? `<div class="note">Chọn một cuốn để <b>đọc tại chỗ</b> (miễn phí, tính điểm như học bài). Bạn có thể đứng đọc ngay đây hoặc mang tới ghế ngồi. Muốn mang về nhà thì mượn ở <b>quầy thủ thư</b>.</div>`
        : `<div class="note">Kệ <b>${shelf.id}</b> có ${books.length} đầu sách. Thêm, sửa hoặc chuyển sách sang kệ khác trong cửa sổ <b>Quản lý sách</b>.</div>`)
        + (books.length ? `<div class="list">${books.map(b => bookRow(b, !reader ? `<button class="btn small" data-edit="${b.id}">Sửa</button>` : held === b.id ? '<button class="btn small" data-put="1">Đặt lại kệ</button>' : `<button class="btn small primary" data-read="${b.id}">Đọc tại chỗ</button>`, { noShelf: true })).join('')}</div>` : '<div class="empty">Kệ này chưa có sách.</div>')
        + `<div class="actions" style="margin-top:12px">${reader ? '<button class="btn small" id="sh-lib">Mượn về ở quầy thủ thư →</button>' : `<button class="btn small primary" id="sh-add">+ Thêm sách vào kệ ${shelf.id}</button><button class="btn small" id="sh-manage">Mở Quản lý sách</button>`}</div>`;
      body.querySelectorAll('[data-read]').forEach(b => (b.onclick = () => net.send({ t: 'takeBook', shelf: shelf.id, book: b.dataset.read })));
      body.querySelector('[data-put]')?.addEventListener('click', () => net.send({ t: 'putBack' }));
      body.querySelectorAll('[data-edit]').forEach(b => (b.onclick = () => admin.editBook(b.dataset.edit)));
      $('#sh-lib', body)?.addEventListener('click', () => { closePanel(); goCounter(); });
      $('#sh-add', body)?.addEventListener('click', () => admin.editBook(null, { shelf: shelf.id }));
      $('#sh-manage', body)?.addEventListener('click', () => admin.openBooks({ shelf: shelf.id }));
    },
  });
}

function openReadPicker() {
  const y = S.you; const held = S.act.held ? bookById(S.act.held) : null;
  const options = [...(held ? [held] : []), ...y.borrowed.map(r => bookById(r.bookId)).filter(b => b && b.id !== held?.id)];
  openPanel({
    kind: 'read', eyebrow: 'Đọc sách', title: 'Chọn sách để đọc',
    render(body) {
      body.innerHTML = options.length
        ? `<div class="list">${options.map(b => bookRow(b, `<button class="btn small primary" data-k="${b.id}">${S.act.book === b.id && S.act.k === 'read' ? 'Đang đọc' : 'Đọc'}</button>`)).join('')}</div>`
        : `<div class="empty">Bạn chưa cầm cuốn sách nào.</div><div class="note">Đi tới một kệ sách (bấm vào kệ) để lấy sách đọc tại chỗ, hoặc mượn sách ở quầy thủ thư.</div>`;
      body.querySelectorAll('[data-k]').forEach(b => (b.onclick = () => { net.send({ t: 'activity', k: 'read', book: b.dataset.k }); closePanel(); }));
    },
  });
}

function openPlayer(id) {
  if (isLibrarian()) net.send({ t: 'lib_loans' });
  openPanel({
    kind: 'player', eyebrow: roleLabel(S.players.get(id)?.role), title: S.players.get(id) ? displayName(S.players.get(id)) : 'Người chơi',
    render(body) {
      const p = S.players.get(id);
      if (!p) { body.innerHTML = '<div class="empty">Người này đã rời thư viện.</div>'; return; }
      const y = S.you; const seat = p.seat ? SEAT_BY_ID[p.seat] : null;
      const act = p.role === 'librarian' ? 'Đang trực quầy' : p.act?.k === 'read' ? `Đang đọc «${esc(bookById(p.act.book)?.title || 'sách')}»` : p.act?.k === 'study' ? 'Đang học bài' : 'Đang dạo thư viện';
      const info = `<dl class="kv"><dt>Vai trò</dt><dd>${roleLabel(p.role)}</dd><dt>${p.role === 'lecturer' ? 'Khoa / Bộ môn' : 'Khoa'}</dt><dd>${esc(p.faculty || '—')}</dd><dt>Hoạt động</dt><dd>${act}</dd><dt>Vị trí</dt><dd>${seat ? `${esc(seat.zone)} · ghế ${seat.id}` : 'Đang đứng / đi lại'}</dd></dl>`;
      if (isLibrarian()) {
        const loans = S.loans.filter(l => l.uid === id);
        body.innerHTML = info + `<div class="big-actions"><button class="btn primary" id="pa-dm">💬 Nhắn tin<small>Trả lời, tư vấn</small></button><button class="btn" id="pa-greet">👋 Chào hỏi<small>Vẫy tay chào</small></button></div>
          <h3 class="eyebrow" style="color:var(--maroon);margin:16px 0 4px">Sách đang mượn (${loans.length})</h3>
          ${loans.length ? `<div class="list">${loans.map(l => `<div class="item"><span class="code">${esc(l.bookId)}</span><div style="min-width:0"><div class="t">${esc(l.title)}</div><div class="s" style="${l.overdue ? 'color:#b42318' : ''}">hạn ${ddmm(l.due)}${l.overdue ? ' · quá hạn' : ''}</div></div><button class="btn small" data-recall="${l.bookId}">Thu hồi</button></div>`).join('')}</div>` : '<div class="empty">Không mượn cuốn nào.</div>'}`;
        $('#pa-dm', body).onclick = () => { openDm(id); closePanel(); };
        $('#pa-greet', body).onclick = () => net.send({ t: 'greet', to: id });
        body.querySelectorAll('[data-recall]').forEach(b => (b.onclick = () => admin.recall(id, b.dataset.recall, p.name)));
        return;
      }
      const giftWait = Math.max(0, y.nextGiftAt - Date.now());
      const greetWait = Math.max(0, y.nextGreetAt - Date.now());
      const mins = (s) => s >= 60 ? `${Math.round(s / 60)} phút` : `${s} giây`;
      const giftNote = giftWait > 0 ? `Lượt tặng tiếp theo sau ${mins(Math.ceil(giftWait / 1000))}` : `Mỗi ${mins(CONFIG.GIFT_COOLDOWN_SEC)} được tặng 1 lần`;
      body.innerHTML = info + `
        <div class="big-actions">
          <button class="btn primary" id="pa-greet">👋 Chào hỏi<small>${greetWait > 0 ? `điểm sau ${Math.ceil(greetWait / 1000)} giây` : `+${CONFIG.GREET_POINTS} điểm`}</small></button>
          <button class="btn" id="pa-dm">💬 Nhắn riêng<small>Chỉ hai người thấy</small></button>
          <button class="btn" id="pa-a4" ${giftWait > 0 || (CONFIG.GIFT_REQUIRES_ITEM && !(y.inventory.a4 > 0)) ? 'disabled' : ''}>📄 Tặng giấy A4<small>+${CONFIG.GIFT_POINTS} · bạn có ${y.inventory.a4 || 0}</small></button>
          <button class="btn" id="pa-pen" ${giftWait > 0 || (CONFIG.GIFT_REQUIRES_ITEM && !(y.inventory.pen > 0)) ? 'disabled' : ''}>🖊️ Tặng bút<small>+${CONFIG.GIFT_POINTS} · bạn có ${y.inventory.pen || 0}</small></button>
        </div>
        <div class="note">${giftNote}. ${CONFIG.GIFT_REQUIRES_ITEM ? 'Giấy A4 và bút mua ở quầy thủ thư.' : ''}</div>
        <div class="actions">${p.role === 'librarian' ? '<button class="btn small primary" id="pa-counter">Tới quầy gặp thủ thư</button>' : ''}<button class="btn small" id="pa-go">Đi tới chỗ người này</button></div>`;
      $('#pa-greet', body).onclick = () => net.send({ t: 'greet', to: id });
      $('#pa-dm', body).onclick = () => { openDm(id); closePanel(); };
      $('#pa-a4', body).onclick = () => net.send({ t: 'gift', to: id, item: 'a4' });
      $('#pa-pen', body).onclick = () => net.send({ t: 'gift', to: id, item: 'pen' });
      $('#pa-counter', body)?.addEventListener('click', () => { closePanel(); goCounter(id); });
      $('#pa-go', body).onclick = () => { const r = p.av.root.position; walkTo(r.x + 0.6, r.z + 0.6); };
    },
  });
}

function openBag() {
  openPanel({
    kind: 'bag', eyebrow: 'Túi đồ & thẻ thư viện', title: displayName(S.you),
    render(body) {
      const y = S.you; const items = SHOP.filter(i => y.inventory[i.id] > 0);
      const held = S.act.held ? bookById(S.act.held) : null;
      body.innerHTML = `<dl class="kv"><dt>Tên đăng nhập</dt><dd style="font-family:var(--f-mono)">${esc(y.username)}</dd><dt>Vai trò</dt><dd>${roleLabel(y.role)}</dd><dt>Khoa</dt><dd>${esc(y.faculty || '—')}</dd>${y.cls ? `<dt>Lớp</dt><dd>${esc(y.cls)}</dd>` : ''}<dt>Điểm hiện có</dt><dd>${pts(y.points)}</dd>
        <dt>Chuỗi check-in</dt><dd>${y.streak} ngày (tổng ${y.checkins} lần)</dd><dt>Thời gian học</dt><dd>${Math.floor(y.totalStudyMin / 60)} giờ ${y.totalStudyMin % 60} phút</dd>
        <dt>Hôm nay</dt><dd>học ${pts(y.studyToday)}/${CONFIG.STUDY_DAILY_CAP} đ · chào ${pts(y.greetToday)}/${CONFIG.GREET_DAILY_CAP} đ</dd></dl>
        <h3 class="eyebrow" style="color:var(--maroon);margin:14px 0 4px">Đồ dùng</h3>
        ${items.length ? `<div class="list">${items.map(i => `<div class="item"><span class="ic">${i.icon}</span><div class="t">${esc(i.name)}</div><b>× ${y.inventory[i.id]}</b></div>`).join('')}</div>` : '<div class="empty">Túi đang trống. Đổi điểm lấy đồ dùng ở quầy thủ thư.</div>'}
        <h3 class="eyebrow" style="color:var(--maroon);margin:14px 0 4px">Sách</h3>
        ${held ? bookRow(held, '<span class="s">Đang cầm đọc</span>') : ''}
        ${y.borrowed.length ? y.borrowed.map(r => bookRow(bookById(r.bookId) || { id: r.bookId, title: r.title, category: '', shelf: '', copies: 0 }, `<span class="s">hạn ${ddmm(r.due)}</span>`)).join('') : (held ? '' : '<div class="empty">Chưa mượn cuốn nào.</div>')}
        <div class="actions" style="margin-top:14px"><button class="btn small ghost" id="bag-out">Đăng xuất khỏi máy này</button></div>`;
      $('#bag-out', body).onclick = () => { store.del(TOKEN_KEY); location.reload(); };
    },
  });
}

function openWardrobe() {
  openPanel({
    kind: 'wear', static: true, eyebrow: 'Trang phục', title: 'Thay đổi ngoại hình',
    render(body) {
      body.innerHTML = '<div id="b-wear"></div><div class="actions" style="margin-top:12px"><button class="btn primary" id="w-save">Lưu trang phục</button></div>';
      const b = createBuilder($('#b-wear', body), S.you.avatar);
      $('#w-save', body).onclick = () => { net.send({ t: 'avatar', avatar: b.get() }); toast('Đã thay trang phục.', 'ok'); closePanel(); };
    },
  });
}

function openOnline() {
  openPanel({
    kind: 'online', eyebrow: 'Đang trong thư viện', title: `${S.players.size + 1} người`,
    render(body) {
      const order = { librarian: 0, lecturer: 1, student: 2 };
      const list = [...S.players.values()].sort((a, b) => (order[a.role] ?? 2) - (order[b.role] ?? 2) || a.name.localeCompare(b.name, 'vi'));
      body.innerHTML = list.length ? `<div class="list">${list.map(p => {
        const seat = p.seat ? SEAT_BY_ID[p.seat] : null;
        const bg = p.role === 'librarian' ? 'var(--blue)' : p.role === 'lecturer' ? 'var(--gold)' : 'var(--maroon)';
        return `<div class="item"><span class="me-badge" style="width:30px;height:30px;font-size:12px;background:${bg}">${esc(initials(p.name))}</span><div style="min-width:0"><div class="t">${esc(displayName(p))}</div><div class="s">${roleLabel(p.role)}${p.faculty && p.role !== 'librarian' ? ' · ' + esc(p.faculty) : ''}${seat ? ' · ' + esc(seat.zone) : ''}${p.act?.k === 'read' ? ' · đang đọc' : p.act?.k === 'study' ? ' · đang học' : ''}</div></div><button class="btn small" data-p="${p.id}">Xem</button></div>`;
      }).join('')}</div>` : '<div class="empty">Hiện chỉ có mình bạn trong thư viện.</div>';
      body.querySelectorAll('[data-p]').forEach(b => (b.onclick = () => openPlayer(b.dataset.p)));
    },
  });
}
function renderOnlineIfOpen() { if (S.panel?.kind === 'online' || S.panel?.kind === 'player') renderPanel(); }

function openHelp() {
  openPanel({
    kind: 'help', static: true, eyebrow: 'Hướng dẫn', title: 'Cách dùng thư viện online',
    render(body) {
      body.innerHTML = `<div class="help">
        <h3>Điều khiển</h3><table>
          <tr><td>Đi tới một điểm</td><td>Bấm sàn</td></tr><tr><td>Đi bằng phím</td><td>W A S D / ←↑→↓</td></tr>
          <tr><td>Chạy</td><td>Giữ Shift</td></tr><tr><td>Xoay / phóng camera</td><td>Kéo chuột · cuộn</td></tr>
          <tr><td>Ngồi vào ghế</td><td>Bấm vào ghế</td></tr><tr><td>Đọc sách trên kệ</td><td>Bấm vào kệ</td></tr>
          <tr><td>Tương tác gần nhất</td><td>E</td></tr><tr><td>Chat</td><td>Enter</td></tr><tr><td>Đóng bảng</td><td>Esc</td></tr></table>
        <h3>Tích điểm</h3><table>
          <tr><td>Check-in lần đầu</td><td>${CONFIG.START_POINTS}</td></tr><tr><td>Check-in mỗi ngày</td><td>+${CONFIG.CHECKIN_POINTS}</td></tr>
          <tr><td>Ngồi học / đọc sách mỗi ${CONFIG.STUDY_INTERVAL_SEC / 60} phút (tối đa ${CONFIG.STUDY_DAILY_CAP}/ngày)</td><td>+${CONFIG.STUDY_POINTS}</td></tr>
          <tr><td>Chào hỏi (cộng điểm ${CONFIG.GREET_COOLDOWN_SEC / 60} phút/lần, tối đa ${CONFIG.GREET_DAILY_CAP}/ngày)</td><td>+${CONFIG.GREET_POINTS}</td></tr>
          <tr><td>Tặng giấy A4 hoặc bút (${CONFIG.GIFT_COOLDOWN_SEC / 60} phút/lần)</td><td>+${CONFIG.GIFT_POINTS}</td></tr>
          <tr><td>Trả sách đúng hạn</td><td>+${CONFIG.RETURN_ONTIME_BONUS}</td></tr>
          <tr><td>Mượn sách (tối đa ${CONFIG.BORROW_MAX} cuốn, ${CONFIG.BORROW_DAYS} ngày)</td><td>−${CONFIG.BORROW_COST}</td></tr></table>
        <h3>Thủ thư</h3><p style="color:var(--ink-2);margin:0">Quầy có 2 thủ thư. Khi thủ thư <b>trực tiếp</b> (có người đăng nhập), yêu cầu mượn, trả, mua đồ dùng sẽ chờ thủ thư duyệt và bạn có thể nhắn tin trao đổi. Khi thủ thư ở chế độ <b>tự động</b>, yêu cầu được xử lý ngay.</p>
        <h3>Lưu ý</h3><p style="color:var(--ink-2);margin:0">Thư viện có ${LAYOUT.seats.length} chỗ ngồi. Khi hết ghế bạn vẫn có thể đứng đọc tại kệ hoặc đi dạo. Ngồi học lâu, hệ thống sẽ hỏi “Bạn còn đang học?” — bấm xác nhận để tiếp tục tính điểm.</p></div>`;
    },
  });
}

const dock = (id, fn) => { $(id).onclick = () => { const was = $(id).getAttribute('aria-pressed') === 'true'; closePanel(); if (!was) { fn(); $(id).setAttribute('aria-pressed', 'true'); } }; };
$('#d-seat').onclick = () => goNearestSeat();
dock('#d-lib', () => goCounter());
dock('#d-bag', openBag);
dock('#d-wear', openWardrobe);
dock('#d-help', openHelp);
dock('#d-req', () => admin.openRequests());
dock('#d-books', () => admin.openBooks());
$('#d-post').onclick = () => goPost();
$('#d-view').onclick = () => {
  S.view = S.view === 'follow' ? 'overview' : 'follow';
  $('#d-view').setAttribute('aria-pressed', S.view === 'overview');
  $('#d-view .lb').textContent = S.view === 'overview' ? 'Theo nhân vật' : 'Toàn cảnh';
  if (S.view === 'overview') {
    controls.maxDistance = 48; controls.target.set(13, 0, 15); camera.position.set(13, 30, 40); world.markers.visible = true;
  } else {
    controls.maxDistance = 16; controls.target.set(me.x, 1.2, me.z); camera.position.set(me.x, 3.0, me.z + 4.5); world.markers.visible = false;
  }
};

// ================= Xác nhận còn học =================
let presenceTimer = null;
function onPresence(timeout) {
  S.presenceDeadline = Date.now() + timeout * 1000;
  modal(`<div class="eyebrow" style="color:var(--maroon)">Kiểm tra chỗ ngồi</div><h3>Bạn vẫn đang học chứ?</h3><p>Xác nhận để tiếp tục tích điểm. Còn <b id="pr-left">${timeout}</b> giây.</p><button class="btn primary" id="pr-ok">Vẫn đang học</button>`,
    (d) => { $('#pr-ok', d).onclick = () => { net.send({ t: 'presence' }); closePresence(); }; });
  clearInterval(presenceTimer);
  presenceTimer = setInterval(() => {
    const left = Math.max(0, Math.round((S.presenceDeadline - Date.now()) / 1000));
    const el = $('#pr-left'); if (el) el.textContent = left;
    if (!left) closePresence();
  }, 1000);
}
function closePresence() { S.presenceDeadline = 0; clearInterval(presenceTimer); $('#modal').hidden = true; $('#modal').innerHTML = ''; }

// ================= Chat =================
function sysChat(text) { S.chat.push({ sys: true, text, ts: Date.now() }); if (S.chat.length > 120) S.chat.shift(); if (S.chatTab === 'all') renderChat(); }
function onDm(m) {
  const other = m.from === S.myId ? m.to : m.from;
  const name = m.from === S.myId ? m.toName : m.fromName;
  if (!S.dms.has(other)) S.dms.set(other, { name, list: [], unread: 0 });
  const t = S.dms.get(other); t.list.push(m);
  if (S.chatTab !== other && m.from !== S.myId) { t.unread++; toast(`💬 ${m.fromName}: ${m.text}`, 'info', 5000); }
  renderChat();
}
function openDm(id, name) {
  const p = S.players.get(id);
  const lib = S.libs.find(l => l.id === id);
  if (!p && !lib) return;
  if (!S.dms.has(id)) S.dms.set(id, { name: name || (p ? displayName(p) : lib.name), list: [], unread: 0 });
  S.chatTab = id; $('#chat').classList.remove('min'); renderChat(); $('#chat-input').focus();
}
function renderChat() {
  const tabs = $('#chat-tabs');
  const dmTabs = [...S.dms.entries()];
  tabs.innerHTML = `<button class="tab" role="tab" data-tab="all" aria-selected="${S.chatTab === 'all'}">Chung</button>` +
    dmTabs.map(([id, t]) => `<button class="tab" role="tab" data-tab="${id}" aria-selected="${S.chatTab === id}">${esc(t.name.split(' ').slice(-1)[0])}${t.unread ? `<span class="unread">${t.unread}</span>` : ''}</button>`).join('') +
    `<button class="toggle" id="chat-min" aria-label="Thu gọn khung chat">${$('#chat').classList.contains('min') ? '▴' : '▾'}</button>`;
  tabs.querySelectorAll('[data-tab]').forEach(b => (b.onclick = () => { S.chatTab = b.dataset.tab; $('#chat').classList.remove('min'); renderChat(); }));
  $('#chat-min').onclick = () => { $('#chat').classList.toggle('min'); renderChat(); };
  const log = $('#chat-log');
  let list;
  if (S.chatTab === 'all') list = S.chat;
  else { const t = S.dms.get(S.chatTab); if (!t) { S.chatTab = 'all'; return renderChat(); } t.unread = 0; list = t.list.map(m => ({ id: m.from, name: m.fromName, role: m.from.startsWith('L:') ? 'librarian' : '', text: m.text, ts: m.ts, auto: m.auto })); }
  const badge = (r) => r === 'librarian' ? '<span class="rb lib">TT</span>' : r === 'lecturer' ? '<span class="rb lec">GV</span>' : '';
  log.innerHTML = list.map(m => m.sys ? `<div class="msg sys">${esc(m.text)}</div>` :
    `<div class="msg${m.auto ? ' sys' : ''}"><time>${hhmm(m.ts)}</time>${badge(m.role)}<span class="who ${m.id === S.myId ? 'me' : ''}" data-id="${m.id}">${esc(m.name)}</span>: ${esc(m.text)}</div>`).join('') || '<div class="msg sys">Chưa có tin nhắn.</div>';
  log.querySelectorAll('.who').forEach(w => (w.onclick = () => { if (w.dataset.id !== S.myId && S.players.has(w.dataset.id)) openPlayer(w.dataset.id); }));
  log.scrollTop = log.scrollHeight;
  $('#chat-input').placeholder = S.chatTab === 'all' ? 'Nhắn cho cả thư viện… (Enter)' : `Nhắn riêng cho ${S.dms.get(S.chatTab)?.name}…`;
}
$('#chat-form').onsubmit = (e) => {
  e.preventDefault();
  const inp = $('#chat-input'); const text = inp.value.trim(); if (!text) return;
  if (S.chatTab === 'all') net.send({ t: 'chat', text }); else net.send({ t: 'dm', to: S.chatTab, text });
  inp.value = '';
};
$('#chat-input').addEventListener('keydown', (e) => { if (e.key === 'Escape') e.target.blur(); });

// ================= Chức năng thủ thư =================
const admin = createAdmin({ S, net: () => net, $, esc, toast, modal, openPanel, renderPanel, closePanel, refreshPanel, bookById, catName, booksOnShelf, shelfName, displayName, roleLabel, ddmm, hhmm, pts, openDm, openPlayer });

// ================= Khởi động =================
requestAnimationFrame(frame);
(async () => {
  try {
    await startNet();
    if (S.token) net.send({ t: 'resume', token: S.token });
    else showAuth('new');
  } catch (e) {
    console.error(e);
    $('#load-text').textContent = 'Không khởi động được: ' + e.message;
  }
})();
