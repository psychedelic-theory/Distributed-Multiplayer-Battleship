/**
 * store.js — Tiny reactive state container.
 *
 * Usage:
 *   store.set({ serverUrl: '...' });
 *   store.subscribe(state => { ... });
 *   store.get(); // current snapshot
 */

import { storage } from '../utils/storage.js';

const PERSISTED_KEYS = ['serverUrl', 'player', 'recentServers'];

function buildInitialState() {
  return {
    // Server connection
    serverUrl: storage.get('serverUrl', ''),
    serverConnected: false,

    // Recent servers history (for quick switching)
    recentServers: storage.get('recentServers', []),

    // Current player identity (per server — we store last used)
    player: storage.get('player', null),

    // Current screen (lobby, placement, game, end)
    screen: 'connect',     // 'connect' | 'lobby' | 'placement' | 'game' | 'end'

    // Current game state
    currentGame: null,     // normalized game object
    myShips: [],           // placed ships for the current game (client-local)
    moves: [],             // full move history (populated during game)
    opponentProfiles: {},  // playerId -> { player_id, username }

    // Last shot we fired (for highlight)
    lastShot: null,        // { row, col, result }

    // Game end info
    winnerId: null,
    loading: false,
  };
}

class Store {
  constructor() {
    this.state = buildInitialState();
    this.listeners = new Set();
  }

  get() { return this.state; }

  set(patch) {
    this.state = { ...this.state, ...patch };
    // Persist a whitelist of keys
    for (const k of PERSISTED_KEYS) {
      if (k in patch) storage.set(k, this.state[k]);
    }
    this._emit();
  }

  /**
   * Subscribe to changes. Returns an unsubscribe function.
   */
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit() {
    for (const fn of this.listeners) fn(this.state);
  }

  /**
   * Full reset — used when disconnecting from a server.
   */
  resetAll() {
    storage.remove('player');
    storage.remove('serverUrl');
    this.state = buildInitialState();
    this.state.serverUrl = '';
    this.state.player = null;
    this._emit();
  }

  /**
   * Game-specific reset — used when leaving a game (back to lobby).
   */
  resetGame() {
    this.set({
      currentGame: null,
      myShips: [],
      moves: [],
      opponentProfiles: {},
      lastShot: null,
      winnerId: null,
    });
  }

  /**
   * Track a server URL in the recent list.
   */
  addRecentServer(url) {
    const list = this.state.recentServers || [];
    const next = [url, ...list.filter(u => u !== url)].slice(0, 6);
    this.set({ recentServers: next });
  }
}

export const store = new Store();
