// ==========================================================================
// Game screen — gameplay with two boards, continuous polling.
//
// CRITICAL invariants (per HANDOFF.md, do NOT regress):
//   1. Poll continuously regardless of whose turn it is.
//   2. Compare by `current_turn_player_id`, NOT by index.
//   3. Opponent board hits/misses derived from /moves filtered to MY player_id.
//   4. Own board incoming hits derived from moves by OTHERS landing on myShips.
// ==========================================================================

import { h, mount } from '../utils/dom.js';
import { store } from '../state/store.js';
import { session } from '../state/session.js';
import { toast } from '../utils/toast.js';
import { Card } from '../../components/ui/Card.js';
import { Loader } from '../../components/ui/Loader.js';
import { TurnIndicator } from '../../components/ui/TurnIndicator.js';
import { StatPill } from '../../components/ui/StatPill.js';
import { Board } from '../../components/features/Board.js';
import { MoveLog } from '../../components/features/MoveLog.js';
import { formatAccuracy, coordLabel } from '../utils/format.js';

const POLL_INTERVAL_MS = 1500;

export function render(mountEl) {
  // ---- Local UI state ----
  let firing = false;            // lock during a fire request
  let moves = [];                // latest moves snapshot
  let playerNames = new Map();   // player_id -> username
  let lastShot = null;           // my most recent shot, for visual highlight
  let lastOpponentShot = null;   // most recent opponent shot, for own-board highlight

  const rerender = () => mount(mountEl, build());

  // ---- Player name lookup helper (cached) ----
  async function resolveName(playerId) {
    if (playerNames.has(playerId)) return playerNames.get(playerId);
    try {
      const client = session.getClient(store.get().serverUrl);
      const p = await client.getPlayer(playerId);
      const name = p.username || `Player ${playerId}`;
      playerNames.set(playerId, name);
      return name;
    } catch {
      const fallback = `Player ${playerId}`;
      playerNames.set(playerId, fallback);
      return fallback;
    }
  }

  function nameLookup(id) {
    return playerNames.get(id) || `Player ${id}`;
  }

  // ---- Derive board markers from moves ----

  /** My hits and misses on opponents (for opponent-board rendering). */
  function myShotsFromMoves(myId) {
    const hits = [];
    const misses = [];
    for (const m of moves) {
      if (m.player_id !== myId) continue;
      if (m.result === 'hit') hits.push({ row: m.row, col: m.col });
      else if (m.result === 'miss') misses.push({ row: m.row, col: m.col });
    }
    return { hits, misses };
  }

  /** Opponent shots on me (for own-board rendering).
   *  The API doesn't tell us which player was TARGETED by a move, so we have to infer.
   *  - HIT by an opponent that lands on one of my ships: definitely my board.
   *  - HIT by an opponent on a non-ship coord: must have been aimed at someone else (can't be here).
   *  - MISS by an opponent: can only be confidently placed on my board if this is a 2-player game.
   */
  // AFTER
function opponentShotsOnMe(myId) {
  const playerCount = store.get().game?.max_players ?? 2;
  const isTwoPlayer = Number(playerCount) <= 2;

  const hits = [];
  const misses = [];
  for (const m of moves) {
    if (m.player_id === myId) continue;
    if (m.result === 'hit') {
      // Server confirmed this as a hit — render it unconditionally.
      // We no longer cross-check against myShips because myShips may be
      // empty or stale, causing valid hits to be silently dropped.
      hits.push({ row: m.row, col: m.col });
    } else if (m.result === 'miss') {
      if (isTwoPlayer) misses.push({ row: m.row, col: m.col });
    }
  }
  const uniq = (arr) => {
    const seen = new Set();
    return arr.filter(c => { const k = `${c.row},${c.col}`; if (seen.has(k)) return false; seen.add(k); return true; });
  };
  return { hits: uniq(hits), misses: uniq(misses) };
}

  // ---- Turn resolver ----
  // Some servers return `current_turn_player_id`; others only return `current_turn_index`
  // plus a `players` list. Resolve robustly so the UI fireability check works either way.
  function resolveCurrentPlayerId(gameState) {
    if (!gameState) return null;
    if (gameState.current_turn_player_id != null) return gameState.current_turn_player_id;
    // Fall back to index + players list
    const idx = gameState.current_turn_index;
    const players = gameState.players;
    if (typeof idx === 'number' && Array.isArray(players) && players[idx] != null) {
      const p = players[idx];
      if (typeof p === 'object') return p.player_id ?? p.playerId ?? p.id ?? null;
      return p;
    }
    return null;
  }

  // ---- Fire action ----
  async function onOpponentCellClick(row, col) {
    if (firing) return;
    const { gameId, player } = store.get();
    const gameAtEntry = store.get().game;
    if (!gameId || !player || !gameAtEntry) return;

   // Guard: only fire on my turn (string-coerce for type-safety)
    const currentTurnPid = resolveCurrentPlayerId(gameAtEntry);
    if (String(currentTurnPid ?? '') !== String(player.player_id)) {
      toast.warn('Not your turn yet.');
      return;
    }

    firing = true;
    rerender();
    try {
      const client = session.getClient(store.get().serverUrl);
      const result = await client.fire(gameId, player.player_id, row, col);
      lastShot = { row, col };

      // Immediate feedback — optimistically add to moves; poll will reconcile.
      moves = [
        ...moves,
        { player_id: player.player_id, row, col, result: result.result, timestamp: new Date().toISOString() },
      ];

      if (result.result === 'hit') toast.success(`Hit! ${coordLabel(row, col)}`);
      else toast.info(`Miss. ${coordLabel(row, col)}`);

      // Re-read the latest game from store (polling may have updated it during the await).
      const latestGame = store.get().game || gameAtEntry;

      if (result.game_status === 'finished') {
        store.set({
          game: { ...latestGame, status: 'finished', winner_id: result.winner_id, current_turn_player_id: null },
        });
        session.stopPolling();
        store.set({ screen: 'end' });
        return;
      }

      // Update local game state with the next turn.
      // Only overwrite current_turn_player_id if the server actually returned one.
      const patch = {
        ...latestGame,
        status: result.game_status || latestGame.status,
      };
      if (result.next_player_id != null) {
        patch.current_turn_player_id = result.next_player_id;
      }
      store.set({ game: patch });
    } catch (err) {
      toast.error('Fire failed', err.message);
    } finally {
      firing = false;
      rerender();
    }
  }

  // ---- Polling loop ----
  async function pollOnce() {
    console.log('[poll] tick', new Date().toLocaleTimeString());
    const { gameId, player } = store.get();
    if (!gameId || !player) return;
    const client = session.getClient(store.get().serverUrl);

    const [rawGame, movesList] = await Promise.all([
      client.getGame(gameId),
      client.getMoves(gameId),
    ]);

    // Normalize: ensure current_turn_player_id is populated if only an index was returned.
    const game = { ...rawGame };
    if (game.current_turn_player_id == null) {
      const resolved = resolveCurrentPlayerId(game);
      if (resolved != null) game.current_turn_player_id = resolved;
    }

    // Capture what was visible before this poll so we can decide if a rerender
    // is actually needed. Rerendering on every poll (even when nothing changed)
    // tears down hover states and feels laggy during the opponent's turn.
    const prevMoveCount = moves.length;
    const prevStatus = store.get().game?.status;
    const prevTurnId = store.get().game?.current_turn_player_id;

    // Detect newly-arrived opponent shots to flash lastOpponentShot
    const prevOppMoves = moves.filter(m => m.player_id !== player.player_id);
    moves = movesList;
    const newOppMoves = movesList.filter(m => m.player_id !== player.player_id);
    if (newOppMoves.length > prevOppMoves.length) {
      lastOpponentShot = newOppMoves[newOppMoves.length - 1];
    }

    store.set({ game });

    // Resolve any unknown player names lazily
    const uniqueIds = new Set(movesList.map(m => m.player_id).filter(Boolean));
    for (const id of uniqueIds) {
      if (!playerNames.has(id)) {
        resolveName(id).then(() => rerender());
      }
    }

    if (game.status === 'finished') {
      session.stopPolling();
      store.set({ screen: 'end' });
      return;
    }

    // Only rerender if something the user would actually see changed:
    //  - a new move landed (affects move log + board markers)
    //  - the turn changed (affects turn indicator + board fireability)
    //  - the game status changed
    const moveCountChanged = movesList.length !== prevMoveCount;
    const turnChanged = String(game.current_turn_player_id ?? '') !== String(prevTurnId ?? '');
    const statusChanged = game.status !== prevStatus;
    if (moveCountChanged || turnChanged || statusChanged) {
      rerender();
    }
  }

  // ---- Build ----
  function build() {
    const { game, gameId, player, myShips } = store.get();

    if (!game || !player) {
      return h('div', { class: 'screen' }, Loader({ label: 'Loading game…', center: true }));
    }

    const gridSize = game.grid_size || 8;
    const myId = player.player_id;
    const turnPlayerId = resolveCurrentPlayerId(game);
    // String-coerce to survive servers returning IDs as either number or string.
    const isMyTurn = turnPlayerId != null && String(turnPlayerId) === String(myId);
    const turnPlayerName = isMyTurn
      ? player.username
      : (turnPlayerId != null ? nameLookup(turnPlayerId) : 'opponent');

    // Derive markers
    const myShots = myShotsFromMoves(myId);
    const oppShots = opponentShotsOnMe(myId);

    // Stats (session)
    const myMoves = moves.filter(m => m.player_id === myId);
    const myHitCount = myMoves.filter(m => m.result === 'hit').length;
    const myShotCount = myMoves.length;
    const sessionAcc = myShotCount > 0 ? (myHitCount / myShotCount) * 100 : 0;

    return h('div', { class: 'screen screen--wide fade-in' },
      h('div', { class: 'screen__header row-between' },
        h('div', {},
          h('h1', {}, `Game #${gameId}`),
          h('div', { class: 'subtitle' }, `${gridSize}×${gridSize} · ${game.active_players ?? '?'}/${game.max_players ?? '?'} players`),
        ),
        TurnIndicator({
          mode: game.status !== 'active' ? 'finished' : (isMyTurn ? 'mine' : 'theirs'),
          whoName: turnPlayerName,
        }),
      ),

      h('div', { class: 'game-screen' },
        // ---- Left/center: two boards ----
        h('div', { class: 'boards-region stagger' },
          Board({
            mode: 'own',
            gridSize,
            ships: myShips || [],
            hits: oppShots.hits,
            misses: oppShots.misses,
            lastShot: lastOpponentShot,
            ownerName: `${player.username} (you)`,
            role: 'Your fleet',
          }),
          Board({
            mode: 'opponent',
            gridSize,
            hits: myShots.hits,
            misses: myShots.misses,
            onCellClick: onOpponentCellClick,
            fireable: isMyTurn && !firing && game.status === 'active',
            lastShot,
            ownerName: 'Opponent',
            role: isMyTurn ? 'Fire at will' : 'Your target',
          }),
        ),

        // ---- Sidebar ----
        h('aside', { class: 'sidebar stagger' },
          Card({
            children: h('div', { class: 'stack' },
              h('h3', { class: 'card__title' }, 'This game'),
              h('div', { class: 'stats-row' },
                StatPill({ label: 'Shots', value: myShotCount }),
                StatPill({ label: 'Hits', value: myHitCount }),
                StatPill({ label: 'Accuracy', value: formatAccuracy(sessionAcc), small: true }),
              ),
            ),
          }),

          Card({
            children: h('div', { class: 'stack-sm' },
              h('div', { class: 'row-between' },
                h('h3', { class: 'card__title' }, 'Move log'),
                h('span', { style: { color: 'var(--color-text-mute)', fontSize: 'var(--fs-xs)', fontFamily: 'var(--font-mono)' } }, `${moves.length}`),
              ),
              MoveLog({ moves, nameLookup, maxItems: 40 }),
            ),
          }),
        ),
      ),
    );
  }

  // ---- Kickoff ----
  rerender();

  // Continuous polling — does NOT stop on opponent's turn.
  session.startPolling(pollOnce, POLL_INTERVAL_MS);
}
