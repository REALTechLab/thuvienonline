// Máy chủ Thư viện DTU Online — Node.js >= 18, không cần cài thư viện ngoài.
// Chạy: node server.js   (cổng mặc định 3000, đổi bằng biến môi trường PORT)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { LibraryCore } from './shared/core.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const MAX_FRAME = 64 * 1024;

// ---------- Lưu dữ liệu ----------
fs.mkdirSync(DATA_DIR, { recursive: true });
let db = {};
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { db = {}; }
let saveTimer = null, saving = false, pending = false;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(saveNow, 2000);
}
function saveNow() {
  saveTimer = null;
  if (saving) { pending = true; return; }
  saving = true;
  const tmp = DB_FILE + '.tmp';
  fs.writeFile(tmp, JSON.stringify(db), (e) => {
    if (e) { console.error('Lưu dữ liệu lỗi:', e); saving = false; return; }
    fs.rename(tmp, DB_FILE, () => { saving = false; if (pending) { pending = false; scheduleSave(); } });
  });
}

// ---------- Mã PIN ----------
const hashPin = (pin) => {
  const salt = crypto.randomBytes(12).toString('hex');
  return salt + ':' + crypto.scryptSync(pin, salt, 32).toString('hex');
};
const verifyPin = (pin, stored) => {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const h = crypto.scryptSync(pin, salt, 32);
  return crypto.timingSafeEqual(h, Buffer.from(hash, 'hex'));
};
const randomId = (n) => crypto.randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n);

// ---------- Kết nối ----------
const clients = new Map(); // sid -> socket wrapper
let nextSid = 1;
const core = new LibraryCore({
  db, hashPin, verifyPin, randomId, onChange: scheduleSave,
  send: (sid, msg) => clients.get(sid)?.send(JSON.stringify(msg)),
});
setInterval(() => core.flush(), 100);
setInterval(() => core.tick(), 5000);

// ---------- File tĩnh ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2',
};
function serveFile(res, file) {
  fs.stat(file, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Không tìm thấy'); }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream', 'content-length': st.size,
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
      'x-content-type-options': 'nosniff',
    });
    fs.createReadStream(file).pipe(res);
  });
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p === '/api/health') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, ...core.stats() })); }
  let base = path.join(ROOT, 'public');
  if (p.startsWith('/shared/')) { base = path.join(ROOT, 'shared'); p = p.slice(7); }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(base, p));
  if (!file.startsWith(base + path.sep)) { res.writeHead(403); return res.end(); }
  serveFile(res, file);
});

// ---------- WebSocket (RFC 6455, tự cài đặt) ----------
server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, 'http://x');
  const key = req.headers['sec-websocket-key'];
  if (url.pathname !== '/ws' || !key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);

  const sid = nextSid++;
  let buf = Buffer.alloc(0), fragments = [], alive = true, lastSeen = Date.now();
  let tokens = 40, lastRefill = Date.now(); // giới hạn 40 tin/giây

  const frame = (op, payload) => {
    const len = payload.length;
    let head;
    if (len < 126) { head = Buffer.alloc(2); head[1] = len; }
    else if (len < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
    head[0] = 0x80 | op;
    return Buffer.concat([head, payload]);
  };
  const ws = {
    send(text) { if (alive && socket.writable) socket.write(frame(0x1, Buffer.from(text))); },
    close() { if (!alive) return; alive = false; try { socket.end(frame(0x8, Buffer.alloc(0))); } catch {} cleanup(); },
    ping() { if (alive && socket.writable) socket.write(frame(0x9, Buffer.alloc(0))); },
    get lastSeen() { return lastSeen; },
  };
  const cleanup = () => {
    if (!clients.has(sid)) return;
    clients.delete(sid); alive = false; core.disconnect(sid);
  };
  clients.set(sid, ws);
  core.connect(sid);

  socket.on('data', (chunk) => {
    lastSeen = Date.now();
    buf = Buffer.concat([buf, chunk]);
    if (buf.length > MAX_FRAME * 4) return ws.close();
    for (;;) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0, op = buf[0] & 0x0f, masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; const big = buf.readBigUInt64BE(2); if (big > BigInt(MAX_FRAME)) return ws.close(); len = Number(big); off = 10; }
      if (len > MAX_FRAME || !masked) return ws.close();
      if (buf.length < off + 4 + len) return;
      const mask = buf.subarray(off, off + 4);
      const data = Buffer.from(buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
      buf = buf.subarray(off + 4 + len);

      if (op === 0x8) return ws.close();
      if (op === 0x9) { socket.write(frame(0xA, data)); continue; }
      if (op === 0xA) continue;
      if (op === 0x1 || op === 0x0) {
        fragments.push(data);
        if (!fin) { if (fragments.reduce((a, b) => a + b.length, 0) > MAX_FRAME) return ws.close(); continue; }
        const text = Buffer.concat(fragments).toString('utf8'); fragments = [];
        const now = Date.now(); tokens = Math.min(40, tokens + (now - lastRefill) * 0.04); lastRefill = now;
        if (tokens < 1) continue; tokens--;
        let msg; try { msg = JSON.parse(text); } catch { continue; }
        core.message(sid, msg);
      }
    }
  });
  socket.on('close', cleanup);
  socket.on('end', cleanup);
  socket.on('error', cleanup);
});

// Giữ kết nối & dọn kết nối chết
setInterval(() => {
  const now = Date.now();
  for (const ws of clients.values()) {
    if (now - ws.lastSeen > 70000) ws.close(); else ws.ping();
  }
}, 25000);

server.listen(PORT, HOST, () => console.log(`Thư viện DTU Online đang chạy: http://localhost:${PORT}`));

const shutdown = () => { console.log('Đang lưu dữ liệu...'); try { fs.writeFileSync(DB_FILE, JSON.stringify(db)); } catch {} process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
