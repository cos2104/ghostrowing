// Kenney(CC0) 나룻배 + 선수 캐릭터를 합쳐 위에서 본 배 그림을 만든다.

export const HAIRS = ['black', 'blonde', 'brown'] as const;
export const SHIRTS = ['blue', 'green', 'red', 'white'] as const;
export type Hair = (typeof HAIRS)[number];
export type Shirt = (typeof SHIRTS)[number];

export interface Character {
  hair: Hair;
  shirt: Shirt;
}

const BASE = `${import.meta.env.BASE_URL}assets/kenney/`;
const cache = new Map<string, Promise<HTMLImageElement>>();

function load(file: string): Promise<HTMLImageElement> {
  let p = cache.get(file);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`이미지 로드 실패: ${file}`));
      img.src = BASE + file;
    });
    cache.set(file, p);
  }
  return p;
}

/** 배 길이(px, CSS). 실제 크기보다 크게 그려 알아보기 쉽게 */
export const BOAT_W = 46;
export const BOAT_H = 88;

/** 뱃머리가 위(북)를 향하는 배 그림. 2배 해상도 캔버스 */
export async function boatSprite(ch: Character, boat: 1 | 2 | 3 = 1): Promise<HTMLCanvasElement> {
  const [hull, person] = await Promise.all([load(`dinghyLarge${boat}.png`), load(`character_${ch.hair}_${ch.shirt}.png`)]);
  const s = 2;
  const c = document.createElement('canvas');
  c.width = BOAT_W * s;
  c.height = BOAT_H * s;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(hull, 0, 0, c.width, c.height);
  // 사람은 배 가운데보다 살짝 뒤(아래)에 앉힌다
  const pw = BOAT_W * 0.95 * s;
  const ph = (pw * person.height) / person.width;
  ctx.drawImage(person, (c.width - pw) / 2, c.height * 0.55 - ph / 2, pw, ph);
  c.style.width = `${BOAT_W}px`;
  c.style.height = `${BOAT_H}px`;
  return c;
}

export function characterUrl(ch: Character) {
  return `${BASE}character_${ch.hair}_${ch.shirt}.png`;
}
