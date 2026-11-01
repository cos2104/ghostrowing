import { app, distanceLabel, esc, fmtPace, formatTime, go, ICON, setSource } from '../app';
import { COUNTRIES, flagUrl } from '../countries';
import { COURSES } from '../courses/data';
import { GENDERS, SHIRTS, type Character } from '../render/sprites';
import { TestSource } from '../rower/testSource';
import { listAll, paceOf, type SavedRace } from '../storage/races';

const GENDER_KO: Record<string, string> = { m: '남자', w: '여자' };
const SHIRT_HEX: Record<string, string> = { blue: '#1f4fbf', green: '#1f8f4a', red: '#c8202e', white: '#eeeeee' };
const SHIRT_KO: Record<string, string> = { blue: '파랑', green: '초록', red: '빨강', white: '흰색' };
const BASE = import.meta.env.BASE_URL;

export function mountHome(root: HTMLElement) {
  root.innerHTML = `
    <div class="page home">
      <div class="page-bg"></div>
      <header class="topbar">
        <div class="brand"><img src="${BASE}assets/ui/icon-192.png" alt="" /> Ghost Rowing</div>
        <a class="link-quiet" href="#/debug">PM5 진단</a>
      </header>

      <div class="home-grid">
        <section class="hero">
          <p class="eyebrow">CONCEPT2 PM5 · 3D 실시간 레이스</p>
          <h1>지난 나를<br /><span class="grad">이겨라.</span></h1>
          <p class="lede">PM5를 블루투스로 연결하고, 실제 조정 경기장을 옮겨 놓은 3D 코스에서 내 최고 기록 고스트와 경주하세요.</p>
          <div class="cta">
            <button id="solo" class="btn primary xl">레이스 준비 ${ICON.arrow}</button>
            <button id="demo" class="btn glass xl">데모 보기 <small>머신 없이 · 2분</small></button>
          </div>
          <div class="soon">
            <span class="pill">방 만들기</span><span class="pill">코드로 입장</span><span class="pill">관전 모드</span>
            <span class="soon-label">곧 지원</span>
          </div>
        </section>

        <aside class="card profile">
          <div class="card-head"><h3>내 선수</h3></div>
          <div class="profile-top">
            <div class="avatar" id="avatar"><img alt="" /><span class="ring"></span><img class="flag-badge" id="flag" alt="" /></div>
            <label class="field grow">
              <span>닉네임</span>
              <input id="name" maxlength="12" value="${esc(app.name)}" autocomplete="off" placeholder="닉네임" />
            </label>
          </div>
          <label class="field">
            <span>국가</span>
            <select id="country">
              ${COUNTRIES.map((c) => `<option value="${c.code}" ${c.code === app.country.code ? 'selected' : ''}>${c.code} · ${c.name}</option>`).join('')}
            </select>
          </label>
          <div class="field">
            <span>선수</span>
            <div class="seg" id="genders">${GENDERS.map((g) => `<button data-gender="${g}">${GENDER_KO[g]}</button>`).join('')}</div>
          </div>
          <div class="field">
            <span>유니폼</span>
            <div class="swatches" id="shirts">${SHIRTS.map((c) => `<button data-shirt="${c}" title="${SHIRT_KO[c]}" style="--c:${SHIRT_HEX[c]}"></button>`).join('')}</div>
          </div>
        </aside>

        <section class="card records">
          <div class="card-head"><h3>내 기록</h3><span class="muted" id="rec-count"></span></div>
          <div class="pb-row" id="pbs"></div>
          <ol class="recent" id="recent"><li class="empty">아직 기록이 없습니다. 데모로 먼저 둘러보세요.</li></ol>
        </section>
      </div>
    </div>
  `;
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;

  let ch: Character = app.character;
  function refreshProfile() {
    root.querySelectorAll<HTMLButtonElement>('[data-gender]').forEach((b) => b.classList.toggle('on', b.dataset.gender === ch.gender));
    root.querySelectorAll<HTMLButtonElement>('[data-shirt]').forEach((b) => b.classList.toggle('on', b.dataset.shirt === ch.shirt));
    $<HTMLImageElement>('#avatar img').src = `${BASE}assets/ui/avatar_${ch.gender}.jpg`;
    $('#avatar').style.setProperty('--c', SHIRT_HEX[ch.shirt]);
    $<HTMLImageElement>('#flag').src = flagUrl(app.country, 48, 32);
  }
  root.querySelectorAll<HTMLButtonElement>('[data-gender]').forEach((b) =>
    b.addEventListener('click', () => {
      ch = { ...ch, gender: b.dataset.gender as Character['gender'] };
      app.character = ch;
      refreshProfile();
    }),
  );
  root.querySelectorAll<HTMLButtonElement>('[data-shirt]').forEach((b) =>
    b.addEventListener('click', () => {
      ch = { ...ch, shirt: b.dataset.shirt as Character['shirt'] };
      app.character = ch;
      refreshProfile();
    }),
  );
  const sel = $<HTMLSelectElement>('#country');
  sel.addEventListener('change', () => {
    app.country = COUNTRIES.find((c) => c.code === sel.value)!;
    refreshProfile();
  });
  refreshProfile();

  const name = $<HTMLInputElement>('#name');
  name.addEventListener('change', () => (app.name = name.value));

  // 데모: 실전형 자동 젓기 + 컴퓨터 선수로 바로 출발
  $('#demo').addEventListener('click', () => {
    app.name = name.value;
    setSource(new TestSource({ type: 'auto', paceSec: 112, spm: 30, profile: 'race' }));
    if (app.course.loop) app.course = COURSES[0];
    app.distance = 500;
    app.aiCount = 4;
    go('race');
  });
  $('#solo').addEventListener('click', () => {
    app.name = name.value;
    go('connect');
  });

  loadRecords();

  async function loadRecords() {
    let all: SavedRace[];
    try {
      all = await listAll();
    } catch {
      $('#recent').innerHTML = '<li class="empty">이 브라우저에서는 기록을 저장할 수 없습니다.</li>';
      return;
    }
    $('#rec-count').textContent = all.length ? `${all.length}회` : '';
    // 거리별 최고 (PM5 우선, 없으면 테스트)
    const pbs = [500, 1000, 2000].map((d) => {
      const list = all.filter((r) => r.distance === d);
      const pm5 = list.filter((r) => r.source === 'pm5');
      const pool = pm5.length ? pm5 : list;
      const best = pool.reduce<SavedRace | null>((b, r) => (!b || r.finishMs < b.finishMs ? r : b), null);
      return { d, best, src: pm5.length ? 'PM5' : list.length ? '테스트' : '' };
    });
    $('#pbs').innerHTML = pbs
      .map(
        (p) => `<div class="pb"><span>${p.d}m</span><b>${p.best ? formatTime(p.best.finishMs) : '—'}</b><small>${p.best ? `${fmtPace(paceOf(p.best))}/500m · ${p.src}` : '기록 없음'}</small></div>`,
      )
      .join('');
    if (!all.length) return;
    const fmtDate = (t: number) => new Date(t).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
    $('#recent').innerHTML = all
      .slice(0, 5)
      .map((r) => {
        const course = COURSES.find((c) => c.id === r.courseId)?.name ?? '';
        const dist = r.distance ? distanceLabel(r.distance) : `${(r.traveledM / 1000).toFixed(2)}km`;
        return `<li><span class="tag ${r.source}">${r.source === 'pm5' ? 'PM5' : 'TEST'}</span>
          <span class="r-main"><b>${dist}</b><small>${esc(course)} · ${fmtDate(r.createdAt)}</small></span>
          <span class="r-time">${formatTime(r.finishMs)}<small>${fmtPace(paceOf(r))}</small></span></li>`;
      })
      .join('');
  }
}
