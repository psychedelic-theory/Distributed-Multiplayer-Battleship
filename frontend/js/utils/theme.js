// ==========================================================================
// Theme — apply data-theme attribute and keep it in sync with store
// ==========================================================================

import { store } from '../state/store.js';

function apply(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function initTheme() {
  apply(store.get().theme);
  store.subscribe(state => apply(state.theme));
}
