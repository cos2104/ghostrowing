import { app, esc, go } from '../app';
import { COUNTRIES, flagUrl } from '../countries';
import { boatSprite, HAIRS, SHIRTS, type Character } from '../render/sprites';

const HAIR_KO: Record<string, string> = { black: '검정', blonde: '금발', brown: '갈색' };
const SHIRT_KO: Record<string, string> = { blue: '파랑', green: '초록', red: '빨강', white: '흰색' };

export function mountHome(root: HTMLElement) {
  root.innerHTML = `
    <section class="home">
      <h1 class="logo">Ghost Rowing</h1>
      <p class="tagline">Concept2 PM5로 지난 나와 경주하기</p>
      <label class="field">닉네임
        <input id="name" maxlength="12" value="${esc(app.name)}" autocomplete="off" />
      </label>
      <div class="field">국가
        <div class="country-pick">
          <img id="flag" class="flag" alt="" />
          <select id="country">
            ${COUNTRIES.map((c) => `<option value="${c.code}" ${c.code === app.country.code ? 'selected' : ''}>${c.code} · ${c.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field">선수
        <div class="char-pick">
          <div id="char-preview" class="char-preview"></div>
          <div class="char-opts">
            <div class="row" id="hairs">${HAIRS.map((h) => `<button class="chip" data-hair="${h}">${HAIR_KO[h]} 머리</button>`).join('')}</div>
            <div class="row" id="shirts">${SHIRTS.map((c) => `<button class="chip" data-shirt="${c}">${SHIRT_KO[c]} 옷</button>`).join('')}</div>
          </div>
        </div>
      </div>
      <div class="menu">
        <button id="solo" class="big">혼자 하기</button>
        <button class="big secondary" disabled>방 만들기 <small>2단계</small></button>
        <button class="big secondary" disabled>코드로 입장 <small>2단계</small></button>
        <button class="big secondary" disabled>관전하기 <small>3단계</small></button>
      </div>
      <p class="footnote"><a href="#/debug">PM5 패킷 측정 (디버그)</a></p>
    </section>
  `;
  let ch: Character = app.character;
  const preview = root.querySelector<HTMLElement>('#char-preview')!;
  async function refresh() {
    root.querySelectorAll<HTMLButtonElement>('[data-hair]').forEach((b) => b.classList.toggle('selected', b.dataset.hair === ch.hair));
    root.querySelectorAll<HTMLButtonElement>('[data-shirt]').forEach((b) => b.classList.toggle('selected', b.dataset.shirt === ch.shirt));
    try {
      const sprite = await boatSprite(ch);
      sprite.style.width = '60px';
      sprite.style.height = '114px';
      preview.replaceChildren(sprite);
    } catch {
      preview.textContent = '';
    }
  }
  root.querySelectorAll<HTMLButtonElement>('[data-hair]').forEach((b) =>
    b.addEventListener('click', () => {
      ch = { ...ch, hair: b.dataset.hair as Character['hair'] };
      app.character = ch;
      refresh();
    }),
  );
  root.querySelectorAll<HTMLButtonElement>('[data-shirt]').forEach((b) =>
    b.addEventListener('click', () => {
      ch = { ...ch, shirt: b.dataset.shirt as Character['shirt'] };
      app.character = ch;
      refresh();
    }),
  );
  refresh();

  const sel = root.querySelector<HTMLSelectElement>('#country')!;
  const flag = root.querySelector<HTMLImageElement>('#flag')!;
  const showFlag = () => (flag.src = flagUrl(app.country, 60, 40));
  showFlag();
  sel.addEventListener('change', () => {
    app.country = COUNTRIES.find((c) => c.code === sel.value)!;
    showFlag();
  });

  const name = root.querySelector<HTMLInputElement>('#name')!;
  name.addEventListener('change', () => (app.name = name.value));
  root.querySelector('#solo')!.addEventListener('click', () => {
    app.name = name.value;
    go('connect');
  });
}
