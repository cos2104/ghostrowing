// 3D 경기장: 물·하늘·조명·강둑·레인 부표·표지판·출발/결승 시설.
import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import type { Track } from './track';

export interface WorldOptions {
  track: Track;
  lanes: number;
  laneWidth: number;
  /** 직선 코스: 레이스 거리 (출발선 = 길이 - 거리). 순환: 무시 */
  raceDistance: number;
  quality: 'high' | 'low';
  /** 강둑 색 */
  grass?: number;
}

const BASE = import.meta.env.BASE_URL;

export class World {
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;
  readonly sun = new THREE.Vector3();
  private water: Water | null = null;
  readonly waterHalf: number; // 코스 중심선에서 강둑까지 (m)
  private disposables: { dispose(): void }[] = [];
  readonly startD: number;
  readonly finishD: number;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly opts: WorldOptions,
  ) {
    const { track, lanes, laneWidth, quality } = opts;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === 'high', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.shadowMap.enabled = false; // 인스턴스 배경과 충돌하고 효과도 작아서 끔

    this.waterHalf = (lanes * laneWidth) / 2 + 45;
    this.finishD = track.loop ? opts.raceDistance : track.length;
    this.startD = track.loop ? 0 : track.length - opts.raceDistance;

    this.scene.fog = new THREE.Fog(0xc4d3e2, 1200, 4200);
    this.addSky();
    this.addLights();
    this.addWater(quality);
    this.addBanks(opts.grass ?? 0x557f3a);
    this.addBuoys();
    this.addLaneMarkers();
    if (!track.loop) {
      this.addStartPontoons();
      this.addGate(this.startD, 'START', 0x2b6cb0);
      this.addGate(this.finishD, 'FINISH', 0xc53030);
    } else {
      this.addGate(0, 'START · FINISH', 0x2b6cb0);
    }
    this.addDistanceBoards();
  }

  /**
   * 하늘: Poly Haven 실사 하늘(CC0, "Kloofendal 48d Partly Cloudy Pure Sky").
   * 배경은 4K JPG, 조명·반사용 환경광은 1K HDR. 불러오기 전까지는 Sky 셰이더로 대신 그린다.
   */
  private addSky() {
    // 하늘 사진 속 태양 위치 (equirect u=0.602, 위에서 v=0.234 → 고도 약 48도)
    const u = 0.602;
    const vTop = 0.234;
    const elev = (0.5 - vTop) * Math.PI;
    const az = (u - 0.5) * Math.PI * 2;
    this.sun.set(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev)).normalize();

    const sky = new Sky();
    sky.scale.setScalar(10000);
    const su = sky.material.uniforms;
    su.turbidity.value = 4;
    su.rayleigh.value = 1.2;
    su.sunPosition.value.copy(this.sun);
    this.scene.add(sky);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.disposables.push(pmrem);
    const big = this.opts.quality === 'high';
    new THREE.TextureLoader().load(`${BASE}assets/polyhaven/sky_${big ? '4k' : '2k'}.jpg`, (tex) => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.scene.background = tex;
      this.scene.backgroundIntensity = 1;
      this.scene.remove(sky);
      this.disposables.push(tex);
    });
    new HDRLoader().load(`${BASE}assets/polyhaven/sky_1k.hdr`, (hdr) => {
      const rt = pmrem.fromEquirectangular(hdr);
      this.scene.environment = rt.texture;
      this.scene.environmentIntensity = 0.6;
      hdr.dispose();
      this.disposables.push(rt);
    });
  }

  private addLights() {
    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x5a6b3a, 0.9));
    const dir = new THREE.DirectionalLight(0xfff2dd, 2.2);
    dir.position.copy(this.sun).multiplyScalar(300);
    dir.castShadow = false;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.left = -30;
    dir.shadow.camera.right = 30;
    dir.shadow.camera.top = 30;
    dir.shadow.camera.bottom = -30;
    this.scene.add(dir, dir.target);
    this.sunLight = dir;
  }
  sunLight!: THREE.DirectionalLight;

  /** 그림자 범위를 카메라 주변으로 옮긴다 */
  followShadow(x: number, z: number) {
    this.sunLight.position.set(x + this.sun.x * 300, this.sun.y * 300, z + this.sun.z * 300);
    this.sunLight.target.position.set(x, 0, z);
  }

  private addWater(quality: 'high' | 'low') {
    const size = 8000;
    const geo = new THREE.PlaneGeometry(size, size);
    const tex = new THREE.TextureLoader().load(`${BASE}assets/three/waternormals.jpg`, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
    });
    if (quality === 'high') {
      const water = new Water(geo, {
        textureWidth: 512,
        textureHeight: 512,
        waterNormals: tex,
        sunDirection: this.sun.clone(),
        sunColor: 0xffffff,
        waterColor: 0x2c5a63,
        distortionScale: 0.45,
        fog: true,
      });
      water.rotation.x = -Math.PI / 2;
      (water.material as THREE.ShaderMaterial).uniforms.size.value = 14;
      this.water = water;
      this.scene.add(water);
    } else {
      const m = new THREE.MeshStandardMaterial({ color: 0x3b6e78, roughness: 0.25, metalness: 0.1, normalMap: tex });
      tex.repeat.set(400, 400);
      const w = new THREE.Mesh(geo, m);
      w.rotation.x = -Math.PI / 2;
      this.scene.add(w);
    }
    this.disposables.push(geo, tex);
  }

  /** 코스 양쪽 강둑: 중심선을 따라가는 띠 모양 땅 */
  private addBanks(grass: number) {
    const { track } = this.opts;
    const inner = this.waterHalf;
    const outer = inner + 700;
    const step = 10;
    const extra = track.loop ? 0 : 600; // 직선 코스 앞뒤로 연장
    const from = -extra;
    const to = track.loop ? track.length : track.length + extra;
    const mat = new THREE.MeshStandardMaterial({ color: grass, roughness: 0.95 });
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x9a9a92, roughness: 0.9 });
    for (const side of [-1, 1]) {
      const pos: number[] = [];
      const edge: number[] = [];
      for (let d = from; d <= to + 0.01; d += step) {
        const fi = track.loop ? track.frame(d, side * inner) : frameExt(track, d, side * inner);
        const fo = track.loop ? track.frame(d, side * outer) : frameExt(track, d, side * outer);
        const fe = track.loop ? track.frame(d, side * (inner - 3)) : frameExt(track, d, side * (inner - 3));
        pos.push(fi.x, 0.6, fi.z, fo.x, 0.9, fo.z);
        edge.push(fe.x, -0.3, fe.z, fi.x, 0.62, fi.z);
      }
      this.scene.add(stripMesh(pos, mat, side < 0), stripMesh(edge, edgeMat, side < 0));
    }
    this.disposables.push(mat, edgeMat);
  }

  /** 레인 경계 부표: 출발·결승 근처 250m는 주황 큰 공, 나머지는 노랑 작은 공 */
  private addBuoys() {
    const { track, lanes, laneWidth } = this.opts;
    const spacing = 12.5;
    const positions: { x: number; z: number; big: boolean }[] = [];
    const from = track.loop ? 0 : Math.max(0, this.startD - 30);
    const to = track.loop ? track.length - spacing : this.finishD;
    for (let b = 0; b <= lanes; b++) {
      const off = (b - lanes / 2) * laneWidth;
      for (let d = from; d <= to; d += spacing) {
        const f = track.frame(d, off);
        const big = !track.loop && (d - this.startD < 250 || this.finishD - d < 250);
        positions.push({ x: f.x, z: f.z, big });
      }
    }
    const make = (big: boolean, color: number, r: number) => {
      const list = positions.filter((p) => p.big === big);
      if (!list.length) return;
      const geo = new THREE.SphereGeometry(r, 12, 8);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      const m = new THREE.Matrix4();
      list.forEach((p, i) => mesh.setMatrixAt(i, m.makeTranslation(p.x, r * 0.35, p.z)));
      this.scene.add(mesh);
      this.disposables.push(geo, mat);
    };
    make(false, 0xf2c200, 0.16);
    make(true, 0xff5a1f, 0.32);
  }

  /** 출발선·결승선 위를 가로지르는 줄 */
  private addLaneMarkers() {
    const { track, lanes, laneWidth } = this.opts;
    const lines = track.loop ? [0] : [this.startD, this.finishD];
    for (const d of lines) {
      const a = track.frame(d, (-lanes / 2) * laneWidth);
      const b = track.frame(d, (lanes / 2) * laneWidth);
      const geo = new THREE.BoxGeometry(0.12, 0.03, Math.hypot(b.x - a.x, b.z - a.z));
      const mat = new THREE.MeshBasicMaterial({ color: d === this.finishD && !track.loop ? 0xff3b5c : 0xffffff });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set((a.x + b.x) / 2, 0.03, (a.z + b.z) / 2);
      mesh.rotation.y = -a.heading;
      this.scene.add(mesh);
    }
  }

  private addStartPontoons() {
    const { track, lanes, laneWidth } = this.opts;
    const mat = new THREE.MeshStandardMaterial({ color: 0x6d7680, roughness: 0.8 });
    const walk = new THREE.MeshStandardMaterial({ color: 0x2f6fd6, roughness: 0.7 });
    for (let i = 0; i < lanes; i++) {
      const off = (i + 0.5 - lanes / 2) * laneWidth;
      const f = track.frame(this.startD - 6.5, off);
      const p = new THREE.Mesh(new THREE.BoxGeometry(5, 0.35, 0.9), mat);
      p.position.set(f.x, 0.1, f.z);
      p.rotation.y = -f.heading;
      this.scene.add(p);
    }
    // 폰툰을 잇는 파란 통로
    const a = track.frame(this.startD - 9.5, (-lanes / 2) * laneWidth - 6);
    const b = track.frame(this.startD - 9.5, (lanes / 2) * laneWidth + 6);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, Math.hypot(b.x - a.x, b.z - a.z)), walk);
    bridge.position.set((a.x + b.x) / 2, 0.15, (a.z + b.z) / 2);
    bridge.rotation.y = -a.heading;
    this.scene.add(bridge);
  }

  /** 출발·결승 게이트: 양쪽 탑 + 물 위를 가로지르는 현수막 */
  private addGate(d: number, label: string, color: number) {
    const { track, lanes, laneWidth } = this.opts;
    const half = (lanes / 2) * laneWidth + 8;
    const towerMat = new THREE.MeshStandardMaterial({ color: 0xe9edf2, roughness: 0.6 });
    for (const s of [-1, 1]) {
      const f = track.frame(d, s * half);
      const t = new THREE.Mesh(new THREE.BoxGeometry(1.2, 9, 1.2), towerMat);
      t.position.set(f.x, 4.5, f.z);
      this.scene.add(t);
    }
    const a = track.frame(d, -half);
    const b = track.frame(d, half);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const tex = textTexture(label, color, 2048, 128, 76);
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 1.8, len),
      [0, 1, 2, 3, 4, 5].map((i) =>
        i === 0 || i === 1 ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }) : new THREE.MeshStandardMaterial({ color }),
      ),
    );
    banner.position.set((a.x + b.x) / 2, 8.4, (a.z + b.z) / 2);
    banner.rotation.y = -a.heading;
    this.scene.add(banner);
  }

  /** 강둑 위 거리 표지판: 직선은 250m마다(출발 기준), 순환은 500m마다 */
  private addDistanceBoards() {
    const { track } = this.opts;
    const step = track.loop ? 500 : 250;
    const from = track.loop ? step : this.startD + step;
    const to = track.loop ? track.length - 1 : this.finishD - 1;
    for (let d = from; d < to; d += step) {
      const label = String(Math.round(d - (track.loop ? 0 : this.startD)));
      for (const s of [-1, 1]) {
        const f = track.frame(d, s * (this.waterHalf + 4));
        const tex = textTexture(label, 0x1a1d21, 512, 256, 180, '#ffffff');
        const board = new THREE.Mesh(
          new THREE.PlaneGeometry(6, 3),
          new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }),
        );
        board.position.set(f.x, 3.2, f.z);
        // 물 쪽(코스 중심)을 바라보게
        board.rotation.y = -f.heading + (s > 0 ? Math.PI : 0);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2), new THREE.MeshStandardMaterial({ color: 0x444444 }));
        post.position.set(f.x, 1.2, f.z);
        this.scene.add(board, post);
      }
    }
  }

  render(camera: THREE.Camera, dtSec: number) {
    if (this.water) (this.water.material as THREE.ShaderMaterial).uniforms.time.value += dtSec * 0.6;
    this.renderer.render(this.scene, camera);
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mm of mats) {
        for (const v of Object.values(mm)) if (v instanceof THREE.Texture) v.dispose();
        mm.dispose();
      }
    });
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
  }
}

/** 직선 트랙을 양 끝 밖으로 연장 */
function frameExt(track: Track, d: number, off: number) {
  if (d >= 0 && d <= track.length) return track.frame(d, off);
  const edge = track.frame(d < 0 ? 0 : track.length, off);
  const extra = d < 0 ? d : d - track.length;
  return { x: edge.x + Math.cos(edge.heading) * extra, z: edge.z + Math.sin(edge.heading) * extra, heading: edge.heading };
}

/** [안쪽, 바깥쪽] 쌍이 이어진 정점 배열로 띠 메시 */
function stripMesh(pos: number[], mat: THREE.Material, flip: boolean) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const idx: number[] = [];
  const n = pos.length / 6;
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    if (flip) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

export function textTexture(text: string, bg: number, w: number, h: number, size: number, fg = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = `#${bg.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.font = `bold ${size}px system-ui, 'Noto Sans KR', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + size * 0.05);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
