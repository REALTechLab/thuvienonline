// Dựng không gian thư viện Duy Tân theo mặt bằng trong shared/layout.js
import * as THREE from 'three';
import { LAYOUT, ROOM, CATEGORIES, DOOR } from '../shared/layout.js';

const PI = Math.PI;
const C = {
  floor: '#f3f1ed', wall: '#f5f3ef', woodL: '#c99563', woodM: '#b07a46', woodD: '#5b3c27', white: '#f4f2ee',
  metal: '#2a2c30', black: '#17181b', fabric: '#d6c7ae', taupe: '#9a8672', grey: '#8e9196', gold: '#c4a061',
  maroon: '#8c1d2f', marble: '#26272b', screen: '#0d1626', carpet: '#7b6a58', leaf: '#4f7a3c',
};

function canvasTexture(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

// Gom các khối giống nhau thành InstancedMesh để vẽ nhanh
class Batch {
  constructor() {
    this.geos = { box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 24), cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8) };
    this.groups = new Map();
    this.m = new THREE.Matrix4(); this.p = new THREE.Matrix4(); this.l = new THREE.Matrix4();
    this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.s = new THREE.Vector3(); this.v = new THREE.Vector3();
    this.frame = new THREE.Matrix4();
  }
  setFrame(x = 0, z = 0, ry = 0, y = 0) { this.frame.makeRotationY(ry).setPosition(x, y, z); return this; }
  add(geo, material, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0, opts = {}) {
    const key = geo + '|' + material.uuid + (opts.noShadow ? '|ns' : '');
    if (!this.groups.has(key)) this.groups.set(key, { geo, material, list: [], opts });
    this.e.set(rx, ry, rz); this.q.setFromEuler(this.e);
    this.l.compose(this.v.set(x, y, z), this.q, this.s.set(sx, sy, sz));
    this.groups.get(key).list.push(this.m.multiplyMatrices(this.frame, this.l).clone());
  }
  box(material, x, y, z, w, h, d, ry, rx, rz, opts) { this.add('box', material, x, y, z, w, h, d, ry, rx, rz, opts); }
  cyl(material, x, y, z, r, h, opts = {}) { this.add(opts.low ? 'cyl8' : 'cyl', material, x, y, z, r * 2, h, (opts.rz || r) * 2, opts.ry || 0, opts.rx || 0, 0, opts); }
  build(parent) {
    for (const g of this.groups.values()) {
      const im = new THREE.InstancedMesh(this.geos[g.geo], g.material, g.list.length);
      g.list.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = !g.opts.noShadow && !g.material.transparent; im.receiveShadow = true;
      im.computeBoundingSphere();
      parent.add(im);
    }
  }
}

export function buildWorld(scene, renderer, { quality = 'high' } = {}) {
  const group = new THREE.Group(); scene.add(group);
  const M = {};
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });
  M.woodL = std(C.woodL, { roughness: 0.5 }); M.woodM = std(C.woodM, { roughness: 0.5 }); M.woodD = std(C.woodD, { roughness: 0.45 });
  M.white = std(C.white, { roughness: 0.35 }); M.metal = std(C.metal, { roughness: 0.35, metalness: 0.5 }); M.black = std(C.black, { roughness: 0.4 });
  M.fabric = std(C.fabric, { roughness: 0.9 }); M.taupe = std(C.taupe, { roughness: 0.95 }); M.grey = std(C.grey, { roughness: 0.95 });
  M.gold = std(C.gold, { roughness: 0.3, metalness: 0.7 }); M.marble = std(C.marble, { roughness: 0.15 });
  M.ghost = new THREE.MeshStandardMaterial({ color: '#9aa3a8', roughness: 0.05, transparent: true, opacity: 0.38, depthWrite: false });
  M.ghostAmber = new THREE.MeshStandardMaterial({ color: '#c9a24a', roughness: 0.05, transparent: true, opacity: 0.42, depthWrite: false });
  M.glass = new THREE.MeshStandardMaterial({ color: '#cfe3ea', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  M.glassDoor = new THREE.MeshStandardMaterial({ color: '#d6e9ee', roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  M.led = new THREE.MeshBasicMaterial({ color: '#fff6e3' });
  M.warmLed = new THREE.MeshBasicMaterial({ color: '#ffd9a0' });
  M.screen = new THREE.MeshStandardMaterial({ color: '#16243b', emissive: '#1d3558', emissiveIntensity: 0.6, roughness: 0.2 });
  M.leaf = std(C.leaf, { roughness: 0.8 });
  M.chairWood = std('#7a5235', { roughness: 0.5 });
  M.meetingWhite = std('#ece9e3', { roughness: 0.4 });

  const B = new Batch();

  // ---------- Sàn ----------
  const floorTex = canvasTexture(2080, 2400, (g, w, h) => {
    const s = w / ROOM.w;
    g.fillStyle = '#f2f0eb'; g.fillRect(0, 0, w, h);
    // vân đá mờ
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(${170 + Math.random() * 40},${165 + Math.random() * 40},${160 + Math.random() * 40},${Math.random() * 0.05})`;
      g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 60, 2 + Math.random() * 6, Math.random() * PI, 0, PI * 2); g.fill();
    }
    // ron gạch 1.2m
    g.strokeStyle = 'rgba(160,150,140,.16)'; g.lineWidth = 1.5;
    for (let x = 0; x < ROOM.w; x += 1.2) { g.beginPath(); g.moveTo(x * s, 0); g.lineTo(x * s, h); g.stroke(); }
    for (let z = 0; z < ROOM.d; z += 1.2) { g.beginPath(); g.moveTo(0, z * s); g.lineTo(w, z * s); g.stroke(); }
    // chỉ đồng trang trí (như ảnh thật)
    g.strokeStyle = '#c4a061'; g.lineWidth = 4;
    const line = (pts) => { g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(x * s, z * s) : g.moveTo(x * s, z * s))); g.stroke(); };
    line([[0.6, 1.6], [11.2, 1.6]]);
    line([[0.6, 1.75], [11.2, 1.75]]);
    line([[11.0, 1.9], [11.0, 18.6], [7.2, 22.4], [7.2, 29.6]]);
    line([[14.6, 1.9], [14.6, 18.2], [12.2, 20.6], [12.2, 29.8]]);
    line([[14.75, 1.9], [14.75, 18.3], [12.4, 20.7], [12.4, 29.8]]);
    line([[16.4, 9.4], [25.4, 9.4]]);
    g.beginPath(); g.arc(8.5 * s, 18 * s, 2.2 * s, 0, PI * 2); g.stroke();
  });
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.2, metalness: 0.05 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), floorMat);
  floor.rotation.x = -PI / 2; floor.position.set(ROOM.w / 2, 0, ROOM.d / 2); floor.receiveShadow = true;
  floor.name = 'floor'; group.add(floor);
  // thảm phòng họp
  const carpetTex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#7d6b58'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '40,30,20' : '200,180,150'},${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  }, { repeat: [6, 6] });
  for (const r of LAYOUT.rooms) {
    const cp = new THREE.Mesh(new THREE.PlaneGeometry(r.x2 - r.x1 - 0.1, r.z2 - r.z1 - 0.1), new THREE.MeshStandardMaterial({ map: carpetTex, roughness: 1 }));
    cp.rotation.x = -PI / 2; cp.position.set((r.x1 + r.x2) / 2, 0.004, (r.z1 + r.z2) / 2); cp.receiveShadow = true; group.add(cp);
  }
  // sàn gỗ dưới bàn học dài (như ảnh)
  const woodFloor = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 16.6), new THREE.MeshStandardMaterial({ color: '#6e4a30', roughness: 0.45 }));
  woodFloor.rotation.x = -PI / 2; woodFloor.position.set(12.8, 0.003, 9.95); woodFloor.receiveShadow = true; group.add(woodFloor);

  // ---------- Cảnh bên ngoài cửa kính ----------
  const outside = canvasTexture(4096, 1024, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h * 0.55);
    sky.addColorStop(0, '#8fc0e6'); sky.addColorStop(1, '#e6eef2');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 18; i++) { g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(Math.random() * w, 60 + Math.random() * 200, 80 + Math.random() * 160, 14 + Math.random() * 18, 0, 0, PI * 2); g.fill(); }
    const ridge = (base, amp, color, seed) => {
      g.fillStyle = color; g.beginPath(); g.moveTo(0, h);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, base - Math.abs(Math.sin(x * 0.0021 + seed) * amp + Math.sin(x * 0.0067 + seed * 2) * amp * 0.35));
      g.lineTo(w, h); g.fill();
    };
    ridge(520, 210, '#9fb2bf', 1); ridge(560, 130, '#7f97a5', 3);
    g.fillStyle = '#8fb3c4'; g.fillRect(0, 585, w, 60); // sông Hàn
    for (let x = 0; x < w; x += 26 + Math.random() * 30) {
      const bh = 40 + Math.random() * 160, bw = 18 + Math.random() * 40;
      g.fillStyle = ['#d9d6cf', '#c4c8cc', '#e9e4da', '#b8bec4'][Math.floor(Math.random() * 4)];
      g.fillRect(x, 650 - bh, bw, bh + 10);
      g.fillStyle = 'rgba(70,90,110,.35)';
      for (let yy = 650 - bh + 6; yy < 650; yy += 10) for (let xx = x + 3; xx < x + bw - 3; xx += 7) g.fillRect(xx, yy, 4, 5);
    }
    g.fillStyle = '#5d7f47'; g.fillRect(0, 650, w, h);
    for (let i = 0; i < 260; i++) { g.fillStyle = ['#4d7a3a', '#6b9a4a', '#3f6a33'][i % 3]; g.beginPath(); g.arc(Math.random() * w, 660 + Math.random() * 300, 18 + Math.random() * 36, 0, PI * 2); g.fill(); }
    g.fillStyle = '#9aa0a4'; for (let i = 0; i < 6; i++) g.fillRect(Math.random() * w, 760 + Math.random() * 200, 300, 16);
  });
  const outMat = new THREE.MeshBasicMaterial({ map: outside, fog: false });
  const north = new THREE.Mesh(new THREE.PlaneGeometry(110, 27.5), outMat);
  north.position.set(13, -1.5, -26); group.add(north);
  const east = new THREE.Mesh(new THREE.PlaneGeometry(110, 27.5), outMat);
  east.position.set(52, -1.5, 6); east.rotation.y = -PI / 2; group.add(east);

  // ---------- Tường ----------
  const wallMat = new THREE.MeshStandardMaterial({ color: C.wall, roughness: 0.9 });
  const woodWallTex = canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#b57d4b'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 64) { g.fillStyle = 'rgba(60,30,10,.25)'; g.fillRect(x, 0, 2, h); }
    for (let i = 0; i < 300; i++) { g.strokeStyle = `rgba(90,50,20,${Math.random() * 0.12})`; g.beginPath(); const x = Math.random() * w; g.moveTo(x, 0); g.bezierCurveTo(x + 6, h / 3, x - 6, h * 2 / 3, x + 3, h); g.stroke(); }
  }, { repeat: [4, 1] });
  const woodWallMat = new THREE.MeshStandardMaterial({ map: woodWallTex, roughness: 0.55 });
  const H = ROOM.h;
  const wallPlane = (x1, z1, x2, z2, material, inwardSign) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), material);
    m.position.set((x1 + x2) / 2, H / 2, (z1 + z2) / 2);
    m.rotation.y = Math.atan2(x2 - x1, z2 - z1) + (inwardSign > 0 ? -PI / 2 : PI / 2);
    m.receiveShadow = true; group.add(m); return m;
  };
  for (const w of LAYOUT.walls) {
    if (w.kind === 'glass') {
      const horiz = w.z1 === w.z2;
      const len = horiz ? w.x2 - w.x1 : w.z2 - w.z1;
      const gp = new THREE.Mesh(new THREE.PlaneGeometry(len, H - 0.5), M.glass);
      gp.position.set(horiz ? (w.x1 + w.x2) / 2 : w.x1, (H - 0.5) / 2 + 0.3, horiz ? w.z1 : (w.z1 + w.z2) / 2);
      if (!horiz) gp.rotation.y = PI / 2;
      group.add(gp);
      const n = Math.round(len / 1.6);
      for (let i = 0; i <= n; i++) {
        const t = (horiz ? w.x1 : w.z1) + (len * i) / n;
        if (horiz) B.box(M.metal, t, H / 2, w.z1, 0.07, H, 0.12); else B.box(M.metal, w.x1, H / 2, t, 0.12, H, 0.07);
      }
      for (const yy of [0.15, 0.3, H - 0.18]) {
        if (horiz) B.box(yy === 0.15 ? M.white : M.metal, (w.x1 + w.x2) / 2, yy, w.z1 + (yy === 0.15 ? 0.15 : 0), len, yy === 0.15 ? 0.3 : 0.06, yy === 0.15 ? 0.3 : 0.1);
        else B.box(yy === 0.15 ? M.white : M.metal, w.x1 - (yy === 0.15 ? 0.15 : 0), yy, (w.z1 + w.z2) / 2, yy === 0.15 ? 0.3 : 0.1, yy === 0.15 ? 0.3 : 0.06, len);
      }
      continue;
    }
    if (w.kind === 'solid') {
      // tường ngoài: mặt phẳng nhìn vào trong (nhìn từ ngoài sẽ xuyên qua)
      const isWest = w.x1 === 0 && w.x2 === 0;
      const mt = isWest ? woodWallMat : wallMat;
      if (w.z1 === w.z2) wallPlane(w.x1, w.z1, w.x2, w.z2, mt, w.z1 === 0 ? 1 : -1);
      else wallPlane(w.x1, w.z1, w.x2, w.z2, isWest ? woodWallMat : woodWallMat, w.x1 === 0 ? -1 : 1);
      if (w.z1 === w.z2) B.box(M.woodD, (w.x1 + w.x2) / 2, 0.05, w.z1 - 0.01, w.x2 - w.x1, 0.1, 0.02, 0, 0, 0, { noShadow: true });
      continue;
    }
    // vách phòng họp
    const horiz = w.z1 === w.z2;
    const len = horiz ? w.x2 - w.x1 : w.z2 - w.z1;
    if (len < 0.05) continue;
    const cx = horiz ? (w.x1 + w.x2) / 2 : w.x1, cz = horiz ? w.z1 : (w.z1 + w.z2) / 2;
    const sx = horiz ? len : 0.1, sz = horiz ? 0.1 : len;
    if (w.kind === 'wood') {
      B.box(M.woodM, cx, H / 2, cz, sx, H, sz);
    } else {
      B.box(M.woodM, cx, 0.45, cz, sx, 0.9, sz);
      const gp = new THREE.Mesh(new THREE.BoxGeometry(horiz ? len : 0.02, H - 1.15, horiz ? 0.02 : len), M.glass);
      gp.position.set(cx, 0.9 + (H - 1.15) / 2, cz); group.add(gp);
      B.box(M.metal, cx, H - 0.12, cz, horiz ? len : 0.12, 0.24, horiz ? 0.12 : len);
      B.box(M.metal, cx, 0.92, cz, horiz ? len : 0.12, 0.04, horiz ? 0.12 : len);
    }
  }

  // ---------- Trần ----------
  const ceiling = new THREE.Group(); group.add(ceiling);
  const ceilWhite = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), new THREE.MeshStandardMaterial({ color: '#f7f6f3', roughness: 0.9 }));
  ceilWhite.rotation.x = PI / 2; ceilWhite.position.set(ROOM.w / 2, H, ROOM.d / 2); ceiling.add(ceilWhite);
  const CB = new Batch();
  const slatZone = (x1, x2, z1, z2) => {
    for (let z = z1; z < z2; z += 0.16) CB.box(M.woodL, (x1 + x2) / 2, H - 0.12, z, x2 - x1, 0.1, 0.055, 0, 0, 0, { noShadow: true });
    for (let z = z1 + 1.2; z < z2; z += 2.4) CB.box(M.led, (x1 + x2) / 2, H - 0.19, z, x2 - x1 - 0.3, 0.02, 0.04, 0, 0, 0, { noShadow: true });
    CB.box(M.black, (x1 + x2) / 2, H - 0.2, z1, x2 - x1, 0.4, 0.08, 0, 0, 0, { noShadow: true });
  };
  slatZone(0, 16, 0.6, 14.5);
  slatZone(16, 26, 0.6, 10.3);
  // vùng trần trắng có ray đèn đen
  for (const x of [4, 8, 12]) {
    CB.box(M.black, x, H - 0.03, 22, 0.06, 0.05, 15, 0, 0, 0, { noShadow: true });
    for (let z = 15.5; z < 29.5; z += 1.6) CB.cyl(M.black, x, H - 0.11, z, 0.04, 0.12, { noShadow: true, low: true });
  }
  for (const [x, z] of [[6, 18], [10.5, 25], [3.5, 25]]) { CB.box(M.white, x, H - 0.02, z, 0.9, 0.04, 0.9, 0, 0, 0, { noShadow: true }); CB.box(M.black, x, H - 0.045, z, 0.55, 0.01, 0.55, 0, 0, 0, { noShadow: true }); }
  for (const r of LAYOUT.rooms) {
    const cx = (r.x1 + r.x2) / 2, cz = (r.z1 + r.z2) / 2;
    CB.box(M.black, cx, H - 0.05, cz, 7.2, 0.06, r.z2 - r.z1 - 2.4, 0, 0, 0, { noShadow: true });
    CB.box(M.led, cx, H - 0.085, cz, 7.0, 0.01, r.z2 - r.z1 - 2.6, 0, 0, 0, { noShadow: true });
  }
  CB.build(ceiling);

  // ---------- Đồ nội thất ----------
  const tableTopH = 0.75;
  const woodChair = (s, cushion = M.fabric) => {
    B.setFrame(s.x, s.z, s.ry);
    B.box(cushion, 0, 0.45, 0, 0.44, 0.06, 0.42);
    B.box(M.chairWood, 0, 0.41, 0, 0.42, 0.03, 0.4);
    for (const [lx, lz] of [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17], [0.18, 0.17]]) B.box(M.chairWood, lx, 0.21, lz, 0.035, 0.42, 0.035);
    B.box(M.chairWood, 0, 0.72, -0.2, 0.42, 0.18, 0.03, 0, -0.08);
    B.box(M.chairWood, -0.19, 0.6, -0.19, 0.03, 0.4, 0.03); B.box(M.chairWood, 0.19, 0.6, -0.19, 0.03, 0.4, 0.03);
    B.setFrame();
  };
  const ghostChair = (s, i) => {
    const m = i % 3 === 1 ? M.ghostAmber : M.ghost;
    B.setFrame(s.x, s.z, s.ry);
    B.box(m, 0, 0.44, 0.02, 0.44, 0.04, 0.42);
    B.box(m, 0, 0.72, -0.18, 0.44, 0.5, 0.04, 0, -0.12);
    B.box(m, 0, 0.22, 0.18, 0.4, 0.44, 0.03, 0, 0.15);
    B.box(m, -0.21, 0.24, 0, 0.03, 0.46, 0.38); B.box(m, 0.21, 0.24, 0, 0.03, 0.46, 0.38);
    B.setFrame();
  };
  const armchair = (s) => {
    B.setFrame(s.x, s.z, s.ry);
    B.box(M.woodL, 0, 0.3, 0.02, 0.64, 0.06, 0.6, 0, 0.12);
    B.box(M.black, 0, 0.38, 0.04, 0.56, 0.08, 0.52, 0, 0.1);
    B.box(M.woodL, 0, 0.62, -0.26, 0.7, 0.42, 0.05, 0, -0.25);
    B.box(M.black, 0, 0.62, -0.22, 0.6, 0.34, 0.05, 0, -0.25);
    B.box(M.woodL, -0.25, 0.15, 0.25, 0.04, 0.3, 0.04); B.box(M.woodL, 0.25, 0.15, 0.25, 0.04, 0.3, 0.04);
    B.box(M.woodL, 0, 0.17, -0.2, 0.5, 0.34, 0.04, 0, 0.3);
    B.setFrame();
  };
  const officeChair = (s) => {
    B.setFrame(s.x, s.z, s.ry);
    B.box(M.black, 0, 0.48, 0, 0.48, 0.07, 0.46);
    B.box(M.black, 0, 0.82, -0.22, 0.46, 0.5, 0.05, 0, -0.1);
    B.cyl(M.metal, 0, 0.27, 0, 0.025, 0.4, { low: true });
    for (let k = 0; k < 5; k++) { const a = (k / 5) * PI * 2; B.box(M.metal, Math.sin(a) * 0.16, 0.05, Math.cos(a) * 0.16, 0.04, 0.03, 0.32, a); }
    B.setFrame();
  };
  const meetingChair = (s) => woodChair(s, M.fabric);

  LAYOUT.seats.forEach((s, i) => {
    if (s.type === 'wood') woodChair(s);
    else if (s.type === 'ghost') ghostChair(s, i);
    else if (s.type === 'armchair') armchair(s);
    else if (s.type === 'office') officeChair(s);
    else if (s.type === 'meeting') meetingChair(s);
  });

  for (const f of LAYOUT.furniture) {
    switch (f.type) {
      case 'roundTable':
        B.cyl(M.white, f.x, 0.72, f.z, f.r, 0.03);
        B.cyl(M.white, f.x, 0.38, f.z, 0.05, 0.68);
        B.cyl(M.white, f.x, 0.02, f.z, 0.22, 0.04);
        break;
      case 'coffeeTable':
        B.cyl(M.marble, f.x, 0.45, f.z, f.r, 0.03);
        B.cyl(M.black, f.x, 0.22, f.z, 0.03, 0.44);
        B.cyl(M.black, f.x, 0.02, f.z, 0.2, 0.03);
        break;
      case 'longTable': {
        B.box(M.woodD, f.x, tableTopH - 0.02, f.z, f.w, 0.05, f.d);
        B.box(M.woodD, f.x, 0.36, f.z, 0.1, 0.72, f.d - 0.4);
        for (let z = f.z - f.d / 2 + 0.3; z < f.z + f.d / 2; z += 2.6) B.box(M.metal, f.x, 0.36, z, f.w - 0.2, 0.7, 0.06);
        // vách ngăn giữa bàn có đèn đọc sách
        B.box(M.woodM, f.x, tableTopH + 0.17, f.z, 0.08, 0.32, f.d - 0.1);
        B.box(M.woodD, f.x, tableTopH + 0.34, f.z, 0.22, 0.04, f.d - 0.1);
        B.box(M.warmLed, f.x - 0.11, tableTopH + 0.315, f.z, 0.01, 0.01, f.d - 0.3, 0, 0, 0, { noShadow: true });
        B.box(M.warmLed, f.x + 0.11, tableTopH + 0.315, f.z, 0.01, 0.01, f.d - 0.3, 0, 0, 0, { noShadow: true });
        for (let z = f.z - f.d / 2 + 0.55; z < f.z + f.d / 2; z += 1.0) { B.box(M.white, f.x - 0.045, tableTopH + 0.1, z, 0.01, 0.06, 0.08, 0, 0, 0, { noShadow: true }); B.box(M.white, f.x + 0.045, tableTopH + 0.1, z, 0.01, 0.06, 0.08, 0, 0, 0, { noShadow: true }); }
        break;
      }
      case 'desk':
        B.box(M.white, f.x, 0.74, f.z, f.w, 0.03, f.d);
        B.box(M.metal, f.x - f.w / 2 + 0.03, 0.37, f.z, 0.03, 0.72, f.d - 0.05);
        if (f.monitor) {
          B.setFrame(f.x, f.z, f.faceRy);
          B.box(M.black, 0, 1.0, 0.18, 0.52, 0.32, 0.03);
          B.box(M.screen, 0, 1.0, 0.163, 0.48, 0.28, 0.005, 0, 0, 0, { noShadow: true });
          B.box(M.metal, 0, 0.8, 0.2, 0.04, 0.12, 0.04);
          B.box(M.black, 0, 0.76, 0.0, 0.42, 0.015, 0.14);
          B.setFrame();
        }
        break;
      case 'deskDivider':
        B.box(M.grey, f.x, 1.0, f.z, f.w, 0.5, 0.04);
        B.box(M.grey, f.x, 1.0, f.z, 0.04, 0.5, 1.36);
        break;
      case 'wallDesk':
        B.box(M.woodL, f.x, 0.74, f.z, f.w, 0.04, f.d);
        B.box(M.woodL, f.x + 0.3, 0.37, f.z, 0.04, 0.74, f.d);
        B.box(M.woodL, f.x, 0.37, f.z - f.d / 2 + 0.02, f.w, 0.74, 0.03);
        B.box(M.woodL, f.x, 0.37, f.z + f.d / 2 - 0.02, f.w, 0.74, 0.03);
        B.box(M.black, f.x + 0.2, 0.9, f.z, 0.08, 0.3, 0.02);
        B.cyl(M.warmLed, f.x + 0.2, 1.08, f.z, 0.05, 0.03, { noShadow: true });
        break;
      case 'meetingTable': {
        B.box(M.woodL, f.x, 0.74, f.z, f.w, 0.05, f.d);
        B.box(M.marble, f.x, 0.768, f.z, f.w - 0.8, 0.008, 0.28, 0, 0, 0, { noShadow: true });
        B.box(M.woodM, f.x - f.w * 0.3, 0.36, f.z, 0.6, 0.72, f.d * 0.5);
        B.box(M.woodM, f.x + f.w * 0.3, 0.36, f.z, 0.6, 0.72, f.d * 0.5);
        const n = Math.max(2, Math.round(f.w / 1.2));
        for (let i = 0; i < n; i++) B.box(M.black, f.x - f.w / 2 + 0.6 + (i * (f.w - 1.2)) / Math.max(1, n - 1), 0.775, f.z - 0.05, 0.1, 0.03, 0.07);
        break;
      }
      case 'tv': {
        B.box(M.black, f.x, 1.55, f.z, 0.06, f.w * 0.56, f.w);
        B.box(M.screen, f.x - 0.032, 1.55, f.z, 0.005, f.w * 0.53, f.w - 0.05, 0, 0, 0, { noShadow: true });
        break;
      }
      case 'counter': {
        // quầy thủ thư: mặt gỗ dọc, viền trắng phía trên, hai đầu bo tròn
        const x0 = f.x, z0 = f.z;
        B.box(M.woodL, x0, 0.47, z0, f.w, 0.94, f.d - 1.2);
        B.cyl(M.woodL, x0, 0.47, z0 - f.d / 2 + 0.6, f.w / 2, 0.94);
        B.cyl(M.woodL, x0, 0.47, z0 + f.d / 2 - 0.6, f.w / 2, 0.94);
        B.box(M.white, x0 + 0.03, 1.04, z0, f.w + 0.06, 0.2, f.d - 1.2);
        B.cyl(M.white, x0, 1.04, z0 - f.d / 2 + 0.6, f.w / 2 + 0.03, 0.2);
        B.cyl(M.white, x0, 1.04, z0 + f.d / 2 - 0.6, f.w / 2 + 0.03, 0.2);
        for (let z = z0 - f.d / 2 + 0.7; z < z0 + f.d / 2 - 0.6; z += 0.36) B.box(M.woodM, x0 + f.w / 2 + 0.005, 0.47, z, 0.01, 0.9, 0.02, 0, 0, 0, { noShadow: true });
        B.box(M.white, x0 - 0.2, 0.76, z0, 0.6, 0.03, f.d - 1.3);
        // máy tính, máy quét
        for (const dz of [-1.6, 0.4, 2.0]) {
          B.box(M.black, x0 - 0.35, 0.98, z0 + dz, 0.03, 0.3, 0.46, 0, 0, -0.08);
          B.box(M.screen, x0 - 0.33, 0.98, z0 + dz, 0.005, 0.27, 0.42, 0, 0, -0.08, { noShadow: true });
        }
        B.box(M.white, x0 - 0.2, 0.92, z0 - 0.6, 0.45, 0.28, 0.5);
        B.box(M.black, x0 - 0.2, 1.07, z0 - 0.6, 0.4, 0.02, 0.4);
        break;
      }
      case 'backCabinet': {
        B.box(M.woodL, f.x, 1.1, f.z, f.w, 2.2, f.d);
        break;
      }
      case 'locker': {
        B.box(M.white, f.x, 0.95, f.z, f.w, 1.9, f.d);
        const cols = 16, rows = 4;
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
          const z = f.z - f.d / 2 + (i + 0.5) * (f.d / cols), y = 0.12 + (j + 0.5) * (1.72 / rows);
          B.box(M.white, f.x + f.w / 2 + 0.005, y, z, 0.01, 1.72 / rows - 0.03, f.d / cols - 0.03, 0, 0, 0, { noShadow: true });
          B.box(M.metal, f.x + f.w / 2 + 0.015, y + 0.05, z + f.d / cols / 2 - 0.08, 0.01, 0.06, 0.02, 0, 0, 0, { noShadow: true });
        }
        break;
      }
      case 'sofa': {
        B.setFrame(f.x, f.z, f.ry);
        B.box(M.grey, 0, 0.22, 0.02, f.w, 0.36, f.d - 0.1);
        B.box(M.grey, 0, 0.6, -f.d / 2 + 0.14, f.w, 0.5, 0.26);
        B.box(M.grey, -f.w / 2 + 0.1, 0.42, 0, 0.2, 0.42, f.d);
        B.box(M.grey, f.w / 2 - 0.1, 0.42, 0, 0.2, 0.42, f.d);
        for (const o of [-1, 0, 1]) B.box(M.grey, o * 0.98, 0.43, 0.06, 0.94, 0.08, f.d - 0.36);
        B.setFrame();
        break;
      }
      case 'plant':
        B.cyl(M.white, f.x, 0.28, f.z, 0.24, 0.56);
        for (let k = 0; k < 7; k++) { const a = k * 0.9; B.box(M.leaf, f.x + Math.sin(a) * 0.12, 0.85 + (k % 3) * 0.18, f.z + Math.cos(a) * 0.12, 0.08, 0.6, 0.2, a, 0.3 * Math.sin(k), 0.3 * Math.cos(k)); }
        break;
      case 'gate':
        for (const dx of [-1.3, 1.3]) { B.box(M.grey, f.x + dx, 0.75, f.z, 0.2, 1.5, 0.6); B.box(M.led, f.x + dx + (dx < 0 ? 0.105 : -0.105), 1.3, f.z, 0.01, 0.06, 0.5, 0, 0, 0, { noShadow: true }); }
        break;
      case 'door': {
        // cửa kính mở hé vào trong phòng
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.2, 0.02), M.glassDoor);
        leaf.position.set(f.x + 0.45 * Math.cos(1.1), 1.1, f.z - 0.5 + 0.45 * Math.sin(1.1)); leaf.rotation.y = -1.1; group.add(leaf);
        B.box(M.metal, f.x, 2.25, f.z, 0.12, 0.1, 1.0);
        break;
      }
      case 'mainDoor': {
        B.box(M.metal, f.x, 2.45, f.z, f.w + 0.2, 0.12, 0.14);
        B.box(M.metal, f.x - f.w / 2 - 0.05, 1.2, f.z, 0.1, 2.5, 0.14); B.box(M.metal, f.x + f.w / 2 + 0.05, 1.2, f.z, 0.1, 2.5, 0.14);
        for (const s of [-1, 1]) {
          const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.35, 0.02), M.glassDoor);
          leaf.position.set(f.x + s * (f.w / 2 - 0.08), 1.18, f.z - 0.47); leaf.rotation.y = PI / 2; group.add(leaf);
        }
        break;
      }
      case 'wallText': {
        const tex = canvasTexture(1400, 420, (g, w, h) => {
          g.clearRect(0, 0, w, h);
          g.font = '300 300px "Be Vietnam Pro", sans-serif'; g.fillStyle = 'rgba(160,165,175,.35)';
          g.fillText('1 1 0 4', 40, 300);
          g.fillStyle = '#2a2c30'; g.font = '600 92px "Be Vietnam Pro", sans-serif'; g.fillText('LET THE BOOK', 260, 200);
          g.font = 'italic 300 70px "Be Vietnam Pro", sans-serif'; g.fillText('talk', 1040, 290);
          g.font = '500 54px "Be Vietnam Pro", sans-serif'; g.fillStyle = '#8c1d2f'; g.fillText('Feed the Mind', 40, 400);
        });
        const p = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.68), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
        p.position.set(f.x, 2.25, f.z - 0.01); p.rotation.y = PI; group.add(p);
        break;
      }
    }
  }

  // Bảng hiệu quầy
  const signTex = canvasTexture(1200, 120, (g, w, h) => {
    g.fillStyle = '#f4f2ee'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1f1a17'; g.font = '700 74px "Be Vietnam Pro", sans-serif'; g.fillText('LIBRARY', 40, 88);
    g.font = '400 40px "Be Vietnam Pro", sans-serif'; g.fillText('Duy Tan University', 420, 88);
    g.fillStyle = '#8c1d2f'; g.fillRect(1060, 30, 100, 60);
    g.fillStyle = '#fff'; g.font = '700 40px "Be Vietnam Pro", sans-serif'; g.fillText('DTU', 1072, 76);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.18), new THREE.MeshBasicMaterial({ map: signTex }));
  const ctr = LAYOUT.COUNTER;
  sign.position.set(ctr.x + ctr.w / 2 + 0.07, 1.04, ctr.z); sign.rotation.y = PI / 2; group.add(sign);
  // Biển phòng họp
  for (const r of LAYOUT.rooms) {
    const t = canvasTexture(640, 120, (g, w, h) => {
      g.fillStyle = '#1f1a17'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff'; g.font = '600 46px "Be Vietnam Pro", sans-serif'; g.fillText(r.name.split(' (')[0], 28, 62);
      g.fillStyle = '#c4a061'; g.font = '400 30px "Be Vietnam Pro", sans-serif'; g.fillText(r.name.match(/\((.*)\)/)?.[1] || '', 28, 102);
    });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.225), new THREE.MeshBasicMaterial({ map: t }));
    p.position.set(15.94, 2.55, (r.z1 + r.z2) / 2); p.rotation.y = -PI / 2; group.add(p);
  }

  // ---------- Kệ sách ----------
  const shelfHits = [];
  const bookSpots = [];
  const spinePalette = ['#1f4e8c', '#2d6fb7', '#f2efe8', '#c43b3b', '#e6b33b', '#3c8a5a', '#1d8a8f', '#e8742c', '#7a3a8c', '#f1e2c4', '#9fc3e8', '#d9534f', '#2c2c2c', '#e9d8a6', '#5aa0d8'];
  for (const sh of LAYOUT.shelves) {
    const isX = sh.axis === 'x';
    B.setFrame(sh.x, sh.z, isX ? 0 : PI / 2);
    const L = isX ? sh.w : sh.d, Dp = isX ? sh.d : sh.w;
    if (sh.kind === 'tall') {
      B.box(M.woodL, 0, sh.h / 2, 0, L, sh.h, 0.04); // vách giữa
      for (let i = 0; i < 6; i++) B.box(M.woodL, 0, 0.06 + i * 0.4, 0, L, 0.03, Dp);
      B.box(M.woodL, 0, sh.h - 0.01, 0, L, 0.03, Dp);
      B.box(M.white, -L / 2 - 0.02, sh.h / 2, 0, 0.05, sh.h + 0.02, Dp + 0.02);
      B.box(M.white, L / 2 + 0.02, sh.h / 2, 0, 0.05, sh.h + 0.02, Dp + 0.02);
      for (const yy of [0.5, 1.2, 1.9]) { B.box(M.grey, -L / 2 - 0.046, yy, 0, 0.002, 0.04, Dp - 0.1, 0, 0, 0, { noShadow: true }); B.box(M.grey, L / 2 + 0.046, yy, 0, 0.002, 0.04, Dp - 0.1, 0, 0, 0, { noShadow: true }); }
      for (let i = 1; i < 6; i++) for (const s of [-1, 1]) B.box(M.warmLed, 0, 0.06 + i * 0.4 - 0.022, s * (Dp / 2 - 0.05), L - 0.1, 0.008, 0.02, 0, 0, 0, { noShadow: true });
      for (let lvl = 0; lvl < 5; lvl++) for (const s of [-1, 1]) {
        let x = -L / 2 + 0.03;
        while (x < L / 2 - 0.06) {
          const bw = 0.022 + Math.random() * 0.035;
          const bh = 0.22 + Math.random() * 0.1;
          if (Math.random() < 0.06) { x += 0.05; continue; }
          bookSpots.push({ frame: B.frame.clone(), x: x + bw / 2, y: 0.075 + lvl * 0.4 + bh / 2, z: s * (Dp / 4 + 0.01), w: bw, h: bh, d: Dp / 2 - 0.08, tilt: Math.random() < 0.04 ? 0.18 : 0, color: spinePalette[(Math.random() * spinePalette.length) | 0] });
          x += bw + 0.002;
        }
      }
    } else {
      // kệ tạp chí nghiêng hai mặt
      B.box(M.woodL, 0, sh.h / 2, 0, L, sh.h, 0.04);
      B.box(M.woodL, -L / 2, sh.h / 2, 0, 0.04, sh.h, Dp); B.box(M.woodL, L / 2, sh.h / 2, 0, 0.04, sh.h, Dp);
      B.box(M.woodL, 0, 0.12, 0, L, 0.24, Dp);
      for (let lvl = 0; lvl < 3; lvl++) for (const s of [-1, 1]) {
        const y = 0.42 + lvl * 0.36;
        B.box(M.woodL, 0, y - 0.15, s * (Dp / 2 - 0.12), L, 0.02, 0.2);
        B.box(M.woodL, 0, y - 0.1, s * (Dp / 2 - 0.02), L, 0.08, 0.02);
        for (let x = -L / 2 + 0.16; x < L / 2 - 0.1; x += 0.26) {
          bookSpots.push({ frame: B.frame.clone(), x, y, z: s * (Dp / 2 - 0.13), w: 0.21, h: 0.28, d: 0.01, rx: s * -0.28, color: spinePalette[(Math.random() * spinePalette.length) | 0] });
        }
      }
    }
    B.setFrame();
    const hit = new THREE.Mesh(new THREE.BoxGeometry(sh.w + 0.1, sh.h, sh.d + 0.1), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(sh.x, sh.h / 2, sh.z); hit.userData.shelf = sh; group.add(hit); shelfHits.push(hit);
    // nhãn kệ
    const lt = canvasTexture(512, 96, (g, w, h) => {
      g.fillStyle = '#1f1a17'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#c4a061'; g.font = '600 30px "JetBrains Mono", monospace'; g.fillText(sh.id, 18, 60);
      g.fillStyle = '#fff'; g.font = '600 30px "Be Vietnam Pro", sans-serif';
      const name = CATEGORIES[sh.category]; g.fillText(name.length > 22 ? name.slice(0, 21) + '…' : name, 96, 60);
    });
    const lm = new THREE.MeshBasicMaterial({ map: lt, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.19), lm);
      if (isX) { p.position.set(sh.x + s * (sh.w / 2 + 0.05), sh.h * 0.8, sh.z); p.rotation.y = s * PI / 2; }
      else { p.position.set(sh.x, sh.h + 0.13, sh.z + s * (sh.d / 2 - 0.5)); p.rotation.y = s > 0 ? PI / 2 : PI / 2; }
      group.add(p);
    }
  }
  // tủ sau quầy cũng có sách
  {
    const f = LAYOUT.furniture.find(x => x.type === 'backCabinet');
    B.setFrame(f.x + 0.25, f.z, PI / 2);
    for (let lvl = 0; lvl < 4; lvl++) {
      B.box(M.woodM, 0, 0.5 + lvl * 0.42, 0.12, f.d - 0.2, 0.025, 0.24);
      for (let x = -f.d / 2 + 0.2; x < f.d / 2 - 0.2; x += 0.045) {
        bookSpots.push({ frame: B.frame.clone(), x, y: 0.64 + lvl * 0.42, z: 0.12, w: 0.035, h: 0.24 + Math.random() * 0.05, d: 0.18, color: spinePalette[(Math.random() * spinePalette.length) | 0] });
      }
    }
    B.setFrame();
  }

  // Sách: một InstancedMesh duy nhất
  {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.65 }), bookSpots.length);
    const m = new THREE.Matrix4(), l = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
    bookSpots.forEach((b, i) => {
      e.set(b.rx || 0, 0, b.tilt || 0); q.setFromEuler(e);
      l.compose(v.set(b.x, b.y, b.z), q, s.set(b.w, b.h, b.d));
      im.setMatrixAt(i, m.multiplyMatrices(b.frame, l));
      im.setColorAt(i, col.set(b.color));
    });
    im.receiveShadow = true; im.castShadow = quality === 'high';
    group.add(im);
  }

  B.build(group);

  // ---------- Ghế: vùng bấm & chỉ báo ----------
  const seatGeo = new THREE.BoxGeometry(0.55, 1.0, 0.55);
  const seatHit = new THREE.InstancedMesh(seatGeo, new THREE.MeshBasicMaterial({ visible: false }), LAYOUT.seats.length);
  const markerGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.025, 24);
  const markers = new THREE.InstancedMesh(markerGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }), LAYOUT.seats.length);
  const mm = new THREE.Matrix4();
  LAYOUT.seats.forEach((s, i) => {
    seatHit.setMatrixAt(i, mm.makeTranslation(s.x, 0.5, s.z));
    markers.setMatrixAt(i, mm.makeTranslation(s.x, s.h + 0.09, s.z));
    markers.setColorAt(i, new THREE.Color('#2f9e5f'));
  });
  seatHit.computeBoundingSphere(); markers.computeBoundingSphere();
  markers.visible = false; markers.renderOrder = 5;
  group.add(seatHit); group.add(markers);
  const hover = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 8, 32), new THREE.MeshBasicMaterial({ color: '#2f9e5f', transparent: true, opacity: 0.95, depthTest: false }));
  hover.rotation.x = PI / 2; hover.visible = false; hover.renderOrder = 6; group.add(hover);
  const target = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.2, 24), new THREE.MeshBasicMaterial({ color: '#8c1d2f', transparent: true, opacity: 0.9, depthWrite: false }));
  target.rotation.x = -PI / 2; target.visible = false; group.add(target);

  const counterHit = new THREE.Mesh(new THREE.BoxGeometry(ctr.w + 0.2, 1.2, ctr.d), new THREE.MeshBasicMaterial({ visible: false }));
  counterHit.position.set(ctr.x, 0.6, ctr.z); counterHit.userData.counter = true; group.add(counterHit);

  // ---------- Ánh sáng ----------
  scene.add(new THREE.HemisphereLight('#ffffff', '#cdbfae', 1.15));
  const sun = new THREE.DirectionalLight('#fff3df', 1.35);
  sun.position.set(30, 22, -16); sun.target.position.set(12, 0, 14);
  if (quality === 'high') {
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 80 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  }
  scene.add(sun, sun.target);
  const fill = new THREE.PointLight('#ffd7a3', 6, 14, 1.6); fill.position.set(5, 2.6, 7); scene.add(fill);
  const fill2 = new THREE.PointLight('#ffd7a3', 5, 14, 1.6); fill2.position.set(12.8, 2.6, 10); scene.add(fill2);
  const fill3 = new THREE.PointLight('#fff1dc', 6, 16, 1.6); fill3.position.set(6, 2.8, 22); scene.add(fill3);
  const fill4 = new THREE.PointLight('#fff1dc', 5, 16, 1.6); fill4.position.set(21, 2.8, 20); scene.add(fill4);

  return {
    group, floor, ceiling, seatHit, markers, hover, target, shelfHits, counterHit,
    setSeatColors(seats, myId) {
      const c = new THREE.Color();
      LAYOUT.seats.forEach((s, i) => {
        const owner = seats[s.id];
        markers.setColorAt(i, c.set(!owner ? '#2f9e5f' : owner === myId ? '#2c40a3' : '#c0392b'));
      });
      markers.instanceColor.needsUpdate = true;
    },
  };
}

export { DOOR };
