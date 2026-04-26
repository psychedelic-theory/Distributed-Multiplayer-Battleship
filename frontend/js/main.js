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
let headerMount = null;
let screenMount = null;

// Track the last values of header-relevant state so we can skip rebuilding
// the header on unrelated store changes (e.g. polling updates to `game`).
let lastHeaderKey = null;

function headerKey(state) {
  // Anything the header reads should be in this key. If the key hasn't changed,
  // the header's visual output wouldn't change either, so skip the rebuild.
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

  // Connect screen has its own hero treatment — show a floating toolbar with
  // just the theme toggle instead of the full header.
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

  // Stop any lingering polling when switching screens.
  // Individual screens re-start polling as needed.
  session.stopPolling();

  // Render into the screen mount
  module.render(screenMount);
  currentScreen = screen;
}

function rerenderAll() {
  renderHeader();
  // Only re-render screen body when screen actually changes; each screen is
  // responsible for its own intra-screen re-renders.
  const { screen } = store.get();
  if (screen !== currentScreen) {
    renderScreen();
  }
}

function setupRouter() {
  store.subscribe(() => rerenderAll());
}

function validateInitialState() {
  // If we have a serverUrl from storage but haven't probed yet, start at connect.
  const { serverUrl, player } = store.get();
  if (!serverUrl) {
    store.set({ screen: 'connect' });
  } else if (!player) {
    // Known server, but no player registered — go to lobby to register.
    store.set({ screen: 'lobby' });
  } else {
    // Have both — go to lobby.
    store.set({ screen: 'lobby' });
  }
}

function boot() {
  initTheme();

  const app = document.getElementById('app');
  if (!app) { console.error('[main] #app not found'); return; }

  clear(app);

  // Structure: header + screen container
  headerMount = h('div', { id: 'header-mount' });
  screenMount = h('main', { id: 'screen-mount', class: 'app-shell' });

  app.appendChild(headerMount);
  app.appendChild(screenMount);

  setupRouter();
  validateInitialState();
  // Initial render (validateInitialState may not trigger a change if screen matches)
  renderHeader(true);
  renderScreen();
}

// Go.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
