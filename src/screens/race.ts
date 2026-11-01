import { app, formatDiff, formatTime, go } from '../app';
import { clock } from '../clock';
import { formatPace } from '../pm5/parse';
import { COUNTDOWN_MS, RaceEngine } from '../race/engine';
import { distanceAt, timeAt } from '../race/ghost';
import { drawCourse } from '../render/course';
import { TestSource } from '../rower/testSource';
import { getBest, saveRace, type SavedRace } from '../storage/races';

/** 화면 표시 지연. 샘플(250ms) 사이를 보간해 부드럽게 그리기 위함 */
const DISPLAY_DELAY_MS = 250;

export function mountRace(root: HTMLElement) {
  const src = app.source;
  if (!src || src.status !== 'connected') {
    go('connect');
    return;
  }

  const distance = app.distance;
  const engine = new RaceEngine(distance, clock.now() + COUNTDOWN_MS);
  let ghost: SavedRace | null = null;
  let ghostLoaded = false;
  let saving = false;
  let storageError = '';

  getBest(src.kind, distance)
    .then((g) => (ghost = g))
    .catch(() => (storageError = '기록 저장소(IndexedDB)를 사용할 수 없어 고스트와 기록 저장이 꺼집니다.'))
    .finally(() => (ghostLoaded = true));

  const auto = src instanceof TestSource ? src : null;
  auto?.setRunning(false);

  root.innerHTML = `
    <div class="race">
      <div class="race-top">
        <div class="clock" id="clock">0:00.0</div>
        <div class="remain"><output id="remain">${distance}</output><span>m 남음</span></div>
        <div class="gap" id="gap"></div>
        <button id="quit" class="secondary">기권</button>
      </div>
      <p id="banner" class="banner"></p>
      <div class="course-wrap">
        <canvas id="course"></canvas>
        <div id="countdown" class="countdown"></div>
      </div>
      <section class="metrics">
        <div class="metric"><label>거리</label><output id="m-dist">0</output><span>m</span></div>
        <div class="metric"><label>페이스</label><output id="m-pace">-</output><span>/500m</span></div>
        <div class="metric"><label>스트로크레이트</label><output id="m-spm">-</output><span>spm</span></div>
        <div class="metric"><label>파워</label><output id="m-watts">-</output><span>W</span></div>
      </section>
      ${auto?.manual ? '<button id="row" class="row-pad">탭해서 젓기 (스페이스바)</button>' : ''}
    </div>
  `;
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const canvas = $<HTMLCanvasElement>('#course');

  const offSample = src.onSample((s) => {
    engine.push(s);
    if (engine.phase === 'finished' && !saving) finish();
  });

  async function finish() {
    saving = true;
    auto?.setRunning(false);
    const result = engine.result()!;
    const prevBest = ghost;
    const record = { ...result, source: src!.kind, name: app.name };
    let saved: SavedRace;
    try {
      saved = await saveRace(record);
    } catch {
      saved = { ...record, id: 'unsaved', createdAt: Date.now() };
    }
    app.lastRace = { race: saved, ghost: prevBest, isBest: !prevBest || saved.finishMs < prevBest.finishMs };
    setTimeout(() => go('result'), 1200);
  }

  $('#quit').addEventListener('click', () => {
    auto?.setRunning(false);
    go('connect');
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

  let raf = 0;
  const render = () => {
    const now = clock.now();
    engine.tick(now);
    if (engine.phase === 'racing') auto?.setRunning(true);

    const elapsed = engine.elapsed(now);
    const tDisp = engine.finishMs ?? Math.max(0, elapsed - DISPLAY_DELAY_MS);
    const myD = distanceAt(engine.trace, tDisp);
    const ghostD = ghost ? distanceAt(ghost.trace, tDisp) : null;

    // 카운트다운
    const cd = $('#countdown');
    if (engine.phase === 'countdown') {
      const sec = Math.ceil(-elapsed / 1000);
      cd.textContent = String(sec);
      cd.hidden = false;
    } else if (elapsed < 800) {
      cd.textContent = 'GO!';
      cd.hidden = false;
    } else {
      cd.hidden = true;
    }

    $('#clock').textContent = formatTime(Math.max(0, elapsed));
    $('#remain').textContent = String(Math.ceil(distance - engine.distanceM));

    // 고스트와의 차이: 내가 지금 거리에 도달한 시각 vs 고스트가 같은 거리에 도달한 시각
    const gap = $('#gap');
    if (ghost && engine.phase !== 'countdown') {
      const ghostT = timeAt(ghost.trace, myD);
      // 앞섬을 음수로: 거리는 고스트 − 나, 시간은 내 도달 시각 − 고스트 도달 시각
      const m = formatDiff((ghostD ?? 0) - myD, 'm');
      const sec = ghostT === null ? null : formatDiff((tDisp - ghostT) / 1000, 's');
      const cls = sec?.cls ?? m.cls;
      gap.className = `gap ${cls}`;
      const lead = m.cls === 'even' ? '' : m.cls === 'ahead' ? ' 앞섬' : ' 뒤짐';
      gap.textContent = `고스트보다 ${m.text.replace(/^[−+]/, '')}${lead}` + (sec ? ` (${sec.text})` : '');
    } else {
      gap.textContent = ghostLoaded && !ghost ? '첫 기록 — 고스트 없음' : '';
      gap.className = 'gap';
    }

    const banner = $('#banner');
    if (src.status === 'disconnected') banner.textContent = '⚠ 로잉머신 연결이 끊겼습니다. 기권 후 다시 연결하세요.';
    else if (storageError) banner.textContent = storageError;
    else if (engine.phase === 'countdown' && src.kind === 'pm5')
      banner.textContent = 'PM5를 Just Row 상태로 두고 GO 신호에 출발하세요.';
    else if (engine.phase === 'finished') banner.textContent = `🏁 결승! ${formatTime(engine.finishMs!)}`;
    else banner.textContent = '';
    banner.hidden = !banner.textContent;

    const s = src.last;
    $('#m-dist').textContent = String(Math.floor(engine.distanceM));
    $('#m-pace').textContent = s ? formatPace(s.paceSec) : '-';
    $('#m-spm').textContent = s ? String(s.spm) : '-';
    $('#m-watts').textContent = s ? String(s.watts) : '-';

    const boats = [];
    if (ghost) boats.push({ name: `고스트 ${formatTime(ghost.finishMs)}`, distanceM: ghostD!, color: '#b9c6d3', ghost: true });
    boats.push({ name: app.name, distanceM: myD, color: '#3fa9f5', highlight: true });
    drawCourse(canvas, distance, boats);

    raf = requestAnimationFrame(render);
  };
  render();

  return () => {
    cancelAnimationFrame(raf);
    offSample();
    window.removeEventListener('keydown', onKey);
  };
}
