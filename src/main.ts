import './style.css';
import { currentRoute } from './app';
import { mountConnect } from './screens/connect';
import { mountDebug } from './screens/debug';
import { mountHome } from './screens/home';
import { mountRace } from './screens/race';
import { mountResult } from './screens/result';

type Mount = (root: HTMLElement) => (() => void) | void;

const screens: Record<ReturnType<typeof currentRoute>, Mount> = {
  home: mountHome,
  connect: mountConnect,
  race: mountRace,
  result: mountResult,
  debug: mountDebug,
};

const root = document.querySelector<HTMLElement>('#app')!;
let cleanup: (() => void) | void;

function show() {
  cleanup?.();
  cleanup = undefined;
  root.innerHTML = '';
  const route = currentRoute();
  root.dataset.screen = route;
  cleanup = screens[route](root);
}

window.addEventListener('hashchange', show);
show();
