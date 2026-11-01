import './style.css';
import { connect, pickDevice, type Channel, type Pm5Connection } from './pm5/connect';
import {
  dataViewToHex,
  formatPace,
  paceToWatts,
  parseAdditionalStatus1,
  parseAdditionalStatus2,
  parseGeneralStatus,
} from './pm5/parse';
import { GAP_LIMIT_MS, IntervalStats, REQUIRED_MS } from './stats';

type Status = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

const MAX_LOG = 20_000; // 250ms × 3채널 기준 약 25분 분량

interface LogEntry {
  t: number; // 연결 후 경과 ms
  ch: Channel;
  hex: string;
}

const state = {
  status: 'idle' as Status,
  message: '',
  device: null as BluetoothDevice | null,
  conn: null as Pm5Connection | null,
  connectedAt: 0,
  distanceM: null as number | null,
  elapsedSec: null as number | null,
  paceSec: null as number | null,
  spm: null as number | null,
  avgWatts: null as number | null,
  stats: new IntervalStats(),
  passedAt: null as number | null,
  log: [] as LogEntry[],
  parseErrors: 0,
};

const app = document.querySelector<HTMLElement>('#app')!;
app.innerHTML = `
  <header>
    <h1>Ghost Rowing <small>0단계 · PM5 연결 검증</small></h1>
    <div class="conn">
      <span id="status" class="badge"></span>
      <button id="connect">PM5 연결</button>
      <button id="disconnect" class="secondary">연결 끊기</button>
    </div>
  </header>
  <p id="message" class="message"></p>

  <section class="metrics">
    <div class="metric"><label>거리</label><output id="m-dist">-</output><span>m</span></div>
    <div class="metric"><label>페이스</label><output id="m-pace">-</output><span>/500m</span></div>
    <div class="metric"><label>스트로크레이트</label><output id="m-spm">-</output><span>spm</span></div>
    <div class="metric"><label>파워</label><output id="m-watts">-</output><span>W <em id="m-avgw"></em></span></div>
  </section>

  <section class="check">
    <h2>완료 기준 판정 <small>2분 동안 ${GAP_LIMIT_MS}ms 넘게 끊기지 않을 것 (0x0031 기준)</small></h2>
    <div class="grid">
      <div><label>측정 시간</label><output id="s-dur">0:00</output></div>
      <div><label>패킷 수</label><output id="s-count">0</output></div>
      <div><label>평균 간격</label><output id="s-avg">-</output></div>
      <div><label>최대 간격</label><output id="s-max">-</output></div>
      <div><label>끊김(${GAP_LIMIT_MS}ms 초과)</label><output id="s-gaps">0</output></div>
      <div><label>PM5 경과 시간</label><output id="s-pm5t">-</output></div>
    </div>
    <p id="verdict" class="verdict"></p>
    <div class="actions">
      <button id="reset" class="secondary">측정 다시 시작</button>
      <button id="copy" class="secondary">패킷 기록 복사</button>
      <button id="download" class="secondary">패킷 기록 다운로드</button>
      <span id="log-count"></span>
    </div>
  </section>
`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const STATUS_TEXT: Record<Status, string> = {
  idle: '대기',
  connecting: '연결 중…',
  connected: '연결됨',
  disconnected: '연결 끊김',
  error: '오류',
};

function setStatus(status: Status, message = '') {
  state.status = status;
  state.message = message;
  render();
}

function resetMeasurement() {
  state.stats = new IntervalStats();
  state.passedAt = null;
  state.log = [];
  state.connectedAt = performance.now();
  render();
}

function onPacket(ch: Channel, data: DataView, at: number) {
  if (state.log.length < MAX_LOG) {
    state.log.push({ t: Math.round(at - state.connectedAt), ch, hex: dataViewToHex(data) });
  }
  try {
    if (ch === '0031') {
      const g = parseGeneralStatus(data);
      state.distanceM = g.distanceM;
      state.elapsedSec = g.elapsedSec;
      state.stats.add(at);
    } else if (ch === '0032') {
      const a = parseAdditionalStatus1(data);
      state.paceSec = a.currentPaceSec;
      state.spm = a.strokeRate;
    } else {
      state.avgWatts = parseAdditionalStatus2(data).averagePowerW;
    }
  } catch (e) {
    state.parseErrors++;
    console.warn('해석 실패', ch, dataViewToHex(data), e);
  }
}

async function attach(device: BluetoothDevice) {
  setStatus('connecting');
  try {
    state.conn?.disconnect();
    state.conn = await connect(device, {
      onPacket,
      onDisconnect: () => setStatus('disconnected', 'PM5 연결이 끊겼습니다. 다시 연결을 눌러 주세요.'),
    });
    resetMeasurement();
    setStatus('connected', `${state.conn.name}에 연결됨. PM5에서 Just Row를 시작하세요.`);
  } catch (e) {
    setStatus('error', errorText(e));
  }
}

function errorText(e: unknown): string {
  if (e instanceof DOMException && e.name === 'NotFoundError') return '기기 선택이 취소되었습니다.';
  return e instanceof Error ? e.message : String(e);
}

$('connect').addEventListener('click', async () => {
  try {
    // 끊긴 기기는 선택 창 없이 바로 다시 붙인다
    const device = state.status === 'disconnected' && state.device ? state.device : await pickDevice();
    state.device = device;
    await attach(device);
  } catch (e) {
    setStatus('error', errorText(e));
  }
});

$('disconnect').addEventListener('click', () => {
  state.conn?.disconnect();
  state.conn = null;
  setStatus('disconnected', '연결을 끊었습니다.');
});

$('reset').addEventListener('click', resetMeasurement);

function logJson() {
  return JSON.stringify(
    {
      device: state.conn?.name ?? state.device?.name ?? null,
      userAgent: navigator.userAgent,
      capturedAt: new Date().toISOString(),
      stats: {
        count: state.stats.count,
        durationMs: Math.round(state.stats.durationMs),
        avgGapMs: Math.round(state.stats.avgGap),
        maxGapMs: Math.round(state.stats.maxGap),
        longGaps: state.stats.longGaps,
        parseErrors: state.parseErrors,
      },
      packets: state.log,
    },
    null,
    0,
  );
}

$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(logJson());
    state.message = `패킷 ${state.log.length}개를 복사했습니다.`;
  } catch {
    state.message = '복사 실패. 다운로드 버튼을 사용하세요.';
  }
  render();
});

$('download').addEventListener('click', () => {
  const blob = new Blob([logJson()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `pm5-packets-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

const fmtMs = (ms: number) => `${Math.round(ms)}ms`;
const fmtClock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function render() {
  const now = performance.now();
  const s = state.stats;

  const badge = $('status');
  badge.textContent = STATUS_TEXT[state.status];
  badge.dataset.status = state.status;
  $<HTMLButtonElement>('connect').textContent = state.status === 'disconnected' ? '다시 연결' : 'PM5 연결';
  $<HTMLButtonElement>('connect').disabled = state.status === 'connecting' || state.status === 'connected';
  $<HTMLButtonElement>('disconnect').disabled = state.status !== 'connected';
  $('message').textContent = state.message;

  $('m-dist').textContent = state.distanceM === null ? '-' : Math.floor(state.distanceM).toString();
  $('m-pace').textContent = state.paceSec === null ? '-' : formatPace(state.paceSec);
  $('m-spm').textContent = state.spm === null ? '-' : String(state.spm);
  $('m-watts').textContent = state.paceSec ? String(Math.round(paceToWatts(state.paceSec))) : '-';
  $('m-avgw').textContent = state.avgWatts === null ? '' : `(평균 ${state.avgWatts})`;

  $('s-dur').textContent = fmtClock(s.durationMs);
  $('s-count').textContent = String(s.count);
  $('s-avg').textContent = s.count > 1 ? fmtMs(s.avgGap) : '-';
  $('s-max').textContent = s.count > 1 ? fmtMs(s.maxGap) : '-';
  $('s-gaps').textContent = String(s.longGaps);
  $('s-pm5t').textContent = state.elapsedSec === null ? '-' : `${state.elapsedSec.toFixed(2)}s`;
  $('log-count').textContent = `기록 ${state.log.length}개${state.parseErrors ? ` · 해석 실패 ${state.parseErrors}` : ''}`;

  if (state.passedAt === null && s.passed(now)) state.passedAt = now;
  const verdict = $('verdict');
  if (state.passedAt !== null) {
    verdict.textContent = '✅ 완료 기준 통과';
    verdict.dataset.result = 'pass';
  } else if (s.longGaps > 0) {
    verdict.textContent = `❌ 끊김 ${s.longGaps}회 발생 — 측정 다시 시작으로 재시도`;
    verdict.dataset.result = 'fail';
  } else if (s.count > 0) {
    verdict.textContent = `측정 중… ${fmtClock(Math.max(0, REQUIRED_MS - s.durationMs))} 남음`;
    verdict.dataset.result = 'running';
  } else {
    verdict.textContent = '연결 후 PM5에서 젓기 시작하면 측정합니다.';
    verdict.dataset.result = 'idle';
  }
}

(function loop() {
  render();
  requestAnimationFrame(loop);
})();
