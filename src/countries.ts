// 레인 카드·순위표에 쓰는 국가 (IOC 코드 + 국기 색). 국기는 단순화한 색 띠로 직접 그린다.
export interface Country {
  code: string;
  name: string;
  /** 국기: 띠 방향과 색 */
  flag: { dir: 'h' | 'v'; colors: string[] } | { kind: 'kor' | 'jpn' | 'usa' | 'gbr' | 'can' | 'chn' | 'gre' | 'sui' | 'den' | 'swe' | 'nor' | 'fin' };
  /** 유니폼·블레이드 색 */
  kit: number;
}

export const COUNTRIES: Country[] = [
  { code: 'KOR', name: '대한민국', flag: { kind: 'kor' }, kit: 0x1f3fbf },
  { code: 'JPN', name: '일본', flag: { kind: 'jpn' }, kit: 0xd8202e },
  { code: 'CHN', name: '중국', flag: { kind: 'chn' }, kit: 0xd8202e },
  { code: 'USA', name: '미국', flag: { kind: 'usa' }, kit: 0x1c2f6e },
  { code: 'CAN', name: '캐나다', flag: { kind: 'can' }, kit: 0xd8202e },
  { code: 'GBR', name: '영국', flag: { kind: 'gbr' }, kit: 0x1c2f6e },
  { code: 'GER', name: '독일', flag: { dir: 'h', colors: ['#000000', '#dd0000', '#ffce00'] }, kit: 0x111111 },
  { code: 'FRA', name: '프랑스', flag: { dir: 'v', colors: ['#0055a4', '#ffffff', '#ef4135'] }, kit: 0x0055a4 },
  { code: 'ITA', name: '이탈리아', flag: { dir: 'v', colors: ['#009246', '#ffffff', '#ce2b37'] }, kit: 0x1e5bd8 },
  { code: 'NED', name: '네덜란드', flag: { dir: 'h', colors: ['#ae1c28', '#ffffff', '#21468b'] }, kit: 0xff6a13 },
  { code: 'BEL', name: '벨기에', flag: { dir: 'v', colors: ['#000000', '#fdda24', '#ef3340'] }, kit: 0xd8202e },
  { code: 'CRO', name: '크로아티아', flag: { dir: 'h', colors: ['#ff0000', '#ffffff', '#171796'] }, kit: 0xd8202e },
  { code: 'CZE', name: '체코', flag: { dir: 'h', colors: ['#ffffff', '#d7141a'] }, kit: 0x11457e },
  { code: 'LTU', name: '리투아니아', flag: { dir: 'h', colors: ['#fdb913', '#006a44', '#c1272d'] }, kit: 0x006a44 },
  { code: 'IRL', name: '아일랜드', flag: { dir: 'v', colors: ['#169b62', '#ffffff', '#ff883e'] }, kit: 0x169b62 },
  { code: 'ROU', name: '루마니아', flag: { dir: 'v', colors: ['#002b7f', '#fcd116', '#ce1126'] }, kit: 0xfcd116 },
  { code: 'GRE', name: '그리스', flag: { kind: 'gre' }, kit: 0x0d5eaf },
  { code: 'SUI', name: '스위스', flag: { kind: 'sui' }, kit: 0xd52b1e },
  { code: 'DEN', name: '덴마크', flag: { kind: 'den' }, kit: 0xc8102e },
  { code: 'SWE', name: '스웨덴', flag: { kind: 'swe' }, kit: 0x006aa7 },
  { code: 'NOR', name: '노르웨이', flag: { kind: 'nor' }, kit: 0xba0c2f },
  { code: 'FIN', name: '핀란드', flag: { kind: 'fin' }, kit: 0x003580 },
  { code: 'AUS', name: '호주', flag: { dir: 'h', colors: ['#00843d', '#ffcd00'] }, kit: 0x00843d },
  { code: 'NZL', name: '뉴질랜드', flag: { dir: 'h', colors: ['#000000'] }, kit: 0x111111 },
  { code: 'UKR', name: '우크라이나', flag: { dir: 'h', colors: ['#0057b7', '#ffd700'] }, kit: 0x0057b7 },
  { code: 'POL', name: '폴란드', flag: { dir: 'h', colors: ['#ffffff', '#dc143c'] }, kit: 0xdc143c },
  { code: 'ESP', name: '스페인', flag: { dir: 'h', colors: ['#aa151b', '#f1bf00', '#f1bf00', '#aa151b'] }, kit: 0xaa151b },
];

export function countryByCode(code: string | null | undefined): Country {
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
}

/** 캔버스에 국기를 그린다 (x, y, w, h) */
export function drawFlag(ctx: CanvasRenderingContext2D, c: Country, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const f = c.flag;
  const fill = (col: string, rx: number, ry: number, rw: number, rh: number) => {
    ctx.fillStyle = col;
    ctx.fillRect(x + rx, y + ry, rw, rh);
  };
  if ('dir' in f) {
    const n = f.colors.length;
    f.colors.forEach((col, i) => (f.dir === 'h' ? fill(col, 0, (h * i) / n, w, h / n + 1) : fill(col, (w * i) / n, 0, w / n + 1, h)));
  } else {
    const cross = (bg: string, fg: string, inner?: string) => {
      fill(bg, 0, 0, w, h);
      const t = h * 0.22;
      fill(fg, w * 0.3, 0, t, h);
      fill(fg, 0, (h - t) / 2, w, t);
      if (inner) {
        const t2 = t * 0.5;
        fill(inner, w * 0.3 + (t - t2) / 2, 0, t2, h);
        fill(inner, 0, (h - t2) / 2, w, t2);
      }
    };
    switch (f.kind) {
      case 'kor': {
        fill('#ffffff', 0, 0, w, h);
        const r = h * 0.25;
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, r, Math.PI, 0);
        ctx.fillStyle = '#cd2e3a';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI);
        ctx.fillStyle = '#0047a0';
        ctx.fill();
        ctx.fillStyle = '#000';
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.fillRect(x + w / 2 + dx * w * 0.32 - w * 0.05, y + h / 2 + dy * h * 0.3 - h * 0.08, w * 0.1, h * 0.16);
        break;
      }
      case 'jpn':
        fill('#ffffff', 0, 0, w, h);
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, h * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = '#bc002d';
        ctx.fill();
        break;
      case 'chn':
        fill('#de2910', 0, 0, w, h);
        ctx.fillStyle = '#ffde00';
        ctx.beginPath();
        ctx.arc(x + w * 0.18, y + h * 0.28, h * 0.14, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'usa':
        for (let i = 0; i < 7; i++) fill(i % 2 ? '#ffffff' : '#b22234', 0, (h * i) / 7, w, h / 7 + 1);
        fill('#3c3b6e', 0, 0, w * 0.42, h * 0.54);
        break;
      case 'can':
        fill('#d80621', 0, 0, w, h);
        fill('#ffffff', w * 0.25, 0, w * 0.5, h);
        fill('#d80621', w * 0.44, h * 0.3, w * 0.12, h * 0.4);
        break;
      case 'gbr':
        fill('#012169', 0, 0, w, h);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = h * 0.2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y + h);
        ctx.moveTo(x + w, y);
        ctx.lineTo(x, y + h);
        ctx.stroke();
        fill('#ffffff', w * 0.42, 0, w * 0.16, h);
        fill('#ffffff', 0, h * 0.36, w, h * 0.28);
        fill('#c8102e', w * 0.45, 0, w * 0.1, h);
        fill('#c8102e', 0, h * 0.41, w, h * 0.18);
        break;
      case 'gre':
        for (let i = 0; i < 9; i++) fill(i % 2 ? '#ffffff' : '#0d5eaf', 0, (h * i) / 9, w, h / 9 + 1);
        fill('#0d5eaf', 0, 0, w * 0.37, (h * 5) / 9);
        fill('#ffffff', w * 0.15, 0, w * 0.07, (h * 5) / 9);
        fill('#ffffff', 0, h * 0.22, w * 0.37, h * 0.11);
        break;
      case 'sui':
        fill('#d52b1e', 0, 0, w, h);
        fill('#ffffff', w * 0.42, h * 0.2, w * 0.16, h * 0.6);
        fill('#ffffff', w * 0.3, h * 0.42, w * 0.4, h * 0.16);
        break;
      case 'den':
        cross('#c8102e', '#ffffff');
        break;
      case 'swe':
        cross('#006aa7', '#fecc00');
        break;
      case 'nor':
        cross('#ba0c2f', '#ffffff', '#00205b');
        break;
      case 'fin':
        cross('#ffffff', '#003580');
        break;
    }
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

/** HTML용 국기 data URL (캐시) */
const urlCache = new Map<string, string>();
export function flagUrl(c: Country, w = 48, h = 32): string {
  const key = `${c.code}-${w}x${h}`;
  let u = urlCache.get(key);
  if (!u) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    drawFlag(cv.getContext('2d')!, c, 0, 0, w, h);
    u = cv.toDataURL();
    urlCache.set(key, u);
  }
  return u;
}
