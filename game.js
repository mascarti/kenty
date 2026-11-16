import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { clone as skClone } from './vendor/utils/SkeletonUtils.js';
import { LEVELS, ZMAP, LOBBY, ARENA } from './levels.js';
import { SND } from './snd.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const T = 2; // размер тайла
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const rnd = (a, b) => a + Math.random() * (b - a);
const hash = (n) => { let x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ---------- модели (Sketchfab, CC BY 4.0) ----------
const CREDITS = [
  ['toon', 'Lowpoly Toon Characters', 'joaobaltieri', 'f774333ab1b6400288a069b12d582555'],
  ['man', 'Low-poly Man', 'Razvan Savescu', '7b93db2d46d847f191cf5e841b322856'],
  ['demon', 'Demon Melee - Animated & Game Ready', 'Tiago Barracha', '0d61017daba349c1b7ab750727a68d48'],
  ['zombie', 'Zombie Melee - Animated & Game Ready', 'Tiago Barracha', '05bc4661b32f4497872944d7c8bb7e5d'],
  ['car', '1969 Dodge Charger R/T [GT2/PSX Style]', 'Samuel M. Liberato', '2856e53227fa445092da3cc41078618c'],
  ['sofa', 'Blue Sofa - PS1 Low Poly', 'Wersaus33', '315b8551f71b4677afb1279e5863f1f1'],
  ['armchair', 'PSX Armchair', 'Tomitos', 'a32d0264449c47caa9ba02bc1e0d9f94'],
  ['pool', 'Pool Table Set', 'NTSC', '7a91611c0e5d4f519c9e7cd1425d066a'],
  ['arcade', 'Arcade Machine - Pixel-art Low-Poly', 'Wade_Kenny', '2e95a489783e4e75a132bcc9e42b69e6'],
  ['plant', 'Potted Plant - Household Props Challenge', 'Pixel-bit', '4176123e70e44426be3ba0e65587af90'],
  ['desk', 'Low Poly Computer Desk', 'Nyangire', '646ed84ecd9d40089c31d94f79334ca5'],
  ['palm', 'Coconut Tree', 'sujirour', 'd141941578044b0f861ca83b36d4c411'],
  ['pine', 'Pine Tree - PS1 Low Poly', 'Wersaus33', 'd71ceeb303644e649d09fe8038aa5e47'],
  ['fence', 'Low Poly Wooden Fence', 'thelegokid4455', 'd69753a062cf4b47b9434a63631ed947'],
  ['wardrobe', 'PSX Style Wardrobe', 'Icevanilla', '76fdc513979041b19b5cf5395110ed6d'],
  ['generator', 'Low poly Electric Generator', 'Kolos Studios', 'ef6f713517894a92bd7a53ff645d4c0f'],
  ['bat', 'PSX Low Poly Horror Baseball Bat', 'jonniemadeit', 'b0339a8406a248e8a8b8a7e71ad3e508'],
  ['pistol', 'Low-Poly CZ Vz. 82', 'notcplkerry', '9108e50f39e548cab52d351b92a8e013'],
  ['shotgun', 'PSX Shotgun', 'Tomitos', '227daf7aaa3c418481dc294723026381'],
  ['mac10', 'MAC-10 SMG - Low Poly Retro Weapon Prop', 'Vlaxled', '033b41ffd36746ecacd6c90a44088bde'],
  ['ak', 'Low-Poly AK-47 Type 2', 'TastyTony', 'a7260926fb0a40f8bba5f651b03d23f1'],
  ['m4', 'Low-poly M4 assault rifle', 'szaw', 'fb85c455cf374675a1db7988def2d926'],
  ['minigun', 'M134 (Cube)', 'GoldbergR', '1ffee348949142439771d1ecd0c6ffd6'],
  ['grenade', 'Low-Poly M67', 'TastyTony', 'c233d27d001d4d19aab9f35bf171f1a5'],
  ['molotov', 'Cóctel Molotov - Reduce', 'DanixsDesigner', '9e2ba68ad5144981b609798394ba4287'],
];
const SKIN_CREDITS = [ // грузятся по требованию, когда скин реально нужен
  ['specops', 'PS1/Low Poly Night Vision Special Forces', 'Jellypack', 'afb42573fa5f4fd2af09c9929d9ccd93'],
  ['spacesurv', 'space survivor', 's.probka', 'cd2576b76a0d4ff5a33e0806c25b86c8'],
  ['gnome', 'The Green Wizard Gnome N64 Style', 'Drillimpact', '7708c9dd60234693a6dcb326d66c627f'],
  ['army', 'Modern Army Soldier with +24 pro Animations', 'abdlilah ben', '37566d930fa7404f87847b7fca8dca97'],
  ['fsoldier', 'Futuristic soldier (lowpoly)', 'SlagPerch 3D', '5ebade1ccbff4adb91ddd3a4d1fcd541'],
  ['moonwalk', 'Moon Walk', 'EvgenyS', '4a6955a4df8449b5af8ef4c3cd9d0e03'],
  ['rapper22', '22Block Rapper', '22blockverse', '85df5d1d058348daa85ade2ef3568bb4'],
];
const LOW = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches; // телефон
function cheapMat(m) { // PBR-материалы дорогие для телефона — меняем на простые
  if (!m || !m.isMeshStandardMaterial) return m;
  const glass = m.transmission > 0;
  const n = new THREE.MeshLambertMaterial({ map: m.map, color: m.color, transparent: m.transparent || glass, opacity: glass ? .45 : m.opacity, alphaTest: m.alphaTest, side: m.side, vertexColors: m.vertexColors, emissive: m.emissive, emissiveMap: m.emissiveMap });
  n.name = m.name; m.dispose(); return n;
}
function cheapen(root) { root.traverse(o => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(cheapMat) : cheapMat(o.material); }); }
const G = {}; // name -> gltf
const loading = {};
const gltfLoader = new GLTFLoader();
function loadModel(name) {
  if (loading[name]) return loading[name];
  return loading[name] = (async () => {
    try {
      let buf;
      if (SA) buf = await (await fetch('./glb/' + name + '.glb')).arrayBuffer();
      else { const b64 = (await import('./m/' + name + '.js')).default; const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); buf = u8.buffer; }
      G[name] = await new Promise((res, rej) => gltfLoader.parse(buf, '', res, rej));
      cheapen(G[name].scene);
    } catch (e) { console.warn('model failed', name, e); G[name] = null; }
    return G[name];
  })();
}

async function loadModels(onProgress) { // по 3 за раз, чтобы не раздувать память на телефоне
  let done = 0, next = 0; const names = CREDITS.map(c => c[0]);
  const worker = async () => { while (next < names.length) { await loadModel(names[next++]); onProgress(++done / names.length); } };
  await Promise.all([worker(), worker(), worker()]);
}

const _v = new THREE.Vector3(), _b = new THREE.Box3();
function skinnedBox(o, out) {
  out.makeEmpty(); o.updateMatrixWorld(true);
  o.traverse(x => { if (!x.isMesh) return; if (x.isSkinnedMesh) { x.skeleton.update(); x.computeBoundingBox(); out.union(x.boundingBox.clone().applyMatrix4(x.matrixWorld)); } else out.expandByObject(x); });
  return out;
}
function fit(name, { size = 1, dim = 'max', rx = 0, ry = 0, rz = 0, drop } = {}) {
  const g = new THREE.Group();
  if (!G[name]) { // запасной вариант, если моделька не загрузилась
    const m = new THREE.Mesh(new THREE.BoxGeometry(size * .6, size * .6, size * .6), new THREE.MeshStandardMaterial({ color: 0x888899 }));
    m.position.y = size * .3; g.add(m); return g;
  }
  const src = skClone(G[name].scene);
  if (drop) { const rm = []; src.traverse(o => { if (o.isMesh && drop.test(o.name)) rm.push(o); }); rm.forEach(o => o.parent.remove(o)); }
  src.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  const rot = new THREE.Group(); rot.add(src); rot.rotation.set(rx, ry, rz);
  skinnedBox(rot, _b); const s = _b.getSize(new THREE.Vector3()), c = _b.getCenter(new THREE.Vector3());
  const k = size / (dim === 'y' ? s.y : dim === 'x' ? s.x : dim === 'z' ? s.z : Math.max(s.x, s.y, s.z));
  rot.position.set(-c.x, -_b.min.y, -c.z);
  const sc = new THREE.Group(); sc.add(rot); sc.scale.setScalar(k); g.add(sc);
  return g;
}

const WPN_MODEL = {
  bat: () => fit('bat', { size: 1.25, rx: Math.PI / 2 }),
  pistol: () => fit('pistol', { size: 0.62 }),
  shotgun: () => fit('shotgun', { size: 1.5, ry: Math.PI / 2, drop: /Ammo|Shell/ }),
  mac10: () => fit('mac10', { size: 0.85 }),
  ak: () => fit('ak', { size: 1.55, ry: Math.PI / 2 }),
  m4: () => fit('m4', { size: 1.5, ry: Math.PI / 2 }),
  minigun: () => fit('minigun', { size: 1.7 }),
  grenade: () => fit('grenade', { size: 0.5 }),
  molotov: () => fit('molotov', { size: 0.7, dim: 'y' }),
  ammo: () => { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(1, .6, .7), new THREE.MeshLambertMaterial({ color: 0x4f7a34 })); b.position.y = .3; const l = new THREE.Mesh(new THREE.BoxGeometry(1.04, .12, .74), new THREE.MeshLambertMaterial({ color: 0xffe14d })); l.position.y = .62; g.add(b, l); return g; },
};
const W = {
  bat: { melee: 1, rate: .36, dmg: 3, name: 'БИТА' },
  pistol: { rate: .24, ammo: 24, pel: 1, spr: .02, dmg: 2, name: 'ПИСТОЛЕТ' },
  mac10: { rate: .07, ammo: 60, pel: 1, spr: .09, dmg: 1, name: 'УЗИ' },
  shotgun: { rate: .7, ammo: 12, pel: 7, spr: .17, dmg: 1, name: 'ДРОБОВИК' },
  ak: { rate: .11, ammo: 60, pel: 1, spr: .05, dmg: 2, name: 'КАЛАШ' },
  m4: { rate: .085, ammo: 60, pel: 1, spr: .03, dmg: 2, name: 'ЭМКА' },
  minigun: { rate: .04, ammo: 200, pel: 1, spr: .1, dmg: 1, name: 'МИНИГАН', slow: .62 },
  grenade: { thr: 1, ammo: 2, name: 'ГРАНАТА' },
  molotov: { thr: 1, ammo: 2, name: 'МОЛОТОВ' },
  ammo: { name: 'ПАТРОНЫ' },
};
const THROWS = ['grenade', 'molotov'];
const ET = {
  m: { hp: 2, w: 'bat', spd: 6.0, h: 1.9, tint: 0xffffff, model: 'man' },
  g: { hp: 2, w: 'pistol', spd: 4.2, h: 1.9, tint: 0x9fd4ff, react: .55, rate: .6, model: 'man' },
  s: { hp: 2, w: 'shotgun', spd: 4.0, h: 1.9, tint: 0xffe08a, react: .7, rate: 1.15, model: 'man' },
  u: { hp: 2, w: 'mac10', spd: 4.2, h: 1.9, tint: 0xff9fd0, react: .45, rate: .17, burst: 6, model: 'man' },
  k: { hp: 3, w: 'ak', spd: 4.2, h: 1.95, tint: 0xb0ffb0, react: .5, rate: .14, burst: 5, model: 'man' },
  B: { hp: 12, w: 'bat', spd: 4.4, h: 2.7, tint: 0xff7a7a, model: 'man' },
  // зомби (волны)
  w: { zombie: 1, hp: 3, spd: 2.9, h: 1.95, tint: 0xffffff, model: 'zombie', core: .5 },
  r: { zombie: 1, hp: 2, spd: 6.2, h: 1.65, tint: 0xff9a9a, model: 'zombie', core: .4 },
  f: { zombie: 1, hp: 16, spd: 2.2, h: 2.7, tint: 0xa8ff8a, model: 'zombie', core: 1.5 },
  Z: { zombie: 1, boss: 1, hp: 200, spd: 3.3, h: 4.8, tint: 0xffffff, model: 'demon', core: 6 },
};
const SKINS = [
  { id: 'toon', name: 'ПАЦАН', model: 'toon', h: 1.8, price: 0 },
  { id: 'specops', name: 'СПЕЦНАЗ', model: 'specops', h: 2.0, price: 150, run: 'SMGwalk', idle: 'SMGpose', noWpn: 1 },
  { id: 'spacesurv', name: 'КОСМО-БРОДЯГА', model: 'spacesurv', h: 2.05, price: 250, ry: Math.PI },
  { id: 'gnome', name: 'ГНОМ-МАГ', model: 'gnome', h: 1.6, price: 350 },
  { id: 'army', name: 'АРМЕЕЦ', model: 'army', h: 1.95, price: 500, run: 'run', idle: 'idle simple', noWpn: 1 },
  { id: 'fsoldier', name: 'СОЛДАТ БУДУЩЕГО', model: 'fsoldier', h: 2.0, price: 700, run: 'Rifle_run', idle: 'Rifle_stand', noWpn: 1 },
  { id: 'moonwalk', name: 'ЛУННЫЙ', model: 'moonwalk', h: 1.95, price: 1000 },
  { id: 'rapper22', name: 'РЭПЕР', model: 'rapper22', h: 2.0, price: 1500 },
];
const FREE_SKINS = true; // пока всё бесплатно
const owns = (id) => FREE_SKINS || save.owned.includes(id);
const skinOf = (id) => SKINS.find(s => s.id === id) || SKINS[0];

// ---------- сцена ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, powerPreference: 'high-performance' });
let pxr = Math.min(devicePixelRatio || 1, LOW ? 1.5 : 1.75);
renderer.setPixelRatio(pxr);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a0845);
const cam = new THREE.PerspectiveCamera(46, 1, 1, 200);
const hemi = new THREE.HemisphereLight(0xffffff, 0x554466, 2.1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe8ff, 1.6); sun.position.set(6, 14, 4); scene.add(sun);
const flash = new THREE.PointLight(0xffd27a, 0, 14, 1.6); flash.position.y = 1.4; scene.add(flash);
const houseLight = new THREE.PointLight(0xffb060, 0, 26, 1.3); houseLight.position.y = 3; scene.add(houseLight);
const selfLight = new THREE.PointLight(0xbfd0ff, 0, 5, 1.5); scene.add(selfLight);
const torches = [0, 1].map(() => { const s = new THREE.SpotLight(0xfff2d0, 0, 30, .62, .7, 1.1); s.visible = false; scene.add(s); scene.add(s.target); return s; });
let theme = 'neon';
function setTheme(t) {
  theme = t; scene.fog = null; houseLight.intensity = 0; houseLight.visible = t === 'night'; selfLight.visible = t === 'dark';
  if (t === 'night') { hemi.color.set(0x8fa8ff); hemi.groundColor.set(0x16202e); hemi.intensity = .75; sun.color.set(0x9db8ff); sun.intensity = .7; scene.background.set(0x050914); scene.fog = new THREE.Fog(0x050914, 30, 70); houseLight.intensity = 120; }
  else if (t === 'dark') { hemi.color.set(0x8890b0); hemi.groundColor.set(0x000000); hemi.intensity = .035; sun.intensity = 0; scene.background.set(0x000000); scene.fog = new THREE.Fog(0x000000, 16, 40); }
  else if (t === 'home') { hemi.color.set(0xffe6c4); hemi.groundColor.set(0x4a3a30); hemi.intensity = 1.9; sun.color.set(0xfff0dd); sun.intensity = 1.1; scene.background.set(0x120d16); }
  else { hemi.color.set(0xffffff); hemi.groundColor.set(0x554466); hemi.intensity = 2.1; sun.color.set(0xffe8ff); sun.intensity = 1.6; }
  for (const s of torches) { s.visible = t === 'night' || t === 'dark'; s.intensity = 0; }
  selfLight.intensity = t === 'dark' ? 5 : 0;
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 250)); resize();

const levelGroup = new THREE.Group(); scene.add(levelGroup);
const dynGroup = new THREE.Group(); scene.add(dynGroup);

// пули
const NB = 160;
const bulletMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.13, .13, 1.1), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), NB);
bulletMesh.frustumCulled = false; bulletMesh.count = 0; scene.add(bulletMesh);
const bullets = [];
// кровь
const NBL = 300;
const bloodMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff }), NBL);
bloodMesh.frustumCulled = false; bloodMesh.count = 0; scene.add(bloodMesh);
let bloodN = 0;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
function blood(x, z, n = 3, spread = 1, soot = false) {
  for (let i = 0; i < n; i++) {
    const idx = bloodN % NBL; bloodN++;
    const r = rnd(.18, .55) * (i === 0 ? 1.5 : 1) * (soot ? 2.4 : 1);
    _p.set(x + rnd(-spread, spread), .025 + (idx % 20) * .0012, z + rnd(-spread, spread)); _s.set(r * rnd(.8, 1.3), 1, r);
    _q.setFromAxisAngle(_v.set(0, 1, 0), rnd(0, TAU));
    bloodMesh.setMatrixAt(idx, _m.compose(_p, _q, _s));
    bloodMesh.setColorAt(idx, soot ? _c.setHSL(0, 0, rnd(.02, .06)) : _c.setHSL(rnd(0, .015), 1, theme === 'dark' ? rnd(.03, .06) : theme === 'night' ? rnd(.2, .3) : rnd(.28, .42)));
  }
  bloodMesh.count = Math.min(bloodN, NBL); bloodMesh.instanceMatrix.needsUpdate = true; if (bloodMesh.instanceColor) bloodMesh.instanceColor.needsUpdate = true;
}
// взмах
const swingGeo = new THREE.RingGeometry(1.0, 2.1, 12, 1, -0.9, 1.8).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2);
const ringFxGeo = new THREE.RingGeometry(.86, 1, 32).rotateX(-Math.PI / 2);
const sphGeo = new THREE.SphereGeometry(1, 14, 10);
const fxs = []; // {m,t,dur,grow}
function swingFx(x, z, a, color) {
  const m = new THREE.Mesh(swingGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8, depthWrite: false }));
  m.position.set(x, 1.0, z); m.rotation.y = a; dynGroup.add(m); fxs.push({ m, t: .14, dur: .14, o: .8 });
}
function ringFx(x, z, r, color, dur = .5) { // телеграф удара / волна
  const m = new THREE.Mesh(ringFxGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .9, depthWrite: false })); m.position.set(x, .08, z); m.scale.setScalar(.2); dynGroup.add(m); fxs.push({ m, t: dur, dur, o: .9, grow: r });
}
function boomFx(x, z, r) {
  const m = new THREE.Mesh(sphGeo, new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: .85, depthWrite: false, fog: false })); m.position.set(x, .8, z); m.scale.setScalar(.3); dynGroup.add(m); fxs.push({ m, t: .3, dur: .3, o: .85, grow: r });
  ringFx(x, z, r * 1.25, 0xffe14d, .35); flash.position.set(x, 2, z); flash.intensity = 260; blood(x, z, 3, .8, true);
}
// дуга броска
const ARC_N = 18;
const arcLine = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_N * 3), 3)), new THREE.LineBasicMaterial({ color: 0xffe14d, fog: false }));
arcLine.frustumCulled = false; arcLine.visible = false; scene.add(arcLine);
const arcRing = new THREE.Mesh(new THREE.RingGeometry(.7, 1, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: .85, depthWrite: false, fog: false }));
arcRing.visible = false; scene.add(arcRing);
const arcY = (t, d) => 1.1 * (1 - t) + Math.sin(t * Math.PI) * (1.6 + d * .22);

// ---------- персонажи ----------
const shadowGeo = new THREE.CircleGeometry(.55, 14).rotateX(-Math.PI / 2);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .35, depthWrite: false });
const ringGeo = new THREE.RingGeometry(.62, .78, 20).rotateX(-Math.PI / 2);
const MEAS = {};
function findClip(src, role, exact) {
  if (exact) { const c = src.animations.find(a => a.name === exact); if (c) return c; }
  const ok = src.animations.filter(a => !/rest|tpose|t-pose|bones/i.test(a.name));
  const pick = (re) => ok.find(a => re.test(a.name));
  if (role === 'run') return pick(/run|sprint|move/i) || pick(/walk/i);
  if (role === 'idle') return pick(/idle|standing/i);
  if (role === 'attack') return pick(/attack|punch/i);
}
function measure(kind, o2 = {}) {
  if (MEAS[kind]) return MEAS[kind];
  const src = G[kind]; const o = skClone(src.scene); const mx = new THREE.AnimationMixer(o); const cl = findClip(src, 'idle', o2.idle) || findClip(src, 'run', o2.run) || src.animations[0];
  if (cl) { mx.clipAction(cl).play(); mx.update(.1); }
  skinnedBox(o, _b);
  return MEAS[kind] = { h: Math.max(.01, _b.max.y - _b.min.y), minY: _b.min.y };
}
class Char {
  constructor(kind, { h = 1.9, tint = 0xffffff, ring = 0, run, idle, noWpn, ry = 0 } = {}) {
    this.g = new THREE.Group(); this.body = new THREE.Group(); this.g.add(this.body);
    const src = G[kind]; this.h = h; this.noWpn = !!noWpn;
    if (src) {
      const ms = measure(kind, { run, idle }), k = h / ms.h;
      const o = skClone(src.scene);
      o.traverse(m => { if (m.isMesh) { m.frustumCulled = false; if (tint !== 0xffffff) { const cl = (x) => { const c = x.clone(); c.color.multiply(_c.set(tint)); return c; }; m.material = Array.isArray(m.material) ? m.material.map(cl) : cl(m.material); m.userData.ownMat = 1; } } });
      const holder = new THREE.Group(); holder.add(o); holder.scale.setScalar(k); holder.rotation.y = ry; holder.position.y = -ms.minY * k; this.body.add(holder);
      this.mixer = new THREE.AnimationMixer(o);
      const mk = (role) => { const c = findClip(src, role, role === 'run' ? run : role === 'idle' ? idle : null); if (!c) return null; const a = this.mixer.clipAction(c); a.play(); a.setEffectiveWeight(0); return a; };
      this.aIdle = mk('idle'); this.aRun = mk('run'); this.aAtk = mk('attack'); if (this.aAtk === this.aRun || this.aAtk === this.aIdle) this.aAtk = null;
      if (this.aRun && (!this.aIdle || this.aIdle === this.aRun)) { this.aIdle = this.aRun; this.freeze = true; } // один клип ходьбы: стоим — замираем
      if (!this.aRun && !this.aIdle && src.animations[0]) { this.aIdle = this.mixer.clipAction(src.animations[0]); this.aIdle.play(); }
      this.bob = !this.aRun; this.bt = 0;
    } else {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(.4, .9), new THREE.MeshStandardMaterial({ color: tint })); m.position.y = .9; this.body.add(m);
    }
    const sh = new THREE.Mesh(shadowGeo, shadowMat); sh.position.y = .03; sh.scale.setScalar(h / 1.9); this.g.add(sh);
    if (ring) { this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: ring, transparent: true, opacity: .9, depthWrite: false, fog: false })); this.ring.position.y = .04; this.g.add(this.ring); }
    this.hand = new THREE.Group(); this.hand.position.set(-.42, h * .5, .55); this.body.add(this.hand);
    this.wpn = ''; this.wr = 0; this.dead = false; this.recoil = 0; this.atkT = 0; this.moving = 0;
  }
  setWeapon(w) {
    if (w === this.wpn) return; this.wpn = w; this.hand.clear();
    if (w && WPN_MODEL[w] && !this.noWpn) { const m = WPN_MODEL[w](); m.position.y = -.1; m.position.z = w === 'bat' ? .35 : .2; if (w === 'bat') m.rotation.x = -.5; this.hand.add(m); }
  }
  setAnim(moving) { this.moving = moving; }
  attack() { this.recoil = 1; if (this.aAtk) { this.aAtk.reset(); this.aAtk.setEffectiveWeight(1); this.atkT = Math.min(.7, this.aAtk.getClip().duration); } }
  setDead(d) {
    if (d === this.dead) return; this.dead = d;
    this.body.rotation.x = d ? -Math.PI / 2 : 0; this.body.position.y = d ? .25 : 0;
    if (this.ring) this.ring.visible = !d;
  }
  update(dt) {
    if (!this.mixer) return;
    const tr = this.dead ? 0 : (this.moving ? 1 : 0);
    this.wr += (tr - this.wr) * Math.min(1, dt * 12);
    let aw = 0; if (this.atkT > 0) { this.atkT -= dt; aw = this.atkT > 0 ? 1 : 0; }
    if (this.aAtk) this.aAtk.setEffectiveWeight(aw);
    if (this.freeze) { this.aRun.setEffectiveWeight(1 - aw); if (!this.dead) this.mixer.update(dt * (aw ? 1 : this.wr)); }
    else {
      if (this.aRun) this.aRun.setEffectiveWeight(this.wr * (1 - aw));
      if (this.aIdle) this.aIdle.setEffectiveWeight((this.aRun ? 1 - this.wr : 1) * (1 - aw));
      if (!this.dead) this.mixer.update(dt);
    }
    if (this.bob && !this.dead) { this.bt += dt * 13 * this.wr; this.body.position.y = Math.abs(Math.sin(this.bt)) * .16 * this.wr; this.body.rotation.x = .2 * this.wr; }
    if (this.recoil > 0) { this.recoil -= dt * 6; this.hand.position.z = .55 - Math.max(0, this.recoil) * .3; }
  }
  dispose() { this.g.parent && this.g.parent.remove(this.g); this.g.traverse(m => { if (m.isMesh && m.userData.ownMat) for (const x of [].concat(m.material)) x.dispose(); }); if (this.ring) this.ring.material.dispose(); }
}
function nameTag(text, color) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const x = cv.getContext('2d');
  x.font = 'bold 34px ui-monospace,monospace'; x.textAlign = 'center'; x.lineWidth = 8; x.strokeStyle = '#000'; x.strokeText(text, 128, 44); x.fillStyle = color; x.fillText(text, 128, 44);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true, fog: false }));
  sp.scale.set(3.2, .8, 1); sp.position.y = 3; sp.renderOrder = 10; return sp;
}

// ---------- уровень ----------
let lvl = null;
const enemies = []; const pickups = [];
let exitMark = null;
const tileOf = (x, z) => [Math.floor(x / T), Math.floor(z / T)];
const idx = (c, r) => r * lvl.w + c;
const isWall = (x, z) => { const c = Math.floor(x / T), r = Math.floor(z / T); return c < 0 || r < 0 || c >= lvl.w || r >= lvl.h || lvl.wall[r * lvl.w + c] === 1; };
const isSolidT = (c, r) => c < 0 || r < 0 || c >= lvl.w || r >= lvl.h || lvl.solid[r * lvl.w + c] === 1;
function blocked(x, z, rad) { return isSolidT(Math.floor((x - rad) / T), Math.floor((z - rad) / T)) || isSolidT(Math.floor((x + rad) / T), Math.floor((z - rad) / T)) || isSolidT(Math.floor((x - rad) / T), Math.floor((z + rad) / T)) || isSolidT(Math.floor((x + rad) / T), Math.floor((z + rad) / T)); }
function moveEnt(e, dx, dz, rad = .45) { if (!blocked(e.x + dx, e.z, rad)) e.x += dx; if (!blocked(e.x, e.z + dz, rad)) e.z += dz; }
function los(x0, z0, x1, z1) { const d = Math.hypot(x1 - x0, z1 - z0); const n = Math.ceil(d / .45); for (let i = 1; i < n; i++) { const t = i / n; if (isWall(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false; } return true; }

const PROPS = {
  S: { m: 'sofa', size: 3.7, long: 'z' }, T: { m: 'pool', size: 3.7, long: 'x' }, D: { m: 'desk', size: 3.3, long: 'x' }, C: { m: 'car', size: 6.4, long: 'x' },
  A: { m: 'armchair', size: 1.7, back: 1 }, K: { m: 'arcade', size: 2.7, dim: 'y', back: 1 }, L: { m: 'plant', size: 1.9, dim: 'y' }, Y: { m: 'palm', size: 5.5, dim: 'y' },
  W: { m: 'wardrobe', size: 3.1, dim: 'y', back: 1 }, G: { m: 'generator', size: 2.1 }, N: { m: 'pine', size: 6.5, dim: 'y' },
  F: { m: 'fence', size: 2.08, dim: 'z', ry: Math.PI / 2 }, f: { m: 'fence', size: 2.08, dim: 'z', ry: 0 },
};
function disposeTree(o) { o.traverse(m => { if (m.geometry && m.userData.own) m.geometry.dispose(); if (m.material && m.userData.own) { m.material.map && m.material.map.dispose(); m.material.dispose(); } }); }
function clearEnemies() { for (const e of enemies) if (e.ch) e.ch.dispose(); enemies.length = 0; }
function clearPickups() { for (const p of pickups) p.g.parent && p.g.parent.remove(p.g); pickups.length = 0; }

function loadLevel(def) {
  disposeTree(levelGroup); levelGroup.clear(); dynGroup.clear(); fxs.length = 0; thrown.length = 0; fires.length = 0;
  clearEnemies(); pickups.length = 0; bullets.length = 0; bloodN = 0; bloodMesh.count = 0;
  setTheme(def.theme || 'neon');
  const h = def.map.length, w = def.map[0].length;
  lvl = { def, w, h, wall: new Uint8Array(w * h), solid: new Uint8Array(w * h), spawns: [], exit: null, fields: new Map(), zs: [], crates: [], spots: [], core: null, wardrobe: null, arcade: null };
  const cv = document.createElement('canvas'); const PX = 32; cv.width = w * PX; cv.height = h * PX; const x2 = cv.getContext('2d');
  const walls = []; const props = []; const night = theme === 'night';
  const isFloor = (ch) => ch === '.' || ch === ',' || ch === '_' || ch === '"';
  const floorAt = (row, c) => { for (let d = 1; d < w; d++) for (const cc of [c - d, c + d]) if (isFloor(row[cc])) return row[cc]; return '.'; };
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const ch = def.map[r][c]; const i = r * w + c; const wx = (c + .5) * T, wz = (r + .5) * T;
    if (ch === ' ') { lvl.wall[i] = lvl.solid[i] = 1; continue; }
    if (ch === '#') { lvl.wall[i] = lvl.solid[i] = 1; walls.push([wx, wz]); x2.fillStyle = '#0c0616'; x2.fillRect(c * PX, r * PX, PX, PX); continue; }
    let fl = ch;
    if (!isFloor(ch)) {
      fl = floorAt(def.map[r], c);
      if (ch === 'P') lvl.spawns.push([wx, wz]);
      else if (ch === 'X') lvl.exit = [wx, wz];
      else if (ch === 'z') lvl.zs.push([wx, wz]);
      else if (ch === 'c') lvl.crates.push([wx, wz]);
      else if (ch === '*') lvl.spots.push({ x: wx, z: wz, t: rnd(0, 3), p: null });
      else if (ch === '!' || ch === '%') lvl.spots.push({ x: wx, z: wz, t: 0, p: null, once: ch === '!' ? 'grenade' : 'molotov' });
      else if (ET[ch] && !ET[ch].zombie) enemies.push(makeEnemy(enemies.length, ch, ET[ch].hp, wx, wz, true));
      else if (ch === '+') lvl.solid[i] = 1;
      else if (PROPS[ch]) { lvl.solid[i] = 1; props.push([ch, c, r]); if (ch === 'G') lvl.core = [wx, wz]; if (ch === 'W') lvl.wardrobe = [wx, wz]; if (ch === 'K') lvl.arcade = [wx, wz]; }
    }
    // пол
    const X = c * PX, Y = r * PX;
    if (fl === '_') {
      x2.fillStyle = night ? ((c + r) % 2 ? '#3a3a44' : '#36363f') : ((c + r) % 2 ? '#2b2440' : '#272038'); x2.fillRect(X, Y, PX, PX);
      if (!night && r % 4 === 2 && c % 3 !== 2) { x2.fillStyle = '#ffe14d'; x2.fillRect(X + 4, Y + 14, PX - 8, 3); }
    } else if (fl === '"') {
      x2.fillStyle = hash(i) > .5 ? '#3d7a45' : '#387240'; x2.fillRect(X, Y, PX, PX);
      for (let k = 0; k < 7; k++) { const hx = hash(i * 13 + k), hy = hash(i * 29 + k * 3); x2.fillStyle = hash(i + k * 7) > .5 ? '#4c8f52' : '#2f6238'; x2.fillRect(X + (hx * 28 | 0), Y + (hy * 26 | 0), 3, 5); }
    } else {
      const pal = fl === ',' ? def.pal.b : def.pal.a;
      x2.fillStyle = pal[(c + r) % 2]; x2.fillRect(X, Y, PX, PX);
      if (theme === 'neon') { x2.fillStyle = 'rgba(0,0,0,.18)'; x2.fillRect(X, Y, PX, 1); x2.fillRect(X, Y, 1, PX); x2.fillStyle = 'rgba(255,255,255,.10)'; x2.fillRect(X + 3, Y + 3, PX / 2 - 4, PX / 2 - 4); }
      else { x2.fillStyle = 'rgba(0,0,0,.22)'; for (let k = 0; k < 4; k++) x2.fillRect(X, Y + k * 8, PX, 1); x2.fillRect(X + ((r * 7 + c * 3) % 3) * 10 + 4, Y, 1, PX); }
    }
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w * T, h * T).rotateX(-Math.PI / 2), theme === 'neon' ? new THREE.MeshBasicMaterial({ map: tex }) : new THREE.MeshLambertMaterial({ map: tex }));
  floor.position.set(w * T / 2, 0, h * T / 2); floor.userData.own = 1; levelGroup.add(floor);
  // стены
  const WH = theme === 'neon' ? 1.7 : 2.0;
  const wm = new THREE.InstancedMesh(new THREE.BoxGeometry(T, WH, T), new THREE.MeshLambertMaterial({ color: def.pal.wall }), walls.length);
  const capMat = theme === 'neon' ? new THREE.MeshBasicMaterial({ color: def.pal.neon }) : new THREE.MeshLambertMaterial({ color: def.pal.neon });
  const cap = new THREE.InstancedMesh(new THREE.BoxGeometry(T, .1, T), capMat, walls.length);
  const meshes = [wm, cap];
  walls.forEach(([x, z], i) => { wm.setMatrixAt(i, _m.makeTranslation(x, WH / 2, z)); cap.setMatrixAt(i, _m.makeTranslation(x, WH, z)); });
  if (theme === 'neon') { const capIn = new THREE.InstancedMesh(new THREE.BoxGeometry(T - .3, .12, T - .3), new THREE.MeshBasicMaterial({ color: 0x140a24 }), walls.length); walls.forEach(([x, z], i) => capIn.setMatrixAt(i, _m.makeTranslation(x, WH + .01, z))); meshes.push(capIn); }
  for (const m of meshes) { m.userData.own = 1; m.frustumCulled = false; levelGroup.add(m); }
  // пропсы
  for (const [ch, c, r] of props) {
    const p = PROPS[ch]; let n = 1, horiz = true;
    while (def.map[r][c + n] === '+') n++;
    if (n === 1) { while (def.map[r + n] && def.map[r + n][c] === '+') n++; if (n > 1) horiz = false; }
    const o = fit(p.m, { size: p.size, dim: p.dim });
    if (p.long) { if ((p.long === 'z') === horiz) o.rotation.y = Math.PI / 2; }
    else if (p.ry !== undefined) o.rotation.y = p.ry;
    else if (p.back) { const free = [[0, 1, 0], [1, 0, Math.PI / 2], [0, -1, Math.PI], [-1, 0, -Math.PI / 2]].find(([dc, dr]) => !isSolidT(c + dc, r + dr) && isSolidT(c - dc, r - dr)); if (free) o.rotation.y = free[2]; }
    else o.rotation.y = ((c * 7 + r * 13) % 4) * Math.PI / 2;
    o.position.set((c + (horiz ? n / 2 : .5)) * T, 0, (r + (horiz ? .5 : n / 2)) * T);
    levelGroup.add(o);
  }
  if (lvl.core) houseLight.position.set(lvl.core[0], 3.2, lvl.core[1]);
  // маркер выхода
  exitMark = new THREE.Group();
  if (lvl.exit) {
    const er = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.6, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3ff3ff, transparent: true, opacity: .9, depthWrite: false }));
    const ea = new THREE.Mesh(new THREE.ConeGeometry(.5, 1.1, 4), new THREE.MeshBasicMaterial({ color: 0x3ff3ff })); ea.rotation.x = Math.PI; ea.position.y = 2.6;
    er.userData.own = ea.userData.own = 1; er.position.y = .05; exitMark.add(er, ea); exitMark.position.set(lvl.exit[0], 0, lvl.exit[1]);
  }
  exitMark.visible = false; levelGroup.add(exitMark);
  myDmg = new Array(enemies.length).fill(0);
}

function makeEnemy(id, type, hp, x, z, active) {
  const t = ET[type]; const a = rnd(0, TAU);
  const e = { id, type, t, hp, x, z, a, tx: x, tz: z, ta: a, st: active ? 0 : 3, q: 0, cd: 0, aim: 0, wind: 0, dead: false, ch: null, mv: 0, think: rnd(0, .2), turn: rnd(1, 4), burst: 0, rot: 0, chg: rnd(4, 7) };
  if (active) ensureChar(e);
  return e;
}
function ensureChar(e) {
  if (e.ch) return;
  e.ch = new Char(e.t.model, { h: e.t.h, tint: e.t.tint }); if (e.t.w) e.ch.setWeapon(e.t.w);
  e.ch.g.position.set(e.x, 0, e.z); e.ch.g.rotation.y = e.a; scene.add(e.ch.g);
}
function waveList(w) {
  const n = Math.min(40, 6 + w * 4), out = [], hpK = 1 + (w - 1) * .1;
  if (w % 5 === 0) out.push(['Z', Math.round(ET.Z.hp * (1 + (w / 5 - 1) * .5))]);
  for (let i = 0; i < n; i++) { const r = hash(w * 100 + i); const type = r < Math.min(.35, .06 * w) ? 'r' : (w >= 3 && r > 1 - Math.min(.14, .025 * w)) ? 'f' : 'w'; out.push([type, Math.round(ET[type].hp * hpK)]); }
  return out;
}

// ---------- сеть ----------
function mockBase() { // локальная проверка в двух вкладках (?mock=1)
  const id = Math.random().toString(36).slice(2, 10);
  const mk = (chan) => {
    const bc = new BroadcastChannel('kenty-' + chan); const peers = new Map(); let mine = {};
    bc.onmessage = (e) => { const m = e.data; if (m.bye) { peers.delete(m.id); return; } peers.set(m.id, { p: m.p, t: performance.now() }); };
    const iv = setInterval(() => bc.postMessage({ id, p: mine }), 50);
    addEventListener('pagehide', () => bc.postMessage({ id, bye: 1 }));
    return {
      presence(p) { mine = Object.assign({}, mine, p); for (const k in mine) if (mine[k] === null) delete mine[k]; return Promise.resolve(); },
      peers() { const now = performance.now(); const out = [{ peer: id, sameTab: true, presence: mine }]; for (const [k, v] of peers) { if (now - v.t > 1500) { peers.delete(k); continue; } out.push({ peer: k, sameTab: false, presence: v.p }); } return out; },
      leave() { clearInterval(iv); bc.postMessage({ id, bye: 1 }); bc.close(); return Promise.resolve(); },
    };
  };
  const base = mk('lobby'); base.join = (name) => Promise.resolve(mk(name)); return base;
}
const SA = !!window.KENTY_SA; // отдельный сайт (не страница Claude): сеть напрямую между телефонами
function p2pBase() {
  const OPTS = Q.get('ps') ? { host: 'localhost', port: +Q.get('ps'), path: '/', secure: false, debug: 1 } : { debug: 1 };
  return {
    peers: () => [], presence: () => Promise.resolve(),
    join(name, create) {
      return new Promise((resolve, reject) => {
        const hostId = 'kenty-v1-' + name, others = new Map(); let mine = {}, myId = '', conns = [], hostConn = null, hosting = false, peer = null, done = false, timer = null;
        const room = {
          presence(p) { mine = Object.assign({}, mine, p); for (const k in mine) if (mine[k] === null) delete mine[k]; return Promise.resolve(); },
          peers() { const out = [{ peer: myId, sameTab: true, presence: mine }]; for (const [k, v] of others) out.push({ peer: k, sameTab: false, presence: v }); return out; },
          leave() { clearInterval(timer); try { peer.destroy(); } catch (e) { } return Promise.resolve(); },
        };
        const tick = () => {
          try {
            if (hosting) { const all = {}; all[myId] = mine; for (const [k, v] of others) all[k] = v; for (const c of conns) if (c.open) c.send({ t: 's', all }); }
            else if (hostConn && hostConn.open) hostConn.send({ t: 'p', p: mine });
          } catch (e) { }
        };
        const finish = () => { if (done) return; done = true; timer = setInterval(tick, 66); resolve(room); };
        const fail = (e) => { if (done) return; done = true; try { peer.destroy(); } catch (_) { } reject(e); };
        const startHost = (fallback) => {
          peer = new window.Peer(hostId, OPTS);
          peer.on('open', (id) => { myId = id; hosting = true; finish(); });
          peer.on('connection', (c) => {
            conns.push(c); c.on('data', (d) => { if (d && d.t === 'p' && d.p) others.set(c.peer, d.p); });
            const bye = () => { others.delete(c.peer); conns = conns.filter(x => x !== c); }; c.on('close', bye); c.on('error', bye);
          });
          peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { } });
          peer.on('error', (e) => { if (done) return; if (e.type === 'unavailable-id' && fallback) { try { peer.destroy(); } catch (_) { } startClient(false); } else fail(e); });
        };
        const startClient = (fallback) => {
          peer = new window.Peer(OPTS);
          peer.on('open', (id) => {
            myId = id; hostConn = peer.connect(hostId, { reliable: true, serialization: 'json' });
            hostConn.on('open', finish);
            hostConn.on('data', (d) => { if (d && d.t === 's' && d.all) { others.clear(); for (const k in d.all) if (k !== myId) others.set(k, d.all[k]); } });
            hostConn.on('close', () => { others.clear(); toast('связь с комнатой потеряна'); });
          });
          peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { } });
          peer.on('error', (e) => { if (done) return; if (e.type === 'peer-unavailable' && fallback) { try { peer.destroy(); } catch (_) { } startHost(false); } else fail(e); });
        };
        setTimeout(() => fail({ type: 'timeout' }), 15000);
        if (create) startHost(true); else startClient(true);
      });
    },
  };
}
const Net = { base: null, room: null, state: 'wait', myId: 'solo', code: '', shared: false };
async function initNet() {
  try {
    if (Q.get('mock')) Net.base = mockBase();
    else if (SA) { if (window.Peer) Net.base = p2pBase(); }
    else {
      for (let i = 0; i < 30 && !(window.claude && window.claude.use); i++) await new Promise(r => setTimeout(r, 100));
      if (window.claude && window.claude.use) Net.base = await window.claude.use('room');
    }
  } catch (e) { console.warn('net', e); }
  Net.state = Net.base ? 'on' : 'off';
}
function netPeers() { if (!Net.room) return []; try { return Net.room.peers(); } catch (e) { return []; } }
function basePeers() { if (!Net.base) return []; try { return Net.base.peers(); } catch (e) { return []; } }
let netErr = 0;
function netSend(patch) { if (Net.room) Net.room.presence(patch).catch((e) => { if (!netErr++) console.warn('presence', e && e.code, e && e.message); }); }

// ---------- сохранение: монеты и скины ----------
const save = { coins: 0, owned: ['toon'], skin: 'toon' };
let saveRef = null, saveBusy = false, saveDirty = false, saveDb = true;
function saveLocal() { try { localStorage.setItem('kenty-save', JSON.stringify(save)); } catch (e) { } }
function persist() {
  saveLocal(); $('coins').textContent = '◎ ' + save.coins;
  if (!saveRef || !saveDb) return;
  if (saveBusy) { saveDirty = true; return; }
  saveBusy = true; saveDirty = false;
  saveRef.set({ coins: save.coins, owned: save.owned.slice(), skin: save.skin }).catch((e) => { if (e && e.code === 'invalid_argument') saveDb = false; }).then(() => { saveBusy = false; if (saveDirty) persist(); });
}
function mergeSave(d) {
  if (!d || typeof d !== 'object') return;
  if (typeof d.coins === 'number' && d.coins > save.coins) save.coins = Math.floor(d.coins);
  if (Array.isArray(d.owned)) for (const id of d.owned) if (SKINS.some(s => s.id === id) && !save.owned.includes(id)) save.owned.push(id);
  if (typeof d.skin === 'string' && owns(d.skin) && SKINS.some(x => x.id === d.skin) && save.skin === 'toon') save.skin = d.skin;
}
async function initSave() {
  try { mergeSave(JSON.parse(localStorage.getItem('kenty-save') || 'null')); } catch (e) { }
  $('coins').textContent = '◎ ' + save.coins;
  try {
    if (Q.get('mock') || SA) return;
    for (let i = 0; i < 30 && !(window.claude && window.claude.use); i++) await new Promise(r => setTimeout(r, 100));
    if (!(window.claude && window.claude.use)) return;
    const [user, db] = await Promise.all([window.claude.use('user'), window.claude.use('db')]);
    if (!user || !db) return; const uid = await user.id(); if (!uid) return;
    const ref = db.doc('data/users/' + uid + '/save');
    const snap = await Promise.race([ref.get(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 9000))]);
    if (snap && snap.exists) mergeSave(snap.data());
    saveRef = ref; persist(); if (me.ch) applySkin();
  } catch (e) { console.warn('save', e && (e.code || e.message)); }
}
function addCoins(n, why) { if (n <= 0) return; save.coins += n; persist(); sfx('coin'); toast('+' + n + ' ◎ ' + (why || '')); }
let toastT = 0;
function toast(t) { const el = $('toast'); el.textContent = t; el.style.opacity = 1; toastT = 2.2; }

// ---------- состояние игры ----------
let running = false, mode = 'lobby', L = 0, ep = 1, gid = 0, isHost = true, t0 = 0, hostless = 0;
let myDmg = [];
let phase = 'play', clearT = 0, wipeT = 0, score = 0, combo = 0, comboT = 0, time = 0, shake = 0;
let lvlT = 0, wave = 0, interT = 0, spawnT = 0, coreHp = 100, over = 0, overT = 0, winPeer = '', paidGid = 0;
const me = { x: 0, z: 0, a: 0, hp: 3, inv: 0, cd: 0, mv: 0, dead: false, revT: 0, ex: 0, ch: null, nick: 'игрок', s: 0, slots: [null, null, null], sel: 0, dth: 0, th: null, thN: 0, respT: 0 };
const mates = new Map();
let hostPeer = null, lastE = null, others = [];
const thrown = [], fires = [];
const maxHp = () => mode === 'coop' ? 3 : 5;
const cur = () => me.slots[me.sel] || { w: 'bat', ammo: 0 };
const ARENA_DARK = Object.assign({}, ARENA, { theme: 'dark', name: 'АРЕНА «ТЬМА»', pal: { a: ['#6f6f7a', '#64646e'], b: ['#7a6f6f', '#6e6464'], wall: 0x55505f, neon: 0x3a3644 } });
const mapFor = (m, l) => m === 'coop' ? LEVELS[l % LEVELS.length] : m === 'pvp' ? ARENA : m === 'pvpd' ? ARENA_DARK : m === 'zombie' ? ZMAP : LOBBY;
const isPvp = () => mode === 'pvp' || mode === 'pvpd';

function totalDmg(id) { let d = myDmg[id] || 0; for (const p of others) { const pr = p.presence; if (pr.gid === gid && pr.ep === ep && Array.isArray(pr.d)) d += +pr.d[id] || 0; } return d; }
function dmgEnemy(e, n) { myDmg[e.id] = (myDmg[e.id] || 0) + n; }

function skinChar(sk, ring, onReady) { // пока модель скина грузится — стоит стартовый пацан
  const ok = G[sk.model] !== undefined; const use = ok && G[sk.model] ? sk : SKINS[0];
  if (!ok) loadModel(sk.model).then(onReady);
  return new Char(use.model, { h: use.h, tint: use.tint, ring, run: use.run, idle: use.idle, noWpn: use.noWpn, ry: use.ry });
}
let shownSkin = 'toon';
function applySkin(id) { // без id — надетый скин; с id — примерка в гардеробе
  shownSkin = id || save.skin; const sk = skinOf(shownSkin); const old = me.ch;
  me.ch = skinChar(sk, 0x3ff3ff, () => { if (shownSkin === sk.id && running) applySkin(sk.id); }); scene.add(me.ch.g);
  if (old) { me.ch.g.position.copy(old.g.position); old.dispose(); }
}
function resetInv() {
  me.slots = mode === 'coop' ? [{ w: 'pistol', ammo: 24 }, null, null] : isPvp() ? [{ w: 'pistol', ammo: 24 }, { w: 'grenade', ammo: 1 }, null] : mode === 'zombie' ? [{ w: 'pistol', ammo: Infinity }, { w: 'grenade', ammo: 2 }, null] : [null, null, null];
  me.sel = 0;
}
function spawnMe(keepInv, first) {
  let sp = lvl.spawns[(isHost ? 0 : 1) % lvl.spawns.length] || [T * 2, T * 2];
  if (isPvp() && first) sp = lvl.spawns[isHost ? 0 : lvl.spawns.length - 1];
  else if (isPvp()) { let best = -1; for (const s of lvl.spawns) { let d = 1e9; for (const m of mates.values()) d = Math.min(d, Math.hypot(m.x - s[0], m.z - s[1])); if (!mates.size) d = Math.random(); if (d > best) { best = d; sp = s; } } }
  me.x = sp[0]; me.z = sp[1]; me.a = Math.PI; me.hp = maxHp(); me.dead = false; me.inv = 1.2; me.revT = 0; me.ex = 0; me.cd = .3; me.respT = 0;
  if (!keepInv) resetInv(); else if (!me.slots.some(s => s && !W[s.w].thr)) me.slots[me.slots.indexOf(null) >= 0 ? me.slots.indexOf(null) : 0] = { w: 'pistol', ammo: 24 };
  me.ch.setDead(false); $('dead').style.display = 'none'; camSnap = true;
}
function enterMode(m, l, newEp, newGid, wv) {
  const same = mode === 'coop' && m === 'coop' && newGid === gid;
  mode = m; L = l | 0; ep = newEp; gid = newGid; phase = 'play'; clearT = 0; wipeT = 0; lastE = null; over = 0; overT = 0; winPeer = ''; coreHp = 100; interT = 0;
  const def = mapFor(m, L);
  loadLevel(def); spawnMe(same, true); lvlT = time;
  if (!same) { score = 0; combo = 0; me.dth = 0; }
  $('lvl').textContent = m === 'coop' ? (L % LEVELS.length + 1) + '/' + LEVELS.length + ' ' + def.name : def.name;
  $('bars').style.display = m === 'zombie' ? 'block' : 'none';
  closeOverlays();
  if (m === 'zombie') { wave = 0; setWave(wv || 1, newEp); }
  else if (m === 'lobby') banner('ХАТА', Net.code ? 'комната ' + Net.code : 'гардероб слева · режимы справа', 2.5);
  else if (m === 'pvp') banner('1 НА 1', 'до 5 фрагов');
  else if (m === 'pvpd') banner('1 НА 1 В ТЕМНОТЕ', 'видно только свой фонарик', 3);
  else banner(def.name, 'зачисти этаж');
}
function setWave(w, newEp) {
  wave = w; ep = newEp; phase = 'play'; lastE = null; spawnT = 1.5; interT = 0;
  clearEnemies(); waveList(w).forEach(([type, hp], i) => enemies.push(makeEnemy(i, type, hp, 0, 0, false)));
  myDmg = new Array(enemies.length).fill(0);
  if (me.dead) { me.dead = false; me.hp = maxHp(); me.inv = 1.5; me.ch.setDead(false); $('dead').style.display = 'none'; const sp = lvl.spawns[isHost ? 0 : 1]; me.x = sp[0]; me.z = sp[1]; }
  banner(w % 5 === 0 ? 'БОСС ИДЁТ' : 'ВОЛНА ' + w, w % 5 === 0 ? 'волна ' + w : 'держи дом', 2.4); sfx(w % 5 === 0 ? 'boss' : 'clear');
}
function hostStart(m) { isHost = true; enterMode(m, 0, 1, (Date.now() % 1e9) + 1, 1); }
let bannerT = 0;
function banner(t, sub, dur = 2.2) { const b = $('banner'); b.textContent = t; if (sub) { const s = document.createElement('small'); s.textContent = sub; b.appendChild(s); } b.style.opacity = 1; bannerT = dur; }

// ---------- ввод ----------
const inp = { mx: 0, mz: 0, ax: 0, az: 0, mag: 0, fire: false, act: false, rel: null, aiming: false };
const keys = {}; let mouseAim = false, mouseDown = false, uiOpen = false; const mouseNDC = new THREE.Vector2();
addEventListener('keydown', e => { if (e.target && e.target.tagName === 'INPUT') return; keys[e.code] = 1; if (e.code === 'KeyE') inp.act = true; if (e.code === 'Digit1') me.sel = 0; if (e.code === 'Digit2') me.sel = 1; if (e.code === 'Digit3') me.sel = 2; if (e.code === 'KeyG') dropSlot(me.sel); });
addEventListener('keyup', e => { keys[e.code] = 0; });
const touchEl = $('touch'); const sticks = { L: null, R: null };
function stickEl(k) { return $(k === 'L' ? 'sL' : 'sR'); }
const ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1);
function mouseGround() { ray.setFromCamera(mouseNDC, cam); return ray.ray.intersectPlane(ground, _v) ? [_v.x - me.x, _v.z - me.z] : null; }
touchEl.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') { mouseAim = true; mouseDown = true; mouseNDC.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight * 2 - 1)); return; }
  const k = e.clientX < innerWidth / 2 ? 'L' : 'R'; if (sticks[k]) return;
  sticks[k] = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0 };
  const el = stickEl(k); el.style.display = 'block'; el.style.left = e.clientX + 'px'; el.style.top = e.clientY + 'px'; el.firstChild.style.transform = '';
  try { touchEl.setPointerCapture(e.pointerId); } catch (_) { }
});
touchEl.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') { mouseAim = true; mouseNDC.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight * 2 - 1)); return; }
  for (const k of ['L', 'R']) { const s = sticks[k]; if (s && s.id === e.pointerId) { let dx = e.clientX - s.x0, dy = e.clientY - s.y0; const d = Math.hypot(dx, dy), R = 55; if (d > R) { dx *= R / d; dy *= R / d; } s.dx = dx / R; s.dy = dy / R; stickEl(k).firstChild.style.transform = `translate(${dx}px,${dy}px)`; } }
});
const up = e => {
  if (e.pointerType === 'mouse') { if (mouseDown) { const g = mouseGround(); if (g) inp.rel = { ax: g[0], az: g[1], dist: Math.hypot(g[0], g[1]) }; } mouseDown = false; return; }
  for (const k of ['L', 'R']) { const s = sticks[k]; if (s && s.id === e.pointerId) { if (k === 'R') { const m = Math.hypot(s.dx, s.dy); if (m > .3) inp.rel = { ax: s.dx, az: s.dy, dist: m * 13 }; } sticks[k] = null; stickEl(k).style.display = 'none'; } }
};
touchEl.addEventListener('pointerup', up); touchEl.addEventListener('pointercancel', up);
touchEl.addEventListener('contextmenu', e => e.preventDefault());
$('act').addEventListener('click', () => { inp.act = true; });
function readInput() {
  let mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), mz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  if (sticks.L) { mx = sticks.L.dx; mz = sticks.L.dy; }
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; } if (ml < .15) { mx = mz = 0; }
  inp.mx = mx; inp.mz = mz; inp.fire = false; inp.aiming = false; inp.dist = 0;
  if (uiOpen) { inp.mx = inp.mz = 0; inp.rel = null; return; }
  if (sticks.R) { const d = Math.hypot(sticks.R.dx, sticks.R.dy); if (d > .2) { inp.ax = sticks.R.dx; inp.az = sticks.R.dy; inp.aiming = true; inp.fire = d > .45; inp.dist = d * 13; } }
  else if (mouseAim) { const g = mouseGround(); if (g) { inp.ax = g[0]; inp.az = g[1]; inp.aiming = true; inp.dist = Math.hypot(g[0], g[1]); } inp.fire = mouseDown; }
  if (keys.Space) inp.fire = true;
}
// слоты инвентаря: тап — выбрать, свайп вверх — выбросить
const slotEls = [0, 1, 2].map(i => $('s' + i));
slotEls.forEach((el, i) => {
  let y0 = 0, down = false;
  el.addEventListener('pointerdown', e => { down = true; y0 = e.clientY; try { el.setPointerCapture(e.pointerId); } catch (_) { } e.stopPropagation(); });
  el.addEventListener('pointermove', e => { if (down) el.style.transform = `translateY(${Math.min(0, Math.max(-46, e.clientY - y0))}px)`; });
  const end = e => { if (!down) return; down = false; el.style.transform = ''; if (e.type === 'pointerup') { if (e.clientY - y0 < -32) dropSlot(i); else me.sel = i; } };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
});
function dropSlot(i) {
  const it = me.slots[i]; if (!it || me.dead) return;
  if (mode === 'zombie' && it.w === 'pistol' && it.ammo === Infinity) { toast('этот пистолет с тобой до конца'); return; }
  me.slots[i] = null; addPickup(me.x + Math.sin(me.a) * 1.2, me.z + Math.cos(me.a) * 1.2, it.w, it.ammo, true); sfx('swing', .5);
}

// ---------- звук ----------
let AC = null, master = null, muted = false, musicOn = false;
let noiseBuf = null, nextBeat = 0, beat = 0;
function initAudio() {
  if (AC) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = .5; master.connect(AC.destination);
    const len = AC.sampleRate * .6; noiseBuf = AC.createBuffer(1, len, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    musicOn = true; nextBeat = AC.currentTime + .1; loadSamples();
  } catch (e) { AC = null; }
}
const SMP = {}; // настоящие сэмплы (ElevenLabs): pistol, shotgun
function loadSamples() {
  for (const k in SND) { try { const bin = atob(SND[k]); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); AC.decodeAudioData(u8.buffer, (b) => { SMP[k] = b; }, () => { }); } catch (e) { } }
}
function playSmp(name, vol, rate, lp) {
  const b = SMP[name]; if (!b) return false; const t = AC.currentTime;
  const n = AC.createBufferSource(); n.buffer = b; n.playbackRate.value = rate * rnd(.96, 1.04); const g = AC.createGain(); g.gain.value = vol; let out = n;
  if (lp) { const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; n.connect(f); out = f; }
  out.connect(g); g.connect(master); n.start(t); return true;
}
function noiseHit(t, type, f0, f1, dur, vol, q = .8) { // шумовой удар/свист с фильтром
  const n = AC.createBufferSource(); n.buffer = noiseBuf; const f = AC.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = AC.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(.03, dur * .3)); g.gain.exponentialRampToValueAtTime(.001, t + dur); n.connect(f); f.connect(g); g.connect(master); n.start(t, rnd(0, .2)); n.stop(t + dur + .02);
}
function tone(t, type, f0, f1, dur, vol) { const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .02); }
const GUN = { pistol: ['pistol', 1, .9], mac10: ['pistol', 1.32, .6], ak: ['pistol', .8, 1], m4: ['pistol', .93, .9], minigun: ['pistol', 1.18, .45], shotgun: ['shotgun', 1, 1] };
function gunSfx(w, vol) { if (!AC || muted) return; const g = GUN[w] || GUN.pistol; if (!playSmp(g[0], g[2] * vol, g[1])) { const t = AC.currentTime; noiseHit(t, 'bandpass', 1800, 500, .12, .5 * vol); tone(t, 'sine', 180, 50, .09, .3 * vol); } }
function sfx(type, vol = 1) {
  if (!AC || muted) return; const t = AC.currentTime;
  if (type === 'boom') { if (!playSmp('shotgun', 1.5 * vol, .36, 1400)) noiseHit(t, 'lowpass', 900, 120, .6, 1 * vol); tone(t, 'sine', 95, 28, .5, .9 * vol); noiseHit(t + .05, 'lowpass', 500, 80, .9, .5 * vol); }
  else if (type === 'boss') { playSmp('shotgun', 1.2 * vol, .17, 700); tone(t, 'sawtooth', 70, 38, 1.3, .25 * vol); noiseHit(t, 'lowpass', 300, 90, 1.4, .5 * vol); }
  else if (type === 'swing') noiseHit(t, 'bandpass', 500, 2600, .16, .5 * vol, 1.6);
  else if (type === 'kill') { noiseHit(t, 'lowpass', 900, 160, .2, .7 * vol); tone(t, 'sine', 120, 45, .18, .5 * vol); }
  else if (type === 'hurt') { tone(t, 'sine', 150, 60, .25, .7 * vol); noiseHit(t, 'lowpass', 600, 200, .18, .4 * vol); }
  else if (type === 'growl') { const o = AC.createOscillator(), f = AC.createBiquadFilter(), g = AC.createGain(), l = AC.createOscillator(), lg = AC.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(rnd(70, 95), t); o.frequency.linearRampToValueAtTime(55, t + .5); f.type = 'lowpass'; f.frequency.value = 420; l.frequency.value = 27; lg.gain.value = 18; l.connect(lg); lg.connect(o.frequency); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.35 * vol, t + .08); g.gain.exponentialRampToValueAtTime(.001, t + .55); o.connect(f); f.connect(g); g.connect(master); o.start(t); l.start(t); o.stop(t + .6); l.stop(t + .6); }
  else if (type === 'fire') { noiseHit(t, 'bandpass', 3000, 900, .12, .5 * vol, 2); noiseHit(t + .08, 'lowpass', 400, 1400, .8, .6 * vol); }
  else if (type === 'pick') { noiseHit(t, 'highpass', 2500, 4000, .05, .3 * vol); tone(t + .05, 'triangle', 500, 700, .08, .25 * vol); }
  else if (type === 'coin') { tone(t, 'sine', 1320, 1320, .09, .25 * vol); tone(t + .08, 'sine', 1760, 1760, .3, .25 * vol); }
  else if (type === 'clear') { for (const [i, f] of [220, 277, 330, 440].entries()) tone(t + i * .09, 'triangle', f, f, .5, .18 * vol); }
}
const BASS = [55, 55, 82.4, 55, 65.4, 65.4, 98, 65.4, 49, 49, 73.4, 49, 61.7, 61.7, 92.5, 61.7];
function music() {
  if (!AC || !musicOn) return;
  const night = theme === 'night', home = theme === 'home';
  if (nextBeat < AC.currentTime - .3) nextBeat = AC.currentTime + .05;
  while (nextBeat < AC.currentTime + .15) {
    const t = nextBeat, step = beat % 64, bar = (step >> 4) % 4;
    if (!muted) {
      if (!home && (night ? (step % 16 === 0 || step % 16 === 3) : step % 4 === 0)) { const o = AC.createOscillator(), g = AC.createGain(); o.frequency.setValueAtTime(night ? 90 : 150, t); o.frequency.exponentialRampToValueAtTime(40, t + .12); g.gain.setValueAtTime(.5, t); g.gain.exponentialRampToValueAtTime(.001, t + .18); o.connect(g); g.connect(master); o.start(t); o.stop(t + .2); }
      if (!night && !home && step % 8 === 4) { const n = AC.createBufferSource(); n.buffer = noiseBuf; const f = AC.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800; const g = AC.createGain(); g.gain.setValueAtTime(.16, t); g.gain.exponentialRampToValueAtTime(.001, t + .12); n.connect(f); f.connect(g); g.connect(master); n.start(t); n.stop(t + .13); }
      if (!night || step % 4 === 0) { const o = AC.createOscillator(), g = AC.createGain(), f = AC.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = BASS[bar * 4 + (step % 4)] * (night ? 1 : step % 2 ? 2 : 1); f.type = 'lowpass'; f.frequency.value = night ? 260 : 500 + 300 * Math.sin(beat * .1); const len = night ? .5 : .11; g.gain.setValueAtTime(home ? .07 : .16, t); g.gain.exponentialRampToValueAtTime(.001, t + len); o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t + len + .02); }
      if (step % 2 === 0 && (!night || step % 16 === 8)) { const o = AC.createOscillator(), g = AC.createGain(); o.type = night ? 'sine' : 'triangle'; o.frequency.value = BASS[bar * 4] * [4, 6, 8, 6, 5, 6, 8, 12][(step >> 1) % 8] * (night ? .5 : 1); g.gain.setValueAtTime(night ? .06 : .035, t); g.gain.exponentialRampToValueAtTime(.001, t + (night ? .9 : .2)); o.connect(g); g.connect(master); o.start(t); o.stop(t + (night ? .92 : .21)); }
    }
    nextBeat += 60 / 118 / 4; beat++;
  }
}
const wake = () => { if (AC && AC.state !== 'running') AC.resume().catch(() => { }); };
addEventListener('touchend', wake); addEventListener('pointerup', wake); document.addEventListener('visibilitychange', () => { if (!document.hidden) { wake(); last = performance.now(); } });
// iOS: никакого зума и резинового скролла поверх игры
for (const ev of ['gesturestart', 'gesturechange', 'dblclick']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => { if (!(e.target.closest && e.target.closest('.panel,#menu,#credits'))) e.preventDefault(); }, { passive: false });
$('mute').addEventListener('click', () => { muted = !muted; $('mute').textContent = muted ? 'ТИХО' : 'ЗВУК'; });

// ---------- бой ----------
function addBullet(x, z, a, enemy, mine, speed, dmg) { if (bullets.length >= NB) bullets.shift(); bullets.push({ x, z, dx: Math.sin(a), dz: Math.cos(a), a, enemy, mine, speed, dmg, life: 1.4 }); }
function fireGun(x, z, a, w, mine, enemy, fast) {
  const d = W[w]; if (!d || !d.pel) return;
  const ox = x + Math.sin(a) * .8, oz = z + Math.cos(a) * .8;
  for (let i = 0; i < d.pel; i++) addBullet(ox, oz, a + rnd(-d.spr, d.spr), enemy, mine, fast ? 46 : 21, d.dmg);
  flash.position.set(x + Math.sin(a), 1.4, z + Math.cos(a)); flash.intensity = 60;
  const dist = Math.hypot(x - me.x, z - me.z);
  gunSfx(w, clamp(1.2 - dist / 28, .1, 1) * (enemy && !fast ? .8 : 1));
}
function useAmmo(it) { it.ammo--; if (it.ammo <= 0) { me.slots[me.sel] = null; const j = me.slots.findIndex(s => s && !W[s.w].thr); if (j >= 0) me.sel = j; else toast('ПАТРОНЫ ВСЁ — бери биту'); } }
function playerAttack() {
  const it = cur(), d = W[it.w]; me.cd = d.rate; me.s = (me.s + 1) % 1000; me.ch.attack();
  if (d.melee) {
    swingFx(me.x, me.z, me.a, 0x3ff3ff); sfx('swing');
    for (const e of enemies) { if (e.dead || e.st === 3) continue; const dx = e.x - me.x, dz = e.z - me.z, dist = Math.hypot(dx, dz); if (dist < 2.5 + e.t.h * .15 && Math.abs(angDiff(Math.atan2(dx, dz), me.a)) < 1.05 && los(me.x, me.z, e.x, e.z)) { dmgEnemy(e, d.dmg); blood(e.x, e.z, 2, .5); shake = .25; } }
    return;
  }
  let a = me.a, best = .2; // лёгкий автоприцел
  for (const e of enemies) { if (e.dead || e.st === 3) continue; const dx = e.x - me.x, dz = e.z - me.z; if (dx * dx + dz * dz > 400) continue; const df = Math.abs(angDiff(Math.atan2(dx, dz), me.a)); if (df < best && los(me.x, me.z, e.x, e.z)) { best = df; a = Math.atan2(dx, dz); } }
  fireGun(me.x, me.z, a, it.w, true, false, true); shake = Math.max(shake, it.w === 'shotgun' ? .35 : .1);
  heardShot(me.x, me.z); useAmmo(it);
}
function throwTarget(ax, az, dist) {
  const l = Math.hypot(ax, az) || 1, dx = ax / l, dz = az / l; let d = clamp(dist, 2.5, 13), ok = 1.2;
  for (let s = 1.2; s <= d; s += .4) { if (isWall(me.x + dx * s, me.z + dz * s)) break; ok = s; }
  return [me.x + dx * ok, me.z + dz * ok, ok];
}
function spawnThrow(type, x0, z0, x1, z1, mine) {
  const m = WPN_MODEL[type](); m.scale.multiplyScalar(1.3); dynGroup.add(m); const d = Math.hypot(x1 - x0, z1 - z0);
  thrown.push({ type, x0, z0, x1, z1, d, t: 0, dur: .42 + d * .035, mine, m });
}
function doThrow(rel) {
  const it = cur(); const [tx, tz] = throwTarget(rel.ax, rel.az, rel.dist);
  me.a = Math.atan2(rel.ax, rel.az); me.cd = .5; me.ch.attack();
  spawnThrow(it.w, me.x, me.z, tx, tz, true); sfx('swing');
  me.thN = (me.thN + 1) % 1000; me.th = [me.thN, THROWS.indexOf(it.w), +me.x.toFixed(1), +me.z.toFixed(1), +tx.toFixed(1), +tz.toFixed(1)];
  it.ammo--; if (it.ammo <= 0) { me.slots[me.sel] = null; const j = me.slots.findIndex(s => s && !W[s.w].thr); if (j >= 0) me.sel = j; }
}
function explode(x, z, mine) {
  const R = 4.8; boomFx(x, z, R); const dm = Math.hypot(x - me.x, z - me.z); shake = Math.max(shake, clamp(1.4 - dm / 14, 0, 1)); sfx('boom', clamp(1.3 - dm / 30, .2, 1));
  if (mine) { for (const e of enemies) { if (e.dead || e.st === 3) continue; const d = Math.hypot(e.x - x, e.z - z); if (d < R + e.t.h * .2) { dmgEnemy(e, Math.round(14 * (1 - d / (R * 1.6)))); blood(e.x, e.z, 2, .6); } } heardShot(x, z); }
  if (isPvp() && dm < R) hurtMe(dm < 2.4 ? 3 : 2);
}
function ignite(x, z, mine) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  for (let i = 0; i < 13; i++) { const a = i / 13 * TAU * 2, r = i === 0 ? 0 : rnd(.6, 2.4); const c = new THREE.Mesh(new THREE.ConeGeometry(rnd(.45, .8), rnd(1.5, 2.8), 5), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff7a1a : 0xffd23f, transparent: true, opacity: .85, depthWrite: false, fog: false })); c.position.set(Math.cos(a) * r, .7, Math.sin(a) * r); c.userData.ph = rnd(0, 9); g.add(c); }
  dynGroup.add(g); blood(x, z, 2, 1, true); fires.push({ x, z, t: 6, tick: 0, mine, g }); sfx('fire', clamp(1.2 - Math.hypot(x - me.x, z - me.z) / 26, .15, 1));
}
function hurtMe(n = 1) {
  if (me.dead || me.inv > 0 || mode === 'lobby') return;
  me.hp -= n; me.inv = isPvp() ? .3 : .7; shake = .5; $('hit').style.opacity = 1; blood(me.x, me.z, 3, .6); sfx('hurt');
  if (me.hp <= 0) { me.hp = 0; me.dead = true; me.ch.setDead(true); blood(me.x, me.z, 6, 1); $('dead').style.display = 'flex'; combo = 0; if (isPvp()) { me.dth++; me.respT = 2.2; } }
}
function enemyAttack(e) {
  if (e.dead || !e.ch) return;
  e.ch.attack();
  if (e.t.boss) { ringFx(e.x, e.z, 5.2, 0xff3c1a, .4); sfx('boom', clamp(1.2 - Math.hypot(me.x - e.x, me.z - e.z) / 30, .2, 1)); shake = Math.max(shake, .6); if (!me.dead && Math.hypot(me.x - e.x, me.z - e.z) < 5) hurtMe(2); return; }
  if (e.t.zombie) { if (hash(time * 60 + e.id) > .6) sfx('growl', clamp(1 - Math.hypot(me.x - e.x, me.z - e.z) / 20, .1, .7)); if (!me.dead && Math.hypot(me.x - e.x, me.z - e.z) < 2.0 + e.t.h * .2) hurtMe(e.type === 'f' ? 2 : 1); return; }
  if (W[e.t.w].melee) { swingFx(e.x, e.z, e.a, 0xff5a3c); sfx('swing', .6); if (!me.dead && Math.hypot(me.x - e.x, me.z - e.z) < 2.2) hurtMe(); }
  else fireGun(e.x, e.z, e.a, e.t.w, false, true, false);
}
function killEnemy(e) {
  e.dead = true; e.rot = e.t.zombie ? 5 : 1e9; if (e.ch) e.ch.setDead(true); blood(e.x, e.z, e.t.boss ? 20 : 7, e.t.boss ? 3 : 1.1); sfx('kill');
  if ((myDmg[e.id] || 0) > 0) { combo++; comboT = 3; score += 100 * Math.min(combo, 20) * (e.t.boss ? 20 : e.type === 'B' || e.type === 'f' ? 3 : 1); shake = Math.max(shake, .3); }
  if (e.t.boss) { boomFx(e.x, e.z, 6); banner('БОСС ПАЛ', '', 2); }
  if (e.t.w && !W[e.t.w].melee) addPickup(e.x, e.z, e.t.w, Math.ceil(W[e.t.w].ammo * .5));
}
function addPickup(x, z, w, ammo, manual) {
  const g = new THREE.Group(); const m = WPN_MODEL[w](); m.scale.multiplyScalar(1.5); m.position.y = .5; g.add(m);
  const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: w === 'ammo' ? 0x7dff5a : W[w].thr ? 0xff7a1a : 0xffe14d, transparent: true, opacity: .8, depthWrite: false, fog: false })); r.position.y = .04; g.add(r);
  g.position.set(x, 0, z); dynGroup.add(g); const p = { x, z, w, ammo, g, manual: !!manual }; pickups.push(p); return p;
}
function removePickup(p) { p.g.parent && p.g.parent.remove(p.g); const i = pickups.indexOf(p); if (i >= 0) pickups.splice(i, 1); for (const s of lvl.spots) if (s.p === p) { s.p = null; s.t = 14; } }
function takePickup(p, force) { // true — подобрал
  if (p.w === 'ammo') { let got = false; for (const s of me.slots) if (s && s.ammo !== Infinity) { s.ammo += W[s.w].thr ? 1 : Math.ceil(W[s.w].ammo * .6); got = true; } if (!got) { const j = me.slots.indexOf(null); if (j >= 0) me.slots[j] = { w: 'mac10', ammo: 60 }; } return true; }
  const same = me.slots.find(s => s && s.w === p.w);
  if (same) { if (same.ammo !== Infinity) same.ammo += p.ammo; return true; }
  if (p.manual && !force) return false;
  const j = me.slots.indexOf(null);
  if (j >= 0) { me.slots[j] = { w: p.w, ammo: p.ammo }; if (!me.slots[me.sel] || (W[cur().w].thr && !W[p.w].thr)) me.sel = j; return true; }
  if (!force) return false;
  const old = me.slots[me.sel]; if (mode === 'zombie' && old.ammo === Infinity) { toast('выбери другой слот'); return false; }
  me.slots[me.sel] = { w: p.w, ammo: p.ammo }; addPickup(me.x, me.z, old.w, old.ammo, true); return true;
}
function spawnCrates(w) {
  const cs = lvl.crates; if (!cs.length) return;
  const put = (i, wp, ammo) => { const [x, z] = cs[i % cs.length]; for (const p of pickups.slice()) if (Math.hypot(p.x - x, p.z - z) < .6) removePickup(p); addPickup(x, z, wp, ammo); };
  put(w, 'ammo', 0);
  const seq = ['mac10', 'shotgun', 'grenade', 'ak', 'molotov', 'minigun', 'm4', 'grenade', 'molotov'][(w - 1) % 9]; put(w + 1, seq, W[seq].ammo);
  if (w % 2 === 0) { const t = w % 4 === 0 ? 'molotov' : 'grenade'; put(w + 2, t, 2); }
  toast('в доме свежие ящики');
}

// ---------- ИИ (только у хоста) ----------
function fieldFor(c, r) {
  const key = r * lvl.w + c; let f = lvl.fields.get(key);
  if (f && time - f.t < .35) return f.d;
  const d = f ? f.d : new Int16Array(lvl.w * lvl.h); d.fill(-1); const q = [key]; d[key] = 0;
  for (let h = 0; h < q.length; h++) { const k = q[h], kc = k % lvl.w, kr = (k / lvl.w) | 0, nd = d[k] + 1; for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nc = kc + dc, nr = kr + dr; if (isSolidT(nc, nr)) continue; const nk = nr * lvl.w + nc; if (d[nk] < 0) { d[nk] = nd; q.push(nk); } } }
  lvl.fields.set(key, { d, t: time }); if (lvl.fields.size > 8) lvl.fields.delete(lvl.fields.keys().next().value);
  return d;
}
function stepToward(e, tx, tz, direct, dt, spd) { // шаг по полю расстояний к цели
  let gx = tx - e.x, gz = tz - e.z;
  const [c, r] = tileOf(e.x, e.z), [tc, tr] = tileOf(tx, tz);
  if (!direct) {
    const f = fieldFor(tc, tr); let bd = f[idx(c, r)]; if (bd < 0) bd = 1e9; let bc = c, br = r;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nc = c + dc, nr = r + dr; if (isSolidT(nc, nr) && !(nc === tc && nr === tr)) continue; if (dc && dr && (isSolidT(c + dc, r) || isSolidT(c, r + dr))) continue;
      const d = f[idx(nc, nr)]; if (d >= 0 && d < bd) { bd = d; bc = nc; br = nr; }
    }
    if (bc !== c || br !== r) { gx = (bc + .5) * T - e.x; gz = (br + .5) * T - e.z; }
  }
  const gl = Math.hypot(gx, gz) || 1, sp = spd * dt; moveEnt(e, gx / gl * sp, gz / gl * sp, .42); e.mv = 1;
  return Math.atan2(gx, gz);
}
function livePlayers() { const out = []; if (!me.dead) out.push(me); for (const m of mates.values()) if (m.alive && m.sameEp) out.push(m); return out; }
const shots = [];
function heardShot(x, z) { shots.push([x, z]); }
function hostWaves(dt) {
  if (over) { overT += dt; if (overT > 6) hostStart('lobby'); return; }
  if (phase === 'clear') { interT -= dt; if (interT <= 0) setWave(wave + 1, ep + 1); return; }
  spawnT -= dt; if (spawnT > 0) return;
  let active = 0; for (const e of enemies) if (!e.dead && e.st !== 3) active++;
  const next = enemies.find(e => e.st === 3); if (!next || active >= (LOW ? 15 : 20)) return;
  const pl = livePlayers(); const far = lvl.zs.filter(([x, z]) => pl.every(p => Math.hypot(p.x - x, p.z - z) > 12)); const pool = far.length ? far : lvl.zs;
  const [sx, sz] = pool[(Math.random() * pool.length) | 0];
  next.x = sx + rnd(-.5, .5); next.z = sz + rnd(-.5, .5); next.st = 1; next.a = Math.atan2(lvl.core[0] - sx, lvl.core[1] - sz); ensureChar(next);
  spawnT = next.t.boss ? 2 : Math.max(.22, 1.1 - wave * .07);
}
function zombieAI(e, dt, pl) {
  let tgt = null, td = 1e9;
  for (const p of pl) { const d = Math.hypot(p.x - e.x, p.z - e.z); if (d < td) { td = d; tgt = p; } }
  const core = lvl.core, cd = Math.hypot(core[0] - e.x, core[1] - e.z);
  const chase = tgt && (e.t.boss ? true : td < 9);
  if (e.t.boss) {
    if (e.st === 2) { e.wind += dt; if (e.wind > .85) { e.q = (e.q + 1) & 63; enemyAttack(e); if (cd < 6) coreHp -= e.t.core; e.st = 1; e.cd = 2.4; e.wind = 0; } return; }
    e.chg -= dt;
    if ((chase && td < 4.2 || !chase && cd < 4.2) && e.cd <= 0) { e.st = 2; e.wind = 0; ringFx(e.x, e.z, 5.2, 0xff3c1a, .85); return; }
  }
  const tx = chase ? tgt.x : core[0], tz = chase ? tgt.z : core[1], d = chase ? td : cd, reach = chase ? 1.6 + e.t.h * .15 : 2.3 + e.t.h * .15;
  if (d < reach) {
    e.a += angDiff(Math.atan2(tx - e.x, tz - e.z), e.a) * Math.min(1, dt * 10); e.wind += dt;
    if (e.wind > .38 && e.cd <= 0 && !e.t.boss) { e.q = (e.q + 1) & 63; enemyAttack(e); if (!chase) coreHp -= e.t.core; e.cd = .95; e.wind = 0; }
  } else {
    e.wind = 0; const direct = chase && td < 6 && los(e.x, e.z, tx, tz);
    const spd = e.t.spd * (e.t.boss && e.chg < 0 ? 2.6 : 1); if (e.t.boss && e.chg < -1.3) e.chg = rnd(5, 8);
    const ga = stepToward(e, tx, tz, direct, dt, spd); e.a += angDiff(ga, e.a) * Math.min(1, dt * 8);
  }
}
function hostAI(dt) {
  const pl = livePlayers();
  for (const e of enemies) {
    if (e.dead || e.st === 3) continue;
    e.cd -= dt; e.think -= dt; e.mv = 0;
    if (e.t.zombie) { zombieAI(e, dt, pl); continue; }
    let tgt = null, td = 1e9;
    for (const p of pl) { const d = Math.hypot(p.x - e.x, p.z - e.z); if (d < td) { td = d; tgt = p; } }
    if (e.st === 0) {
      e.turn -= dt; if (e.turn < 0) { e.turn = rnd(1.5, 4); e.ta = e.a + rnd(-1.5, 1.5); }
      e.a += angDiff(e.ta, e.a) * Math.min(1, dt * 3);
      if (e.think < 0 && time - lvlT > 2.5) {
        e.think = .12;
        for (const p of pl) { const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz); if (d < 13 && (d < 3.2 || Math.abs(angDiff(Math.atan2(dx, dz), e.a)) < 1.75) && los(e.x, e.z, p.x, p.z)) { e.st = 1; break; } }
        for (const s of shots) if (Math.hypot(s[0] - e.x, s[1] - e.z) < 13) e.st = 1;
        if (e.st === 1) { e.aim = -rnd(0, .25); for (const o of enemies) if (!o.dead && o.st === 0 && Math.hypot(o.x - e.x, o.z - e.z) < 7 && los(e.x, e.z, o.x, o.z)) { o.think = rnd(.15, .4); o.st = 1; } }
      }
      continue;
    }
    if (!tgt) { e.aim = 0; e.wind = 0; continue; }
    const dx = tgt.x - e.x, dz = tgt.z - e.z, want = Math.atan2(dx, dz), see = los(e.x, e.z, tgt.x, tgt.z);
    const gun = !W[e.t.w].melee; let go = true;
    if (gun) {
      if (see && td < 14) {
        e.a += angDiff(want, e.a) * Math.min(1, dt * 9); e.aim += dt; go = td > 9;
        if (e.aim > e.t.react && e.cd <= 0 && Math.abs(angDiff(want, e.a)) < .35) {
          e.q = (e.q + 1) & 63; enemyAttack(e); e.cd = e.t.rate;
          if (e.t.burst) { e.burst++; if (e.burst >= e.t.burst) { e.burst = 0; e.cd = .9; } }
        }
      } else e.aim = Math.min(e.aim, 0.15);
    } else {
      if (td < 1.75 + e.t.h * .1 && see) { go = false; e.a += angDiff(want, e.a) * Math.min(1, dt * 12); e.wind += dt; if (e.wind > .26 && e.cd <= 0) { e.q = (e.q + 1) & 63; enemyAttack(e); e.cd = e.type === 'B' ? 1.0 : .75; e.wind = 0; } }
      else e.wind = 0;
    }
    if (go) { const ga = stepToward(e, tgt.x, tgt.z, see && td < 5, dt, e.t.spd); if (!(gun && see && td < 14)) e.a += angDiff(ga, e.a) * Math.min(1, dt * 10); }
  }
  // расталкивание
  for (let i = 0; i < enemies.length; i++) { const a = enemies[i]; if (a.dead || a.st === 3) continue; for (let j = i + 1; j < enemies.length; j++) { const b = enemies[j]; if (b.dead || b.st === 3) continue; const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), rr = .45 * (a.t.h + b.t.h) / 1.9; if (d < rr && d > .001) { const p = (rr - d) / 2; moveEnt(a, -dx / d * p, -dz / d * p, .42); moveEnt(b, dx / d * p, dz / d * p, .42); } } }
  shots.length = 0;
}
function packEnemies() { const E = new Array(enemies.length * 4); enemies.forEach((e, i) => { E[i * 4] = Math.round(e.x * 10); E[i * 4 + 1] = Math.round(e.z * 10); E[i * 4 + 2] = Math.round(((e.a % TAU) + TAU) % TAU * 10); E[i * 4 + 3] = e.st | (e.q << 2); }); return E; }
function applyEnemies(E) {
  if (!Array.isArray(E) || E.length !== enemies.length * 4) return;
  enemies.forEach((e, i) => {
    e.tx = E[i * 4] / 10; e.tz = E[i * 4 + 1] / 10; e.ta = E[i * 4 + 2] / 10; const f = E[i * 4 + 3] | 0; const st = f & 3, q = (f >> 2) & 63;
    if (e.st === 3 && st !== 3) { e.x = e.tx; e.z = e.tz; e.a = e.ta; e.q = q; if (!e.dead) ensureChar(e); }
    if (st === 2 && e.st !== 2 && e.t.boss) ringFx(e.tx, e.tz, 5.2, 0xff3c1a, .85);
    e.st = st;
    if (q !== e.q) { const n = (q - e.q) & 63; e.q = q; if (n > 0 && n < 10 && !e.dead) { e.a = e.ta; if (Math.hypot(e.tx - e.x, e.tz - e.z) < 3) { e.x = e.tx; e.z = e.tz; } enemyAttack(e); } }
  });
}

function litByMe(m) { // тёмный режим: соперника видно только в моём луче (или вплотную, или пока он стреляет/горит)
  const dx = m.x - me.x, dz = m.z - me.z, d = Math.hypot(dx, dz);
  if (d < 2.6) return true; if (m.ch.recoil > .3) return true;
  for (const f of fires) if (Math.hypot(m.x - f.x, m.z - f.z) < 5) return true;
  if (me.dead || d > 27) return false;
  return Math.abs(angDiff(Math.atan2(dx, dz), me.a)) < .56 && los(me.x, me.z, m.x, m.z);
}
// ---------- сеть: синхронизация ----------
let sendT = 0;
function netUpdate(dt) {
  const peers = netPeers(); others = []; hostPeer = null;
  for (const p of peers) { if (p.sameTab) { Net.myId = p.peer; continue; } const pr = p.presence; if (pr && pr.g === 1 && typeof pr.x === 'number' && (!Net.shared || pr.rc === Net.code)) others.push(p); }
  let best = null; // хост — самая старая игра, при равенстве меньший id
  for (const p of others) if (p.presence.H === 1) { if (!best || p.presence.t0 < best.presence.t0 || (p.presence.t0 === best.presence.t0 && p.peer < best.peer)) best = p; }
  if (isHost) { if (best && (best.presence.t0 < t0 || (best.presence.t0 === t0 && best.peer < Net.myId))) isHost = false; }
  if (!isHost) {
    if (best) { hostPeer = best; hostless = 0; t0 = best.presence.t0; }
    else { hostless += dt; if (hostless > 2.2 && others.every(p => Net.myId < p.peer)) { isHost = true; hostless = 0; if (!gid) gid = (Date.now() % 1e9) + 1; toast('ты теперь хост'); } }
  }
  if (hostPeer) {
    const hp = hostPeer.presence;
    if (typeof hp.gid === 'number' && typeof hp.ep === 'number') {
      if (hp.gid !== gid || hp.M !== mode) enterMode(hp.M, hp.L | 0, hp.ep, hp.gid, hp.wv | 0);
      else if (hp.ep !== ep) { if (mode === 'zombie') setWave(hp.wv | 0, hp.ep); else enterMode(hp.M, hp.L | 0, hp.ep, hp.gid); }
      if (hp.E && hp.E !== lastE) { lastE = hp.E; applyEnemies(hp.E); }
      if (typeof hp.cH === 'number') coreHp = hp.cH; interT = hp.it | 0;
      if (hp.ov && !over) { over = hp.ov; gameOverBanner(); }
      if (hp.win && !winPeer) { winPeer = hp.win; pvpEnd(); }
    }
  }
  const seen = new Set();
  for (const p of others) {
    const pr = p.presence; seen.add(p.peer); let m = mates.get(p.peer);
    if (!m) { m = { ch: null, sk: null, x: pr.x, z: pr.z, a: pr.a || 0, s: pr.s | 0, thN: Array.isArray(pr.th) ? pr.th[0] : 0, nick: '', peer: p.peer }; mates.set(p.peer, m); toast((pr.n || 'кент') + ' зашёл'); }
    if (m.sk !== pr.sk || !m.ch) { const sk = skinOf(pr.sk); if (m.ch) m.ch.dispose(); m.sk = pr.sk; m.ch = skinChar(sk, 0xff3fa4, () => { if (m.sk === pr.sk) m.sk = null; }); scene.add(m.ch.g); m.nick = ''; m.tag = null; }
    if (m.nick !== pr.n) { m.nick = String(pr.n || 'кент').slice(0, 12); if (m.tag) m.ch.g.remove(m.tag); m.tag = nameTag(m.nick, '#ff7ad1'); m.tag.position.y = m.ch.h + 1.1; m.ch.g.add(m.tag); }
    m.tx = pr.x; m.tz = pr.z; m.ta = pr.a || 0; m.hp = pr.hp | 0; m.alive = m.hp > 0; m.sameEp = pr.gid === gid && pr.ep === ep; m.w = WPN_MODEL[pr.w] && pr.w !== 'ammo' ? pr.w : 'bat'; m.mv = pr.mv | 0; m.ex = pr.ex | 0; m.dth = pr.dth | 0;
    if (Math.hypot(m.tx - m.x, m.tz - m.z) > 8) { m.x = m.tx; m.z = m.tz; }
    const k = Math.min(1, dt * 14); m.x += (m.tx - m.x) * k; m.z += (m.tz - m.z) * k; m.a += angDiff(m.ta, m.a) * k;
    const sameG = pr.gid === gid;
    if ((pr.s | 0) !== m.s) {
      const n = ((pr.s | 0) - m.s + 1000) % 1000; m.s = pr.s | 0;
      if (sameG && m.alive && n < 20) {
        m.ch.attack();
        if (W[m.w].melee) { swingFx(m.x, m.z, m.ta, 0xff7ad1); sfx('swing', .5); if (isPvp() && !me.dead && Math.hypot(me.x - m.tx, me.z - m.tz) < 2.5 && Math.abs(angDiff(Math.atan2(me.x - m.tx, me.z - m.tz), m.ta)) < 1.05) hurtMe(2); }
        else if (W[m.w].pel) { for (let i = 0; i < Math.min(n, 3); i++) fireGun(m.tx, m.tz, m.ta, m.w, false, isPvp(), true); heardShot(m.x, m.z); }
      }
    }
    if (Array.isArray(pr.th) && pr.th[0] !== m.thN) { m.thN = pr.th[0]; if (sameG && THROWS[pr.th[1]]) { spawnThrow(THROWS[pr.th[1]], +pr.th[2], +pr.th[3], +pr.th[4], +pr.th[5], false); m.ch.attack(); } }
    m.ch.g.visible = sameG && (theme !== 'dark' || litByMe(m)); m.ch.g.position.set(m.x, 0, m.z); m.ch.g.rotation.y = m.a; m.ch.setWeapon(m.w); m.ch.setAnim(m.mv); m.ch.setDead(!m.alive); m.ch.update(dt);
  }
  for (const [k, m] of mates) if (!seen.has(k)) { if (m.ch) m.ch.dispose(); mates.delete(k); toast((m.nick || 'кент') + ' вышел'); }
  sendT -= dt;
  if (sendT <= 0 && Net.room) {
    sendT = .066; const h = isHost;
    netSend({ g: 1, rc: Net.code, n: me.nick, sk: save.skin, x: +me.x.toFixed(2), z: +me.z.toFixed(2), a: +me.a.toFixed(2), hp: me.hp, w: cur().w, s: me.s, mv: me.mv, ex: me.ex, dth: me.dth, th: me.th, gid, ep, d: myDmg.slice(),
      H: h ? 1 : null, t0: h ? t0 : null, M: h ? mode : null, L: h ? L : null, wv: h ? wave : null, cH: h ? Math.max(0, Math.round(coreHp)) : null, it: h ? Math.ceil(Math.max(0, interT)) : null, ov: h && over ? over : null, win: h && winPeer ? winPeer : null, E: h ? packEnemies() : null });
  }
}
function gameOverBanner() { banner(over === 1 ? 'ДОМ ПАЛ' : 'ВСЕХ СОЖРАЛИ', 'продержались до волны ' + wave, 5.5); sfx('boss'); }
function pvpEnd() {
  const win = winPeer === Net.myId; banner(win ? 'ТЫ ЗАТАЩИЛ' : 'КЕНТ ЗАТАЩИЛ', win ? 'красава' : 'реванш в хате', 4.5);
  if (paidGid !== gid) { paidGid = gid; addCoins(win ? 60 : 20, win ? 'победа' : 'за старание'); }
}

// ---------- главный цикл ----------
let camSnap = true, action = null, shopOn = false, shopK = 0, shopSel = ''; const camP = { x: 0, z: 0 };
function update(dt) {
  time += dt;
  readInput();
  const it = cur(), wd = W[it.w];
  me.cd -= dt; me.inv -= dt; me.mv = 0; action = null; arcLine.visible = arcRing.visible = false;
  if (!me.dead) {
    const spd = 7.6 * (wd.slow || 1);
    if (inp.mx || inp.mz) { moveEnt(me, inp.mx * spd * dt, inp.mz * spd * dt); me.mv = 1; }
    if (inp.aiming && (inp.ax || inp.az)) me.a = Math.atan2(inp.ax, inp.az);
    else if (me.mv) me.a += angDiff(Math.atan2(inp.mx, inp.mz), me.a) * Math.min(1, dt * 12);
    if (mode !== 'lobby') {
      if (wd.thr) {
        if (inp.aiming && me.cd <= 0) { // дуга броска
          const [tx, tz, d] = throwTarget(inp.ax, inp.az, inp.dist); const pos = arcLine.geometry.attributes.position;
          for (let i = 0; i < ARC_N; i++) { const t = i / (ARC_N - 1); pos.setXYZ(i, me.x + (tx - me.x) * t, arcY(t, d), me.z + (tz - me.z) * t); }
          pos.needsUpdate = true; arcLine.visible = arcRing.visible = true; arcRing.position.set(tx, .09, tz); arcRing.scale.setScalar(it.w === 'grenade' ? 4.8 : 2.8);
          const col = it.w === 'grenade' ? 0xffe14d : 0xff7a1a; arcLine.material.color.set(col); arcRing.material.color.set(col);
        }
        if (inp.rel && me.cd <= 0) doThrow(inp.rel);
      } else if (inp.fire && me.cd <= 0) playerAttack();
    }
    // подбор
    let near = null;
    for (const p of pickups) if (Math.hypot(p.x - me.x, p.z - me.z) < 1.6) { if (takePickup(p)) { removePickup(p); sfx('pick'); } else near = p; break; }
    if (near) action = { label: 'ВЗЯТЬ ' + W[near.w].name, fn: () => { if (takePickup(near, true)) { removePickup(near); sfx('pick'); } } };
    if (mode === 'lobby') {
      if (lvl.wardrobe && Math.hypot(me.x - lvl.wardrobe[0], me.z - lvl.wardrobe[1]) < 3.2) action = { label: 'ГАРДЕРОБ', fn: openShop };
      else if (lvl.arcade && Math.hypot(me.x - lvl.arcade[0], me.z - lvl.arcade[1]) < 3.2) action = { label: 'РЕЖИМЫ', fn: openModes };
    }
    me.ex = phase === 'clear' && lvl.exit && Math.hypot(me.x - lvl.exit[0], me.z - lvl.exit[1]) < 2.4 ? 1 : 0;
  } else {
    me.ex = 0;
    if (isPvp()) { me.respT -= dt; $('deadS').textContent = 'респ через ' + Math.max(0, me.respT).toFixed(1); if (me.respT <= 0 && !winPeer) spawnMe(false); }
    else {
      let helper = false; for (const m of mates.values()) if (m.alive && m.sameEp && Math.hypot(m.x - me.x, m.z - me.z) < 2) helper = true;
      me.revT = helper ? me.revT + dt : 0;
      $('deadS').textContent = helper ? 'кент поднимает… ' + Math.round(me.revT / 2 * 100) + '%' : (mates.size ? 'кент может поднять — пусть встанет рядом' : mode === 'zombie' ? 'конец…' : 'рестарт…');
      if (me.revT >= 2) { me.dead = false; me.hp = 2; me.inv = 1.5; me.revT = 0; me.ch.setDead(false); $('dead').style.display = 'none'; sfx('pick'); }
    }
  }
  if (inp.act && action) action.fn();
  inp.act = false; inp.rel = null;
  const ab = $('act'); if (action && !uiOpen) { if (ab.textContent !== action.label) ab.textContent = action.label; ab.style.display = 'block'; } else ab.style.display = 'none';
  me.ch.g.position.set(me.x, 0, me.z); me.ch.g.rotation.y = me.a; me.ch.setWeapon(shopOn ? '' : it.w); me.ch.setAnim(shopOn ? (me.ch.bob ? 0 : 1) : me.mv); me.ch.update(dt);
  me.ch.body.visible = me.dead || me.inv <= 0 || Math.floor(time * 18) % 2 === 0;

  netUpdate(dt);
  if (isHost) { if (mode === 'zombie') hostWaves(dt); if (!over) hostAI(dt); }

  // враги
  let alive = 0, boss = null;
  for (const e of enemies) {
    if (!e.dead && e.st !== 3 && totalDmg(e.id) >= e.hp) killEnemy(e);
    if (e.dead) { if (e.ch) { e.rot -= dt; if (e.rot <= 0) { e.ch.dispose(); e.ch = null; } else e.ch.update(dt); } continue; }
    alive++; if (e.st === 3 || !e.ch) continue;
    if (e.t.boss) boss = e;
    if (!isHost) { const k = Math.min(1, dt * 12), ox = e.x, oz = e.z; e.x += (e.tx - e.x) * k; e.z += (e.tz - e.z) * k; e.a += angDiff(e.ta, e.a) * k; e.mv = Math.hypot(e.x - ox, e.z - oz) > dt * 1.0 ? 1 : 0; }
    e.ch.g.position.set(e.x, 0, e.z); e.ch.g.rotation.y = e.a; e.ch.setAnim(e.mv); e.ch.update(dt);
  }
  // фазы режимов
  if (phase === 'play' && alive === 0 && enemies.length && !over) {
    phase = 'clear';
    if (mode === 'coop') { banner('ЭТАЖ ЗАЧИЩЕН', 'вали к тачке →', 3); sfx('clear'); addCoins(30 + 15 * (L % LEVELS.length), 'за этаж'); }
    if (mode === 'zombie') { banner('ВОЛНА ' + wave + ' ОТБИТА', 'лутай ящики в доме', 3); addCoins(10 + 4 * wave + (wave % 5 === 0 ? 100 : 0), wave % 5 === 0 ? 'за босса' : 'за волну'); spawnCrates(wave); if (isHost) { interT = 12; coreHp = Math.min(100, coreHp + 12); } }
  }
  exitMark.visible = mode === 'coop' && phase === 'clear'; if (exitMark.visible) { exitMark.children[0].scale.setScalar(1 + Math.sin(time * 6) * .12); exitMark.children[1].position.y = 2.6 + Math.sin(time * 5) * .3; }
  if (isHost) {
    const team = [...mates.values()].filter(m => m.sameEp);
    if (mode === 'coop') {
      const anyEx = me.ex || team.some(m => m.alive && m.ex);
      if (phase === 'clear' && anyEx) { clearT += dt; if (clearT > .35) { if ((L + 1) % LEVELS.length === 0) { hostStart('lobby'); banner('ГОРОД ВАШ', 'кампания пройдена', 4); addCoins(100, 'за кампанию'); } else enterMode('coop', L + 1, ep + 1, gid); } } else clearT = 0;
      if (me.dead && team.every(m => !m.alive)) { wipeT += dt; if (wipeT > 1.7) enterMode('coop', L, ep + 1, gid); } else wipeT = 0;
    } else if (mode === 'zombie' && !over) {
      if (coreHp <= 0) { over = 1; gameOverBanner(); }
      else if (me.dead && team.every(m => !m.alive)) { wipeT += dt; if (wipeT > 1.5) { over = 2; gameOverBanner(); } } else wipeT = 0;
    } else if (isPvp()) {
      if (!winPeer) { const all = [[Net.myId, me.dth], ...team.map(m => [m.peer, m.dth])]; if (all.some(a => a[1] >= 5)) { all.sort((a, b) => a[1] - b[1]); winPeer = all[0][0]; pvpEnd(); overT = 0; } }
      else { overT += dt; if (overT > 5) hostStart('lobby'); }
    }
  }
  // точки оружия (арена / кампания)
  for (const s of lvl.spots) { if (s.p) continue; s.t -= dt; if (s.t <= 0) { if (s.once) { if (!s.done) { s.done = 1; s.p = addPickup(s.x, s.z, s.once, 2); } } else { const w = ['mac10', 'shotgun', 'ak', 'm4', 'grenade', 'molotov', 'minigun'][(Math.random() * 6.3) | 0]; s.p = addPickup(s.x, s.z, w, W[w].thr ? 2 : W[w].ammo); } } }

  // пули
  const sub = 2;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]; b.life -= dt; let gone = b.life <= 0;
    for (let s = 0; s < sub && !gone; s++) {
      b.x += b.dx * b.speed * dt / sub; b.z += b.dz * b.speed * dt / sub;
      if (isWall(b.x, b.z)) { gone = true; break; }
      if (b.enemy) { if (!me.dead && Math.hypot(b.x - me.x, b.z - me.z) < .55) { hurtMe(1); gone = true; } else if (!isPvp()) for (const m of mates.values()) if (m.alive && Math.hypot(b.x - m.x, b.z - m.z) < .55) { gone = true; break; } }
      else {
        for (const e of enemies) { if (e.dead || e.st === 3) continue; if (Math.hypot(b.x - e.x, b.z - e.z) < .37 * e.t.h) { if (b.mine) { dmgEnemy(e, b.dmg); if (totalDmg(e.id) < e.hp) blood(e.x, e.z, 1, .4); } gone = true; break; } }
        if (!gone && isPvp() && b.mine) for (const m of mates.values()) if (m.alive && Math.hypot(b.x - m.x, b.z - m.z) < .6) { blood(m.x, m.z, 1, .4); gone = true; break; }
      }
    }
    if (gone) bullets.splice(i, 1);
  }
  bulletMesh.count = bullets.length;
  bullets.forEach((b, i) => { _p.set(b.x, 1.15, b.z); _q.setFromAxisAngle(_v.set(0, 1, 0), b.a); _s.set(1, 1, 1); bulletMesh.setMatrixAt(i, _m.compose(_p, _q, _s)); bulletMesh.setColorAt(i, _c.set(b.enemy ? 0xff5a3c : 0xfff27a)); });
  bulletMesh.instanceMatrix.needsUpdate = true; if (bulletMesh.instanceColor) bulletMesh.instanceColor.needsUpdate = true;
  // броски и огонь
  for (let i = thrown.length - 1; i >= 0; i--) {
    const p = thrown[i]; p.t += dt; const t = Math.min(1, p.t / p.dur);
    p.m.position.set(p.x0 + (p.x1 - p.x0) * t, arcY(t, p.d), p.z0 + (p.z1 - p.z0) * t); p.m.rotation.x += dt * 12; p.m.rotation.z += dt * 7;
    if (t >= 1) { dynGroup.remove(p.m); thrown.splice(i, 1); if (p.type === 'grenade') explode(p.x1, p.z1, p.mine); else ignite(p.x1, p.z1, p.mine); }
  }
  for (let i = fires.length - 1; i >= 0; i--) {
    const f = fires[i]; f.t -= dt; f.tick -= dt;
    for (const c of f.g.children) { const k = .75 + Math.sin(time * 14 + c.userData.ph) * .3; c.scale.set(1, k * Math.min(1, f.t), 1); c.position.y = 1.0 * k; }
    if (f.tick <= 0) { f.tick = .35; if (f.mine) for (const e of enemies) if (!e.dead && e.st !== 3 && Math.hypot(e.x - f.x, e.z - f.z) < 2.9) dmgEnemy(e, e.t.boss ? 4 : 2); if (isPvp() && Math.hypot(me.x - f.x, me.z - f.z) < 2.7) hurtMe(1); }
    if (f.t <= 0) { dynGroup.remove(f.g); fires.splice(i, 1); }
  }
  // эффекты
  for (let i = fxs.length - 1; i >= 0; i--) { const s = fxs[i]; s.t -= dt; const k = Math.max(0, s.t / s.dur); s.m.material.opacity = k * s.o; if (s.grow) s.m.scale.setScalar(.2 + (1 - k) * s.grow); if (s.t <= 0) { dynGroup.remove(s.m); s.m.material.dispose(); fxs.splice(i, 1); } }
  for (const p of pickups) { p.g.children[0].rotation.y += dt * 3; p.g.children[0].position.y = .5 + Math.sin(time * 4 + p.x) * .12; }
  flash.intensity *= Math.pow(.0001, dt * 6); if (flash.intensity < .5) flash.intensity = 0;
  if (fires.length && flash.intensity < 30) { flash.position.set(fires[0].x, 1.5, fires[0].z); flash.intensity = 30 + Math.sin(time * 20) * 8; }
  shake = Math.max(0, shake - dt * 1.6);
  if (comboT > 0) { comboT -= dt; if (comboT <= 0) combo = 0; }
  const hit = $('hit'); if (hit.style.opacity > 0) hit.style.opacity = Math.max(0, hit.style.opacity - dt * 2.5);
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').style.opacity = 0; }
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').style.opacity = 0; }
  if (theme === 'neon') scene.background.setHSL((.86 + Math.sin(time * .35) * .12) % 1, .75, .16 + Math.sin(time * 2.1) * .015);
  // фонарики
  if (theme === 'night' || theme === 'dark') {
    const who = theme === 'dark' ? [me] : [me, ...mates.values()]; // в темноте у каждого на экране только свой фонарик
    selfLight.position.set(me.x, 2.2, me.z);
    torches.forEach((s, i) => { const p = who[i]; const on = p && (p === me ? !me.dead : p.alive); s.intensity = on ? 420 : 0; if (on) { s.position.set(p.x, 2.4, p.z); s.target.position.set(p.x + Math.sin(p.a) * 9, .4, p.z + Math.cos(p.a) * 9); } });
    if (theme === 'night') houseLight.intensity = 110 + Math.sin(time * 9) * 6 + (coreHp < 30 ? Math.sin(time * 30) * 40 : 0);
  }
  // камера
  const asp = cam.aspect, half = (asp > 1 ? 12.5 : 8.5) * (mode === 'zombie' ? 1.15 : mode === 'lobby' ? .8 : 1); const dist = clamp(half / (Math.tan(cam.fov * Math.PI / 360) * asp), mode === 'lobby' ? 15 : 19.5, 46);
  const lead = me.dead || mode === 'lobby' ? 0 : 2.2; const tx = me.x + Math.sin(me.a) * lead, tz = me.z + Math.cos(me.a) * lead;
  if (camSnap) { camP.x = tx; camP.z = tz; camSnap = false; }
  camP.x += (tx - camP.x) * Math.min(1, dt * 5); camP.z += (tz - camP.z) * Math.min(1, dt * 5);
  const sx = (Math.random() - .5) * shake * 1.2, sz = (Math.random() - .5) * shake * 1.2;
  shopK += ((shopOn ? 1 : 0) - shopK) * Math.min(1, dt * 4.5); if (shopK < .002) shopK = 0;
  const k = shopK * shopK * (3 - 2 * shopK), side = asp > 1 ? -.8 : -.55, ch = me.ch.h; // в гардеробе камера подлетает к персонажу
  const cd = asp > 1 ? ch * 2.55 : ch * 4.6;
  cam.position.set(camP.x + sx + (me.x + side - camP.x) * k, dist * .9 + (ch * .62 - dist * .9) * k, camP.z + dist * .44 + sz + (me.z + cd - camP.z - dist * .44) * k);
  cam.lookAt(camP.x + sx + (me.x + side - camP.x) * k, ch * .5 * k, camP.z + sz + (me.z - camP.z) * k); if (theme === 'neon') cam.rotateZ(Math.sin(time * .6) * .025);
  if (shopOn) me.a += dt * .9;

  music();
  hud(boss, alive);
}
let hudKey = '';
function hud(boss, alive) {
  const it = cur();
  const key = [me.hp, me.sel, me.slots.map(s => s ? s.w + s.ammo : '-').join(), score, combo, mode, wave, alive, interT | 0, me.dth, Math.round(coreHp), boss ? Math.round(totalDmg(boss.id) / boss.hp * 50) : -1, [...mates.values()].map(m => m.nick + m.hp + m.dth).join(), Net.code, phase].join('|');
  if (key !== hudKey) {
    hudKey = key; const mh = maxHp();
    $('hp').textContent = mode === 'lobby' ? '' : '♥'.repeat(Math.max(0, me.hp)) + '♡'.repeat(Math.max(0, mh - me.hp));
    $('wpn').textContent = mode === 'lobby' ? (Net.code ? 'КОМНАТА ' + Net.code : 'СОЛО') : W[it.w].name;
    const ms = [...mates.values()];
    $('score').textContent = mode === 'coop' ? score : mode === 'zombie' ? (phase === 'clear' && !over ? 'ВОЛНА ' + (wave + 1) + ' ЧЕРЕЗ ' + (interT | 0) : 'ВОЛНА ' + wave + ' · ' + alive) : isPvp() ? 'ТЫ ' + ms.reduce((a, m) => a + m.dth, 0) + ' : ' + me.dth : '';
    $('combo').textContent = mode === 'coop' && combo > 1 ? 'КОМБО ×' + combo : mode === 'zombie' ? 'очки ' + score : '';
    $('mate').textContent = ms.map(m => m.nick + ' ' + (mode === 'lobby' ? '' : m.alive ? '♥'.repeat(m.hp) : '✖')).join('  ');
    slotEls.forEach((el, i) => { const s = me.slots[i]; el.className = 'slot' + (i === me.sel ? ' on' : '') + (s ? '' : ' empty'); el.firstChild.textContent = s ? W[s.w].name : 'БИТА'; el.lastChild.textContent = s ? (s.ammo === Infinity ? '∞' : s.ammo) : ''; });
    $('slots').style.display = mode === 'lobby' ? 'none' : 'grid';
    if (mode === 'zombie') { $('coreF').style.width = clamp(coreHp, 0, 100) + '%'; $('bossB').style.display = boss ? 'block' : 'none'; if (boss) $('bossF').style.width = clamp(100 - totalDmg(boss.id) / boss.hp * 100, 0, 100) + '%'; }
  }
  const ar = $('arrow'); let show = false; // стрелка на напарника за экраном
  for (const m of mates.values()) {
    if (!m.ch || !m.ch.g.visible || theme === 'dark') continue; _v.set(m.x, 1, m.z).project(cam);
    if (Math.abs(_v.x) > .95 || Math.abs(_v.y) > .95 || _v.z > 1) {
      const ang = Math.atan2(_v.x, _v.y), r = Math.max(Math.abs(_v.x), Math.abs(_v.y)); const nx = _v.x / r * .86, ny = _v.y / r * .86;
      ar.style.left = ((nx + 1) / 2 * innerWidth - 11) + 'px'; ar.style.top = ((1 - ny) / 2 * innerHeight - 11) + 'px'; ar.style.transform = `rotate(${ang}rad)`; show = true; break;
    }
  }
  ar.style.display = show ? 'block' : 'none';
}
let last = 0, fAcc = 0, fN = 0;
function frame(t) {
  requestAnimationFrame(frame); const raw = (t - last) / 1000 || .016, dt = Math.min(.066, raw); last = t;
  if (!running) return;
  update(dt); renderer.render(scene, cam);
  if (raw < .5) { fAcc += raw; fN++; if (fAcc > 2.5) { const fps = fN / fAcc; fAcc = fN = 0; if (fps < 42 && pxr > 1) { pxr = Math.max(1, pxr - .25); renderer.setPixelRatio(pxr); resize(); } } } // тормозит — снижаем разрешение
}

// ---------- оверлеи: гардероб, режимы, пауза ----------
function closeOverlays() { for (const id of ['shop', 'modes', 'pause']) $(id).style.display = 'none'; uiOpen = false; if (shopOn) { shopOn = false; if (me.ch && shownSkin !== save.skin) applySkin(); me.a = Math.PI; } }
function openOverlay(id) { closeOverlays(); $(id).style.display = 'flex'; uiOpen = true; }
function btn(text, fn, cls) { const b = document.createElement('button'); b.className = 'mbtn' + (cls ? ' ' + cls : ''); b.textContent = text; b.addEventListener('click', fn); return b; }
function openShop() { shopSel = save.skin; openOverlay('shop'); shopOn = true; renderShop(); }
function renderShop() {
  const box = $('shopL'); box.textContent = ''; $('shopC').textContent = '◎ ' + save.coins;
  for (const s of SKINS) {
    const own = owns(s.id);
    const b = btn(s.name, () => { shopSel = s.id; applySkin(s.id); renderShop(); }, 'sk' + (s.id === shopSel ? ' on' : '') + (own ? '' : ' lock'));
    const t = document.createElement('em'); t.textContent = save.skin === s.id ? '✓' : own ? '' : '◎' + s.price; b.appendChild(t);
    box.appendChild(b);
  }
  const s = skinOf(shopSel), own = owns(s.id), on = save.skin === s.id, a = $('shopA');
  $('shopN').textContent = s.name;
  a.textContent = on ? 'НАДЕТО' : own ? 'НАДЕТЬ' : save.coins >= s.price ? 'КУПИТЬ ◎ ' + s.price : 'НЕ ХВАТАЕТ ◎ ' + (s.price - save.coins);
  a.className = 'mbtn' + (on ? ' off' : own ? ' join' : save.coins >= s.price ? ' buy' : ' off');
}
$('shopA').addEventListener('click', () => {
  const s = skinOf(shopSel), own = owns(s.id);
  if (save.skin === s.id) return;
  if (!own && !FREE_SKINS) { if (save.coins < s.price) { toast('не хватает ' + (s.price - save.coins) + ' ◎'); return; } save.coins -= s.price; save.owned.push(s.id); sfx('coin'); toast(s.name + ' — твой'); }
  save.skin = s.id; persist(); if (shownSkin !== s.id) applySkin(); renderShop();
});
function openModes() {
  const box = $('modesL'); box.textContent = '';
  if (!isHost) { const d = document.createElement('div'); d.className = 'note'; d.textContent = 'режим выбирает хост комнаты'; box.appendChild(d); }
  else {
    box.appendChild(btn('КАМПАНИЯ · кооп, 4 этажа', () => hostStart('coop')));
    box.appendChild(btn('ЗОМБИ · оборона дома', () => hostStart('zombie')));
    for (const [mm, label] of [['pvp', '1 НА 1 · до 5 фрагов'], ['pvpd', '1 НА 1 В ТЕМНОТЕ · только фонарики']]) { const pv = btn(label, () => { if (!mates.size) { toast('нужен кент в комнате'); return; } hostStart(mm); }); if (!mates.size) pv.classList.add('off'); box.appendChild(pv); }
  }
  openOverlay('modes');
}
$('menuB').addEventListener('click', () => {
  const box = $('pauseL'); box.textContent = '';
  if (isHost && mode !== 'lobby') box.appendChild(btn('В ХАТУ (лобби)', () => hostStart('lobby')));
  if (SA && Net.code) box.appendChild(btn('ПОЗВАТЬ КЕНТА (ссылка)', () => {
    const url = location.origin + location.pathname + '?room=' + Net.code;
    if (navigator.share) navigator.share({ title: 'КЕНТЫ', text: 'Залетай в комнату ' + Net.code, url }).catch(() => { });
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast('ссылка скопирована'), () => toast(url));
  }, 'join'));
  box.appendChild(btn('ВЫЙТИ ИЗ КОМНАТЫ', leaveRoom));
  const d = document.createElement('div'); d.className = 'note'; d.textContent = Net.code ? 'код комнаты: ' + Net.code : 'соло, сети нет'; box.appendChild(d);
  openOverlay('pause');
});
for (const b of document.querySelectorAll('.close')) b.addEventListener('click', closeOverlays);

// ---------- меню и комнаты ----------
function roomsList() { const seen = new Map(); for (const p of basePeers()) { if (p.sameTab) continue; const pr = p.presence; if (pr && typeof pr.rc === 'string' && /^\d{4}$/.test(pr.rc) && !seen.has(pr.rc)) seen.set(pr.rc, String(pr.n || 'кент').slice(0, 12)); } return seen; }
let roomsKey = '';
function netStatus() {
  if (running) return;
  const el = $('net');
  if (Net.state === 'wait') el.textContent = 'сеть: подключаюсь…';
  else if (Net.state === 'off') el.textContent = 'сеть недоступна — можно играть соло. Вдвоём: откройте страницу под аккаунтами Claude';
  else el.textContent = SA ? 'сеть: напрямую между телефонами · заходи по коду' : 'сеть: ок';
  const rooms = roomsList(), key = [...rooms].join();
  if (key !== roomsKey) { roomsKey = key; const box = $('rooms'); box.textContent = ''; for (const [code, n] of rooms) box.appendChild(btn('ВОЙТИ К ' + n + ' · ' + code, () => enterRoom(code, false), 'join')); }
}
setInterval(netStatus, 500);
let entering = false;
async function enterRoom(code, create) {
  if (running || entering) return; entering = true;
  me.nick = ($('nick').value.trim() || 'игрок').slice(0, 12);
  try { localStorage.setItem('kenty-nick', me.nick); } catch (e) { }
  initAudio();
  try { const el = document.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen || (() => { })).call(el).catch(() => { }); } catch (e) { }
  $('menu').style.display = 'none';
  Net.code = ''; Net.room = null; Net.shared = false;
  if (Net.base) {
    Net.code = code;
    try { if (SA) { $('net').textContent = 'подключаюсь к комнате ' + code + '…'; $('menu').style.display = 'grid'; } Net.room = await Net.base.join('k' + code, !!create); } catch (e) { console.warn('join', e && (e.code || e.type)); Net.room = Net.base; Net.shared = true; if (SA) { Net.code = ''; toast('сеть не поднялась — играешь соло'); } }
    if (!Net.shared) Net.base.presence({ rc: code, n: me.nick }).catch(() => { });
  }
  $('menu').style.display = 'none';
  applySkin();
  t0 = Date.now(); isHost = !!create || !Net.room; hostless = 0; gid = 0;
  if (isHost) enterMode(Q.get('mode') || 'lobby', +Q.get('lvl') || 0, 1, (Date.now() % 1e9) + 1, 1);
  else { enterMode('lobby', 0, 0, 0, 1); banner('ЗАХОЖУ…', 'комната ' + code, 2); }
  running = true; entering = false;
}
function leaveRoom() {
  closeOverlays(); running = false;
  try { if (Net.room && Net.room !== Net.base && Net.room.leave) Net.room.leave(); else if (Net.room) Net.room.presence({ g: null, H: null, E: null }); if (Net.base) Net.base.presence({ rc: null }); } catch (e) { }
  Net.room = null; Net.code = '';
  for (const m of mates.values()) if (m.ch) m.ch.dispose(); mates.clear(); others = [];
  $('menu').style.display = 'grid'; $('dead').style.display = 'none';
}
$('create').addEventListener('click', () => enterRoom(String(1000 + Math.floor(Math.random() * 9000)), true));
$('joinB').addEventListener('click', () => { const c = $('code').value.trim(); if (!/^\d{4}$/.test(c)) { $('net').textContent = 'код — это 4 цифры'; return; } enterRoom(c, false); });
$('cb').addEventListener('click', () => {
  const c = $('credits'); c.textContent = '';
  const h = document.createElement('h3'); h.textContent = '3D-модели со Sketchfab (CC BY 4.0)'; c.appendChild(h);
  for (const [, title, author, uid] of CREDITS.concat(SKIN_CREDITS)) { const p = document.createElement('div'); const a = document.createElement('a'); a.href = 'https://sketchfab.com/3d-models/' + uid; a.target = '_blank'; a.rel = 'noopener'; a.textContent = title; p.appendChild(a); p.appendChild(document.createTextNode(' — ' + author)); c.appendChild(p); }
  const b = btn('НАЗАД', () => { c.style.display = 'none'; }); c.appendChild(b);
  c.style.display = 'block';
});
try { $('nick').value = localStorage.getItem('kenty-nick') || ''; } catch (e) { }
if (/^\d{4}$/.test(Q.get('room') || '')) $('code').value = Q.get('room');

initNet(); initSave();
loadModels(p => { $('create').textContent = 'ГРУЗИМ ' + Math.round(p * 100) + '%'; }).then(() => {
  $('create').disabled = false; $('joinB').disabled = false; $('create').textContent = 'СОЗДАТЬ КОМНАТУ';
  window.__g = { SMP, sfx, gunSfx, SKINS, skinChar, scene, loadModel, step: (n, dt = .033) => { for (let i = 0; i < n; i++) update(dt); }, setWave: (w) => setWave(w, ep + 1), dropSlot, me, enemies, mates, pickups, bullets, fires, thrown, Net, save, enterRoom, hostStart, addPickup, addCoins, openShop, openModes, dmgEnemy, inp, keys, cam, G, W, lvl: () => lvl,
    get mode() { return mode; }, get L() { return L; }, get ep() { return ep; }, get gid() { return gid; }, get isHost() { return isHost; }, get phase() { return phase; }, get wave() { return wave; }, get coreHp() { return coreHp; }, set coreHp(v) { coreHp = v; }, get over() { return over; }, get interT() { return interT; }, set interT(v) { interT = v; } };
  if (Q.get('auto')) { $('nick').value = Q.get('auto'); enterRoom(Q.get('rc') || '1234', !Q.get('join')); }
  window.__ready = true;
});
requestAnimationFrame(frame);
