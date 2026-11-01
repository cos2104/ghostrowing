import { app, distanceLabel, DISTANCES, formatTime, go, setSource } from '../app';
import { clock } from '../clock';
import { COURSES } from '../courses/data';
import { formatPace } from '../pm5/parse';
import { Pm5Source } from '../rower/pm5Source';
import { TestSource } from '../rower/testSource';
import { getBest } from '../storage/races';

function formatPaceShort(r: { finishMs: number; traveledM?: number }) {
  const pace = (r.finishMs / 1000) * (500 / Math.max(1, r.traveledM ?? 0));
  return `${Math.floor(pace / 60)}:${(pace % 60).toFixed(1).padStart(4, '0')}/500m`;
}

export function mountConnect(root: HTMLElement) {
  const fast = clock.speed() !== 1;
  root.innerHTML = `
    <header>
      <h1><a href="#/">Ghost Rowing</a> <small>혼자 하기 · 준비</small></h1>
    </header>

    <section class="panel">
      <h2>1. 로잉머신 연결</h2>
      <div class="row">
        <button id="pm5" ${fast ? 'disabled' : ''}>PM5 연결</button>
        <button id="test-manual" class="secondary">테스트 모드: 탭·스페이스</button>
        <button id="test-auto" class="secondary">테스트 모드: 자동</button>
        <label class="inline">자동 페이스
          <select id="auto-pace">
            <option value="100">1:40</option>
            <option value="110">1:50</option>
            <option value="120" selected>2:00</option>
            <option value="130">2:10</option>
            <option value="140">2:20</option>
          </select>
        </label>
      </div>
      ${fast ? `<p class="warn">개발용 배속 ×${clock.speed()} — PM5는 사용할 수 없습니다.</p>` : ''}
      <p id="src-status" class="message"></p>
      <details class="help">
        <summary>PM5가 목록에 안 보이나요?</summary>
        <ol>
          <li>PM5는 한 번에 기기 하나만 연결됩니다. ErgData 등 다른 앱을 <b>완전히 종료</b>하세요.</li>
          <li>PM5 메인 메뉴에서 <b>Connect</b>를 눌러 연결 대기 화면을 띄운 상태로 다시 시도하세요.</li>
          <li>태블릿 <b>위치(GPS)</b>를 켜고, 크롬 앱 권한에서 <b>근처 기기</b>를 허용하세요.</li>
          <li>안드로이드 블루투스 설정에서 PM5를 직접 페어링했다면 <b>등록 해제</b>하세요.</li>
        </ol>
        <button id="pm5-all" class="secondary" ${fast ? 'disabled' : ''}>모든 블루투스 기기 보기</button>
      </details>
      <div class="preview">
        <div><label>거리</label><output id="p-dist">-</output></div>
        <div><label>페이스</label><output id="p-pace">-</output></div>
        <div><label>spm</label><output id="p-spm">-</output></div>
        <div><label>파워</label><output id="p-watts">-</output></div>
      </div>
    </section>

    <section class="panel">
      <h2>2. 거리</h2>
      <div class="row" id="distances">
        ${DISTANCES.map((d) => `<button class="choice" data-d="${d}">${distanceLabel(d)}<small data-best="${d}"></small></button>`).join('')}
      </div>
    </section>

    <section class="panel">
      <h2>3. 코스 <small>무제한은 순환 코스에서만</small></h2>
      <div class="courses" id="courses">
        ${COURSES.map(
          (c) => `<button class="course-card" data-course="${c.id}">
            <b>${c.name}</b><span>${c.region}</span><small>${c.description}</small>
          </button>`,
        ).join('')}
      </div>
    </section>

    <div class="row end">
      <button id="start" class="big">레이스 시작</button>
    </div>
  `;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const status = $('#src-status');

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
  $('#pm5').addEventListener('click', () => pickPm5(false));
  $('#pm5-all').addEventListener('click', () => pickPm5(true));
  $('#test-manual').addEventListener('click', () => {
    setSource(new TestSource({ type: 'manual' }));
    refreshBest();
  });
  $('#test-auto').addEventListener('click', () => {
    const paceSec = Number($<HTMLSelectElement>('#auto-pace').value);
    setSource(new TestSource({ type: 'auto', paceSec, spm: 28 }));
    refreshBest();
  });

  root.querySelectorAll<HTMLButtonElement>('#distances .choice').forEach((b) =>
    b.addEventListener('click', () => {
      app.distance = Number(b.dataset.d);
    }),
  );

  root.querySelectorAll<HTMLButtonElement>('#courses .course-card').forEach((b) =>
    b.addEventListener('click', () => {
      app.course = COURSES.find((c) => c.id === b.dataset.course)!;
    }),
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
        el.textContent = !best ? '' : d === 0 ? `최고 ${formatPaceShort(best)}` : `최고 ${formatTime(best.finishMs)}`;
      } catch {
        /* IndexedDB 불가 */
      }
    }
  }
  refreshBest();

  let raf = 0;
  const render = () => {
    const src = app.source;
    if (!src) status.textContent ||= '연결할 방법을 고르세요.';
    else if (src.status === 'disconnected') status.textContent = `${src.label}: 연결 끊김`;
    else status.textContent = `연결됨: ${src.label}`;
    const s = src?.last;
    $('#p-dist').textContent = s ? `${Math.floor(s.distanceM)}m` : '-';
    $('#p-pace').textContent = s ? formatPace(s.paceSec) : '-';
    $('#p-spm').textContent = s ? String(s.spm) : '-';
    $('#p-watts').textContent = s ? `${s.watts}W` : '-';
    // 무제한은 순환 코스에서만. 직선 코스로 바꾸면 2000m로
    const loop = !!app.course.loop;
    if (!loop && app.distance === 0) app.distance = 2000;
    root.querySelectorAll<HTMLButtonElement>('#distances .choice').forEach((b) => {
      b.classList.toggle('selected', Number(b.dataset.d) === app.distance);
      b.disabled = Number(b.dataset.d) === 0 && !loop;
    });
    const courseId = app.course.id;
    root.querySelectorAll<HTMLButtonElement>('#courses .course-card').forEach((b) => {
      b.classList.toggle('selected', b.dataset.course === courseId);
    });
    $<HTMLButtonElement>('#start').disabled = !src || src.status !== 'connected';
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
