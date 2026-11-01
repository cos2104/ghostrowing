// Quaternius(CC0) 뼈대 캐릭터를 불러와 관절 위치로 자세를 잡는다.
// 애니메이션 없이, 매 프레임 "이 뼈가 저 점을 향하게"(aim)로 노 젓기·응원 동작을 만든다.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

const BASE = `${import.meta.env.BASE_URL}assets/quaternius/people/`;
const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Object3D>>();

export type HumanModel = 'm_Beach' | 'w_Casual' | 'm_Casual' | 'm_Suit' | 'm_Worker' | 'w_Formal' | 'w_Worker' | 'w_Adventurer';

function loadBase(model: HumanModel) {
  let p = cache.get(model);
  if (!p) {
    p = loader.loadAsync(`${BASE}${model}.glb`).then((g) => g.scene);
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

  private constructor(model: THREE.Object3D, height: number) {
    this.model = model;
    this.root.add(model);
    model.traverse((o) => {
      const b = o as THREE.Bone;
      // GLTFLoader가 이름의 '.'을 지우므로 (UpperArm.L → UpperArmL) 점 없이 비교
      if (b.isBone) {
        const hit = BONES.find((n) => n.replace('.', '') === b.name);
        if (hit) this.bones[hit] = b;
      }
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh;
        m.frustumCulled = false;
        m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
        for (const x of Array.isArray(m.material) ? m.material : [m.material]) this.materials.push(x);
      }
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
  }

  static async create(model: HumanModel, height = 1.8) {
    const base = await loadBase(model);
    return new Human(cloneSkinned(base), height);
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
    this.aim(b, c, target);
  }

  dispose() {
    for (const m of this.materials) m.dispose();
  }
}
