// Mặt bằng thư viện (đơn vị: mét). Lấy theo bản vẽ 26m x 30m.
// Trục x: trái → phải (0..26). Trục z: tường kính phía trên (z=0) → cửa chính (z=30).
// Hướng nhìn ry: 0 = nhìn về phía cửa chính (+z), PI = nhìn ra cửa kính (-z),
// PI/2 = nhìn sang phải (+x), -PI/2 = nhìn sang trái (-x).

const PI = Math.PI;
export const ROOM = { w: 26, d: 30, h: 3.3 };
export const DOOR = { x1: 12.4, x2: 14.4, z: 30 };
export const SPAWN = { x: 13.4, z: 28.6, ry: PI };


function buildLayout() {
  const walls = [];      // {x1,z1,x2,z2,kind:'solid'|'glass'|'partition'|'wood'}
  const blocks = [];     // vật cản cho tìm đường {x,z,w,d} (tâm, kích thước theo x và z)
  const furniture = [];  // đồ để vẽ
  const seats = [];
  const shelves = [];
  const rooms = [];

  const seat = (zone, type, x, z, ry, h = 0.46) => {
    const id = 'S' + String(seats.length + 1).padStart(3, '0');
    seats.push({ id, zone, type, x: +x.toFixed(3), z: +z.toFixed(3), ry, h });
  };
  const block = (x, z, w, d) => blocks.push({ x, z, w, d });

  // ---------- Tường ----------
  const W = ROOM.w, D = ROOM.d;
  walls.push({ x1: 0, z1: 0, x2: W, z2: 0, kind: 'glass' });                // tường kính phía trên
  walls.push({ x1: W, z1: 0, x2: W, z2: 10.4, kind: 'glass' });             // kính bên phải
  walls.push({ x1: W, z1: 10.4, x2: W, z2: D, kind: 'solid' });
  walls.push({ x1: 0, z1: 0, x2: 0, z2: D, kind: 'solid' });
  walls.push({ x1: 0, z1: D, x2: DOOR.x1, z2: D, kind: 'solid' });
  walls.push({ x1: DOOR.x2, z1: D, x2: W, z2: D, kind: 'solid' });

  // Khối phòng họp bên phải (x=16..26, z=10.4..30)
  const RX = 16;
  const doorGaps = [[12.0, 13.0], [16.0, 17.0], [19.6, 20.6], [25.2, 26.2]];
  let zc = 10.4;
  for (const [a, b] of doorGaps) {
    walls.push({ x1: RX, z1: zc, x2: RX, z2: a, kind: 'partition' });
    zc = b;
  }
  walls.push({ x1: RX, z1: zc, x2: RX, z2: D, kind: 'partition' });
  walls.push({ x1: RX, z1: 10.4, x2: W, z2: 10.4, kind: 'partition' });
  walls.push({ x1: RX, z1: 18.2, x2: W, z2: 18.2, kind: 'wood' });
  walls.push({ x1: RX, z1: 24.1, x2: W, z2: 24.1, kind: 'wood' });
  for (const w of walls) {
    const t = 0.16;
    if (w.z1 === w.z2) block((w.x1 + w.x2) / 2, w.z1, Math.abs(w.x2 - w.x1), t);
    else block(w.x1, (w.z1 + w.z2) / 2, t, Math.abs(w.z2 - w.z1));
  }
  furniture.push({ type: 'door', x: RX, z: 12.5, axis: 'z', w: 1 });
  furniture.push({ type: 'door', x: RX, z: 16.5, axis: 'z', w: 1 });
  furniture.push({ type: 'door', x: RX, z: 20.1, axis: 'z', w: 1 });
  furniture.push({ type: 'door', x: RX, z: 25.7, axis: 'z', w: 1 });
  furniture.push({ type: 'mainDoor', x: (DOOR.x1 + DOOR.x2) / 2, z: D, w: DOOR.x2 - DOOR.x1 });

  // ---------- 1. Bàn tròn cạnh cửa kính (6 cụm x 2 ghế) ----------
  for (const cx of [2.5, 8.6, 12.8, 16.6, 19.9, 23.3]) {
    const cz = 0.82;
    furniture.push({ type: 'roundTable', x: cx, z: cz, r: 0.36 });
    block(cx, cz, 0.72, 0.72);
    seat('Cửa kính', 'ghost', cx - 0.72, cz, PI / 2, 0.45);
    seat('Cửa kính', 'ghost', cx + 0.72, cz, -PI / 2, 0.45);
  }

  // ---------- 2. Kệ sách lớn: 2 dãy x 7 kệ ----------
  const rowZ = [2.45, 3.95, 5.45, 7.25, 8.75, 10.25, 11.75];
  const cols = [{ x: 2.95, w: 4.1 }, { x: 8.4, w: 4.2 }];
  let cat = 0;
  for (const c of cols) {
    for (const z of rowZ) {
      const id = 'K' + String(shelves.length + 1).padStart(2, '0');
      shelves.push({ id, x: c.x, z, w: c.w, d: 0.6, h: 2.1, axis: 'x', seed: cat % 14, kind: 'tall' });
      block(c.x, z, c.w, 0.6);
      cat++;
    }
  }

  // ---------- 3. Bàn học dài (15 ghế mỗi bên) ----------
  const LT = { x: 12.8, z: 9.95, w: 1.2, d: 16.1 };
  furniture.push({ type: 'longTable', ...LT });
  block(LT.x, LT.z, LT.w, LT.d);
  for (let i = 0; i < 15; i++) {
    const z = 2.55 + i * 1.0;
    seat('Bàn học dài', 'wood', LT.x - 1.02, z, PI / 2);
    seat('Bàn học dài', 'wood', LT.x + 1.02, z, -PI / 2);
  }

  // ---------- 4. Khu ghế bành (2 cụm) ----------
  for (const gx of [18.2, 21.6]) {
    furniture.push({ type: 'coffeeTable', x: gx, z: 3.95, r: 0.36 });
    block(gx, 3.95, 0.72, 0.72);
    seat('Ghế bành', 'armchair', gx - 0.48, 3.05, 0, 0.42);
    seat('Ghế bành', 'armchair', gx + 0.48, 3.05, 0, 0.42);
  }

  // ---------- 5. Cụm bàn làm việc 8 chỗ (có màn hình) ----------
  const deskX = [18.65, 19.55, 20.45, 21.35];
  for (const dx of deskX) {
    furniture.push({ type: 'desk', x: dx, z: 6.55, w: 0.88, d: 0.68, monitor: true, faceRy: 0 });
    furniture.push({ type: 'desk', x: dx, z: 7.25, w: 0.88, d: 0.68, monitor: true, faceRy: PI });
  }
  furniture.push({ type: 'deskDivider', x: 20.0, z: 6.9, w: 3.6 });
  block(20.0, 6.9, 3.6, 1.4);
  for (const dx of deskX) {
    seat('Bàn máy tính', 'office', dx, 5.78, 0, 0.48);
    seat('Bàn máy tính', 'office', dx, 8.02, PI, 0.48);
  }

  // ---------- 6. Bàn học sát tường phải (3 bàn x 2 ghế) ----------
  for (const cz of [3.0, 5.25, 7.8]) {
    furniture.push({ type: 'wallDesk', x: 25.55, z: cz, w: 0.7, d: 1.5 });
    block(25.55, cz, 0.7, 1.5);
    seat('Bàn sát tường', 'wood', 24.85, cz - 0.38, PI / 2);
    seat('Bàn sát tường', 'wood', 24.85, cz + 0.38, PI / 2);
  }

  // ---------- 7. Phòng họp ----------
  const roomDefs = [
    { id: 'R1', name: 'Phòng họp lớn (20 ghế)', z1: 10.4, z2: 18.2, tableW: 5.9, tableD: 1.5, perSide: 9 },
    { id: 'R2', name: 'Phòng họp nhỏ A (10 ghế)', z1: 18.2, z2: 24.1, tableW: 3.2, tableD: 1.2, perSide: 4 },
    { id: 'R3', name: 'Phòng họp nhỏ B (10 ghế)', z1: 24.1, z2: 30, tableW: 3.2, tableD: 1.2, perSide: 4 },
  ];
  for (const r of roomDefs) {
    const cx = 21.3, cz = (r.z1 + r.z2) / 2;
    rooms.push({ id: r.id, name: r.name, x1: RX, x2: W, z1: r.z1, z2: r.z2 });
    furniture.push({ type: 'meetingTable', x: cx, z: cz, w: r.tableW, d: r.tableD });
    furniture.push({ type: 'tv', x: W - 0.06, z: cz, w: Math.min(2.4, (r.z2 - r.z1) * 0.45) });
    block(cx, cz, r.tableW, r.tableD);
    const step = (r.tableW - 0.5) / (r.perSide - 1);
    for (let i = 0; i < r.perSide; i++) {
      const x = cx - r.tableW / 2 + 0.25 + i * step;
      seat(r.name.split(' (')[0], 'meeting', x, cz - r.tableD / 2 - 0.42, 0);
      seat(r.name.split(' (')[0], 'meeting', x, cz + r.tableD / 2 + 0.42, PI);
    }
    seat(r.name.split(' (')[0], 'meeting', cx - r.tableW / 2 - 0.45, cz, PI / 2);
    seat(r.name.split(' (')[0], 'meeting', cx + r.tableW / 2 + 0.45, cz, -PI / 2);
  }

  // ---------- 8. Quầy thủ thư ----------
  const COUNTER = { x: 3.1, z: 17.6, w: 1.2, d: 6.8 };
  furniture.push({ type: 'counter', ...COUNTER });
  block(COUNTER.x, COUNTER.z, COUNTER.w, COUNTER.d);
  furniture.push({ type: 'backCabinet', x: 0.3, z: 17.6, w: 0.5, d: 5.0 });
  block(0.3, 17.6, 0.5, 5.0);

  // ---------- 9. Tủ locker, kệ tạp chí, sofa ----------
  furniture.push({ type: 'locker', x: 0.32, z: 25.2, w: 0.56, d: 7.0 });
  block(0.32, 25.2, 0.56, 7.0);
  for (const [i, x] of [[0, 5.15], [1, 7.65]]) {
    const id = 'K' + String(15 + i);
    shelves.push({ id, x, z: 25.1, w: 0.62, d: 4.0, h: 1.45, axis: 'z', seed: 14 + i, kind: 'rack' });
    block(x, 25.1, 0.62, 4.0);
  }
  for (const sx of [3.8, 9.0]) {
    furniture.push({ type: 'sofa', x: sx, z: 28.85, w: 3.2, d: 0.95, ry: PI });
    block(sx, 28.85, 3.2, 0.95);
    for (const o of [-1, 0, 1]) seat('Sofa sảnh', 'sofa', sx + o * 0.98, 28.62, PI, 0.42);
  }
  furniture.push({ type: 'plant', x: 15.3, z: 29.3 });
  furniture.push({ type: 'plant', x: 11.4, z: 29.4 });
  furniture.push({ type: 'plant', x: 15.4, z: 1.5 });
  furniture.push({ type: 'plant', x: 25.4, z: 9.6 });
  furniture.push({ type: 'wallText', x: 6.4, z: 29.92, ry: PI, text1: 'LET THE BOOK', text2: 'talk' });
  furniture.push({ type: 'gate', x: 13.4, z: 27.6 });
  block(12.1, 27.6, 0.25, 0.7);
  block(14.7, 27.6, 0.25, 0.7);

  // Vị trí đứng trực của 2 thủ thư sau quầy (post 0, post 1)
  const LIB_POSTS = [{ x: 1.75, z: 16.4, ry: PI / 2 }, { x: 1.75, z: 18.8, ry: PI / 2 }];
  const COUNTER_FRONT = { x: 4.2, z: 17.6 };

  return { walls, blocks, furniture, seats, shelves, rooms, COUNTER, LIB_POSTS, COUNTER_FRONT };
}

export const LAYOUT = buildLayout();
export const SEAT_BY_ID = Object.fromEntries(LAYOUT.seats.map(s => [s.id, s]));
export const SHELF_BY_ID = Object.fromEntries(LAYOUT.shelves.map(s => [s.id, s]));

// Điểm đứng phía trước kệ gần nhất với (x,z) — dùng để đi tới đọc sách
export function shelfApproach(shelf, x, z) {
  if (shelf.axis === 'x') {
    const side = z < shelf.z ? -1 : 1;
    const px = Math.max(shelf.x - shelf.w / 2 + 0.4, Math.min(shelf.x + shelf.w / 2 - 0.4, x));
    return { x: px, z: shelf.z + side * (shelf.d / 2 + 0.42), ry: side < 0 ? 0 : PI };
  }
  const side = x < shelf.x ? -1 : 1;
  const pz = Math.max(shelf.z - shelf.d / 2 + 0.4, Math.min(shelf.z + shelf.d / 2 - 0.4, z));
  return { x: shelf.x + side * (shelf.w / 2 + 0.42), z: pz, ry: side < 0 ? PI / 2 : -PI / 2 };
}

export function distToShelf(shelf, x, z) {
  const dx = Math.max(Math.abs(x - shelf.x) - shelf.w / 2, 0);
  const dz = Math.max(Math.abs(z - shelf.z) - shelf.d / 2, 0);
  return Math.hypot(dx, dz);
}

export function roomAt(x, z) {
  return LAYOUT.rooms.find(r => x > r.x1 && x < r.x2 && z > r.z1 && z < r.z2) || null;
}
