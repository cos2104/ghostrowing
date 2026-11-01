// 1인승 경기정(싱글 스컬)과 선수를 코드로 만든다. 노 젓기 동작은 스트로크레이트에 맞춰 움직인다.
// 배 로컬 좌표: +x = 뱃머리(진행 방향), y = 위, z = 오른쪽(스트로크사이드). 선수는 뒤(-x, 선미)를 보고 앉는다.
import * as THREE from 'three';
import { Human, type HumanModel } from './human';

export interface ScullStyle {
  hull: number; // 선체 색
  shirt: number; // 선수 유니폼 색
  cap: number;
  blade: number; // 노 블레이드 색 (국가색)
  skin?: number;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

/** 2관절 IK: root에서 target까지 길이 l1, l2 뼈, pole 방향으로 관절을 굽힌다 */
function ik(root: THREE.Vector3, target: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3) {
  const dirV = target.clone().sub(root);
  let d = dirV.length();
  d = Math.min(Math.max(d, 1e-4), l1 + l2 - 1e-4);
  dirV.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const perp = pole.clone().sub(dirV.clone().multiplyScalar(pole.dot(dirV))).normalize();
  return root.clone().add(dirV.multiplyScalar(a)).add(perp.multiplyScalar(h));
}

/** 길이 1, y축 방향 원기둥을 a→b 사이에 놓는다 */
function place(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  const d = b.clone().sub(a);
  const len = d.length();
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, d.normalize());
  mesh.scale.set(1, len, 1);
}

const ease = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)));
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

// 치수 (m)
const PIN_X = -0.22;
const PIN_Y = 0.33;
const PIN_Z = 0.8;
const INBOARD = 0.9; // 손잡이가 몸 앞에서 조금 겹친다 (겹칠 때 왼손이 위)
const OUTBOARD = 1.95; // 핀에서 블레이드 중심까지
const FOOT = V(-0.55, 0.12, 0);
const SEAT_Y = 0.2;
const SEAT_CATCH = -0.16;
const SEAT_FINISH = 0.4;
const THIGH = 0.46;
const SHIN = 0.46;
const TORSO = 0.55;
const UPPER_ARM = 0.31;
const FOREARM = 0.31;
const CATCH_ANGLE = (66 * Math.PI) / 180; // 캐치: 노가 뱃머리 쪽으로 배와 거의 나란히
const FINISH_ANGLE = (-48 * Math.PI) / 180; // 피니시: 노가 선미 쪽으로 깊게

export class Scull {
  readonly group = new THREE.Group();
  private parts: Record<string, THREE.Mesh> = {};
  private phase = 0; // 0~1 스트로크 위치
  private materials: THREE.Material[] = [];
  private human: Human | null = null;
  private ghost = false;
  private lastSpm = 0;
  private resting = true;
  private joints = {
    hip: V(0, 0, 0),
    lean: 0,
    hand: { L: V(0, 0, 0), R: V(0, 0, 0) },
    /** 손잡이에서 노받이 쪽(바깥) 방향, 배 로컬 */
    shaft: { L: V(0, 0, 1), R: V(0, 0, -1) },
  };

  constructor(style: ScullStyle, opts: { ghost?: boolean } = {}) {
    this.ghost = !!opts.ghost;
    const skin = style.skin ?? 0xe0ac8a;
    const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...extra });
      if (opts.ghost) {
        m.transparent = true;
        m.opacity = 0.42;
        m.depthWrite = false;
      }
      this.materials.push(m);
      return m;
    };
    const cyl = (r: number, m: THREE.Material, seg = 8) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, seg), m);

    // 선체: 길고 가는 타원체 + 덱 + 앞뒤 끝 표식
    const hullMat = mat(style.hull, { roughness: 0.35 });
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 10), hullMat);
    hull.scale.set(4.1, 0.1, 0.15);
    hull.position.y = 0.02;
    const deck = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xf4f4f0));
    deck.scale.set(4.0, 0.035, 0.14);
    deck.position.y = 0.1;
    // 콕핏 (선수가 앉는 곳)
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.02, 0.24), mat(0x2a2a2a));
    cockpit.position.set(0.0, 0.12, 0);
    const bowBall = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), mat(0xffffff));
    bowBall.position.set(4.08, 0.1, 0);
    this.group.add(hull, deck, cockpit, bowBall);

    // 리거
    const rigMat = mat(0x333840, { metalness: 0.6, roughness: 0.4 });
    for (const s of [-1, 1]) {
      const r1 = cyl(0.012, rigMat);
      place(r1, V(PIN_X + 0.15, 0.11, 0.12 * s), V(PIN_X, PIN_Y, PIN_Z * s));
      const r2 = cyl(0.012, rigMat);
      place(r2, V(PIN_X - 0.25, 0.11, 0.12 * s), V(PIN_X, PIN_Y, PIN_Z * s));
      this.group.add(r1, r2);
    }

    // 슬라이드 레일·발판·시트
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.02, 0.16), mat(0x999999, { metalness: 0.5 }));
    rail.position.set(0.15, 0.15, 0);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.24), mat(0x222222));
    foot.position.copy(FOOT).add(V(-0.03, 0.03, 0));
    foot.rotation.z = -0.6;
    this.group.add(rail, foot);
    this.parts.seat = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.26), mat(0x222222));
    this.group.add(this.parts.seat);

    // 노 (좌우)
    const shaftMat = mat(0x1d1f22, { roughness: 0.3 });
    const bladeMat = mat(style.blade, { roughness: 0.4, side: THREE.DoubleSide });
    for (const s of ['L', 'R']) {
      this.parts[`shaft${s}`] = cyl(0.018, shaftMat);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.008, 0.22), bladeMat);
      this.parts[`blade${s}`] = blade;
      this.group.add(this.parts[`shaft${s}`], blade);
    }

    // 선수
    const shirt = mat(style.shirt);
    const skinM = mat(skin);
    const shorts = mat(0x1b1b1f);
    this.parts.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.32, 4, 10), shirt);
    this.parts.torso.scale.set(1, 1, 1.25);
    this.parts.head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 10), skinM);
    this.parts.cap = new THREE.Mesh(new THREE.SphereGeometry(0.112, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(style.cap));
    this.parts.visor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.01, 0.16), mat(style.cap));
    this.parts.hips = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), shorts);
    this.parts.hips.scale.set(1, 0.7, 1.25);
    for (const s of ['L', 'R']) {
      this.parts[`thigh${s}`] = cyl(0.075, shorts);
      this.parts[`shin${s}`] = cyl(0.055, skinM);
      this.parts[`upper${s}`] = cyl(0.05, shirt);
      this.parts[`fore${s}`] = cyl(0.042, skinM);
      this.parts[`hand${s}`] = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), skinM);
    }
    for (const k of ['torso', 'head', 'cap', 'visor', 'hips', 'thighL', 'thighR', 'shinL', 'shinR', 'upperL', 'upperR', 'foreL', 'foreR', 'handL', 'handR'])
      this.group.add(this.parts[k]);

    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !opts.ghost) {
        o.castShadow = true;
      }
    });
    this.pose(0, true);
  }

  /**
   * 시간 진행. spm 0이면 피니시 자세로 노를 물에 눕히고 쉰다.
   * 드라이브 비율은 실제처럼 스트로크레이트가 높을수록 커진다.
   */
  update(dtSec: number, spm: number) {
    if (spm > 0) {
      this.phase = (this.phase + (dtSec * spm) / 60) % 1;
      this.pose(this.phase, false, spm);
    } else {
      this.phase = 0.999; // 다음 스트로크는 캐치 직전부터
      this.pose(0, true);
    }
    this.applyHuman();
  }

  /** Quaternius 캐릭터로 선수 교체 (불러오는 동안은 기본 몸) */
  async useHuman(model: HumanModel, shirt: number, uniform = 'blue') {
    const h = await Human.create(model, 1.82);
    if (h.realistic) await h.setUniform(uniform);
    else {
      h.recolor('Body', shirt);
      h.recolor('Legs', 0x16161a);
    }
    if (this.ghost) h.setGhost(0.42);
    h.root.rotation.y = -Math.PI / 2; // 선미(-x)를 보게
    this.group.add(h.root);
    this.human = h;
    for (const k of ['torso', 'head', 'cap', 'visor', 'hips', 'thighL', 'thighR', 'shinL', 'shinR', 'upperL', 'upperR', 'foreL', 'foreR', 'handL', 'handR'])
      this.parts[k].visible = false;
    this.applyHuman();
  }

  /** 계산해 둔 관절 위치로 캐릭터 뼈를 맞춘다 */
  private applyHuman() {
    const h = this.human;
    if (!h) return;
    const g = this.group;
    g.updateMatrixWorld(true);
    const W = (v: THREE.Vector3) => g.localToWorld(v.clone());
    const J = this.joints;
    h.resetPose();
    h.moveHipsTo(W(J.hip.clone().add(V(0, -0.02, 0))));
    // 상체 기울기: 엉덩이에서 목 방향
    const abd = h.bonePos('Abdomen');
    const leanDir = W(V(-Math.sin(J.lean), Math.cos(J.lean), 0).add(J.hip)).sub(W(J.hip)).normalize();
    h.aim('Abdomen', 'Neck', abd.clone().add(leanDir.multiplyScalar(h.len.spine)));
    // 다리: 발판, 무릎은 위로
    const up = W(V(0, 1, 0)).sub(W(V(0, 0, 0))).normalize();
    for (const [side, z] of [['L', 0.1], ['R', -0.1]] as const) {
      const foot = W(FOOT.clone().add(V(0.02, 0.02, z)));
      h.limb(`UpperLeg.${side}`, `LowerLeg.${side}`, `Foot.${side}`, foot, up.clone().add(W(V(0, 0, z)).sub(W(V(0, 0, 0)))), h.len.thigh, h.len.shin);
      // 팔: 손잡이, 팔꿈치는 바깥·아래로
      // 팔꿈치는 몸 뒤(뱃머리 +x)·아래로, 옆으로는 조금만 (닭날개 방지)
      const out = W(V(0.75, -0.55, z * 2.5)).sub(W(V(0, 0, 0))).normalize();
      // 손: 주먹 안쪽(손가락 마디 가운데)이 손잡이 위에 오고, 마디 줄이 노 막대와 나란하게
      const grip = W(J.hand[side]);
      const shaftOut = W(J.shaft[side].clone()).sub(W(V(0, 0, 0))).normalize();
      const sh = h.bonePos(`UpperArm.${side}`);
      let wrist = grip.clone().sub(grip.clone().sub(sh).normalize().multiplyScalar(0.075));
      for (let it = 0; it < 3; it++) {
        h.limb(`UpperArm.${side}`, `LowerArm.${side}`, `Hand.${side}`, wrist, out, h.len.upper, h.len.fore);
        const g = h.orientGrip(side, shaftOut);
        if (!g) break;
        wrist = wrist.clone().add(grip.clone().sub(g)); // 주먹 중심이 손잡이에 오도록 손목 목표 보정
      }
    }
  }

  /** 드라이브 중인가 (물보라 등 효과용) */
  get driving() {
    return this.phase < 0.35;
  }

  private pose(p: number, resting: boolean, spm = 24) {
    const driveFrac = Math.min(0.5, Math.max(0.28, 0.75 / (60 / spm)));
    let sweep: number; // 노 각도 (catch → finish)
    let seat: number; // 시트 위치 0=캐치, 1=피니시
    let lean: number; // 몸 기울기 (라디안, +는 선미 쪽으로 숙임)
    let bladeY: number;
    let feather: number; // 0=스퀘어(수직), 1=페더(수평)

    if (resting) {
      sweep = 0;
      seat = 0.75;
      lean = 0.05;
      bladeY = 0.02;
      feather = 1;
    } else if (p < driveFrac) {
      // 드라이브: 다리 → 몸 → 팔 순서
      const u = p / driveFrac;
      sweep = CATCH_ANGLE + (FINISH_ANGLE - CATCH_ANGLE) * ease(u);
      seat = ease(clamp01(u / 0.65));
      lean = 0.45 - 0.71 * ease(clamp01((u - 0.25) / 0.6));
      bladeY = u < 0.06 ? 0.12 - (0.2 * u) / 0.06 : u > 0.94 ? -0.08 + (0.22 * (u - 0.94)) / 0.06 : -0.08;
      feather = u > 0.96 ? (u - 0.96) / 0.04 : 0;
    } else {
      // 리커버리: 팔 → 몸 → 다리 순서, 천천히
      const v = (p - driveFrac) / (1 - driveFrac);
      sweep = FINISH_ANGLE + (CATCH_ANGLE - FINISH_ANGLE) * ease(v);
      seat = 1 - ease(clamp01((v - 0.3) / 0.7));
      lean = -0.26 + 0.71 * ease(clamp01(v / 0.45));
      bladeY = 0.14 + 0.04 * Math.sin(v * Math.PI);
      feather = v < 0.85 ? 1 : 1 - (v - 0.85) / 0.15;
    }

    const P = this.parts;
    const seatX = SEAT_CATCH + (SEAT_FINISH - SEAT_CATCH) * seat;
    P.seat.position.set(seatX, 0.17, 0);
    const hip = V(seatX, SEAT_Y + 0.05, 0);
    P.hips.position.copy(hip);
    this.joints.hip.copy(hip);
    this.joints.lean = lean;

    // 상체: 엉덩이에서 위로, 선미(-x) 쪽으로 lean만큼 기울임
    const shoulderC = hip.clone().add(V(-Math.sin(lean) * TORSO, Math.cos(lean) * TORSO, 0));
    const torsoMid = hip.clone().lerp(shoulderC, 0.5);
    P.torso.position.copy(torsoMid);
    P.torso.quaternion.setFromUnitVectors(UP, shoulderC.clone().sub(hip).normalize());
    const neckDir = shoulderC.clone().sub(hip).normalize();
    P.head.position.copy(shoulderC).add(neckDir.clone().multiplyScalar(0.17));
    P.cap.position.copy(P.head.position).add(V(0, 0.015, 0));
    P.cap.quaternion.copy(P.torso.quaternion);
    P.visor.position.copy(P.head.position).add(V(-0.12, 0.03, 0));

    for (const [s, sign] of [
      ['R', 1],
      ['L', -1],
    ] as const) {
      // 노: 핀 기준 회전
      const pin = V(PIN_X, PIN_Y, PIN_Z * sign);
      const dir = V(Math.sin(sweep), 0, Math.cos(sweep) * sign); // 핀 → 블레이드 방향
      const bladeC = pin.clone().add(dir.clone().multiplyScalar(OUTBOARD));
      bladeC.y = bladeY;
      const shaftDir = bladeC.clone().sub(pin).normalize();
      const handle = pin.clone().sub(shaftDir.clone().multiplyScalar(INBOARD));
      // 손잡이 교차 구간: 왼쪽 노(+z) 손잡이가 위로 지나가 서로 부딪히지 않게
      const cross = Math.min(1, Math.max(0, (0.15 - handle.z * sign) / 0.2));
      handle.y += sign > 0 ? 0.045 * cross : -0.025 * cross;
      const tip = pin.clone().add(shaftDir.clone().multiplyScalar(OUTBOARD + 0.22));
      place(P[`shaft${s}`], handle, bladeC);
      const blade = P[`blade${s}`];
      blade.position.copy(bladeC).add(shaftDir.clone().multiplyScalar(0.12));
      // 블레이드: 길이 방향 = 샤프트, 스퀘어일 때 면이 세로
      const q = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), tip.clone().sub(pin).normalize());
      const roll = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), (Math.PI / 2) * (1 - feather));
      blade.quaternion.copy(q).multiply(roll);

      // 팔: 어깨 → 손(손잡이)
      const shoulder = shoulderC.clone().add(V(0, -0.04, 0.19 * sign));
      // 손은 손잡이 끝(중앙 쪽)이 아니라 그립 가운데를 잡는다
      const hand = handle.clone().add(shaftDir.clone().multiplyScalar(0.07));
      // 캐릭터 기준: 선미를 보고 앉으므로 +z 쪽 노는 왼손
      this.joints.hand[sign > 0 ? 'L' : 'R'].copy(hand); // 왼쪽 노(+z) = 왼손, 오른쪽 노 = 오른손
      this.joints.shaft[sign > 0 ? 'L' : 'R'].copy(shaftDir);
      const elbow = ik(shoulder, hand, UPPER_ARM, FOREARM, V(0.2, -0.6, 0.8 * sign));
      place(P[`upper${s}`], shoulder, elbow);
      place(P[`fore${s}`], elbow, hand);
      P[`hand${s}`].position.copy(hand);

      // 다리: 엉덩이 → 발판, 무릎은 위로
      const hipS = hip.clone().add(V(0, 0, 0.09 * sign));
      const footS = FOOT.clone().add(V(0, 0, 0.09 * sign));
      const knee = ik(hipS, footS, THIGH, SHIN, V(0, 1, 0.15 * sign));
      place(P[`thigh${s}`], hipS, knee);
      place(P[`shin${s}`], knee, footS);
    }
  }

  dispose() {
    this.human?.dispose();
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    for (const m of this.materials) m.dispose();
  }
}
