// 실제 지도(MapLibre + OpenFreeMap) 위 레이스 화면.
import 'maplibre-gl/dist/maplibre-gl.css';
import { Map as MlMap, Marker, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { lerpAngle, Polyline } from '../courses/geo';
import type { CourseDef } from '../courses/types';

setWorkerUrl(workerUrl);

export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

export interface MapBoat {
  id: string;
  name: string;
  sprite: HTMLCanvasElement;
  /** 레인: 코스 중앙선 기준 오른쪽(+)/왼쪽(-) 레인 칸 수 (0.5 = 반 칸) */
  lane: number;
  ghost?: boolean;
  me?: boolean;
}

const CAMERA = { zoom: 17.4, pitch: 48, aheadM: 30 };
/** 화면에서 배가 겹치지 않도록 하는 최소 레인 간격 (m). 실제 레인보다 넓게 그린다 */
const MIN_VISUAL_LANE_M = 22;

export class MapRace {
  readonly line: Polyline;
  private map: MlMap;
  private markers = new Map<string, { boat: Marker; label: Marker; lane: number }>();
  private camBearing: number | null = null;
  private startOffset: number;
  ready: Promise<void>;
  private lane: number;
  private zoom: number;

  constructor(
    container: HTMLElement,
    readonly course: CourseDef,
    readonly raceDistance: number,
    boats: MapBoat[],
  ) {
    this.line = new Polyline(course.coords);
    this.lane = Math.max(course.laneWidth, MIN_VISUAL_LANE_M);
    this.zoom = course.zoom ?? CAMERA.zoom;
    this.startOffset = this.line.length - raceDistance;
    const start = this.line.pointAt(this.startOffset);
    const brg = this.line.bearingAt(this.startOffset, 40);

    this.map = new MlMap({
      container,
      style: MAP_STYLE,
      center: start,
      zoom: this.zoom,
      pitch: CAMERA.pitch,
      bearing: brg,
      interactive: false,
      attributionControl: { compact: true },
      fadeDuration: 0,
    });

    for (const b of boats) {
      const el = document.createElement('div');
      el.className = `map-boat${b.ghost ? ' ghost' : ''}${b.me ? ' me' : ''}`;
      el.appendChild(b.sprite);
      const label = document.createElement('div');
      label.className = `map-label${b.ghost ? ' ghost' : ''}${b.me ? ' me' : ''}`;
      label.textContent = b.name;
      const boat = new Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'viewport' })
        .setLngLat(start)
        .addTo(this.map);
      // 이름표: 내 배는 오른쪽 위, 고스트는 왼쪽 위로 비켜서 겹치지 않게
      const lab = new Marker({
        element: label,
        anchor: b.ghost ? 'bottom-right' : 'bottom-left',
        offset: [b.ghost ? -12 : 12, -30],
      })
        .setLngLat(start)
        .addTo(this.map);
      this.markers.set(b.id, { boat, label: lab, lane: b.lane });
    }

    this.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('지도 로딩 시간 초과')), 15000);
      this.map.once('load', () => {
        clearTimeout(timer);
        this.addCourseLayers();
        resolve();
      });
      this.map.on('error', (e) => {
        // 개별 타일 오류는 무시, 스타일 자체 실패만 치명적
        if (!this.map.isStyleLoaded() && !this.map.loaded()) {
          clearTimeout(timer);
          reject(e.error ?? new Error('지도 오류'));
        }
      });
    });
  }

  private addCourseLayers() {
    const { line, startOffset } = this;
    const lw = this.lane;
    const end = line.length;
    const half = lw; // 레인 2칸: 중앙선 기준 ±1칸

    const lines = (offsets: number[]) => ({
      type: 'FeatureCollection' as const,
      features: offsets.map((o) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates: line.slice(startOffset, end, o) },
      })),
    });

    const cross = (d: number) => [line.pointAtOffset(d, -half * 1.3), line.pointAtOffset(d, half * 1.3)];

    const marks = [];
    for (let m = 250; m < this.raceDistance; m += 250) {
      marks.push({
        type: 'Feature' as const,
        properties: { t: `${m}m` },
        geometry: { type: 'Point' as const, coordinates: line.pointAtOffset(startOffset + m, -half - 10) },
      });
    }

    this.map.addSource('lane-buoys', { type: 'geojson', data: lines([-half, 0, half]) });
    this.map.addLayer({
      id: 'lane-buoys',
      type: 'line',
      source: 'lane-buoys',
      paint: { 'line-color': '#ffcc33', 'line-width': 3, 'line-dasharray': [0.6, 2.2] },
      layout: { 'line-cap': 'round' },
    });
    this.map.addSource('start-finish', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: { kind: 'start' }, geometry: { type: 'LineString', coordinates: cross(startOffset) } },
          { type: 'Feature', properties: { kind: 'finish' }, geometry: { type: 'LineString', coordinates: cross(end) } },
        ],
      },
    });
    this.map.addLayer({
      id: 'start-finish',
      type: 'line',
      source: 'start-finish',
      paint: {
        'line-color': ['match', ['get', 'kind'], 'finish', '#ff3b5c', '#ffffff'],
        'line-width': 6,
      },
    });
    this.map.addSource('marks', { type: 'geojson', data: { type: 'FeatureCollection', features: marks } });
    this.map.addLayer({
      id: 'marks',
      type: 'symbol',
      source: 'marks',
      layout: {
        'text-field': ['get', 't'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 16,
        'text-allow-overlap': true,
        'text-rotation-alignment': 'viewport',
      },
      paint: { 'text-color': '#ffffff', 'text-halo-color': '#0f1419', 'text-halo-width': 2 },
    });
  }

  /** 레이스 거리(m)로 배 위치를 옮기고, 내 배를 따라 카메라를 움직인다 */
  update(positions: Record<string, number>, followId: string) {
    const { line, startOffset } = this;
    for (const [id, m] of this.markers) {
      const d = startOffset + Math.min(positions[id] ?? 0, this.raceDistance);
      const p = line.pointAtOffset(d, m.lane * this.lane);
      m.boat.setLngLat(p).setRotation(line.bearingAt(d, 15));
      m.label.setLngLat(p);
    }
    const me = startOffset + Math.min(positions[followId] ?? 0, this.raceDistance);
    const target = line.bearingAt(Math.min(me + 20, line.length), 60);
    this.camBearing = this.camBearing === null ? target : lerpAngle(this.camBearing, target, 0.06);
    const center = line.pointAt(Math.min(me + CAMERA.aheadM, line.length + 60));
    this.map.jumpTo({ center, bearing: this.camBearing, zoom: this.zoom, pitch: CAMERA.pitch });
  }

  /** 시작 화면용: 코스 전체를 위에서 보여 준다 */
  overview() {
    const pts = this.line.slice(this.startOffset, this.line.length, 0, 100);
    const lngs = pts.map((p) => p[0]);
    const lats = pts.map((p) => p[1]);
    this.map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 60, bearing: this.line.bearingAt(this.startOffset + this.raceDistance / 2, 200), pitch: 0, duration: 0 },
    );
  }

  destroy() {
    this.map.remove();
  }
}
