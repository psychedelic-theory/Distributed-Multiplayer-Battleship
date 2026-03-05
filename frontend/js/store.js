/**
 * store.js — Reactive state store
 * Minimal pub/sub pattern for cross-component communication.
 */

const _state = {
  // Identity
  playerId:   null,
  username:   null,

  // Current game
  gameId:       null,
  gameStatus:   null,  // 'waiting' | 'active' | 'finished'
  gridSize:     10,
  maxPlayers:   2,
  currentTurnIndex: 0,
  activePlayers: 0,

  // Boards
  myShips:      [],   // [{row, col}] placed by local player
  myHits:       new Set(), // "row,col" strings cells we've been hit on
  enemyShots:   {},   // map: targetPlayerId -> [{row,col,result}]
  myShots:      [],   // [{row, col, result}]

  // Placement phase
  pendingShips: [],   // ships being placed (not yet submitted)
  shipsPlaced:  false,

  // Turn
  isMyTurn:     false,
  winnerId:     null,

  // UI
  activeScreen: 'lobby', // 'lobby' | 'placement' | 'game' | 'results'
  notification: null,
  loading:      false,
};

const _listeners = new Map();

function get(key) { return _state[key]; }

function set(updates) {
  const changed = [];
  for (const [k, v] of Object.entries(updates)) {
    if (_state[k] !== v) {
      _state[k] = v;
      changed.push(k);
    }
  }
  changed.forEach(k => {
    (_listeners.get(k) || []).forEach(fn => fn(_state[k], _state));
    (_listeners.get('*') || []).forEach(fn => fn(_state));
  });
}

function on(key, fn) {
  if (!_listeners.has(key)) _listeners.set(key, []);
  _listeners.get(key).push(fn);
  return () => {
    const arr = _listeners.get(key) || [];
    const idx = arr.indexOf(fn);
    if (idx !== -1) arr.splice(idx, 1);
  };
}

function getAll() { return { ..._state }; }

export const store = { get, set, on, getAll };
