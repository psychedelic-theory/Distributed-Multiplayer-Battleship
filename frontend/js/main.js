// ==========================================================================
// main.js — bootstrap + router
// ==========================================================================

import { h, mount, clear } from './utils/dom.js';
import { store } from './state/store.js';
import { session } from './state/session.js';
import { Header } from '../components/layout/Header.js';

import * as connect from './screens/connect.js';
import * as lobby from './screens/lobby.js';
import * as placement from './screens/placement.js';
import * as game from './screens/game.js';
import * as end from './screens/end.js';

const screens = { connect, lobby, placement, game, end };

let currentScreen = null;
let headerMount = null;
let screenMount = null;

function renderHeader() {
  if (!headerMount) return;
  const { screen } = store.get();
  // Hide header on the connect screen — it has its own hero treatment.
  if (screen === 'connect') {
    clear(headerMount);
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
  renderHeader();
  renderScreen();
}

// Go.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
