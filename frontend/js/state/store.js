// ==========================================================================
// Store — reactive global state
//
// PERSISTED KEYS: 'player', 'recentServers', 'theme'
//
// NOTE: 'serverUrl' is intentionally NOT persisted. Persisting it caused two
// bugs:
//   1. On page reload, validateInitialState() saw a non-null serverUrl and
//      routed straight to 'lobby', bypassing connect.js and the probe() that
//      validates the connection — so the client could end up pointing at a
//      stale or wrong URL with serverConnected=false.
//   2. After a manual disconnect, the stored serverUrl was restored on the
//      next store.set() call, undoing the disconnect before the user could
//      choose a different server.
//
// Consequence: every page load starts at the connect screen. The auto-connect
// logic in connect.js handles the cold-boot probe to the default server, and
// 'player' persistence means the user's identity is remembered across sessions
// once they reconnect.
// ==========================================================================

import { storage } from '../utils/storage.js';

const PERSIST_KEYS = ['player', 'recentServers', 'theme'];

const initialState = {
  // Navigation
  screen: 'connect',          // connect | lobby | placement | game | end

  // Theme — persisted; falls back to OS preference on first load
  theme: window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark',

  // Connection — never persisted; always re-established on page load
  serverUrl: null,
  serverConnected: false,
  recentServers: [],

  // Identity — persisted so the user doesn't re-enter their name every session
  player: null,               // { player_id, username }

  // Game session
  gameId: null,
  game: null,                 // normalized game object
  myShips: [],                // [{row,col}] kept in memory for the current game
  moves: [],                  // full move history for current game
  opponentMoves: [],          // moves by opponents only
  myMoves: [],                // moves by me only
  lastEvent: null,            // { type, ... } for transient UI feedback

  // Derived stats (session-local)
  myStats: null,
};

function loadPersisted() {
  const patch = {};
  for (const k of PERSIST_KEYS) {
    const v = storage.get(k, undefined);
    if (v !== undefined) patch[k] = v;
  }
  if (!patch.recentServers) patch.recentServers = [];
  return patch;
}

function savePersisted(state) {
  for (const k of PERSIST_KEYS) {
    if (state[k] !== undefined) storage.set(k, state[k]);
  }
}

function createStore() {
  let state = { ...initialState, ...loadPersisted() };

  // Always start disconnected regardless of what was stored. The connect
  // screen is responsible for establishing (and validating) a connection.
  state.serverUrl = null;
  state.serverConnected = false;
  state.screen = 'connect';

  const listeners = new Set();

  function get() { return state; }

  function set(patch) {
    const next = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...next };
    savePersisted(state);
    listeners.forEach(fn => {
      try { fn(state); } catch (e) { console.error('[store] listener error:', e); }
    });
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function resetGame() {
    set({
      gameId: null,
      game: null,
      myShips: [],
      moves: [],
      opponentMoves: [],
      myMoves: [],
      lastEvent: null,
    });
  }

  function addRecentServer(url) {
    if (!url) return;
    const current = state.recentServers || [];
    const filtered = current.filter(u => u !== url);
    const updated = [url, ...filtered].slice(0, 6);
    set({ recentServers: updated });
  }

  return { get, set, subscribe, resetGame, addRecentServer };
}

export const store = createStore();