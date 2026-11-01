import { app, formatDiff, formatTime, go } from '../app';
import { clock } from '../clock';
import { countryByCode, flagUrl, type Country } from '../countries';
import { formatPace } from '../pm5/parse';
import { COUNTDOWN_MS, RaceEngine } from '../race/engine';
import { distanceAt, spmAt, timeAt, type Trace } from '../race/ghost';
import { drawCourse } from '../render/course';
import type { Minimap } from '../render/minimap';
import { webglAvailable } from '../render/webgl';
import { TestSource } from '../rower/testSource';
import { getBest, isBetter, saveRace, type SavedRace } from '../storage/races';
import type { CameraMode, RaceView3D } from '../three/raceView';

/** 화면 표시 지연. 샘플(250ms) 사이를 보간해 부드럽게 그리기 위함 */
const DISPLAY_DELAY_MS = 250;
const CAM_LABEL: Record<CameraMode, string> = { auto: '자동', side: '측면', face: '근접', aerial: '공중' };
const CAM_ORDER: CameraMode[] = ['auto', 'side', 'face', 'aerial'];
const SHIRTS: Record<string, number> = { blue: 0x1f4fbf, green: 0x1f8f4a, red: 0xc8202e, white: 0xf2f2f2 };

interface Racer {
  id: string;
  name: string;
  country: Country;
  lane: number;
  ghost?: boolean;
  me?: boolean;
  trace: () => Trace;
}

export function mountRace(root: HTMLElement) {
  const src = app.source;
  if (!src || src.status !== 'connected') {
    go('connect');
    return;
  }

  const course = app.course;
  const open = app.distance === 0; // 무제한 (순환 코스)
  const distance = open ? Infinity : app.distance;
  const engine = new RaceEngine(distance, clock.now() + COUNTDOWN_MS);
  let ghost: SavedRace | null = null;
  let ghostLoaded = false;
  let saving = false;
  let storageError = '';
  let view: RaceView3D | null = null;
  let minimap: Minimap | null = null;
  let destroyed = false;
  const use3D = webglAvailable();

  const ghostReady = getBest(src.kind, app.distance)
    .then((g) => (ghost = g))
    .catch(() => (storageError = '기록 저장소(IndexedDB)를 사용할 수 없어 고스트와 기록 저장이 꺼집니다.'))
    .finally(() => (ghostLoaded = true));

  const auto = src instanceof TestSource ? src : null;
  // 자동 젓기는 출발 시각에 정확히 시작하도록 예약
  auto?.setRunning(true, engine.startAt);

  const me: Racer = { id: 'me', name: app.name, country: app.country, lane: course.loop ? 2 : 3, me: true, trace: () => engine.trace };
  const racers: Racer[] = [me];

  root.innerHTML = `
    <div class="race3d">
      <div class="stage">
        <canvas id="view"></canvas>
        <canvas id="course" hidden></canvas>
        <div class="hud">
          <div class="hud-tl">
            <div id="lights" class="lights"><i></i><i></i></div>
            <div id="leader" class="leader"></div>
          </div>
          <div class="hud-tr"><div id="minimap" class="minimap"></div></div>
          <div class="hud-bl"><div id="standings" class="standings"></div></div>
          <div class="hud-br">
            <div id="mark" class="mark"></div>
            <div class="clockbox"><span id="clock">0:00.0</span><b>${open ? '무제한' : `${distance}M`}</b></div>
          </div>
          <div id="split" class="split" hidden></div>
          <div id="countdown" class="countdown"></div>
          <div id="banner" class="banner" hidden></div>
          <button id="cam" class="cam-btn">카메라: 자동</button>
        </div>
      </div>
      <section class="metrics compact">
        <div class="metric"><label>${open ? '거리' : '남은 거리'}</label><output id="m-dist">${open ? 0 : distance}</output><span>m</span></div>
        <div class="metric"><label>페이스</label><output id="m-pace">-</output><span>/500m</span></div>
        <div class="metric"><label>스트로크레이트</label><output id="m-spm">-</output><span>spm</span></div>
        <div class="metric"><label>파워</label><output id="m-watts">-</output><span>W</span></div>
        <div class="metric"><label>고스트</label><output id="m-gap">-</output><span id="m-gap-u"></span></div>
      </section>
      <div class="row race-actions">
        ${auto?.manual ? '<button id="row" class="row-pad">탭해서 젓기 (스페이스바)</button>' : ''}
        <button id="quit" class="secondary big">${open ? '종료' : '기권'}</button>
      </div>
    </div>
  `;
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const viewCanvas = $<HTMLCanvasElement>('#view');
  const flatCanvas = $<HTMLCanvasElement>('#course');

  async function init() {
    await ghostReady;
    if (ghost) {
      const g = ghost;
      racers.push({
        id: 'ghost',
        name: `고스트 ${open ? '' : formatTime(g.finishMs)}`.trim(),
        country: countryByCode(g.country ?? app.country.code),
        lane: me.lane + 1,
        ghost: true,
        trace: () => g.trace,
      });
    }
    if (destroyed) return;
    renderStandings(0, 0);

    if (use3D) {
      const { RaceView3D } = await import('../three/raceView'); // 3D 엔진은 필요할 때만
      if (destroyed) return;
      view = new RaceView3D(viewCanvas, {
        theme: course.theme,
        loop: !!course.loop,
        raceDistance: distance,
        quality: app.quality,
        boats: racers.map((r) => ({
          id: r.id,
          name: r.name,
          country: r.country,
          lane: r.lane,
          ghost: r.ghost,
          me: r.me,
          shirt: r.me || r.ghost ? SHIRTS[app.character.shirt] : undefined,
          human: app.character.gender === 'w' ? 'rb_female' : 'rb_male',
          uniform: app.character.shirt,
        })),
      });
    } else {
      viewCanvas.hidden = true;
      flatCanvas.hidden = false;
    }

    const { svgMinimap, mapMinimap } = await import('../render/minimap');
    if (destroyed) return;
    const dots = racers.map((r) => ({ id: r.id, color: r.ghost ? '#b9c6d3' : '#3fa9f5', me: r.me }));
    if (course.loop) minimap = svgMinimap($('#minimap'), dots);
    else mapMinimap($('#minimap'), course, distance, dots).then((m) => (destroyed ? m.destroy() : (minimap = m)), () => {});
  }
  init().catch((e) => {
    console.warn('레이스 화면 초기화 실패', e);
    viewCanvas.hidden = true;
    flatCanvas.hidden = false;
  });

  // 출발 전 기준점: 마지막으로 받은 값을 바로 넣어 둔다.
  // (3D 로딩으로 카운트다운 동안 샘플이 늦게 와도 출발 순간 거리를 놓치지 않게)
  if (src.last) engine.push({ ...src.last, at: Math.min(src.last.at, engine.startAt - 1) });

  const offSample = src.onSample((s) => {
    engine.push(s);
    if (engine.phase === 'finished' && !saving) finish();
  });

  async function finish() {
    saving = true;
    auto?.setRunning(false);
    view?.setPhase('finished');
    const result = engine.result()!;
    const prevBest = ghost;
    const record = { ...result, source: src!.kind, name: app.name, courseId: course.id, country: app.country.code };
    let saved: SavedRace;
    try {
      saved = await saveRace(record);
    } catch {
      saved = { ...record, id: 'unsaved', createdAt: Date.now() };
    }
    app.lastRace = { race: saved, ghost: prevBest, isBest: isBetter(saved, prevBest) };
    setTimeout(() => go('result'), open ? 300 : 2500);
  }

  $('#quit').addEventListener('click', () => {
    if (open && engine.phase === 'racing') {
      engine.stop(clock.now());
      if (!saving) finish();
      return;
    }
    auto?.setRunning(false);
    go('connect');
  });
  $('#cam').addEventListener('click', () => {
    if (!view) return;
    view.cameraMode = CAM_ORDER[(CAM_ORDER.indexOf(view.cameraMode) + 1) % CAM_ORDER.length];
    $('#cam').textContent = `카메라: ${CAM_LABEL[view.cameraMode]}`;
  });
  const stroke = () => src.stroke();
  root.querySelector('#row')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    stroke();
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      stroke();
    }
  };
  window.addEventListener('keydown', onKey);

  // 500m 구간 기록
  let lastSplit = 0;
  let splitUntil = 0;

  function renderStandings(tDisp: number, elapsed: number) {
    const pos = racers.map((r) => ({ r, d: r.me ? myDisplayD(tDisp) : distanceAt(r.trace(), tDisp) }));
    pos.sort((a, b) => b.d - a.d);
    const leader = pos[0];
    // 시간 차: 뒤쪽 배가 지금 있는 거리에 선두가 도달했던 시각과의 차이
    const gapSec = (p: (typeof pos)[number]) => {
      if (p === leader) return 0;
      const t = timeAt(leader.r.trace(), p.d);
      return t === null ? null : (tDisp - t) / 1000;
    };
    const flag = (c: Country) => `<img class="flag" src="${flagUrl(c)}" alt="">`;
    $('#leader').innerHTML = pos
      .slice(0, 2)
      .map((p, i) => {
        const g = gapSec(p);
        const val = i === 0 ? formatTime(Math.max(0, elapsed)) : g === null ? '' : `+${Math.max(0, g).toFixed(2)}`;
        return `<div class="lrow${p.r.me ? ' me' : ''}"><span class="code">${p.r.country.code}</span>${flag(p.r.country)}<span class="nm">${esc(p.r.name)}</span><span class="val">${val}</span></div>`;
      })
      .join('');
    const head = open ? `${(leader.d / 1000).toFixed(2)}KM` : `1ST: ${Math.floor(leader.d)}M`;
    $('#standings').innerHTML =
      `<div class="shead"><span>${head}</span><span>STROKE</span></div>` +
      pos
        .map((p, i) => {
          const spm = p.r.me ? (src!.last?.spm ?? 0) : spmAt(p.r.trace(), tDisp);
          const gap = i === 0 ? '' : `${Math.max(0, leader.d - p.d).toFixed(0)}m`;
          return `<div class="srow${p.r.me ? ' me' : ''}${p.r.ghost ? ' ghost' : ''}"><b>${i + 1}</b>${flag(p.r.country)}<span class="gp">${gap}</span><span class="sp">${spm || '-'}</span></div>`;
        })
        .join('');
    return pos;
  }

  /**
   * 화면에 그릴 내 거리. 샘플이 늦게 오면(화면 버벅임 등) 마지막 샘플 위치에 멈추지 않도록
   * 현재 페이스로 최대 1.5초까지 앞으로 예측한다. 기록 계산에는 쓰지 않는다.
   */
  function myDisplayD(tDisp: number) {
    const tr = engine.trace;
    const last = tr[tr.length - 1];
    if (engine.phase !== 'racing' || tDisp <= last[0]) return distanceAt(tr, tDisp);
    const pace = src!.last?.paceSec ?? 0;
    const speed = pace > 0 ? 500 / pace : 0;
    const ahead = Math.min(tDisp - last[0], 1500) / 1000;
    const d = last[1] + speed * ahead;
    return Number.isFinite(distance) ? Math.min(d, distance) : d;
  }

  let raf = 0;
  let hudAt = 0;
  const render = () => {
    const now = clock.now();
    engine.tick(now);
    const elapsed = engine.elapsed(now);
    const tDisp = engine.finishMs ?? Math.max(0, elapsed - DISPLAY_DELAY_MS);
    const myD = myDisplayD(tDisp);
    const ghostR = racers.find((r) => r.ghost);
    const ghostD = ghostR ? distanceAt(ghostR.trace(), tDisp) : null;

    if (view) {
      view.setPhase(engine.phase);
      view.setClock(Math.max(0, elapsed) / 1000);
      view.setState('me', { d: myD, spm: src.last?.spm ?? 0 });
      if (ghostR) view.setState('ghost', { d: ghostD!, spm: spmAt(ghostR.trace(), tDisp) });
    } else if (!flatCanvas.hidden && !open) {
      const boats = [];
      if (ghostR) boats.push({ name: ghostR.name, distanceM: ghostD!, color: '#b9c6d3', ghost: true });
      boats.push({ name: app.name, distanceM: myD, color: '#3fa9f5', highlight: true });
      drawCourse(flatCanvas, distance, boats);
    }

    // 카운트다운 신호등
    const cd = $('#countdown');
    const lights = $('#lights');
    if (engine.phase === 'countdown') {
      cd.textContent = String(Math.ceil(-elapsed / 1000));
      cd.hidden = false;
      lights.dataset.state = 'red';
    } else if (elapsed < 900) {
      cd.textContent = 'GO!';
      cd.hidden = false;
      lights.dataset.state = 'green';
    } else {
      cd.hidden = true;
      lights.dataset.state = elapsed < 4000 ? 'green' : 'off';
    }

    // 구간 기록 (500m마다)
    const k = Math.floor(myD / 500);
    if (k > lastSplit && engine.phase !== 'countdown') {
      lastSplit = k;
      const myT = timeAt(engine.trace, k * 500);
      const gT = ghostR ? timeAt(ghostR.trace(), k * 500) : null;
      if (myT !== null) {
        const diff = gT === null ? null : formatDiff((myT - gT) / 1000, '');
        $('#split').innerHTML = `<b>${k * 500}M</b><span>${formatTime(myT)}</span>${diff ? `<em class="${diff.cls}">${diff.text}</em>` : ''}`;
        $('#split').hidden = false;
        splitUntil = now + 5000;
      }
    }
    if (splitUntil && now > splitUntil) {
      $('#split').hidden = true;
      splitUntil = 0;
    }

    // HUD는 초당 10번만 갱신
    if (now - hudAt > 100) {
      hudAt = now;
      $('#clock').textContent = formatTime(Math.max(0, elapsed));
      const passed = Math.floor(myD / 250) * 250;
      $('#mark').textContent = passed > 0 ? `${passed}M` : '';
      $('#mark').hidden = passed === 0;
      renderStandings(tDisp, elapsed);
      minimap?.update(Object.fromEntries(racers.map((r) => [r.id, r.me ? myD : distanceAt(r.trace(), tDisp)])));

      const s = src.last;
      $('#m-dist').textContent = String(open ? Math.floor(engine.distanceM) : Math.max(0, Math.ceil(distance - engine.distanceM)));
      $('#m-pace').textContent = s ? formatPace(s.paceSec) : '-';
      $('#m-spm').textContent = s ? String(s.spm) : '-';
      $('#m-watts').textContent = s ? String(s.watts) : '-';
      if (ghostR && engine.phase !== 'countdown') {
        const gT = timeAt(ghostR.trace(), myD);
        const m = formatDiff((ghostD ?? 0) - myD, '');
        $('#m-gap').textContent = m.text;
        $('#m-gap').className = m.cls;
        $('#m-gap-u').textContent = gT === null ? 'm' : `m (${formatDiff((tDisp - gT) / 1000, 's').text})`;
      } else {
        $('#m-gap').textContent = ghostLoaded && !ghostR ? '없음' : '-';
        $('#m-gap-u').textContent = ghostLoaded && !ghostR ? '첫 기록' : '';
      }

      const banner = $('#banner');
      if (src.status === 'disconnected') banner.textContent = '⚠ 로잉머신 연결이 끊겼습니다. 기권 후 다시 연결하세요.';
      else if (storageError) banner.textContent = storageError;
      else if (engine.phase === 'countdown' && src.kind === 'pm5') banner.textContent = 'PM5를 Just Row 상태로 두고 GO 신호에 출발하세요.';
      else if (engine.phase === 'finished') banner.textContent = open ? '레이스 종료' : `🏁 결승! ${formatTime(engine.finishMs!)}`;
      else banner.textContent = '';
      banner.hidden = !banner.textContent;
    }

    raf = requestAnimationFrame(render);
  };
  render();

  return () => {
    destroyed = true;
    view?.destroy();
    minimap?.destroy();
    cancelAnimationFrame(raf);
    offSample();
    window.removeEventListener('keydown', onKey);
  };
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
