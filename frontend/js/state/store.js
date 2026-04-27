// ==========================================================================
// Store — reactive global state
//
// PERSISTED KEYS: 'player', 'recentServers', 'theme'
//
// 'serverUrl' is intentionally NOT persisted — every page load starts at the
// connect screen so the connection is always freshly validated.
//
// Ship positions ARE persisted, but separately via persistShips/restoreShips,
// keyed by "gameId:playerId" so rejoining a game restores the correct board.
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
  myShips: [],                // [{row, col, shipIndex}] — in-memory + localStorage
  moves: [],
  opponentMoves: [],
  myMoves: [],
  lastEvent: null,

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

// Ship persistence helpers — keyed by "ships:gameId:playerId"
function shipsKey(gameId, playerId) {
  return `ships:${gameId}:${playerId}`;
}

function createStore() {
  let state = { ...initialState, ...loadPersisted() };

  // Always start disconnected; connect screen re-establishes everything.
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

  // ---------------------------------------------------------------------------
  // Ship persistence — called by placement.js whenever ships are confirmed,
  // and by lobby.js when entering a game to restore prior placements.
  // ---------------------------------------------------------------------------

  /** Save placed ships to localStorage for a specific game+player. */
  function persistShips(gameId, playerId, ships) {
    if (!gameId || !playerId) return;
    storage.set(shipsKey(gameId, playerId), ships);
  }

  /** Restore ships from localStorage. Returns [] if nothing stored. */
  function restoreShips(gameId, playerId) {
    if (!gameId || !playerId) return [];
    return storage.get(shipsKey(gameId, playerId), []);
  }

  /** Remove persisted ships (called when a game is finished or reset). */
  function clearShips(gameId, playerId) {
    if (!gameId || !playerId) return;
    storage.remove(shipsKey(gameId, playerId));
  }

  return { get, set, subscribe, resetGame, addRecentServer, persistShips, restoreShips, clearShips };
}

export const store = createStore();