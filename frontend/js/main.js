// ==========================================================================
// main.js — bootstrap + router
// ==========================================================================

import { h, mount, clear } from './utils/dom.js';
import { store } from './state/store.js';
import { session } from './state/session.js';
import { initTheme } from './utils/theme.js';
import { Header } from '../components/layout/Header.js';
import { ThemeToggle } from '../components/ui/ThemeToggle.js';

import * as connect from './screens/connect.js';
import * as lobby from './screens/lobby.js';
import * as placement from './screens/placement.js';
import * as game from './screens/game.js';
import * as end from './screens/end.js';

const screens = { connect, lobby, placement, game, end };

let currentScreen = null;
let currentPlayerId = null; // track player so sign-out forces a re-render
let headerMount = null;
let screenMount = null;

let lastHeaderKey = null;

function headerKey(state) {
  return JSON.stringify({
    screen: state.screen,
    serverUrl: state.serverUrl,
    playerName: state.player?.username || null,
    playerId: state.player?.player_id || null,
    theme: state.theme,
  });
}

function renderHeader(force = false) {
  if (!headerMount) return;
  const state = store.get();
  const key = headerKey(state);
  if (!force && key === lastHeaderKey) return;
  lastHeaderKey = key;

  if (state.screen === 'connect') {
    mount(headerMount, h('div', { class: 'connect-toolbar' }, ThemeToggle()));
    return;
  }
  mount(headerMount, Header());
}

function renderScreen() {
  if (!screenMount) return;
  const { screen } = store.get();
  const module = screens[screen];
  if (!module || !module.render) {
    mount(screenMount, h('div', { class: 'screen' }, `Unknown screen: ${screen}`));
    return;
  }

  session.stopPolling();
  module.render(screenMount);
  currentScreen = screen;
}

function rerenderAll() {
  renderHeader();

  const state = store.get();
  const newPlayerId = state.player?.player_id ?? null;
  const screenChanged = state.screen !== currentScreen;
  // Re-render the lobby when the player signs out (player goes from set → null
  // while remaining on the lobby screen). Without this, the screen-change guard
  // would skip renderScreen() since the screen name hasn't changed.
  const playerSignedOut = currentPlayerId !== null && newPlayerId === null && state.screen === 'lobby';

  currentPlayerId = newPlayerId;

  if (screenChanged || playerSignedOut) {
    renderScreen();
  }
}

function setupRouter() {
  store.subscribe(() => rerenderAll());
}

function validateInitialState() {
  const { serverUrl, player } = store.get();
  if (!serverUrl) {
    store.set({ screen: 'connect' });
  } else if (!player) {
    store.set({ screen: 'lobby' });
  } else {
    store.set({ screen: 'lobby' });
  }
}

function boot() {
  initTheme();

  const app = document.getElementById('app');
  if (!app) { console.error('[main] #app not found'); return; }

  clear(app);

  headerMount = h('div', { id: 'header-mount' });
  screenMount = h('main', { id: 'screen-mount', class: 'app-shell' });

  app.appendChild(headerMount);
  app.appendChild(screenMount);

  setupRouter();
  validateInitialState();
  renderHeader(true);
  renderScreen();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}