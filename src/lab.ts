// 개발용 3D 미리보기 (빌드에 포함되지 않음). /lab.html?cam=side&d=300&spm=32
import * as THREE from 'three';
import { Scull } from './three/scull';
import { StraightTrack, LoopTrack, GRAND_LOOP } from './three/track';
import { World } from './three/world';
import { Scenery, type Theme } from './three/scenery';

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const loop = q.get('loop') === '1';
const track = loop ? new LoopTrack(GRAND_LOOP) : new StraightTrack(2000);
const lanes = 6, laneWidth = 13.5;
const world = new World(canvas, { track, lanes, laneWidth, raceDistance: loop ? 0 : 2000, quality: (q.get('q') as 'high' | 'low') ?? 'high' });
const sc = new Scenery(track, world.waterHalf, (q.get('theme') as Theme) ?? 'lake', loop ? { from: 0, to: track.length } : { from: -300, to: 2300 }, 'high');
sc.build().then((g) => { world.scene.add(g); (window as any).sceneryReady = true; (window as any).scg = g; });
const colors = [
  { hull: 0xf2f2f0, shirt: 0x1f4fbf, cap: 0xffffff, blade: 0x1f4fbf },
  { hull: 0xf3d23a, shirt: 0xd62828, cap: 0xffffff, blade: 0xd62828 },
  { hull: 0xf2f2f0, shirt: 0x111111, cap: 0xffcc00, blade: 0xffcc00 },
];
const d0 = Number(q.get('d') ?? 300);
const spm = Number(q.get('spm') ?? 32);
const boats = colors.map((c, i) => ({ s: new Scull(c, { ghost: i === 2 }), lane: i + 1, d: d0 - i * 3 }));
for (const b of boats) world.scene.add(b.s.group);
(window as any).boats = boats;
if (q.get('human') !== '0') boats.forEach((b, i) => b.s.useHuman(i === 1 ? 'rb_female' : 'rb_male', [0x1f4fbf, 0xd62828, 0x222222][i], ['blue', 'red', 'white'][i]));
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 6000);
const resize = () => { world.resize(canvas.clientWidth, canvas.clientHeight); camera.aspect = canvas.clientWidth / canvas.clientHeight; camera.updateProjectionMatrix(); };
resize(); addEventListener('resize', resize);
let last = performance.now();
const t0 = Number(q.get('t') ?? 0);
function frame(now: number) {
  const dt = (now - last) / 1000; last = now;
  for (const b of boats) {
    b.d += dt * 5;
    const f = track.frame(b.d, (b.lane + 0.5 - lanes / 2) * laneWidth);
    b.s.group.position.set(f.x, 0, f.z);
    b.s.group.rotation.y = -f.heading;
    b.s.update(dt, spm);
  }
  const me = boats[0];
  const f = track.frame(me.d, 0);
  const cam = q.get('cam') ?? 'side';
  const right = (o: number, dd = 0) => track.frame(me.d + dd, o);
  if (cam === 'side') { const p = right(-world.waterHalf + 15, -4); camera.position.set(p.x, 6, p.z); const t = track.frame(me.d, laneWidth); camera.lookAt(t.x + 1, 0.4, t.z); camera.fov = 16; }
  else if (cam === 'front') { const p = track.frame(me.d - Number(q.get('fd') ?? 6.5), (me.lane + 0.5 - lanes / 2) * laneWidth - 1.5); camera.position.set(p.x, 1.5, p.z); const t = track.frame(me.d, (me.lane + 0.5 - lanes / 2) * laneWidth); camera.lookAt(t.x, 0.7, t.z); camera.fov = 45; }
  else if (cam === 'f2') { const b = boats[1]; const p = track.frame(b.d - 2.4, (b.lane + 0.5 - lanes / 2) * laneWidth - 1.2); camera.position.set(p.x, 1.3, p.z); const t = track.frame(b.d, (b.lane + 0.5 - lanes / 2) * laneWidth); camera.lookAt(t.x, 0.7, t.z); camera.fov = 45; }
  else if (cam === 'start') { const p = right(30, -40); camera.position.set(p.x, 22, p.z); camera.lookAt(f.x + 40, 0, f.z - 5); camera.fov = 45; }
  else if (cam === 'top') { camera.position.set(f.x, 600, f.z + 1); camera.lookAt(f.x, 0, f.z); camera.fov = 60; }
  camera.updateProjectionMatrix();
  world.followShadow(f.x, f.z);
  world.render(camera, dt);
  (window as any).frames_ = ((window as any).frames_ ?? 0) + 1;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
void t0;
