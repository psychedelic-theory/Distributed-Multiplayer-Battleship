// ==========================================================================
// ApiClient — universal, tolerant of snake_case and camelCase response shapes
// ==========================================================================

export class ApiError extends Error {
  constructor(message, { status = 0, body = null, endpoint = '' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.endpoint = endpoint;
  }
}

/**
 * Normalize keys — read either snake or camel, always return snake_case
 * (we expose snake_case to the rest of the app so there's one shape to code against).
 */
function pick(obj, ...keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined) return obj[k];
  }
  return undefined;
}

function normalizeStatus(status) {
  if (!status) return status;
  const s = String(status).toLowerCase();
  if (s === 'playing' || s === 'in_progress' || s === 'started' || s === 'ongoing') {
    return 'active';
  }
  if (s === 'done' || s === 'completed' || s === 'ended') {
    return 'finished';
  }
  return s;
}

function normalizeGame(g) {
  if (!g || typeof g !== 'object') return g;
  return {
    game_id:         pick(g, 'game_id', 'gameId', 'id'),
    grid_size:       pick(g, 'grid_size', 'gridSize'),
    status:          normalizeStatus(pick(g, 'status', 'state')),
    current_turn_index: pick(g, 'current_turn_index', 'currentTurnIndex'),
    current_turn_player_id: pick(g, 'current_turn_player_id', 'currentTurnPlayerId', 'current_player_id', 'currentPlayerId'),
    active_players:  pick(g, 'active_players', 'activePlayers', 'player_count', 'playerCount'),
    max_players:     pick(g, 'max_players', 'maxPlayers'),
    creator_id:      pick(g, 'creator_id', 'creatorId'),
    winner_id:       pick(g, 'winner_id', 'winnerId'),
    players:         pick(g, 'players'),
    created_at:      pick(g, 'created_at', 'createdAt'),
    _raw: g,
  };
}

function normalizePlayer(p) {
  if (!p || typeof p !== 'object') return p;
  return {
    player_id: pick(p, 'player_id', 'playerId', 'id'),
    username:  pick(p, 'username', 'name'),
    _raw: p,
  };
}

function normalizeStats(s) {
  if (!s || typeof s !== 'object') return s;
  return {
    games_played: pick(s, 'games_played', 'gamesPlayed') ?? 0,
    wins:         pick(s, 'wins') ?? 0,
    losses:       pick(s, 'losses') ?? 0,
    total_shots:  pick(s, 'total_shots', 'totalShots') ?? 0,
    total_hits:   pick(s, 'total_hits', 'totalHits') ?? 0,
    accuracy:     pick(s, 'accuracy') ?? 0,
    _raw: s,
  };
}

function normalizeMove(m) {
  if (!m || typeof m !== 'object') return m;
  return {
    player_id: pick(m, 'player_id', 'playerId'),
    row:       pick(m, 'row', 'r'),
    col:       pick(m, 'col', 'c', 'column'),
    result:    pick(m, 'result', 'outcome'),
    timestamp: pick(m, 'timestamp', 'time', 'created_at', 'createdAt'),
    _raw: m,
  };
}

function normalizeFireResult(r) {
  if (!r || typeof r !== 'object') return r;
  return {
    result:         pick(r, 'result', 'outcome'),
    next_player_id: pick(r, 'next_player_id', 'nextPlayerId'),
    game_status:    normalizeStatus(pick(r, 'game_status', 'gameStatus', 'status')),
    winner_id:      pick(r, 'winner_id', 'winnerId'),
    _raw: r,
  };
}

// --------------------------------------------------------------------------

export class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async _fetch(path, options = {}) {
    const url = this.baseUrl + path;
    const init = {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);

    let res;
    try {
      res = await fetch(url, init);
    } catch (err) {
      throw new ApiError(`Network error: ${err.message}`, { endpoint: path });
    }

    let body = null;
    const text = await res.text();
    if (text) {
      try { body = JSON.parse(text); }
      catch { body = { raw: text }; }
    }

    if (!res.ok) {
      const msg = (body && (body.error || body.message)) || `HTTP ${res.status}`;
      throw new ApiError(msg, { status: res.status, body, endpoint: path });
    }
    return body;
  }

  /** Quick health/probe — tries /api/games (a GET) or falls back. */
  async probe() {
    // Simplest reliable probe: attempt a non-destructive GET. If the server exposes
    // /api/games listing, great; otherwise the 404/405 response still tells us it's alive.
    try {
      const res = await fetch(this.baseUrl + '/api/games', { method: 'GET' });
      // Any response (even 404) means the server is reachable. Network error will throw above.
      return { ok: true, status: res.status };
    } catch (err) {
      throw new ApiError(`Cannot reach ${this.baseUrl}: ${err.message}`, { endpoint: '/api/games' });
    }
  }

  // ---------- Players ----------

  async createPlayer(username) {
    const body = await this._fetch('/api/players', { method: 'POST', body: { username } });
    return { player_id: pick(body, 'player_id', 'playerId', 'id'), _raw: body };
  }

  async getPlayer(playerId) {
    const body = await this._fetch(`/api/players/${playerId}`);
    return normalizePlayer(body);
  }

  async getPlayerByUsername(username) {
    const body = await this._fetch(
      `/api/players/by-username/${encodeURIComponent(username)}`
    );
    return normalizePlayer(body);
  }

  async getPlayerStats(playerId) {
    const body = await this._fetch(`/api/players/${playerId}/stats`);
    return normalizeStats(body);
  }

  // ---------- Games ----------

  async listGames() {
    // Some servers expose /api/games, others may not. Try it; if unavailable return [].
    try {
      const body = await this._fetch('/api/games');
      const list = Array.isArray(body) ? body : (pick(body, 'games') || []);
      return list.map(normalizeGame);
    } catch (err) {
      if (err.status === 404 || err.status === 405) return [];
      throw err;
    }
  }

  async createGame({ creator_id, grid_size, max_players }) {
    const body = await this._fetch('/api/games', {
      method: 'POST',
      body: { creator_id, grid_size, max_players },
    });
    return { game_id: pick(body, 'game_id', 'gameId', 'id'), _raw: body };
  }

  async joinGame(gameId, playerId) {
    return this._fetch(`/api/games/${gameId}/join`, {
      method: 'POST',
      body: { player_id: playerId },
    });
  }

  async getGame(gameId) {
    const body = await this._fetch(`/api/games/${gameId}`);
    return normalizeGame(body);
  }

  async placeShips(gameId, playerId, ships) {
    return this._fetch(`/api/games/${gameId}/place`, {
      method: 'POST',
      body: { player_id: playerId, ships },
    });
  }

  async fire(gameId, playerId, row, col) {
    const body = await this._fetch(`/api/games/${gameId}/fire`, {
      method: 'POST',
      body: { player_id: playerId, row, col },
    });
    return normalizeFireResult(body);
  }

  async getMoves(gameId) {
    const body = await this._fetch(`/api/games/${gameId}/moves`);
    const list = Array.isArray(body) ? body : (pick(body, 'moves') || []);
    return list.map(normalizeMove);
  }
}
