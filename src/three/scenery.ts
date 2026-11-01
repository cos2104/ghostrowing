// 장소별 배경: Kenney(CC0) 3D 모델을 강둑을 따라 배치한다.
// 같은 모델은 InstancedMesh로 묶어 그려서 태블릿에서도 가볍게.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Track } from './track';

export type Theme = 'lake' | 'city' | 'countryside' | 'brick' | 'grandloop';

const BASE = `${import.meta.env.BASE_URL}assets/kenney3d/`;
const loader = new GLTFLoader();

interface ModelSpec {
  file: string;
  /** 높이(h) 또는 폭(w) 기준 크기 (m) */
  size: { h?: number; w?: number };
}

interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  local: THREE.Matrix4;
}

const cache = new Map<string, Promise<{ parts: Part[]; box: THREE.Box3 }>>();

function loadModel(file: string) {
  let p = cache.get(file);
  if (!p) {
    p = loader.loadAsync(BASE + file).then((gltf) => {
      gltf.scene.updateMatrixWorld(true);
      const parts: Part[] = [];
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          // Kenney 재질은 금속성이 있어 하늘이 비쳐 색이 바래 보인다 → 무광으로
          for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
            const sm = mat as THREE.MeshStandardMaterial;
            if (sm.isMeshStandardMaterial) {
              const hsl = { h: 0, s: 0, l: 0 };
              sm.color.getHSL(hsl);
              if (file.startsWith('nature/') && hsl.h > 0.3 && hsl.h < 0.55) sm.color.setHSL(0.29, Math.min(0.55, hsl.s), hsl.l * 0.55);
              else if (file.startsWith('nature/') && (hsl.h < 0.12 || hsl.h > 0.9) && hsl.l > 0.5) sm.color.setHSL(0.07, 0.4, 0.3);
              sm.metalness = 0;
              sm.roughness = Math.max(sm.roughness, 0.85);
              sm.envMapIntensity = 0.3;
            }
          }
          parts.push({ geometry: m.geometry, material: m.material, local: m.matrixWorld.clone() });
        }
      });
      return { parts, box: new THREE.Box3().setFromObject(gltf.scene) };
    });
    cache.set(file, p);
  }
  return p;
}

/** 간단한 결정적 난수 (코스마다 같은 배치) */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Placement {
  x: number;
  z: number;
  rot: number;
  scale: number; // 크기 배율 (spec 기준 대비)
}

const TREES: ModelSpec[] = [
  { file: 'nature/tree_default.glb', size: { h: 11 } },
  { file: 'nature/tree_oak.glb', size: { h: 13 } },
  { file: 'nature/tree_detailed.glb', size: { h: 12 } },
  { file: 'nature/tree_fat.glb', size: { h: 10 } },
  { file: 'nature/tree_tall.glb', size: { h: 15 } },
  { file: 'nature/tree_default_dark.glb', size: { h: 12 } },
  { file: 'nature/tree_oak_dark.glb', size: { h: 14 } },
];
const PINES: ModelSpec[] = [
  { file: 'nature/tree_pineRoundA.glb', size: { h: 14 } },
  { file: 'nature/tree_pineTallA.glb', size: { h: 18 } },
  { file: 'nature/tree_cone.glb', size: { h: 13 } },
];
const BUSH: ModelSpec = { file: 'nature/plant_bushLarge.glb', size: { h: 2.5 } };
const TOWERS: ModelSpec[] = ['a', 'b', 'c', 'd', 'e'].map((k) => ({ file: `city/building-skyscraper-${k}.glb`, size: { h: 95 } }));
const BLOCKS: ModelSpec[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n'].map((k) => ({
  file: `city/building-${k}.glb`,
  size: { w: 26 },
}));
const HOUSES: ModelSpec[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'].map((k) => ({
  file: `suburb/building-type-${k}.glb`,
  size: { w: 14 },
}));
const GRANDSTAND: ModelSpec = { file: 'racing/grandStandCovered.glb', size: { w: 34 } };
const BANNER: ModelSpec[] = [
  { file: 'racing/bannerTowerRed.glb', size: { h: 7 } },
  { file: 'racing/bannerTowerGreen.glb', size: { h: 7 } },
];

export class Scenery {
  readonly group = new THREE.Group();
  private placements = new Map<ModelSpec, Placement[]>();

  constructor(
    private track: Track,
    private waterHalf: number,
    private theme: Theme,
    private range: { from: number; to: number },
    private quality: 'high' | 'low',
  ) {
    this.plan();
  }

  private add(spec: ModelSpec, d: number, offset: number, r: () => number, opts: { face?: boolean; scale?: number } = {}) {
    const f = this.frameAt(d, offset);
    const rot = opts.face ? -f.heading + (offset > 0 ? Math.PI : 0) : r() * Math.PI * 2;
    const list = this.placements.get(spec) ?? [];
    list.push({ x: f.x, z: f.z, rot, scale: opts.scale ?? 0.8 + r() * 0.45 });
    this.placements.set(spec, list);
  }

  private frameAt(d: number, off: number) {
    const t = this.track;
    if (t.loop || (d >= 0 && d <= t.length)) return t.frame(d, off);
    const e = t.frame(d < 0 ? 0 : t.length, off);
    const x = d < 0 ? d : d - t.length;
    return { x: e.x + Math.cos(e.heading) * x, z: e.z + Math.sin(e.heading) * x, heading: e.heading };
  }

  /** 테마에 맞춰 배치 계획 */
  private plan() {
    const r = rng(this.theme.length * 9973 + 17);
    const W = this.waterHalf;
    const { from, to } = this.range;
    const dense = this.quality === 'high' ? 1 : 0.55;
    const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)];
    const segTheme = (d: number): Theme => {
      if (this.theme !== 'grandloop') return this.theme;
      const L = this.track.length;
      const u = (((d % L) + L) % L) / L;
      return u < 0.3 ? 'lake' : u < 0.55 ? 'city' : u < 0.8 ? 'countryside' : 'brick';
    };

    // 물가 나무 띠 (양쪽)
    for (const side of [-1, 1]) {
      for (let d = from; d < to; d += 9 / dense) {
        const th = segTheme(d);
        if (th === 'city' && r() < 0.6) continue;
        const off = side * (W + 6 + r() * 22);
        this.add(th === 'lake' && r() < 0.35 ? pick(PINES) : pick(TREES), d + r() * 6, off, r);
        if (r() < 0.25) this.add(BUSH, d + r() * 8, side * (W + 3 + r() * 4), r);
      }
    }
    // 뒤쪽 숲·건물 띠
    for (const side of [-1, 1]) {
      for (let d = from; d < to; d += 1) {
        const th = segTheme(d);
        if (th === 'lake' || th === 'countryside') {
          if (r() < 0.07 * dense) this.add(r() < 0.5 ? pick(PINES) : pick(TREES), d, side * (W + 45 + r() * 220), r, { scale: 1 + r() * 0.6 });
        }
        if (th === 'city') {
          if (r() < 0.018 * dense) this.add(pick(TOWERS), d, side * (W + 230 + r() * 420), r, { face: true, scale: 0.7 + r() * 0.9 });
          if (r() < 0.02 * dense) this.add(pick(BLOCKS), d, side * (W + 110 + r() * 110), r, { face: true, scale: 0.8 + r() * 0.4 });
        }
        if (th === 'brick') {
          if (r() < 0.03 * dense) this.add(pick(BLOCKS), d, side * (W + 90 + r() * 140), r, { face: true, scale: 0.6 + r() * 0.4 });
          if (r() < 0.02 * dense) this.add(pick(TREES), d, side * (W + 35 + r() * 20), r);
        }
        if (th === 'countryside' && r() < 0.012 * dense) this.add(pick(HOUSES), d, side * (W + 40 + r() * 60), r, { face: true });
      }
    }
    // 결승 근처 관중석·광고판 (직선 코스: 결승 쪽 강둑 한쪽)
    const t = this.track;
    const finish = t.loop ? 0 : t.length;
    const standSide = 1;
    for (let k = 0; k < 4; k++) this.add(GRANDSTAND, finish - 30 - k * 38, standSide * (W + 22), r, { face: true, scale: 1 });
    for (let k = 0; k < 8; k++) this.add(BANNER[k % 2], finish - 150 + k * 25, -standSide * (W + 6), r, { face: true, scale: 1 });
  }

  /** 모델을 불러와 InstancedMesh로 만든다 */
  async build() {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    // 모든 모델을 동시에 불러오고, 도착하는 대로 배치
    await Promise.all(
      [...this.placements].map(async ([spec, list]) => {
        let model;
        try {
          model = await loadModel(spec.file);
        } catch (e) {
          console.warn('모델 로드 실패', spec.file, e);
          return;
        }
        const size = model.box.getSize(new THREE.Vector3());
        const base = spec.size.h ? spec.size.h / size.y : spec.size.w! / Math.max(size.x, size.z);
        const minY = model.box.min.y;
        for (const part of model.parts) {
          const inst = new THREE.InstancedMesh(part.geometry, part.material, list.length);
          list.forEach((p, i) => {
            const s = base * p.scale;
            q.setFromAxisAngle(up, p.rot);
            m.compose(new THREE.Vector3(p.x, 0.7 - minY * s, p.z), q, new THREE.Vector3(s, s, s)).multiply(part.local);
            inst.setMatrixAt(i, m);
          });
          inst.frustumCulled = false;
          this.group.add(inst);
        }
      }),
    );
    this.addHills();
    this.addBoards();
    return this.group;
  }

  /** 결승 앞 강둑 광고판 (자체 문구) */
  private addBoards() {
    const texts = ['GHOST ROWING', 'ROW YOUR BEST', 'CONCEPT2 PM5 READY', 'BEAT YOUR GHOST'];
    const colors = ['#1e5bd8', '#0f1419', '#c53030', '#0d7a5f'];
    const finish = this.track.loop ? 0 : this.track.length;
    for (let k = 0; k < 12; k++) {
      const d = finish - 320 + k * 26;
      const f = this.frameAt(d, this.waterHalf + 7);
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 96;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = colors[k % 4];
      ctx.fillRect(0, 0, 512, 96);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 54px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(texts[k % 4], 256, 50);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const board = new THREE.Mesh(new THREE.PlaneGeometry(22, 4), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      board.position.set(f.x, 2.8, f.z);
      board.rotation.y = -f.heading + Math.PI;
      this.group.add(board);
    }
  }

  /** 멀리 보이는 산 (안개에 묻히는 큰 원뿔) */
  private addHills() {
    if (this.theme === 'city') return;
    const r = rng(42);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3f5a3a, roughness: 1, flatShading: true });
    const geo = new THREE.ConeGeometry(1, 1, 7);
    const { from, to } = this.range;
    const n = 26;
    const inst = new THREE.InstancedMesh(geo, mat, n * 2);
    const m = new THREE.Matrix4();
    let i = 0;
    for (const side of [-1, 1]) {
      for (let k = 0; k < n; k++) {
        const d = from + ((to - from) * (k + r())) / n;
        const f = this.frameAt(d, side * (this.waterHalf + 900 + r() * 900));
        const h = 120 + r() * 260;
        const w = 500 + r() * 600;
        m.compose(new THREE.Vector3(f.x, h / 2 - 5, f.z), new THREE.Quaternion(), new THREE.Vector3(w, h, w));
        inst.setMatrixAt(i++, m);
      }
    }
    this.group.add(inst);
  }
}
