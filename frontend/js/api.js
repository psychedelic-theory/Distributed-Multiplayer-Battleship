/**
 * api.js — Centralized API client
 * All communication with the Flask backend.
 * Set API_BASE in your .env or override window.API_BASE before loading.
 */

const API_BASE = window.API_BASE || '';

class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body   = body;
  }
}

async function request(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== null) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}/api${path}`, opts);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(data.error || `HTTP ${res.status}`, res.status, data);
  }
  return data;
}

export const api = {
  // ── Players ──────────────────────────────────
  createPlayer: (username)     => request('POST', '/players', { username }),
  getPlayer:    (playerId)     => request('GET',  `/players/${playerId}`),
  getStats:     (playerId)     => request('GET',  `/players/${playerId}/stats`),

  // ── Games ────────────────────────────────────
  createGame:  (creatorId, gridSize, maxPlayers) =>
    request('POST', '/games', { creator_id: creatorId, grid_size: gridSize, max_players: maxPlayers }),
  joinGame:    (gameId, playerId) =>
    request('POST', `/games/${gameId}/join`, { player_id: playerId }),
  getGame:     (gameId) => request('GET', `/games/${gameId}`),
  placeShips:  (gameId, playerId, ships) =>
    request('POST', `/games/${gameId}/place`, { player_id: playerId, ships }),
  fire:        (gameId, playerId, row, col) =>
    request('POST', `/games/${gameId}/fire`, { player_id: playerId, row, col }),
  getMoves:    (gameId) => request('GET', `/games/${gameId}/moves`),

  // ── Reset ────────────────────────────────────
  reset: () => request('POST', '/reset'),
};

export { ApiError };
