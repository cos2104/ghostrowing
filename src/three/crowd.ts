// 강둑 관중: Quaternius 캐릭터를 세우고, 배가 가까이 오면 팔을 흔들며 응원한다.
import * as THREE from 'three';
import { Human, type HumanModel } from './human';
import type { Track } from './track';

// Rocketbox(MIT) 일반인 모델 6종을 돌려 쓴다
const MODELS: HumanModel[] = ['fan_m1', 'fan_f1', 'fan_m8', 'fan_f3', 'fan_m12', 'fan_f12'];

interface Fan {
  h: Human;
  d: number; // 코스 위치
  phase: number;
  cheer: boolean; // 두 팔 / 한 팔
  baseY: number;
}

export class Crowd {
  readonly group = new THREE.Group();
  private fans: Fan[] = [];

  constructor(
    private track: Track,
    private spots: { d: number; offset: number }[],
  ) {}

  async build() {
    const side = (o: number) => Math.sign(o) || 1;
    await Promise.all(
      this.spots.map(async (s, i) => {
        const h = await Human.create(MODELS[i % MODELS.length], 1.65 + ((i * 37) % 20) / 100);
        const f = this.track.frame(s.d, s.offset);
        h.root.position.set(f.x, 0.7, f.z);
        // 코스 쪽을 바라보게 (캐릭터 정면 = +Z)
        const sg = side(s.offset);
        const want = new THREE.Vector2(Math.sin(f.heading) * sg, -Math.cos(f.heading) * sg);
        h.root.rotation.y = Math.atan2(want.x, want.y) + (((i * 53) % 40) - 20) * (Math.PI / 180);
        this.group.add(h.root);
        this.fans.push({ h, d: s.d, phase: (i * 1.7) % (Math.PI * 2), cheer: i % 3 !== 0, baseY: 0.7 });
      }),
    );
    // 바닥 높이 맞추기: 발이 강둑 위에
    for (const f of this.fans) {
      f.h.resetPose();
      const foot = f.h.bonePos('Foot.L');
      f.h.root.position.y += 0.72 - foot.y;
      f.baseY = f.h.root.position.y;
    }
    return this.group;
  }

  /** t: 초, near(d): 그 위치에 배가 얼마나 가까운지 0~1 */
  update(t: number, focusD: number) {
    for (const f of this.fans) {
      const h = f.h;
      h.resetPose();
      const near = Math.max(0, 1 - Math.abs(f.d - focusD) / 90);
      const sh = h.bonePos('UpperArm.L');
      const shR = h.bonePos('UpperArm.R');
      const up = new THREE.Vector3(0, 1, 0);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(h.root.quaternion);
      const right = new THREE.Vector3().crossVectors(fwd, up);
      const wave = Math.sin(t * 7 + f.phase);
      for (const [side, s, sgn] of [['L', sh, -1], ['R', shR, 1]] as const) {
        let target: THREE.Vector3;
        if (near > 0.05 && (f.cheer || side === 'R')) {
          // 응원: 팔을 들어 흔든다
          target = s.clone().add(up.clone().multiplyScalar(0.55)).add(right.clone().multiplyScalar(sgn * (0.18 + 0.12 * wave)));
        } else {
          // 차렷: 팔을 내린다
          target = s.clone().add(up.clone().multiplyScalar(-0.6)).add(right.clone().multiplyScalar(sgn * 0.12)).add(fwd.clone().multiplyScalar(0.05));
        }
        h.limb(`UpperArm.${side}`, `LowerArm.${side}`, `Hand.${side}`, target, fwd.clone().multiplyScalar(-1).add(up.clone().multiplyScalar(-0.3)), h.len.upper, h.len.fore);
      }
      // 살짝 들썩
      h.root.position.y = f.baseY + (near > 0.05 ? Math.max(0, Math.sin(t * 7 + f.phase)) * 0.06 : 0);
    }
  }

  dispose() {
    for (const f of this.fans) f.h.dispose();
  }
}
