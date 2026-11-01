// 가로 레인 코스 (Canvas 2D). 레인 하나에 배 하나.

export interface Boat {
  name: string;
  distanceM: number;
  color: string;
  ghost?: boolean;
  highlight?: boolean;
}

const LANE_H = 90;
const PAD_X = 24;
const PAD_Y = 28;

export function courseHeight(lanes: number) {
  return PAD_Y * 2 + lanes * LANE_H;
}

export function drawCourse(canvas: HTMLCanvasElement, raceDistance: number, boats: Boat[]) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = courseHeight(boats.length);
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.height = `${cssH}px`;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const boatLen = 56;
  const x0 = PAD_X + boatLen; // 출발선 (뱃머리 기준)
  const x1 = cssW - PAD_X; // 결승선
  const xOf = (d: number) => x0 + ((x1 - x0) * Math.min(d, raceDistance)) / raceDistance;

  // 물
  ctx.fillStyle = '#123247';
  ctx.fillRect(0, PAD_Y, cssW, boats.length * LANE_H);

  // 거리 눈금
  const step = raceDistance <= 500 ? 100 : 250;
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let d = 0; d <= raceDistance; d += step) {
    const x = xOf(d);
    ctx.strokeStyle = d === 0 || d === raceDistance ? '#e8edf2' : 'rgba(232,237,242,0.18)';
    ctx.lineWidth = d === raceDistance ? 3 : 1;
    ctx.beginPath();
    ctx.moveTo(x, PAD_Y);
    ctx.lineTo(x, PAD_Y + boats.length * LANE_H);
    ctx.stroke();
    ctx.fillStyle = '#8a97a6';
    ctx.fillText(`${d}m`, x, PAD_Y - 8);
  }

  // 레인 구분선
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.setLineDash([6, 8]);
  for (let i = 1; i < boats.length; i++) {
    const y = PAD_Y + i * LANE_H;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cssW, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  boats.forEach((b, i) => {
    const cy = PAD_Y + i * LANE_H + LANE_H / 2;
    const nose = xOf(b.distanceM);
    ctx.globalAlpha = b.ghost ? 0.45 : 1;

    // 선체
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.moveTo(nose, cy);
    ctx.quadraticCurveTo(nose - boatLen * 0.35, cy - 11, nose - boatLen, cy - 5);
    ctx.lineTo(nose - boatLen, cy + 5);
    ctx.quadraticCurveTo(nose - boatLen * 0.35, cy + 11, nose, cy);
    ctx.fill();
    if (b.highlight) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 이름
    ctx.fillStyle = '#e8edf2';
    ctx.font = `${b.highlight ? 'bold ' : ''}13px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(b.name, Math.max(4, nose - boatLen), cy - 16);
    ctx.globalAlpha = 1;
  });
}
