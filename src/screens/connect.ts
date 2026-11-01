import { app, distanceLabel, DISTANCES, esc, fmtPace, formatTime, go, ICON, setSource } from '../app';
import { clock } from '../clock';
import { COURSES } from '../courses/data';
import { formatPace } from '../pm5/parse';
import { Pm5Source } from '../rower/pm5Source';
import { TestSource } from '../rower/testSource';
import { getBest, paceOf } from '../storage/races';

const PACES = [100, 110, 120, 130, 140];
const THEME_ART: Record<string, string> = {
  lake: 'linear-gradient(135deg,#1e6b52 0%,#2c8a9e 55%,#a8d8e8 100%)',
  city: 'linear-gradient(135deg,#1d2b4a 0%,#3b5a8f 50%,#f2a65a 100%)',
  countryside: 'linear-gradient(135deg,#3d6b2a 0%,#7aa64a 50%,#d9e7a6 100%)',
  brick: 'linear-gradient(135deg,#6b2f22 0%,#a5523b 50%,#e7c6a1 100%)',
  loop: 'conic-gradient(from 200deg,#0ea5e9,#8b5cf6,#22c55e,#f59e0b,#0ea5e9)',
};

export function mountConnect(root: HTMLElement) {
  const fast = clock.speed() !== 1;
  let autoPace = 120;
  let autoRace = true;

  root.innerHTML = `
    <div class="page setup">
      <div class="page-bg dim"></div>
      <header class="topbar">
        <button class="btn icon glass" id="back" aria-label="홈">${ICON.back}</button>
        <div class="title">레이스 준비</div>
        <span></span>
      </header>

      <div class="setup-grid">
        <section class="card">
          <div class="card-head"><h3><i class="num">1</i>로잉머신</h3><span class="status-dot" id="dot"></span></div>
          <div class="tiles three">
            <button class="tile" id="pm5" ${fast ? 'disabled' : ''}>${ICON.bt}<b>PM5 연결</b><small>블루투스</small></button>
            <button class="tile" id="test-auto">${ICON.auto}<b>자동 젓기</b><small>머신 없이 테스트</small></button>
            <button class="tile" id="test-manual">${ICON.tap}<b>탭으로 젓기</b><small>화면·스페이스바</small></button>
          </div>
          <div class="auto-opts" id="auto-opts">
            <div class="field inline-field"><span>페이스</span>
              <div class="seg small" id="paces">${PACES.map((p) => `<button data-pace="${p}">${fmtPace(p).slice(0, 4)}</button>`).join('')}</div>
            </div>
            <label class="switch"><input type="checkbox" id="auto-race" checked /><i></i><span>실전형 (출발·막판 스퍼트)</span></label>
          </div>
          ${fast ? `<p class="note warn">개발용 배속 ×${clock.speed()} — PM5는 사용할 수 없습니다.</p>` : ''}
          <p id="src-status" class="note"></p>
          <div class="live" id="live">
            <div><span>거리</span><b id="p-dist">-</b></div>
            <div><span>페이스</span><b id="p-pace">-</b></div>
            <div><span>spm</span><b id="p-spm">-</b></div>
            <div><span>파워</span><b id="p-watts">-</b></div>
          </div>
          <details class="help">
            <summary>PM5가 목록에 안 보이나요?</summary>
            <ol>
              <li>PM5는 한 번에 기기 하나만 연결됩니다. ErgData 등 다른 앱을 <b>완전히 종료</b>하세요.</li>
              <li>PM5 메인 메뉴에서 <b>Connect</b>를 눌러 연결 대기 화면을 띄운 상태로 다시 시도하세요.</li>
              <li>태블릿 <b>위치(GPS)</b>를 켜고, 크롬 앱 권한에서 <b>근처 기기</b>를 허용하세요.</li>
              <li>안드로이드 블루투스 설정에서 PM5를 직접 페어링했다면 <b>등록 해제</b>하세요.</li>
            </ol>
            <button id="pm5-all" class="btn glass" ${fast ? 'disabled' : ''}>모든 블루투스 기기 보기</button>
          </details>
        </section>

        <section class="card">
          <div class="card-head"><h3><i class="num">2</i>거리</h3></div>
          <div class="dist" id="distances">
            ${DISTANCES.map((d) => `<button class="choice" data-d="${d}"><b>${distanceLabel(d)}</b><small data-best="${d}"></small></button>`).join('')}
          </div>
          <div class="card-head sub"><h3><i class="num">3</i>상대</h3></div>
          <div class="field inline-field"><span>컴퓨터 선수</span>
            <div class="seg small" id="ai">${[0, 2, 4].map((n) => `<button data-ai="${n}">${n ? `${n}명` : '없음'}</button>`).join('')}</div>
          </div>
          <div class="field inline-field"><span>화질</span>
            <div class="seg small" id="quality"><button data-q="high">높음</button><button data-q="low">가벼움</button></div>
          </div>
        </section>

        <section class="card wide">
          <div class="card-head"><h3><i class="num">4</i>코스</h3><span class="muted">무제한은 순환 코스에서만</span></div>
          <div class="courses" id="courses">
            ${COURSES.map(
              (c) => `<button class="course-card" data-course="${c.id}">
                <span class="art" style="background:${THEME_ART[c.loop ? 'loop' : c.theme]}"></span>
                <span class="c-txt"><b>${esc(c.name)}</b><small>${esc(c.region)}</small></span>
              </button>`,
            ).join('')}
          </div>
          <p class="note" id="course-desc"></p>
        </section>
      </div>

      <footer class="action-bar">
        <div class="summary" id="summary"></div>
        <button id="start" class="btn primary xl">레이스 시작 ${ICON.arrow}</button>
      </footer>
    </div>
  `;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const status = $('#src-status');
  $('#back').addEventListener('click', () => go('home'));

  function showError(e: unknown) {
    if (e instanceof DOMException && e.name === 'NotFoundError') status.textContent = '기기 선택이 취소되었습니다.';
    else status.textContent = `연결 실패: ${e instanceof Error ? e.message : String(e)}`;
  }

  async function pickPm5(showAll: boolean) {
    status.textContent = '연결 중…';
    try {
      setSource(null);
      setSource(await Pm5Source.pick(showAll));
      refreshBest();
    } catch (e) {
      showError(e);
    }
  }
  const useAuto = () => {
    setSource(new TestSource({ type: 'auto', paceSec: autoPace, spm: autoRace ? 30 : 28, profile: autoRace ? 'race' : 'steady' }));
    refreshBest();
  };
  $('#pm5').addEventListener('click', () => pickPm5(false));
  $('#pm5-all').addEventListener('click', () => pickPm5(true));
  $('#test-manual').addEventListener('click', () => {
    setSource(new TestSource({ type: 'manual' }));
    refreshBest();
  });
  $('#test-auto').addEventListener('click', useAuto);
  root.querySelectorAll<HTMLButtonElement>('[data-pace]').forEach((b) =>
    b.addEventListener('click', () => {
      autoPace = Number(b.dataset.pace);
      useAuto();
    }),
  );
  $<HTMLInputElement>('#auto-race').addEventListener('change', (e) => {
    autoRace = (e.target as HTMLInputElement).checked;
    useAuto();
  });

  root.querySelectorAll<HTMLButtonElement>('#distances .choice').forEach((b) =>
    b.addEventListener('click', () => (app.distance = Number(b.dataset.d))),
  );
  root.querySelectorAll<HTMLButtonElement>('#courses .course-card').forEach((b) =>
    b.addEventListener('click', () => {
      app.course = COURSES.find((c) => c.id === b.dataset.course)!;
      if (app.course.loop && app.distance !== 0) app.distance = 0;
    }),
  );
  root.querySelectorAll<HTMLButtonElement>('[data-ai]').forEach((b) => b.addEventListener('click', () => (app.aiCount = Number(b.dataset.ai))));
  root.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) =>
    b.addEventListener('click', () => (app.quality = b.dataset.q === 'low' ? 'low' : 'high')),
  );

  $('#start').addEventListener('click', () => go('race'));

  async function refreshBest() {
    const src = app.source;
    for (const d of DISTANCES) {
      const el = $(`[data-best="${d}"]`);
      el.textContent = '';
      if (!src) continue;
      try {
        const best = await getBest(src.kind, d);
        el.textContent = !best ? '첫 기록' : d === 0 ? `최고 ${fmtPace(paceOf(best))}` : `최고 ${formatTime(best.finishMs)}`;
      } catch {
        /* IndexedDB 불가 */
      }
    }
  }
  refreshBest();

  let raf = 0;
  const render = () => {
    const src = app.source;
    const connected = !!src && src.status === 'connected';
    if (!src) status.textContent ||= '연결 방법을 고르세요.';
    else if (src.status === 'disconnected') status.textContent = `${src.label}: 연결 끊김 — 다시 눌러 연결하세요`;
    else status.textContent = `연결됨 · ${src.label}`;
    $('#dot').dataset.on = connected ? '1' : '0';
    const kind = src instanceof TestSource ? (src.manual ? 'test-manual' : 'test-auto') : src ? 'pm5' : '';
    for (const id of ['pm5', 'test-auto', 'test-manual']) $(`#${id}`).classList.toggle('on', connected && kind === id);
    $('#auto-opts').hidden = kind !== 'test-auto';
    root.querySelectorAll<HTMLButtonElement>('[data-pace]').forEach((b) => b.classList.toggle('on', Number(b.dataset.pace) === autoPace));

    const s = src?.last;
    $('#live').classList.toggle('on', !!s);
    $('#p-dist').textContent = s ? `${Math.floor(s.distanceM)}m` : '-';
    $('#p-pace').textContent = s ? formatPace(s.paceSec) : '-';
    $('#p-spm').textContent = s ? String(s.spm) : '-';
    $('#p-watts').textContent = s ? `${s.watts}W` : '-';

    // 무제한은 순환 코스에서만. 직선 코스로 바꾸면 2000m로
    const loop = !!app.course.loop;
    if (!loop && app.distance === 0) app.distance = 2000;
    root.querySelectorAll<HTMLButtonElement>('#distances .choice').forEach((b) => {
      b.classList.toggle('on', Number(b.dataset.d) === app.distance);
      b.disabled = Number(b.dataset.d) === 0 && !loop;
    });
    const course = app.course;
    root.querySelectorAll<HTMLButtonElement>('#courses .course-card').forEach((b) => b.classList.toggle('on', b.dataset.course === course.id));
    $('#course-desc').textContent = course.description;
    root.querySelectorAll<HTMLButtonElement>('[data-ai]').forEach((b) => b.classList.toggle('on', Number(b.dataset.ai) === app.aiCount));
    root.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) => b.classList.toggle('on', b.dataset.q === app.quality));

    const dist = app.distance ? `${app.distance}m` : '무제한';
    $('#summary').innerHTML = `<b>${esc(course.name)}</b><span>${dist} · ${src ? esc(src.label) : '로잉머신 미연결'}${app.aiCount ? ` · 컴퓨터 ${app.aiCount}명` : ''}</span>`;
    const startBtn = $<HTMLButtonElement>('#start');
    startBtn.disabled = !connected;
    raf = requestAnimationFrame(render);
  };
  render();

  const onKey = (e: KeyboardEvent) => {
    const tag = document.activeElement?.tagName;
    if (e.code === 'Space' && tag !== 'INPUT' && tag !== 'SELECT') {
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur();
      app.source?.stroke();
    }
  };
  window.addEventListener('keydown', onKey);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
  };
}
