// Lưới tìm đường A* trên mặt bằng thư viện (dùng chung client + bot demo).
import { LAYOUT, ROOM } from './layout.js';

export function buildGrid(cell = 0.2, radius = 0.26) {
  const cols = Math.ceil(ROOM.w / cell), rows = Math.ceil(ROOM.d / cell);
  const blocked = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * cell, z = (r + 0.5) * cell;
      if (x < radius || z < radius || x > ROOM.w - radius || z > ROOM.d - radius) {
        // ngoại lệ: lối cửa chính
        if (!(z > ROOM.d - radius && x > 12.4 + radius && x < 14.4 - radius)) { blocked[r * cols + c] = 1; continue; }
      }
      for (const b of LAYOUT.blocks) {
        if (Math.abs(x - b.x) < b.w / 2 + radius && Math.abs(z - b.z) < b.d / 2 + radius) { blocked[r * cols + c] = 1; break; }
      }
    }
  }
  return { cell, cols, rows, blocked };
}

export function isBlocked(g, x, z) {
  const c = Math.floor(x / g.cell), r = Math.floor(z / g.cell);
  if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return true;
  return g.blocked[r * g.cols + c] === 1;
}

export function nearestFree(g, x, z, maxR = 3) {
  if (!isBlocked(g, x, z)) return { x, z };
  const c0 = Math.floor(x / g.cell), r0 = Math.floor(z / g.cell);
  const maxCells = Math.ceil(maxR / g.cell);
  let best = null, bestD = Infinity;
  for (let ring = 1; ring <= maxCells && !best; ring++) {
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        const c = c0 + dc, r = r0 + dr;
        if (c < 0 || r < 0 || c >= g.cols || r >= g.rows || g.blocked[r * g.cols + c]) continue;
        const px = (c + 0.5) * g.cell, pz = (r + 0.5) * g.cell;
        const d = (px - x) ** 2 + (pz - z) ** 2;
        if (d < bestD) { bestD = d; best = { x: px, z: pz }; }
      }
    }
  }
  return best;
}

function lineFree(g, x1, z1, x2, z2) {
  const dist = Math.hypot(x2 - x1, z2 - z1);
  const steps = Math.ceil(dist / (g.cell * 0.5));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isBlocked(g, x1 + (x2 - x1) * t, z1 + (z2 - z1) * t)) return false;
  }
  return true;
}

// Trả về mảng điểm [{x,z}] (không gồm điểm xuất phát) hoặc null
export function findPath(g, sx, sz, tx, tz) {
  const s = nearestFree(g, sx, sz, 1.5); const t = nearestFree(g, tx, tz, 4);
  if (!s || !t) return null;
  if (lineFree(g, s.x, s.z, t.x, t.z)) return [t];
  const { cols, rows, cell, blocked } = g;
  const idx = (c, r) => r * cols + c;
  const sc = Math.floor(s.x / cell), sr = Math.floor(s.z / cell);
  const tc = Math.floor(t.x / cell), tr = Math.floor(t.z / cell);
  const N = cols * rows;
  const gScore = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap = []; // [f, i]
  const push = (f, i) => {
    heap.push([f, i]); let k = heap.length - 1;
    while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; }
  };
  const pop = () => {
    const top = heap[0]; const last = heap.pop();
    if (heap.length) {
      heap[0] = last; let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1; let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
      }
    }
    return top;
  };
  const h = (c, r) => { const dx = Math.abs(c - tc), dy = Math.abs(r - tr); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
  const start = idx(sc, sr), goal = idx(tc, tr);
  gScore[start] = 0; push(h(sc, sr), start);
  const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  let found = false, iter = 0;
  while (heap.length && iter++ < 60000) {
    const [, cur] = pop();
    if (closed[cur]) continue;
    if (cur === goal) { found = true; break; }
    closed[cur] = 1;
    const cc = cur % cols, cr = (cur / cols) | 0;
    for (const [dc, dr, cost] of dirs) {
      const nc = cc + dc, nr = cr + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const ni = idx(nc, nr);
      if (blocked[ni] || closed[ni]) continue;
      if (dc && dr && (blocked[idx(cc + dc, cr)] || blocked[idx(cc, cr + dr)])) continue;
      const ng = gScore[cur] + cost;
      if (ng < gScore[ni]) { gScore[ni] = ng; came[ni] = cur; push(ng + h(nc, nr), ni); }
    }
  }
  if (!found) return null;
  const pts = [];
  for (let i = goal; i !== -1 && i !== start; i = came[i]) pts.push({ x: (i % cols + 0.5) * cell, z: (((i / cols) | 0) + 0.5) * cell });
  pts.reverse();
  pts[pts.length - 1] = { x: t.x, z: t.z };
  // Làm mượt bằng kiểm tra tầm nhìn thẳng
  const out = []; let ax = s.x, az = s.z, i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !lineFree(g, ax, az, pts[j].x, pts[j].z)) j--;
    out.push(pts[j]); ax = pts[j].x; az = pts[j].z; i = j + 1;
  }
  return out;
}

// Va chạm khi đi bằng bàn phím: trượt theo từng trục
export function slideMove(g, x, z, nx, nz) {
  if (!isBlocked(g, nx, nz)) return { x: nx, z: nz };
  if (!isBlocked(g, nx, z)) return { x: nx, z };
  if (!isBlocked(g, x, nz)) return { x, z: nz };
  return { x, z };
}
