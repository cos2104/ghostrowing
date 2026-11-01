import { app, esc, go, setSource } from '../app';
import { COURSES } from '../courses/data';
import { TestSource } from '../rower/testSource';
import { COUNTRIES, flagUrl } from '../countries';
import { boatSprite, GENDERS, SHIRTS, type Character } from '../render/sprites';

const GENDER_KO: Record<string, string> = { m: '남자 선수', w: '여자 선수' };
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
            <div class="row" id="genders">${GENDERS.map((g) => `<button class="chip" data-gender="${g}">${GENDER_KO[g]}</button>`).join('')}</div>
            <div class="row" id="shirts">${SHIRTS.map((c) => `<button class="chip" data-shirt="${c}">${SHIRT_KO[c]} 유니폼</button>`).join('')}</div>
          </div>
        </div>
      </div>
      <div class="menu">
        <button id="solo" class="big">혼자 하기</button>
        <button id="demo" class="big demo">데모 레이스 <small>로잉머신 없이 · 컴퓨터 선수 4명 · 500m</small></button>
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
    root.querySelectorAll<HTMLButtonElement>('[data-gender]').forEach((b) => b.classList.toggle('selected', b.dataset.gender === ch.gender));
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
  root.querySelectorAll<HTMLButtonElement>('[data-gender]').forEach((b) =>
    b.addEventListener('click', () => {
      ch = { ...ch, gender: b.dataset.gender as Character['gender'] };
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
  // 데모: 실전형 자동 젓기 + 컴퓨터 선수로 바로 출발
  root.querySelector('#demo')!.addEventListener('click', () => {
    app.name = name.value;
    setSource(new TestSource({ type: 'auto', paceSec: 112, spm: 30, profile: 'race' }));
    if (app.course.loop) app.course = COURSES[0];
    app.distance = 500;
    app.aiCount = 4;
    go('race');
  });

  root.querySelector('#solo')!.addEventListener('click', () => {
    app.name = name.value;
    go('connect');
  });
}
