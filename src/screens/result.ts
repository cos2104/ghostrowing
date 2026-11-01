import { app, esc, formatDiff, formatTime, go } from '../app';
import { formatPace } from '../pm5/parse';

export function mountResult(root: HTMLElement) {
  const last = app.lastRace;
  if (!last) {
    go('connect');
    return;
  }
  const { race, ghost, isBest, place, fieldSize } = last;
  const open = race.distance === 0;
  const pace = (r: { finishMs: number; traveledM?: number; distance: number }) => (r.finishMs / 1000) * (500 / Math.max(1, r.traveledM ?? r.distance));
  // 무제한은 평균 페이스 차이, 거리 레이스는 기록 차이
  const d = !ghost ? null : open ? formatDiff(pace(race) - pace(ghost), 's/500m') : formatDiff((race.finishMs - ghost.finishMs) / 1000, 's');

  root.innerHTML = `
    <section class="result">
      <p class="result-sub">${open ? `무제한 · ${Math.floor(race.traveledM)}m` : `${race.distance}m`} · ${race.source === 'pm5' ? 'PM5' : '테스트 모드'} · ${esc(race.name)}</p>
      ${place ? `<p class="result-place" id="r-place">${place}위 <small>/ ${fieldSize}명</small></p>` : ''}
      <div class="result-time" id="r-time">${formatTime(race.finishMs)}</div>
      ${open ? `<p class="result-dist">${(race.traveledM / 1000).toFixed(2)} km</p>` : ''}
      ${isBest ? `<p class="badge-best">${ghost ? (open ? '🎉 평균 페이스 신기록!' : '🎉 신기록!') : '첫 기록 — 다음 레이스의 고스트가 됩니다'}</p>` : ''}
      <div class="result-grid">
        <div><label>평균 페이스</label><output>${formatPace(race.avgPaceSec)}</output><span>/500m</span></div>
        <div><label>평균 파워</label><output>${race.avgWatts}</output><span>W</span></div>
        <div><label>평균 스트로크레이트</label><output>${race.avgSpm || '-'}</output><span>spm</span></div>
        <div><label>고스트 대비</label><output id="r-diff" class="${d?.cls ?? ''}">${d?.text ?? '-'}</output><span>${ghost ? (open ? `고스트 평균 ${formatPace(pace(ghost))}` : `고스트 ${formatTime(ghost.finishMs)}`) : ''}</span></div>
      </div>
      ${race.id === 'unsaved' ? '<p class="warn">이 기기에서는 기록을 저장할 수 없습니다.</p>' : ''}
      <div class="row center">
        <button id="again" class="big">다시 하기</button>
        <button id="change" class="big secondary">거리·연결 바꾸기</button>
      </div>
    </section>
  `;
  root.querySelector('#again')!.addEventListener('click', () => {
    if (app.source?.status === 'connected') go('race');
    else go('connect');
  });
  root.querySelector('#change')!.addEventListener('click', () => go('connect'));
}
