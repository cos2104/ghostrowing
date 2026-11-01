import { app, esc, formatDiff, formatTime, go } from '../app';
import { formatPace } from '../pm5/parse';

export function mountResult(root: HTMLElement) {
  const last = app.lastRace;
  if (!last) {
    go('connect');
    return;
  }
  const { race, ghost, isBest } = last;
  const d = ghost ? formatDiff((race.finishMs - ghost.finishMs) / 1000, 's') : null;

  root.innerHTML = `
    <section class="result">
      <p class="result-sub">${race.distance}m · ${race.source === 'pm5' ? 'PM5' : '테스트 모드'} · ${esc(race.name)}</p>
      <div class="result-time" id="r-time">${formatTime(race.finishMs)}</div>
      ${isBest ? `<p class="badge-best">${ghost ? '🎉 신기록!' : '첫 기록 — 다음 레이스의 고스트가 됩니다'}</p>` : ''}
      <div class="result-grid">
        <div><label>평균 페이스</label><output>${formatPace(race.avgPaceSec)}</output><span>/500m</span></div>
        <div><label>평균 파워</label><output>${race.avgWatts}</output><span>W</span></div>
        <div><label>평균 스트로크레이트</label><output>${race.avgSpm || '-'}</output><span>spm</span></div>
        <div><label>고스트 대비</label><output id="r-diff" class="${d?.cls ?? ''}">${d?.text ?? '-'}</output><span>${ghost ? `고스트 ${formatTime(ghost.finishMs)}` : ''}</span></div>
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
