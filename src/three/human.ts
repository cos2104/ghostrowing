// Quaternius(CC0) 뼈대 캐릭터를 불러와 관절 위치로 자세를 잡는다.
// 애니메이션 없이, 매 프레임 "이 뼈가 저 점을 향하게"(aim)로 노 젓기·응원 동작을 만든다.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

const ASSETS = `${import.meta.env.BASE_URL}assets/`;
/** Rocketbox(MIT) 사실적 선수 모델 → 폴더 */
const ROCKETBOX: Record<string, string> = {
  rb_male: 'Sports_Male_04',
  rb_female: 'Sports_Female_02',
  fan_f1: 'Female_Adult_01',
  fan_f3: 'Female_Adult_03',
  fan_f12: 'Female_Adult_12',
  fan_m1: 'Male_Adult_01',
  fan_m8: 'Male_Adult_08',
  fan_m12: 'Male_Adult_12',
};
const fileOf = (m: HumanModel) => (m in ROCKETBOX ? `${ASSETS}rocketbox/${ROCKETBOX[m]}/model.glb` : `${ASSETS}quaternius/people/${m}.glb`);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder); // 모델은 meshopt로 압축됨
const cache = new Map<string, Promise<THREE.Object3D>>();

export type HumanModel = 'rb_male' | 'rb_female' | 'fan_f1' | 'fan_f3' | 'fan_f12' | 'fan_m1' | 'fan_m8' | 'fan_m12';

function loadBase(model: HumanModel) {
  let p = cache.get(model);
  if (!p) {
    p = loader.loadAsync(fileOf(model)).then((g) => g.scene);
    cache.set(model, p);
  }
  return p;
}

const BONES = [
  'Hips', 'Abdomen', 'Torso', 'Chest', 'Neck', 'Head',
  'UpperArm.L', 'LowerArm.L', 'Hand.L', 'UpperArm.R', 'LowerArm.R', 'Hand.R',
  'UpperLeg.L', 'LowerLeg.L', 'Foot.L', 'UpperLeg.R', 'LowerLeg.R', 'Foot.R',
] as const;
type BoneName = (typeof BONES)[number];

/** 3ds Max Biped(Rocketbox) 뼈 이름 → 공통 이름 */
const BIPED: Record<string, BoneName> = {
  Bip01_Pelvis: 'Hips', Bip01_Spine: 'Abdomen', Bip01_Spine1: 'Torso', Bip01_Spine2: 'Chest', Bip01_Neck: 'Neck', Bip01_Head: 'Head',
  Bip01_L_UpperArm: 'UpperArm.L', Bip01_L_Forearm: 'LowerArm.L', Bip01_L_Hand: 'Hand.L',
  Bip01_R_UpperArm: 'UpperArm.R', Bip01_R_Forearm: 'LowerArm.R', Bip01_R_Hand: 'Hand.R',
  Bip01_L_Thigh: 'UpperLeg.L', Bip01_L_Calf: 'LowerLeg.L', Bip01_L_Foot: 'Foot.L',
  Bip01_R_Thigh: 'UpperLeg.R', Bip01_R_Calf: 'LowerLeg.R', Bip01_R_Foot: 'Foot.R',
};

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _wq = new THREE.Quaternion();

export class Human {
  readonly root = new THREE.Group(); // 이 그룹을 원하는 곳에 붙인다
  private model: THREE.Object3D;
  private bones = {} as Record<BoneName, THREE.Bone>;
  private rest = new Map<THREE.Bone, THREE.Quaternion>();
  readonly materials: THREE.Material[] = [];
  /** 뼈 길이 (월드 m) */
  len = { thigh: 0, shin: 0, upper: 0, fore: 0, spine: 0 };

  readonly realistic: boolean;

  private constructor(model: THREE.Object3D, height: number, readonly kind: HumanModel) {
    this.model = model;
    this.realistic = kind in ROCKETBOX;
    this.root.add(model);
    model.traverse((o) => {
      const b = o as THREE.Bone;
      // GLTFLoader가 이름의 '.'을 지우므로 (UpperArm.L → UpperArmL) 점 없이 비교
      if (b.isBone) {
        const hit = BIPED[b.name] ?? BONES.find((n) => n.replace('.', '') === b.name);
        if (hit) this.bones[hit] = b;
      }
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh;
        m.frustumCulled = false;
        m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
        for (const x of Array.isArray(m.material) ? m.material : [m.material]) this.materials.push(x);
      }
    });
    // 손가락: 노 손잡이를 쥔 모양으로 구부려 둔다 (Biped 손가락 굽힘축 = 로컬 Z)
    model.traverse((o) => {
      const b = o as THREE.Bone;
      if (!b.isBone) return;
      const m = /^Bip01_[LR]_Finger(\d)(\d?)$/.exec(b.name);
      if (!m) return;
      const thumb = m[1] === '0';
      b.rotateZ(thumb ? 0.35 : m[2] === '' ? 1.1 : 1.25);
    });
    for (const b of Object.values(this.bones)) this.rest.set(b, b.quaternion.clone());
    // 키를 맞춘다: 메시와 뼈대 단위가 달라 메시 상자 대신 뼈대(발목~머리)로 잰다. 머리 뼈는 키의 약 90%
    this.root.updateMatrixWorld(true);
    const headY = this.bones.Head.getWorldPosition(new THREE.Vector3()).y;
    const footY = this.bones['Foot.L'].getWorldPosition(new THREE.Vector3()).y;
    model.scale.multiplyScalar((height * 0.86) / Math.max(1e-6, headY - footY));
    this.root.updateMatrixWorld(true);
    const P = (n: BoneName) => this.bones[n].getWorldPosition(new THREE.Vector3());
    this.len.thigh = P('UpperLeg.L').distanceTo(P('LowerLeg.L'));
    this.len.shin = P('LowerLeg.L').distanceTo(P('Foot.L'));
    this.len.upper = P('UpperArm.L').distanceTo(P('LowerArm.L'));
    this.len.fore = P('LowerArm.L').distanceTo(P('Hand.L'));
    this.len.spine = P('Hips').distanceTo(P('Neck'));
    // 관절 경첩 측정 (좌우 각각): 팔꿈치·무릎이 실제로 굽는 면의 법선을 위팔·허벅지 로컬 좌표로 저장
    for (const side of ['L', 'R'] as const) {
      this.measureHinge(`UpperArm.${side}`, `LowerArm.${side}`, `Hand.${side}`, 1);
      this.measureHinge(`UpperLeg.${side}`, `LowerLeg.${side}`, `Foot.${side}`, -1);
    }
  }

  /** 위팔(a)→아래팔(b)→끝(c). 굽힘(굴곡) 방향: 팔은 손이 몸 앞으로(+1), 다리는 발이 뒤로(-1) */
  private hinge = new Map<BoneName, THREE.Vector3>();
  private measureHinge(a: BoneName, b: BoneName, c: BoneName, forwardSign: number) {
    this.resetPose();
    const A = this.bonePos(a);
    const B = this.bonePos(b);
    const C0 = this.bonePos(c);
    const bone = this.bones[b];
    const saved = bone.quaternion.clone();
    bone.rotateZ(0.5); // Biped·Mixamo 계열 모두 굽힘 축 후보
    bone.updateMatrixWorld(true);
    const C1 = this.bonePos(c);
    bone.quaternion.copy(saved);
    this.root.updateMatrixWorld(true);
    const u = B.clone().sub(A);
    let n = u.clone().cross(C1.clone().sub(B));
    // 축이 뼈 방향과 거의 같으면(굽지 않음) X축으로 다시
    if (n.length() < 1e-4) return;
    n.normalize();
    // 굴곡 방향 판정: 모델 정면(+Z, 모델 좌표)으로 손이 가면 굴곡
    const fwd = new THREE.Vector3(0, 0, 1).transformDirection(this.model.matrixWorld);
    const delta = C1.clone().sub(C0);
    if (delta.dot(fwd) * forwardSign < 0) n.negate();
    // 위 뼈(a)의 로컬 좌표로
    const qa = this.bones[a].getWorldQuaternion(new THREE.Quaternion()).invert();
    this.hinge.set(a, n.applyQuaternion(qa));
  }

  /** 위 뼈를 자기 축으로 비틀어, 경첩 법선이 원하는 굽힘 면 법선(world)과 같아지게 */
  private alignHinge(a: BoneName, axis: THREE.Vector3, want: THREE.Vector3) {
    const local = this.hinge.get(a);
    if (!local || want.lengthSq() < 1e-8) return;
    const bone = this.bones[a];
    const wq = bone.getWorldQuaternion(new THREE.Quaternion());
    const cur = local.clone().applyQuaternion(wq);
    const proj = (v: THREE.Vector3) => v.clone().sub(axis.clone().multiplyScalar(v.dot(axis))).normalize();
    const c = proj(cur);
    const w = proj(want);
    const ang = Math.atan2(c.clone().cross(w).dot(axis), c.dot(w));
    const tw = new THREE.Quaternion().setFromAxisAngle(axis, ang);
    wq.premultiply(tw);
    const pq = bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();
    bone.quaternion.copy(pq.multiply(wq));
    bone.updateMatrixWorld(true);
  }

  static async create(model: HumanModel, height = 1.8) {
    const base = await loadBase(model);
    return new Human(cloneSkinned(base), height, model);
  }

  /** 옷 색 바꾸기: 메시 이름에 part가 들어간 것 중 피부가 아닌 재질 */
  recolor(part: 'Body' | 'Legs' | 'Feet', color: number) {
    this.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.name.includes(part)) return;
      for (const x of Array.isArray(m.material) ? m.material : [m.material]) {
        const sm = x as THREE.MeshStandardMaterial;
        if (sm.name && !/^(skin|eyes?|eyebrows|hair.*|earrings)$/i.test(sm.name)) sm.color.setHex(color);
      }
    });
  }

  /** 사실적 모델: 유니폼 색별 텍스처로 교체 (blue·green·red·white) */
  async setUniform(name: string) {
    if (!this.realistic) return;
    const tex = await new THREE.TextureLoader().loadAsync(`${ASSETS}rocketbox/${ROCKETBOX[this.kind]}/body_${name}.jpg`);
    tex.flipY = true; // 원본(FBX) 방향 이미지. 변환 때 GLB 안의 이미지는 뒤집혀 저장됨
    tex.colorSpace = THREE.SRGBColorSpace;
    this.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      for (const x of Array.isArray(m.material) ? m.material : [m.material]) {
        const sm = x as THREE.MeshStandardMaterial;
        if (/_body$/.test(sm.name)) {
          sm.map = tex;
          sm.needsUpdate = true;
        }
      }
    });
  }

  setGhost(opacity: number) {
    for (const m of this.materials) {
      m.transparent = true;
      m.opacity = opacity;
      m.depthWrite = false;
    }
  }

  resetPose() {
    for (const [b, q] of this.rest) b.quaternion.copy(q);
    this.root.updateMatrixWorld(true);
  }

  bonePos(n: BoneName, out = new THREE.Vector3()) {
    return this.bones[n].getWorldPosition(out);
  }

  /** 뼈 n을 돌려 자식(또는 후손) c의 위치가 target(월드) 방향을 향하게 */
  aim(n: BoneName, c: BoneName, target: THREE.Vector3) {
    const bone = this.bones[n];
    bone.getWorldPosition(_a);
    this.bones[c].getWorldPosition(_b);
    const cur = _b.sub(_a).normalize();
    const want = target.clone().sub(_a).normalize();
    _q.setFromUnitVectors(cur, want);
    bone.getWorldQuaternion(_wq);
    _wq.premultiply(_q);
    bone.parent!.getWorldQuaternion(_pq);
    bone.quaternion.copy(_pq.invert().multiply(_wq));
    bone.updateMatrixWorld(true);
  }

  /** 엉덩이(Hips) 월드 위치를 target으로 옮긴다 */
  moveHipsTo(target: THREE.Vector3) {
    this.root.updateMatrixWorld(true);
    const cur = this.bonePos('Hips');
    const delta = target.clone().sub(cur);
    // root의 부모 좌표계로 변환해서 이동
    const parentInv = new THREE.Matrix4();
    if (this.root.parent) parentInv.copy(this.root.parent.matrixWorld).invert();
    const p0 = this.root.getWorldPosition(new THREE.Vector3());
    const p1 = p0.clone().add(delta).applyMatrix4(parentInv);
    this.root.position.copy(p1);
    this.root.updateMatrixWorld(true);
  }

  /** 2관절 사지: 뿌리 뼈 a, 중간 뼈 b, 끝 뼈 c를 target에 닿게. pole은 관절이 굽는 방향(월드) */
  limb(a: BoneName, b: BoneName, c: BoneName, target: THREE.Vector3, pole: THREE.Vector3, l1: number, l2: number) {
    const root = this.bonePos(a);
    const dir = target.clone().sub(root);
    let d = dir.length();
    d = Math.min(Math.max(d, 1e-3), (l1 + l2) * 0.999);
    dir.normalize();
    const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    const perp = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
    const joint = root.clone().add(dir.clone().multiplyScalar(x)).add(perp.multiplyScalar(h));
    this.aim(a, b, joint);
    // 굽힘 면 법선: 위 뼈 방향 × 아래 뼈 방향
    const upper = joint.clone().sub(root).normalize();
    const want = upper.clone().cross(target.clone().sub(joint).normalize());
    if (want.lengthSq() > 1e-6) this.alignHinge(a, upper, want.normalize());
    this.aim(b, c, target);
  }

  /**
   * 손을 노 손잡이에 맞춰 돌린다. shaftOut: 손잡이→노받이(바깥) 방향(월드).
   * 검지→새끼 마디 줄을 shaftOut과 나란히, 손목은 전완과 일직선.
   * 돌린 뒤 주먹 중심(검지·새끼 마디 가운데) 월드 위치를 돌려준다.
   */
  orientGrip(side: 'L' | 'R', shaftOut: THREE.Vector3): THREE.Vector3 | null {
    const f = this.fingerBases(side);
    if (!f) return null;
    const hand = this.bones[`Hand.${side}`];
    const W = this.bonePos(`Hand.${side}`);
    const F1 = f[0].getWorldPosition(new THREE.Vector3());
    const F4 = f[1].getWorldPosition(new THREE.Vector3());
    const k = F4.clone().sub(F1).normalize();
    const fw = F1.clone().add(F4).multiplyScalar(0.5).sub(W);
    fw.sub(k.clone().multiplyScalar(fw.dot(k))).normalize();
    const kw = shaftOut.clone().normalize();
    const arm = W.clone().sub(this.bonePos(`LowerArm.${side}`)).normalize();
    const fw2 = arm.sub(kw.clone().multiplyScalar(arm.dot(kw)));
    if (fw2.lengthSq() < 1e-6) return null;
    fw2.normalize();
    const B = new THREE.Matrix4().makeBasis(k, fw, k.clone().cross(fw));
    const B2 = new THREE.Matrix4().makeBasis(kw, fw2, kw.clone().cross(fw2));
    const R = new THREE.Quaternion().setFromRotationMatrix(B2.multiply(B.transpose()));
    const wq = hand.getWorldQuaternion(new THREE.Quaternion()).premultiply(R);
    const pq = hand.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();
    hand.quaternion.copy(pq.multiply(wq));
    hand.updateMatrixWorld(true);
    const a = f[0].getWorldPosition(new THREE.Vector3());
    const b = f[1].getWorldPosition(new THREE.Vector3());
    // 주먹 중심: 마디 가운데에서 손바닥 쪽으로 조금
    return a.add(b).multiplyScalar(0.5);
  }

  private fingerCache = new Map<string, [THREE.Object3D, THREE.Object3D] | null>();
  private fingerBases(side: 'L' | 'R') {
    if (!this.fingerCache.has(side)) {
      let i: THREE.Object3D | undefined;
      let p: THREE.Object3D | undefined;
      this.model.traverse((o) => {
        if (o.name === `Bip01_${side}_Finger1`) i = o;
        if (o.name === `Bip01_${side}_Finger4`) p = o;
      });
      this.fingerCache.set(side, i && p ? [i, p] : null);
    }
    return this.fingerCache.get(side)!;
  }

  /** 뼈 n을 부모 뼈(p)→n 방향(전완 장축 등) 기준으로 angle만큼 비튼다 */
  twistAbout(n: BoneName, from: BoneName, angle: number) {
    const bone = this.bones[n];
    const axis = this.bonePos(n).sub(this.bonePos(from)).normalize();
    const wq = bone.getWorldQuaternion(new THREE.Quaternion());
    wq.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
    const pq = bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();
    bone.quaternion.copy(pq.multiply(wq));
    bone.updateMatrixWorld(true);
  }

  dispose() {
    for (const m of this.materials) m.dispose();
  }
}
