/**
 * client.js — Universal Battleship API client.
 *
 * Tolerates minor response-shape variation across different teams' servers
 * as long as they honor the Phase 1 protocol:
 *
 *   POST   /api/players          { username }              -> { player_id }
 *   GET    /api/players          -> { players: [...] }     (lobby convenience; may be absent)
 *   GET    /api/players/:id      -> { player_id, username }
 *   GET    /api/players/:id/stats
 *   POST   /api/games            { creator_id, grid_size, max_players } -> { game_id }
 *   GET    /api/games            -> { games: [...] }       (lobby convenience; may be absent)
 *   GET    /api/games/:id
 *   POST   /api/games/:id/join   { player_id }
 *   POST   /api/games/:id/place  { player_id, ships: [{row,col}x3] }
 *   POST   /api/games/:id/fire   { player_id, row, col }
 *   GET    /api/games/:id/moves
 *
 * Philosophy: parse loosely, normalize into predictable shapes for UI code.
 */

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.status  = status;
    this.payload = payload;
  }
}

export class ApiClient {
  /**
   * @param {string} baseUrl — origin only, no trailing slash.
   */
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  // ------------------------------------------------------------------
  // Transport
  // ------------------------------------------------------------------

  async _fetch(path, { method = 'GET', body, signal } = {}) {
    const url = `${this.baseUrl}${path}`;
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
      signal,
    };
    if (body !== undefined) opts.body = JSON.stringify(body);

    let response;
    try {
      response = await fetch(url, opts);
    } catch (err) {
      // Network-level failure (CORS, unreachable host, offline)
      throw new ApiError(
        `Cannot reach server (${err.message || 'network error'})`,
        0,
        null
      );
    }

    let payload = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try { payload = await response.json(); } catch { payload = null; }
    } else {
      try { payload = await response.text(); } catch { payload = null; }
    }

    if (!response.ok) {
      const message = (payload && typeof payload === 'object' && payload.error)
        ? payload.error
        : `Request failed (${response.status})`;
      throw new ApiError(message, response.status, payload);
    }

    return payload;
  }

  // ------------------------------------------------------------------
  // Health / server probe
  // ------------------------------------------------------------------

  /**
   * Used by the "connect to server" flow. We attempt GET /api/health first,
   * and fall back to GET /api/games — a GET any server implementing the
   * protocol must respond to (even with an empty collection).
   *
   * Returns { ok: boolean, detail: string }
   */
  async probe() {
    // Try /api/health first
    try {
      const res = await this._fetch('/api/health');
      if (res && (res.status === 'ok' || res.status === undefined)) {
        return { ok: true, detail: 'server alive (health)' };
      }
      return { ok: true, detail: 'server responded' };
    } catch (err) {
      if (err.status === 404) {
        // Server may not expose /health — try /api/games as a spec-required endpoint
        try {
          await this._fetch('/api/games');
          return { ok: true, detail: 'server alive (games endpoint)' };
        } catch (err2) {
          throw err2;
        }
      }
      throw err;
    }
  }

  // ------------------------------------------------------------------
  // Players
  // ------------------------------------------------------------------

  async createPlayer(username) {
    const res = await this._fetch('/api/players', {
      method: 'POST',
      body: { username },
    });
    return this._normalizePlayer(res);
  }

  async getPlayer(playerId) {
    const res = await this._fetch(`/api/players/${playerId}`);
    return this._normalizePlayer(res);
  }

  async getPlayerStats(playerId) {
    const res = await this._fetch(`/api/players/${playerId}/stats`);
    return {
      games_played: res.games_played ?? res.gamesPlayed ?? 0,
      wins:         res.wins ?? 0,
      losses:       res.losses ?? 0,
      total_shots:  res.total_shots ?? res.totalShots ?? 0,
      total_hits:   res.total_hits  ?? res.totalHits  ?? 0,
      accuracy:     res.accuracy ?? 0,
    };
  }

  /**
   * Optional endpoint (not strictly required by the spec, but most
   * classmates' servers expose it). If missing, returns empty array.
   */
  async listPlayers() {
    try {
      const res = await this._fetch('/api/players');
      const list = Array.isArray(res) ? res : (res.players ?? []);
      return list.map(p => this._normalizePlayer(p));
    } catch (err) {
      if (err.status === 404 || err.status === 405) return [];
      throw err;
    }
  }

  // ------------------------------------------------------------------
  // Games
  // ------------------------------------------------------------------

  async createGame({ creatorId, gridSize, maxPlayers }) {
    const res = await this._fetch('/api/games', {
      method: 'POST',
      body: {
        creator_id: creatorId,
        grid_size: gridSize,
        max_players: maxPlayers,
      },
    });
    return {
      game_id:     res.game_id ?? res.gameId,
      status:      res.status ?? 'waiting',
      grid_size:   res.grid_size ?? gridSize,
      max_players: res.max_players ?? maxPlayers,
    };
  }

  async getGame(gameId) {
    const res = await this._fetch(`/api/games/${gameId}`);
    return this._normalizeGame(res);
  }

  async listGames() {
    try {
      const res = await this._fetch('/api/games');
      const list = Array.isArray(res) ? res : (res.games ?? []);
      return list.map(g => this._normalizeGame(g));
    } catch (err) {
      if (err.status === 404 || err.status === 405) return [];
      throw err;
    }
  }

  async joinGame(gameId, playerId) {
    return this._fetch(`/api/games/${gameId}/join`, {
      method: 'POST',
      body: { player_id: playerId },
    });
  }

  async placeShips(gameId, playerId, ships) {
    return this._fetch(`/api/games/${gameId}/place`, {
      method: 'POST',
      body: { player_id: playerId, ships },
    });
  }

  async fire(gameId, playerId, row, col) {
    const res = await this._fetch(`/api/games/${gameId}/fire`, {
      method: 'POST',
      body: { player_id: playerId, row, col },
    });
    return {
      result:         res.result,
      next_player_id: res.next_player_id ?? res.nextPlayerId ?? null,
      game_status:    res.game_status ?? res.gameStatus ?? 'active',
      winner_id:      res.winner_id ?? res.winnerId ?? null,
    };
  }

  async getMoves(gameId) {
    const res = await this._fetch(`/api/games/${gameId}/moves`);
    const list = Array.isArray(res) ? res : (res.moves ?? []);
    return list.map(m => ({
      player_id: m.player_id ?? m.playerId,
      row:       m.row,
      col:       m.col,
      result:    m.result,
      timestamp: m.timestamp ?? m.created_at ?? null,
    }));
  }

  // ------------------------------------------------------------------
  // Normalizers
  // ------------------------------------------------------------------

  _normalizePlayer(p) {
    if (!p) return null;
    return {
      player_id: p.player_id ?? p.playerId ?? p.id,
      username:  p.username  ?? p.name     ?? p.displayName ?? '',
    };
  }

  _normalizeGame(g) {
    if (!g) return null;
    // Different servers may report slightly different status strings.
    // We accept any of: 'waiting', 'waiting_setup', 'active', 'playing', 'finished'
    const rawStatus = g.status ?? g.state ?? 'waiting';
    let status = String(rawStatus).toLowerCase();
    if (status === 'waiting_setup') status = 'waiting';
    if (status === 'playing')       status = 'active';

    return {
      game_id:              g.game_id ?? g.gameId ?? g.id,
      grid_size:            g.grid_size ?? g.gridSize ?? 10,
      max_players:          g.max_players ?? g.maxPlayers ?? 2,
      status,
      current_turn_index:   g.current_turn_index ?? g.currentTurnIndex ?? 0,
      current_turn_player_id: g.current_turn_player_id
                              ?? g.currentTurnPlayerId
                              ?? g.current_player_id
                              ?? null,
      active_players:       g.active_players ?? g.activePlayers ?? null,
      total_moves:          g.total_moves ?? g.totalMoves ?? null,
    };
  }
}
