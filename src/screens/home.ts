import { app, esc, go } from '../app';

export function mountHome(root: HTMLElement) {
  root.innerHTML = `
    <section class="home">
      <h1 class="logo">Ghost Rowing</h1>
      <p class="tagline">Concept2 PM5로 지난 나와 경주하기</p>
      <label class="field">닉네임
        <input id="name" maxlength="12" value="${esc(app.name)}" autocomplete="off" />
      </label>
      <div class="menu">
        <button id="solo" class="big">혼자 하기</button>
        <button class="big secondary" disabled>방 만들기 <small>2단계</small></button>
        <button class="big secondary" disabled>코드로 입장 <small>2단계</small></button>
        <button class="big secondary" disabled>관전하기 <small>3단계</small></button>
      </div>
      <p class="footnote"><a href="#/debug">PM5 패킷 측정 (디버그)</a></p>
    </section>
  `;
  const name = root.querySelector<HTMLInputElement>('#name')!;
  name.addEventListener('change', () => (app.name = name.value));
  root.querySelector('#solo')!.addEventListener('click', () => {
    app.name = name.value;
    go('connect');
  });
}
