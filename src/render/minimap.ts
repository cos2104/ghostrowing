// 코스 전체 미니맵: 실제 코스는 실제 지도(MapLibre), 순환 코스는 SVG 윤곽.
import { Polyline } from '../courses/geo';
import type { CourseDef } from '../courses/types';
import { GRAND_LOOP, LoopTrack } from '../three/track';

export interface MiniDot {
  id: string;
  color: string;
  me?: boolean;
}

export interface Minimap {
  update(positions: Record<string, number>): void;
  destroy(): void;
}

/** 순환 코스: SVG */
export function svgMinimap(el: HTMLElement, dots: MiniDot[]): Minimap {
  const track = new LoopTrack(GRAND_LOOP);
  const pts = track.outline(25);
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minZ = Math.min(...zs);
  const w = Math.max(...xs) - minX;
  const h = Math.max(...zs) - minZ;
  const pad = 60;
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${(p[0] - minX + pad).toFixed(0)},${(p[1] - minZ + pad).toFixed(0)}`).join('') + 'Z';
  const start = track.frame(0);
  el.innerHTML = `
    <svg viewBox="0 0 ${w + pad * 2} ${h + pad * 2}" class="mini-svg">
      <path d="${path}" fill="rgba(70,140,190,0.35)" stroke="#9fd3ff" stroke-width="70" stroke-linejoin="round" opacity="0.55"/>
      <path d="${path}" fill="none" stroke="#e8f4ff" stroke-width="10" stroke-dasharray="40 30"/>
      <rect x="${start.x - minX + pad - 12}" y="${start.z - minZ + pad - 60}" width="24" height="120" fill="#fff"/>
      ${dots.map((d) => `<circle id="mini-${d.id}" r="${d.me ? 42 : 34}" fill="${d.color}" stroke="#fff" stroke-width="12" ${d.me ? '' : 'opacity="0.75"'}/>`).join('')}
    </svg>`;
  const circles = new Map(dots.map((d) => [d.id, el.querySelector<SVGCircleElement>(`#mini-${d.id}`)!]));
  return {
    update(pos) {
      for (const [id, c] of circles) {
        const f = track.frame(pos[id] ?? 0);
        c.setAttribute('cx', (f.x - minX + pad).toFixed(0));
        c.setAttribute('cy', (f.z - minZ + pad).toFixed(0));
      }
    },
    destroy() {
      el.innerHTML = '';
    },
  };
}

/** 실제 코스: 실제 지도 위에 코스 선과 배 위치 */
export async function mapMinimap(el: HTMLElement, course: CourseDef, raceDistance: number, dots: MiniDot[]): Promise<Minimap> {
  const [{ Map: MlMap, Marker, setWorkerUrl }, worker] = await Promise.all([
    import('maplibre-gl'),
    import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
    import('maplibre-gl/dist/maplibre-gl.css'),
  ]);
  setWorkerUrl(worker.default);
  const line = new Polyline(course.coords);
  const start = line.length - raceDistance;
  const coords = line.slice(start, line.length, 0, 25);
  const full = line.slice(0, line.length, 0, 25);
  const map = new MlMap({
    container: el,
    style: 'https://tiles.openfreemap.org/styles/liberty',
    interactive: false,
    attributionControl: false,
    bounds: boundsOf(full), // 코스 전체
    fitBoundsOptions: { padding: 24 },
    fadeDuration: 0,
  });
  map.on('load', () => {
    map.addSource('full', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: full } } });
    map.addLayer({ id: 'full', type: 'line', source: 'full', paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-opacity': 0.8 } });
    map.addSource('course', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } } });
    map.addLayer({ id: 'course', type: 'line', source: 'course', paint: { 'line-color': '#ffcc33', 'line-width': 4 } });
  });
  const attr = document.createElement('div');
  attr.className = 'mini-attr';
  attr.textContent = '© OpenStreetMap · OpenFreeMap';
  el.appendChild(attr);
  const markers = new Map(
    dots.map((d) => {
      const e = document.createElement('div');
      e.className = `mini-dot${d.me ? ' me' : ''}`;
      e.style.background = d.color;
      return [d.id, new Marker({ element: e }).setLngLat(coords[0]).addTo(map)];
    }),
  );
  return {
    update(pos) {
      for (const [id, m] of markers) m.setLngLat(line.pointAt(start + Math.min(pos[id] ?? 0, raceDistance)));
    },
    destroy() {
      map.remove();
    },
  };
}

function boundsOf(coords: [number, number][]): [[number, number], [number, number]] {
  const xs = coords.map((c) => c[0]);
  const ys = coords.map((c) => c[1]);
  return [
    [Math.min(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.max(...ys)],
  ];
}
