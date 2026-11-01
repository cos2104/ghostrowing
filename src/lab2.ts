// 개발용: Quaternius 에셋 미리보기 (빌드 제외)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { StraightTrack } from './three/track';
import { World } from './three/world';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const world = new World(canvas, { track: new StraightTrack(2000), lanes: 6, laneWidth: 13.5, raceDistance: 2000, quality: 'high' });
const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
world.resize(canvas.clientWidth, canvas.clientHeight);
cam.aspect = canvas.clientWidth / canvas.clientHeight;
const L = new GLTFLoader();
const Q = '/assets/quaternius/';
const z = world.waterHalf;
const trees = ['CommonTree_1', 'BirchTree_1', 'PineTree_1', 'Willow_1', 'CommonTree_3', 'BirchTree_2', 'PineTree_2', 'CommonTree_4', 'Willow_2', 'BushBerries_1', 'Bush_1', 'CommonTree_5'];
let x = 980;
Promise.all(trees.map((t) => L.loadAsync(`${Q}nature/${t}.glb`))).then((gs) => {
  gs.forEach((g, i) => {
    const o = g.scene;
    const box = new THREE.Box3().setFromObject(o);
    const s = (trees[i].startsWith('Bush') ? 2.5 : 11) / (box.max.y - box.min.y);
    o.scale.setScalar(s);
    o.position.set(x + i * 9, 0.7 - box.min.y * s, z + 10 + (i % 3) * 5);
    world.scene.add(o);
  });
  const people = ['m_Casual', 'm_Casual2', 'm_Beach', 'm_Worker', 'm_Farmer', 'm_Suit', 'w_Casual', 'w_Formal', 'w_Worker', 'w_Suit', 'w_Adventurer'];
  return Promise.all(people.map((p) => L.loadAsync(`${Q}people/${p}.glb`))).then((ps) => {
    ps.forEach((g, i) => {
      const o = g.scene;
      const box = new THREE.Box3().setFromObject(o);
      const s = 1.75 / (box.max.y - box.min.y);
      o.scale.setScalar(s);
      o.position.set(x + 20 + i * 2.2, 0.7 - box.min.y * s, z + 4);
      o.rotation.y = Math.PI;
      // 팔 내리기 (T포즈 → 차렷)
      o.traverse((b) => {
        if (b.name === 'UpperArm.L') b.rotation.z += 1.2;
        if (b.name === 'UpperArm.R') b.rotation.z -= 1.2;
      });
      world.scene.add(o);
    });
    (window as any).ready = true;
  });
});
cam.position.set(x + 31, 1.6, z - 6);
cam.lookAt(x + 31, 1.4, z + 4);
cam.fov = 62;
cam.updateProjectionMatrix();
function f() { world.render(cam, 0.016); requestAnimationFrame(f); }
f();
