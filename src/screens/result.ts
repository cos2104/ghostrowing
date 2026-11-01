import { app, esc, fmtPace, formatDiff, formatTime, go, ICON } from '../app';
import { countryByCode, flagUrl } from '../countries';
import { timeAt, type Trace } from '../race/ghost';
import { paceOf } from '../storage/races';

/** 구간 기록: 거리 레이스는 500m(500m 레이스는 100m) 단위, 무제한은 500m 단위 */
function splits(trace: Trace, total: number) {
  const step = total <= 500 ? 100 : total <= 1000 ? 250 : 500;
  const out: { to: number; ms: number }[] = [];
  let prev = 0;
  for (let d = step; d <= total + 0.01; d += step) {
    const t = timeAt(trace, Math.min(d, total));
    if (t === null) break;
    out.push({ to: Math.min(d, total), ms: t - prev });
    prev = t;
  }
  return { step, out };
}

export function mountResult(root: HTMLElement) {
  const last = app.lastRace;
  if (!last) {
    go('connect');
    return;
  }
  const { race, ghost, isBest, place, fieldSize, field, courseName } = last;
  const open = race.distance === 0;
  const total = open ? race.traveledM : race.distance;
  const d = !ghost ? null : open ? formatDiff(paceOf(race) - paceOf(ghost), 's') : formatDiff((race.finishMs - ghost.finishMs) / 1000, 's');

  const mine = splits(race.trace, total);
  const ghostSplits = ghost ? splits(ghost.trace, total) : null;
  const paces = mine.out.map((s) => (s.ms / 1000) * (500 / mine.step));
  const maxP = Math.max(...paces, 1);
  const minP = Math.min(...paces, maxP);
  const medal = place === 1 ? 'gold' : place === 2 ? 'silver' : place === 3 ? 'bronze' : '';

  root.innerHTML = `
    <div class="page result">
      <div class="page-bg dim"></div>
      <header class="topbar">
        <button class="btn icon glass" id="home" aria-label="홈">${ICON.back}</button>
        <div class="title">레이스 결과</div>
        <span></span>
      </header>

      <div class="result-grid">
        <section class="card hero-card">
          <p class="eyebrow">${esc(courseName ?? '')} · ${open ? '무제한' : `${race.distance}m`} · ${race.source === 'pm5' ? 'PM5' : '테스트 모드'}</p>
          ${place ? `<div class="place ${medal}" id="r-place"><b>${place}</b><span>위 / ${fieldSize}명</span></div>` : ''}
          <div class="big-time" id="r-time">${formatTime(race.finishMs)}</div>
          ${open ? `<div class="big-sub">${(race.traveledM / 1000).toFixed(2)} km</div>` : ''}
          ${
            isBest
              ? `<span class="badge-pb">${ICON.trophy} ${ghost ? (open ? '평균 페이스 신기록' : '개인 신기록') : '첫 기록 · 다음 고스트가 됩니다'}</span>`
              : ghost
                ? `<span class="badge-muted">최고 기록 ${open ? fmtPace(paceOf(ghost)) + '/500m' : formatTime(ghost.finishMs)}</span>`
                : ''
          }
          <div class="stats">
            <div><span>평균 페이스</span><b>${fmtPace(race.avgPaceSec)}</b><small>/500m</small></div>
            <div><span>평균 파워</span><b>${race.avgWatts}</b><small>W</small></div>
            <div><span>스트로크</span><b>${race.avgSpm || '-'}</b><small>spm</small></div>
            <div><span>고스트 대비</span><b id="r-diff" class="${d?.cls ?? ''}">${d?.text ?? '—'}</b><small>${ghost ? (open ? '/500m' : '') : '고스트 없음'}</small></div>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h3>구간 페이스</h3><span class="muted">${mine.step}m 단위</span></div>
          <div class="splits">
            ${mine.out
              .map((s, i) => {
                const p = paces[i];
                const w = 35 + 65 * ((maxP - p) / Math.max(0.1, maxP - minP));
                const g = ghostSplits?.out[i];
                const gd = g ? formatDiff((s.ms - g.ms) / 1000, '') : null;
                return `<div class="split-row ${p === minP ? 'best' : ''}">
                  <span class="s-to">${s.to}m</span>
                  <span class="s-bar"><i style="width:${w.toFixed(0)}%"></i></span>
                  <span class="s-pace">${fmtPace(p)}</span>
                  <span class="s-gd ${gd?.cls ?? ''}">${gd ? gd.text : ''}</span>
                </div>`;
              })
              .join('') || '<p class="muted">구간 기록이 없습니다.</p>'}
          </div>
        </section>

        ${
          field && field.length > 1
            ? `<section class="card">
          <div class="card-head"><h3>결승 순위</h3></div>
          <ol class="ranking">
            ${field
              .map(
                (f, i) => `<li class="${f.me ? 'me' : ''}${f.ghost ? ' ghost' : ''}">
                <i>${f.timeMs === null ? '-' : i + 1}</i>
                <img src="${flagUrl(countryByCode(f.country), 36, 24)}" alt="" />
                <span>${esc(f.name)}</span>
                <b>${f.timeMs === null ? 'DNF' : formatTime(f.timeMs)}</b>
              </li>`,
              )
              .join('')}
          </ol>
        </section>`
            : ''
        }
      </div>

      ${race.id === 'unsaved' ? '<p class="note warn center">이 기기에서는 기록을 저장할 수 없습니다.</p>' : ''}
      <footer class="action-bar">
        <button id="change" class="btn glass xl">설정 바꾸기</button>
        <button id="again" class="btn primary xl">다시 하기 ${ICON.arrow}</button>
      </footer>
    </div>
  `;
  root.querySelector('#again')!.addEventListener('click', () => {
    if (app.source?.status === 'connected') go('race');
    else go('connect');
  });
  root.querySelector('#change')!.addEventListener('click', () => go('connect'));
  root.querySelector('#home')!.addEventListener('click', () => go('home'));
}
