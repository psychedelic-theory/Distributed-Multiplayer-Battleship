// ==========================================================================
// Store — reactive global state
// ==========================================================================

import { storage } from '../utils/storage.js';

const PERSIST_KEYS = ['serverUrl', 'player', 'recentServers'];

const initialState = {
  // Navigation
  screen: 'connect',          // connect | lobby | placement | game | end

  // Connection
  serverUrl: null,
  serverConnected: false,
  recentServers: [],

  // Identity
  player: null,               // { player_id, username }

  // Game session
  gameId: null,
  game: null,                 // normalized game object
  myShips: [],                // [{row,col}] persisted per-game in memory
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
  // Sensible defaults
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
  // If we loaded a serverUrl from storage, mark connection as not-yet-probed.
  state.serverConnected = false;

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
