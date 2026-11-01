// 3D 레이스 화면: 경기장 + 배 + 중계 카메라.
import * as THREE from 'three';
import { drawFlag, type Country } from '../countries';
import { Scenery, type Theme } from './scenery';
import { Crowd } from './crowd';
import type { HumanModel } from './human';
import { Scull } from './scull';
import { GRAND_LOOP, LoopTrack, StraightTrack, type Track } from './track';
import { World } from './world';

export interface Boat3D {
  id: string;
  name: string;
  country: Country;
  lane: number; // 1부터
  ghost?: boolean;
  me?: boolean;
  /** 유니폼 색 (없으면 국가색) */
  shirt?: number;
  /** 선수 캐릭터 */
  human?: HumanModel;
  /** 사실적 모델 유니폼 텍스처 이름 (blue·green·red·white) */
  uniform?: string;
}

export interface BoatState {
  d: number; // 레이스 거리 (m)
  spm: number;
}

export type CameraMode = 'auto' | 'side' | 'face' | 'aerial';
type Shot = 'start' | 'side' | 'face' | 'aerial' | 'finish';

export interface RaceViewOptions {
  theme: Theme;
  loop: boolean;
  raceDistance: number; // 순환 무제한이면 Infinity
  boats: Boat3D[];
  quality: 'high' | 'low';
}

const LANE_W = 13.5;

export class RaceView3D {
  readonly track: Track;
  readonly world: World;
  readonly lanes: number;
  private camera = new THREE.PerspectiveCamera(40, 1, 0.5, 7000);
  private boats = new Map<string, { def: Boat3D; scull: Scull }>();
  private cards: THREE.Object3D[] = [];
  private shot: Shot = 'start';
  private shotSince = 0;
  cameraMode: CameraMode = 'auto';
  private raf = 0;
  private last = performance.now();
  private resizeObs: ResizeObserver;
  private state: Record<string, BoatState> = {};
  private phase: 'countdown' | 'racing' | 'finished' = 'countdown';
  private clockSec = 0;
  ready: Promise<void>;
  private crowd: Crowd | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private opts: RaceViewOptions,
  ) {
    this.track = opts.loop ? new LoopTrack(GRAND_LOOP) : new StraightTrack(2000);
    this.lanes = opts.loop ? 4 : 6;
    const raceDistance = opts.loop ? (Number.isFinite(opts.raceDistance) ? opts.raceDistance : 0) : opts.raceDistance;
    this.world = new World(canvas, {
      track: this.track,
      lanes: this.lanes,
      laneWidth: LANE_W,
      raceDistance,
      quality: opts.quality,
    });

    for (const b of opts.boats) {
      const scull = new Scull(
        { hull: b.ghost ? 0xdfe6ee : b.lane % 2 ? 0xf2f2f0 : 0xf3d23a, shirt: b.shirt ?? b.country.kit, cap: 0xffffff, blade: b.country.kit },
        { ghost: b.ghost },
      );
      this.world.scene.add(scull.group);
      this.boats.set(b.id, { def: b, scull });
      scull.useHuman(b.human ?? 'rb_male', b.shirt ?? b.country.kit, b.uniform).catch((e) => console.warn('선수 캐릭터 로드 실패', e));
      this.state[b.id] = { d: 0, spm: 0 };
    }
    this.addLaneCards();

    const range = opts.loop ? { from: 0, to: this.track.length } : { from: -400, to: 2400 };
    const scenery = new Scenery(this.track, this.world.waterHalf, opts.loop ? 'grandloop' : opts.theme, range, opts.quality);
    this.ready = scenery.build().then((g) => {
      this.world.scene.add(g);
    });
    // 관중: 결승 앞 관중석 쪽 강둑과 출발 폰툰 옆 (가벼운 화질에서는 생략)
    if (opts.quality === 'high') {
      const W = this.world.waterHalf;
      const spots: { d: number; offset: number }[] = [];
      const fin = this.world.finishD || this.track.length;
      if (opts.loop) {
        for (let k = 0; k < 14; k++) spots.push({ d: 10 + k * 5, offset: (k % 2 ? 1 : -1) * (W + 4 + (k % 3) * 2) });
      } else {
        for (let k = 0; k < 24; k++) spots.push({ d: fin - 110 + k * 5 + (k % 2) * 1.5, offset: W + 4 + (k % 3) * 2.2 });
        for (let k = 0; k < 8; k++) spots.push({ d: this.world.startD - 12 + k * 3.5, offset: -(W + 4 + (k % 2) * 2) });
      }
      this.crowd = new Crowd(this.track, spots);
      this.crowd.build().then((g) => this.world.scene.add(g)).catch((e) => console.warn('관중 로드 실패', e));
    }

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  private laneOffset(lane: number) {
    return (lane - 0.5 - this.lanes / 2) * LANE_W;
  }

  /** 레이스 거리 → 트랙 거리 */
  private trackD(d: number) {
    return this.world.startD + d;
  }

  /** 출발선 앞 물 위에 떠 있는 레인 카드 (번호·국기·코드·이름) */
  private addLaneCards() {
    for (const { def } of this.boats.values()) {
      const c = document.createElement('canvas');
      c.width = 1024;
      c.height = 256;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = def.ghost ? 'rgba(40,60,80,0.75)' : 'rgba(20,45,75,0.92)';
      roundRect(ctx, 8, 8, 1008, 240, 110);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'italic bold 150px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(def.lane), 70, 132);
      drawFlag(ctx, def.country, 210, 58, 210, 140);
      ctx.font = 'bold 120px system-ui, sans-serif';
      ctx.fillText(def.country.code, 455, 110);
      ctx.font = 'bold 58px system-ui, sans-serif';
      ctx.fillStyle = '#cfe3ff';
      ctx.fillText(def.ghost ? `${def.name}` : def.name, 460, 200);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const card = new THREE.Mesh(
        new THREE.PlaneGeometry(11, 2.75),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }),
      );
      const f = this.track.frame(this.trackD(0) + 16, this.laneOffset(def.lane));
      card.position.set(f.x, 0.15, f.z);
      card.rotation.x = -Math.PI / 2;
      card.rotation.z = -f.heading + Math.PI / 2;
      this.world.scene.add(card);
      this.cards.push(card);
    }
  }

  setPhase(phase: 'countdown' | 'racing' | 'finished') {
    this.phase = phase;
  }

  setState(id: string, s: BoatState) {
    this.state[id] = s;
  }

  setClock(sec: number) {
    this.clockSec = sec;
  }

  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;

    let me: BoatState | null = null;
    const ds: number[] = [];
    for (const [id, b] of this.boats) {
      const st = this.state[id];
      const f = this.track.frame(this.trackD(st.d), this.laneOffset(b.def.lane));
      b.scull.group.position.set(f.x, 0, f.z);
      b.scull.group.rotation.y = -f.heading;
      b.scull.update(dt, this.phase === 'racing' ? st.spm : 0);
      if (b.def.me) me = st;
      ds.push(st.d);
    }
    // 출발 후 몇 초 뒤 레인 카드 숨김
    const showCards = this.phase === 'countdown' || this.clockSec < 4;
    for (const c of this.cards) c.visible = showCards;

    this.direct(now / 1000, me?.d ?? 0, ds);
    this.crowd?.update(now / 1000, this.trackD(Math.max(...ds)));
    this.world.render(this.camera, dt);
    this.raf = requestAnimationFrame(this.frame);
  };

  /** 중계 카메라 연출 */
  private direct(t: number, myD: number, ds: number[]) {
    const lead = Math.max(...ds);
    const trail = Math.min(...ds);
    const focus = lead - trail < 60 ? (lead + trail) / 2 : myD;
    const finite = Number.isFinite(this.opts.raceDistance) && this.opts.raceDistance > 0;
    const toFinish = finite ? this.opts.raceDistance - lead : Infinity;

    let want: Shot;
    if (this.cameraMode !== 'auto') want = this.cameraMode;
    else if (this.phase === 'countdown' || this.clockSec < 3) want = 'start';
    else if (!this.track.loop && (toFinish < 70 || this.phase === 'finished')) want = 'finish';
    else {
      // 30초 주기: 측면 20초 → 근접 6초 → 측면 → 500m마다 공중 4초
      const cyc = this.clockSec % 30;
      want = cyc > 20 && cyc < 26 ? 'face' : 'side';
      const sinceMark = myD % 500;
      if (myD > 100 && sinceMark < 25) want = 'aerial';
    }
    if (want !== this.shot) {
      this.shot = want;
      this.shotSince = t;
    }

    const cam = this.camera;
    const tr = this.track;
    const at = (d: number, off: number, y: number) => {
      const f = tr.frame(this.trackD(d), off);
      return new THREE.Vector3(f.x, y, f.z);
    };
    const meBoat = [...this.boats.values()].find((b) => b.def.me);
    const myLane = meBoat ? this.laneOffset(meBoat.def.lane) : 0;
    const midLane = [...this.boats.values()].reduce((s, b) => s + this.laneOffset(b.def.lane), 0) / Math.max(1, this.boats.size);

    switch (this.shot) {
      case 'start': {
        cam.fov = 42;
        cam.position.copy(at(-38, (this.lanes / 2) * LANE_W + 22, 17));
        cam.lookAt(at(24, -LANE_W, 0));
        break;
      }
      case 'side': {
        // 강둑에서 약간 뒤쪽 비스듬히: 정면 측면이면 가까운 노가 수직 막대처럼 보인다
        cam.fov = 12;
        cam.position.copy(at(focus - 24, -this.world.waterHalf + 12, 6.5));
        cam.lookAt(at(focus + 1.5, midLane, 0.5));
        break;
      }
      case 'face': {
        cam.fov = 48;
        cam.position.copy(at(myD - 6.2, myLane - 1.1, 1.45));
        cam.lookAt(at(myD - 0.2, myLane, 0.75));
        break;
      }
      case 'aerial': {
        cam.fov = 40;
        cam.position.copy(at(focus - 17, midLane - 8, 9.5));
        cam.lookAt(at(focus + 5, midLane, 0));
        break;
      }
      case 'finish': {
        // 결승선 옆 탑에서 다가오는 배를 비스듬히
        cam.fov = 30;
        const finishRace = this.opts.raceDistance;
        cam.position.copy(at(finishRace + 4, -(this.lanes / 2) * LANE_W - 14, 7));
        cam.lookAt(at(Math.min(focus, finishRace) - 6, midLane, 0.5));
        break;
      }
    }
    cam.updateProjectionMatrix();
    this.world.followShadow(cam.position.x, cam.position.z);
  }

  /** 현재 화면 이름 (HUD 표시용) */
  get currentShot() {
    return this.shot;
  }

  private resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.world.resize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    for (const b of this.boats.values()) b.scull.dispose();
    this.crowd?.dispose();
    this.world.dispose();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
