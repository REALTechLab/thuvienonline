// Nhân vật sinh viên dựng bằng hình khối (không cần file 3D ngoài).
import * as THREE from 'three';

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0, ...opts }));
  return matCache.get(key);
}

const OUTFITS = {
  dtu:    { shirt: '#f3eeee', sleeve: '#7d1a2c', bottom: '#24262c', skirt: '#24262c', tie: null },
  black:  { shirt: '#1f2126', sleeve: '#1f2126', bottom: '#2a2e3a', skirt: '#2a2e3a', tie: '#8d9097' },
  blue:   { shirt: '#2c40a3', sleeve: '#2c40a3', bottom: '#1c2340', skirt: '#1c2340', tie: 'stripe' },
  casual: { shirt: '#e8e2d6', sleeve: '#e8e2d6', bottom: '#3d5a80', skirt: '#5b6f8f', tie: null },
};

const texCache = new Map();
function canvasTex(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  texCache.set(key, t); return t;
}

function shirtTexture(outfit) {
  const o = OUTFITS[outfit];
  return canvasTex('shirt-' + outfit, 512, 256, (g, w, h) => {
    g.fillStyle = o.shirt; g.fillRect(0, 0, w, h);
    const cx = w / 2; // phía trước áo nằm giữa ảnh
    if (outfit === 'dtu') {
      g.fillStyle = '#7d1a2c';
      g.beginPath(); g.moveTo(cx - 46, 0); g.lineTo(cx, 70); g.lineTo(cx + 46, 0); g.lineTo(cx + 30, 0); g.lineTo(cx, 46); g.lineTo(cx - 30, 0); g.fill();
      g.strokeStyle = '#ffffff'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx - 40, 0); g.lineTo(cx, 60); g.lineTo(cx + 40, 0); g.stroke();
      // logo ngực trái
      g.strokeStyle = '#7d1a2c'; g.lineWidth = 3; g.strokeRect(cx - 92, 62, 34, 30);
      g.beginPath(); g.arc(cx - 75, 77, 9, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#7d1a2c'; g.font = 'bold 20px sans-serif'; g.textAlign = 'center'; g.fillText('DTU', cx - 75, 116);
      // vai raglan
      g.fillRect(0, 0, w, 6);
    } else if (outfit === 'casual') {
      g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.arc(cx, -8, 40, 0, Math.PI); g.fill();
      g.fillStyle = '#8c1d2f'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.fillText('DUY TAN', cx, 120);
    } else {
      // sơ mi: cổ áo, nẹp cúc
      g.fillStyle = 'rgba(255,255,255,.10)';
      g.beginPath(); g.moveTo(cx - 40, 0); g.lineTo(cx - 6, 34); g.lineTo(cx - 30, 40); g.fill();
      g.beginPath(); g.moveTo(cx + 40, 0); g.lineTo(cx + 6, 34); g.lineTo(cx + 30, 40); g.fill();
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(cx - 2, 30, 4, h);
      g.fillStyle = 'rgba(255,255,255,.35)';
      for (let y = 60; y < h; y += 46) { g.beginPath(); g.arc(cx + 9, y, 3, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(cx - 120, 90, 50, 3);
    }
  });
}

function tieTexture() {
  return canvasTex('tie-stripe', 64, 256, (g, w, h) => {
    g.fillStyle = '#25326c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8f9bd0'; g.lineWidth = 5;
    for (let y = -64; y < h + 64; y += 22) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 30); g.stroke(); }
  });
}

function faceTexture(hairColor, gender) {
  return canvasTex('face-' + hairColor + gender, 256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    // lông mày
    g.strokeStyle = hairColor; g.lineWidth = gender === 'm' ? 8 : 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(74, 86); g.quadraticCurveTo(96, 76, 114, 84); g.stroke();
    g.beginPath(); g.moveTo(182, 86); g.quadraticCurveTo(160, 76, 142, 84); g.stroke();
    // mắt
    for (const x of [96, 160]) {
      g.fillStyle = '#2a1d17'; g.beginPath(); g.ellipse(x, 116, 11, 14, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x + 4, 110, 4, 0, Math.PI * 2); g.fill();
      if (gender === 'f') { g.strokeStyle = '#2a1d17'; g.lineWidth = 3; g.beginPath(); g.moveTo(x - 13, 106); g.lineTo(x - 18, 101); g.stroke(); }
    }
    // má hồng
    g.fillStyle = 'rgba(232,120,120,.28)';
    g.beginPath(); g.ellipse(76, 150, 16, 9, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(180, 150, 16, 9, 0, 0, Math.PI * 2); g.fill();
    // miệng
    g.strokeStyle = gender === 'f' ? '#c0505a' : '#9a5a4a'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(114, 170); g.quadraticCurveTo(128, 180, 142, 170); g.stroke();
  });
}

// Nhãn tên / bong bóng chat
export function textSprite(text, { bg = 'rgba(255,255,255,.92)', fg = '#1f1a17', size = 30, pad = 14, maxW = 520, accent = null } = {}) {
  const c = document.createElement('canvas'); const g = c.getContext('2d');
  const font = `600 ${size}px "Be Vietnam Pro", system-ui, sans-serif`;
  g.font = font;
  const words = String(text).split(' '); const lines = []; let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    if (lines.length >= 3) break;
  }
  if (line && lines.length < 4) lines.push(line);
  const width = Math.min(maxW, Math.max(...lines.map(l => g.measureText(l).width))) + pad * 2 + (accent ? 10 : 0);
  const lh = size * 1.3; const height = lines.length * lh + pad * 1.4;
  c.width = Math.ceil(width); c.height = Math.ceil(height);
  g.font = font;
  g.fillStyle = bg;
  const r = Math.min(18, height / 2);
  g.beginPath(); g.roundRect(0, 0, c.width, c.height, r); g.fill();
  if (accent) { g.fillStyle = accent; g.fillRect(0, 0, 8, c.height); }
  g.fillStyle = fg; g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, pad + (accent ? 10 : 0), pad * 0.7 + lh * i + lh / 2));
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  const scale = 0.0042;
  sp.scale.set(c.width * scale, c.height * scale, 1);
  sp.renderOrder = 10;
  return sp;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 14) => new THREE.CylinderGeometry(rt, rb, h, s);
const sph = (r, ...a) => new THREE.SphereGeometry(r, 20, 14, ...a);

function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = true; return m;
}

export class Avatar {
  constructor(avatar, { name = '', isSelf = false, isStaff = false, isLecturer = false } = {}) {
    this.root = new THREE.Group();
    this.isSelf = isSelf; this.isStaff = isStaff; this.isLecturer = isLecturer;
    this.phase = Math.random() * 6; this.state = 'idle'; this.speed = 0;
    this.seatH = 0.46; this.seatType = 'wood'; this.activity = 'idle';
    this.emote = null; this.emoteT = 0; this.bubble = null; this.bubbleT = 0;
    this.name = name;
    this.build(avatar);
    this.setName(name);
  }

  dispose() {
    this.root.traverse(o => { if (o.isSprite) { o.material.map?.dispose(); o.material.dispose(); } });
  }

  build(av) {
    this.av = av;
    for (const part of [this.body, this.studyKit, this.hitbox, this.ring]) if (part) this.root.remove(part);
    this.ring = null;
    const o = OUTFITS[av.outfit] || OUTFITS.dtu;
    const skin = mat(av.skin);
    const shirt = new THREE.MeshStandardMaterial({ map: shirtTexture(av.outfit), roughness: 0.8 });
    const sleeve = mat(o.sleeve, { roughness: 0.8 });
    const bottomColor = av.bottom === 'skirt' ? o.skirt : o.bottom;
    const pants = mat(bottomColor, { roughness: 0.85 });
    const hair = new THREE.MeshStandardMaterial({ color: av.hairColor, roughness: 0.55, side: THREE.DoubleSide });
    const skirt = av.bottom === 'skirt';

    const body = this.body = new THREE.Group();
    this.root.add(body);
    const hips = this.hips = new THREE.Group(); hips.position.y = 0.86; body.add(hips);

    // Chân
    this.legs = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(side * 0.085, 0, 0); hips.add(leg);
      leg.add(mesh(cyl(0.072, 0.062, 0.44), skirt ? skin : pants, 0, -0.22, 0));
      const knee = new THREE.Group(); knee.position.y = -0.43; leg.add(knee);
      knee.add(mesh(cyl(0.06, 0.05, 0.4), skirt ? skin : pants, 0, -0.2, 0));
      // giày
      const shoeY = -0.405;
      if (av.shoes === 'sandal') {
        knee.add(mesh(box(0.095, 0.03, 0.22), mat('#3a2a20'), 0, shoeY - 0.02, 0.04));
        knee.add(mesh(box(0.08, 0.04, 0.16), skin, 0, shoeY + 0.015, 0.045));
        knee.add(mesh(box(0.1, 0.025, 0.04), mat('#3a2a20'), 0, shoeY + 0.03, 0.08));
      } else if (av.shoes === 'oxford') {
        knee.add(mesh(box(0.1, 0.07, 0.24), mat('#141414', { roughness: 0.3 }), 0, shoeY, 0.045));
      } else {
        knee.add(mesh(box(0.105, 0.08, 0.25), mat('#f4f4f2'), 0, shoeY, 0.045));
        knee.add(mesh(box(0.11, 0.025, 0.26), mat('#c9c9c4'), 0, shoeY - 0.04, 0.045));
      }
      this.legs.push({ leg, knee });
    }
    if (skirt) {
      this.skirt = mesh(cyl(0.165, 0.225, 0.4, 18), pants, 0, -0.17, 0);
      hips.add(this.skirt);
    } else this.skirt = null;

    // Thân
    const torso = this.torso = new THREE.Group(); hips.add(torso);
    const chest = mesh(new THREE.CylinderGeometry(0.175, 0.15, 0.52, 22, 1, false, Math.PI), shirt, 0, 0.27, 0);
    chest.scale.z = 0.66; torso.add(chest);
    if (!skirt) {
      const belt = mesh(cyl(0.153, 0.153, 0.045, 20), mat('#141414', { roughness: 0.4 }), 0, 0.03, 0);
      belt.scale.z = 0.68; torso.add(belt);
    }
    torso.add(mesh(cyl(0.052, 0.058, 0.1), skin, 0, 0.57, 0));
    // cổ áo
    const collar = mesh(new THREE.TorusGeometry(0.068, 0.018, 6, 18), av.outfit === 'dtu' ? mat('#7d1a2c') : mat(o.shirt), 0, 0.53, 0.005);
    collar.rotation.x = Math.PI / 2; torso.add(collar);
    if (o.tie) {
      const tieMat = o.tie === 'stripe' ? new THREE.MeshStandardMaterial({ map: tieTexture(), roughness: 0.6 }) : mat(o.tie, { roughness: 0.5 });
      if (av.gender === 'f' && av.outfit === 'black') {
        const bow = mesh(box(0.13, 0.05, 0.03), tieMat, 0, 0.49, 0.12); torso.add(bow);
        const t1 = mesh(box(0.045, 0.15, 0.015), tieMat, -0.03, 0.4, 0.122); t1.rotation.z = 0.25; torso.add(t1);
        const t2 = mesh(box(0.045, 0.13, 0.015), tieMat, 0.035, 0.41, 0.12); t2.rotation.z = -0.3; torso.add(t2);
      } else {
        torso.add(mesh(box(0.05, 0.045, 0.03), tieMat, 0, 0.5, 0.118));
        const blade = mesh(cyl(0.024, 0.04, 0.3, 4), tieMat, 0, 0.33, 0.113);
        blade.scale.z = 0.3; blade.rotation.y = Math.PI / 4; torso.add(blade);
      }
    }

    // Tay
    this.arms = [];
    for (const side of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(side * 0.215, 0.47, 0); torso.add(sh);
      sh.add(mesh(cyl(0.064, 0.056, 0.17), sleeve, 0, -0.06, 0));
      sh.add(mesh(cyl(0.045, 0.042, 0.26), skin, 0, -0.14, 0));
      const elbow = new THREE.Group(); elbow.position.y = -0.27; sh.add(elbow);
      elbow.add(mesh(cyl(0.042, 0.036, 0.24), skin, 0, -0.12, 0));
      elbow.add(mesh(sph(0.045), skin, 0, -0.26, 0));
      this.arms.push({ sh, elbow, side });
    }

    // Đầu
    const head = this.head = new THREE.Group(); head.position.y = 0.62; torso.add(head);
    const skull = mesh(sph(0.135), skin, 0, 0.12, 0); skull.scale.set(1, 1.06, 0.98); head.add(skull);
    const face = new THREE.Mesh(
      new THREE.SphereGeometry(0.1372, 24, 16, Math.PI / 2 - 0.75, 1.5, 0.95, 1.25),
      new THREE.MeshStandardMaterial({ map: faceTexture(av.hairColor, av.gender), transparent: true, alphaTest: 0.4, roughness: 0.8 }));
    face.position.set(0, 0.12, 0); face.scale.set(1, 1.06, 0.98); head.add(face);
    for (const side of [-1, 1]) head.add(mesh(sph(0.03), skin, side * 0.135, 0.11, 0));
    this.buildHair(head, av, hair);
    if (av.glasses) {
      const gm = mat('#1a1a1a', { roughness: 0.3 });
      for (const side of [-1, 1]) {
        const ring = mesh(new THREE.TorusGeometry(0.034, 0.006, 6, 18), gm, side * 0.05, 0.115, 0.13); head.add(ring);
        const lens = mesh(new THREE.CircleGeometry(0.032, 16), new THREE.MeshStandardMaterial({ color: '#cfe6ff', transparent: true, opacity: 0.25, roughness: 0.1 }), side * 0.05, 0.115, 0.131);
        head.add(lens);
        const arm = mesh(box(0.006, 0.006, 0.12), gm, side * 0.083, 0.12, 0.07); head.add(arm);
      }
      head.add(mesh(box(0.035, 0.006, 0.006), gm, 0, 0.12, 0.135));
    }

    // Balo
    if (av.backpack) {
      const bm = mat(av.bagColor, { roughness: 0.75 });
      const bag = new THREE.Group(); bag.position.set(0, 0.29, -0.15); torso.add(bag);
      bag.add(mesh(box(0.28, 0.34, 0.13), bm, 0, 0, -0.035));
      bag.add(mesh(box(0.24, 0.05, 0.11), bm, 0, 0.19, -0.035));
      bag.add(mesh(box(0.2, 0.14, 0.05), bm, 0, -0.07, -0.11));
      bag.add(mesh(box(0.16, 0.012, 0.005), mat('#d9d9d9'), 0, -0.01, -0.137));
      for (const side of [-1, 1]) bag.add(mesh(box(0.04, 0.36, 0.02), bm, side * 0.1, 0.06, 0.29));
      this.bag = bag;
    } else this.bag = null;

    // Đồ cầm tay
    this.book = new THREE.Group();
    const cover = mat('#8c1d2f');
    const pageM = mat('#f7f3ea');
    const l = mesh(box(0.15, 0.2, 0.012), cover, -0.075, 0, 0); l.rotation.y = 0.35; this.book.add(l);
    const r = mesh(box(0.15, 0.2, 0.012), cover, 0.075, 0, 0); r.rotation.y = -0.35; this.book.add(r);
    const pl = mesh(box(0.14, 0.19, 0.01), pageM, -0.07, 0, 0.01); pl.rotation.y = 0.35; this.book.add(pl);
    const pr = mesh(box(0.14, 0.19, 0.01), pageM, 0.07, 0, 0.01); pr.rotation.y = -0.35; this.book.add(pr);
    this.bookCover = cover;
    this.book.visible = false; torso.add(this.book);
    this.book.position.set(0, 0.2, 0.33); this.book.rotation.x = -0.75;

    this.studyKit = new THREE.Group();
    const nb = mesh(box(0.34, 0.012, 0.24), mat('#f4f1ea'), 0, 0, 0); this.studyKit.add(nb);
    this.studyKit.add(mesh(box(0.34, 0.008, 0.012), mat('#2c40a3'), 0, 0.007, -0.11));
    const pen = mesh(cyl(0.006, 0.006, 0.14, 6), mat('#1c3faa'), 0.12, 0.012, 0.02); pen.rotation.z = Math.PI / 2; pen.rotation.y = 0.5; this.studyKit.add(pen);
    this.studyKit.visible = false; this.root.add(this.studyKit);

    this.hitbox = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.7, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.hitbox.position.y = 0.85; this.root.add(this.hitbox);

    // Vòng chọn dưới chân
    if (this.isSelf) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.36, 32), new THREE.MeshBasicMaterial({ color: '#8c1d2f', transparent: true, opacity: 0.75, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012; this.ring = ring; this.root.add(ring);
    }
    this.root.traverse(o => { if (o.isMesh) o.userData.avatar = this; });
  }

  buildHair(head, av, hm) {
    const add = (m) => { m.castShadow = true; head.add(m); return m; };
    const y = 0.12;
    const shortHair = av.hair === 'short' || av.hair === 'side';
    // chỏm
    const cap = add(new THREE.Mesh(new THREE.SphereGeometry(0.148, 24, 12, 0, Math.PI * 2, 0, 1.15), hm));
    cap.position.set(0, y + 0.004, -0.004); cap.scale.set(1, 1.07, 1);
    // vòng hai bên + sau đầu (chừa mặt)
    const band = add(new THREE.Mesh(new THREE.SphereGeometry(0.147, 24, 8, Math.PI / 2 + 0.62, Math.PI * 2 - 1.24, 1.0, 0.68), hm));
    band.position.set(0, y, -0.003); band.scale.set(1, 1.06, 1);
    // gáy
    const nape = add(new THREE.Mesh(new THREE.SphereGeometry(0.146, 24, 8, Math.PI + 0.12, Math.PI - 0.24, 1.55, shortHair ? 0.5 : 0.7), hm));
    nape.position.set(0, y, -0.003); nape.scale.set(1, 1.06, 1);
    // mái
    const fr = add(new THREE.Mesh(new THREE.SphereGeometry(0.1505, 20, 8, Math.PI / 2 - 0.85, 1.7, 0.45, shortHair ? 0.72 : 0.86), hm));
    fr.position.set(0, y + 0.004, 0.003); fr.scale.set(1, 1.06, 1);
    if (av.hair === 'side') { fr.rotation.z = 0.16; fr.rotation.y = 0.18; }
    // hai bên thái dương
    for (const side of [-1, 1]) {
      const s = add(new THREE.Mesh(box(0.03, shortHair ? 0.09 : 0.16, 0.08), hm));
      s.position.set(side * 0.138, y - (shortHair ? 0.0 : 0.04), 0.02);
    }
    if (av.hair === 'bob' || av.hair === 'long') {
      const h = av.hair === 'long' ? 0.42 : 0.2;
      const shell = add(new THREE.Mesh(new THREE.CylinderGeometry(0.152, av.hair === 'long' ? 0.17 : 0.165, h, 24, 1, true, 0.85, Math.PI * 2 - 1.7), hm));
      shell.position.set(0, y - h / 2 + 0.02, -0.01); shell.scale.z = 0.92;
      if (av.hair === 'long') {
        const panel = add(new THREE.Mesh(box(0.27, 0.36, 0.06), hm)); panel.position.set(0, y - 0.3, -0.13);
        this.hairTail = panel;
      }
    }
    if (av.hair === 'ponytail') {
      add(new THREE.Mesh(sph(0.04), mat('#7d1a2c'))).position.set(0, y + 0.03, -0.15);
      const tail = new THREE.Group(); tail.position.set(0, y + 0.03, -0.16); head.add(tail);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.02, 0.3, 10), hm); t.castShadow = true;
      t.position.set(0, -0.15, -0.03); t.rotation.x = 0.15; tail.add(t);
      this.hairTail = tail;
    }
    if (av.hair === 'bun') {
      add(new THREE.Mesh(sph(0.072), hm)).position.set(0, y + 0.16, -0.06);
      add(new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 6, 14), mat('#7d1a2c'))).position.set(0, y + 0.115, -0.045);
    }
  }

  setAvatar(av) {
    const keep = [this.label, this.bubble].filter(Boolean);
    this.build(av);
    for (const k of keep) this.root.add(k);
  }

  setName(name, sub) {
    this.name = name;
    if (this.label) { this.root.remove(this.label); this.label.material.map.dispose(); this.label.material.dispose(); }
    this.label = textSprite(name, {
      size: 26, pad: 10,
      bg: this.isStaff ? 'rgba(44,64,163,.92)' : this.isSelf ? 'rgba(140,29,47,.94)' : this.isLecturer ? 'rgba(184,146,79,.95)' : 'rgba(255,255,255,.9)',
      fg: this.isStaff || this.isSelf || this.isLecturer ? '#ffffff' : '#1f1a17',
    });
    this.label.position.y = 1.98; this.root.add(this.label);
  }

  say(text, kind = 'chat') {
    if (this.bubble) { this.root.remove(this.bubble); this.bubble.material.map.dispose(); this.bubble.material.dispose(); }
    this.bubble = textSprite(text, { size: 28, maxW: 460, accent: kind === 'emote' ? null : '#b9824f', bg: 'rgba(255,253,248,.97)' });
    this.bubble.position.y = 2.32 + this.bubble.scale.y / 2;
    this.root.add(this.bubble);
    this.bubbleT = kind === 'emote' ? 2.6 : Math.min(9, 3.5 + text.length * 0.06);
  }

  playEmote(k) { this.emote = k; this.emoteT = k === 'wave' ? 1.8 : 1.4; }

  // state: idle | walk | run | sit ; activity: idle | study | read
  update(dt, t) {
    const sitting = this.state === 'sit';
    const moving = this.state === 'walk' || this.state === 'run';
    const reading = this.activity === 'read';
    const studying = this.activity === 'study' && sitting;
    const L = THREE.MathUtils.lerp;
    const k = Math.min(1, dt * 12);

    let thighX = 0, kneeX = 0, armX = [0, 0], elbowX = [0, 0], armZ = [0, 0], headX = 0, bodyY = 0, bodyZ = 0;
    if (moving) {
      const sp = this.state === 'run' ? 11 : 7.5;
      this.phase += dt * sp;
      const s = Math.sin(this.phase), amp = this.state === 'run' ? 0.75 : 0.55;
      this.legs[0].leg.rotation.x = L(this.legs[0].leg.rotation.x, s * amp, k);
      this.legs[1].leg.rotation.x = L(this.legs[1].leg.rotation.x, -s * amp, k);
      this.legs[0].knee.rotation.x = L(this.legs[0].knee.rotation.x, Math.max(0, -Math.cos(this.phase)) * 0.7, k);
      this.legs[1].knee.rotation.x = L(this.legs[1].knee.rotation.x, Math.max(0, Math.cos(this.phase)) * 0.7, k);
      armX = [-s * amp * 0.8, s * amp * 0.8]; elbowX = [-0.25, -0.25];
      bodyY = Math.abs(Math.cos(this.phase)) * 0.03;
    } else if (sitting) {
      const sx = -Math.PI / 2 + 0.05;
      for (const lg of this.legs) { lg.leg.rotation.x = L(lg.leg.rotation.x, sx, k); lg.knee.rotation.x = L(lg.knee.rotation.x, Math.PI / 2 - 0.05, k); }
      bodyY = this.seatH + 0.07 - 0.86; bodyZ = -0.1;
    } else {
      for (const lg of this.legs) { lg.leg.rotation.x = L(lg.leg.rotation.x, 0, k); lg.knee.rotation.x = L(lg.knee.rotation.x, 0, k); }
      bodyY = Math.sin(t * 2 + this.phase) * 0.004;
    }
    if (this.skirt) {
      this.skirt.rotation.x = L(this.skirt.rotation.x, sitting ? -1.25 : 0, k);
      this.skirt.position.z = L(this.skirt.position.z, sitting ? 0.13 : 0, k);
      this.skirt.position.y = L(this.skirt.position.y, sitting ? -0.02 : -0.17, k);
    }

    if (reading && !moving) {
      armX = [-1.05, -1.05]; elbowX = [-0.9, -0.9]; armZ = [0.32, -0.32]; headX = 0.35;
      if (this.arms[0].side > 0) armZ = [-0.32, 0.32];
    } else if (studying) {
      const tw = Math.sin(t * 9) * 0.06;
      armX = [-0.55 + tw, -0.6 - tw]; elbowX = [-1.0, -1.0]; armZ = [0.2, -0.2]; headX = 0.42;
      if (this.arms[0].side > 0) armZ = [-0.2, 0.2];
    } else if (sitting) {
      armX = [-0.4, -0.4]; elbowX = [-0.9, -0.9];
    }
    if (this.emote && this.emoteT > 0) {
      this.emoteT -= dt;
      const r = this.arms.findIndex(a => a.side < 0);
      if (this.emote === 'wave') {
        armX[r] = -0.3; armZ[r] = 2.5 * this.arms[r].side; elbowX[r] = -0.4 + Math.sin(t * 14) * 0.35;
      } else if (this.emote === 'gift') { armX = [-1.2, -1.2]; armZ = [0.0001, 0.0001]; elbowX = [-0.3, -0.3];
      } else if (this.emote === 'clap') { armX = [-1.2, -1.2]; armZ = [0.5 + Math.sin(t * 20) * 0.2, -0.5 - Math.sin(t * 20) * 0.2]; elbowX = [-0.6, -0.6]; }
      else if (this.emote === 'think') { armX[r] = -1.2; elbowX[r] = -2.2; headX = -0.1; }
      if (this.emoteT <= 0) this.emote = null;
    }
    this.arms.forEach((a, i) => {
      a.sh.rotation.x = L(a.sh.rotation.x, armX[i], k);
      a.sh.rotation.z = L(a.sh.rotation.z, armZ[i] || a.side * 0.06, k);
      a.elbow.rotation.x = L(a.elbow.rotation.x, elbowX[i], k);
    });
    this.head.rotation.x = L(this.head.rotation.x, headX, k);
    this.body.position.y = L(this.body.position.y, bodyY, sitting || this._wasSit ? k : 1);
    this.body.position.z = L(this.body.position.z, bodyZ, k);
    this._wasSit = sitting;
    if (this.hairTail) this.hairTail.rotation.x = 0.1 + (moving ? Math.sin(this.phase * 2) * 0.12 : Math.sin(t * 1.5) * 0.02);

    this.book.visible = reading && !moving;
    if (this.book.visible) {
      this.book.position.set(0, sitting ? 0.22 : 0.24, sitting ? 0.34 : 0.32);
      this.book.rotation.x = sitting ? -0.85 : -0.7;
    }
    this.studyKit.visible = studying;
    if (studying) {
      const onLap = this.seatType === 'sofa' || this.seatType === 'armchair';
      this.studyKit.position.set(0, onLap ? this.seatH + 0.2 : this.tableH || 0.76, onLap ? 0.3 : 0.48);
    }
    if (this.ring) this.ring.material.opacity = 0.45 + Math.sin(t * 3) * 0.2;
    if (this.bubble && this.bubbleT > 0) {
      this.bubbleT -= dt;
      if (this.bubbleT <= 0) { this.root.remove(this.bubble); this.bubble.material.map.dispose(); this.bubble.material.dispose(); this.bubble = null; }
    }
  }
}
