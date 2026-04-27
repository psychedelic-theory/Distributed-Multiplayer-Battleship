// ==========================================================================
// Game screen — gameplay with two boards, continuous polling.
//
// CRITICAL invariants (per HANDOFF.md, do NOT regress):
//   1. Poll continuously regardless of whose turn it is.
//   2. Compare by `current_turn_player_id`, NOT by index.
//   3. Opponent board hits/misses derived from /moves filtered to MY player_id.
//   4. Own board incoming hits derived from moves by OTHERS landing on myShips.
//
// Hit detection fix (2024):
//   - opponentShotsOnMe() previously dropped opponent hits when myShips was
//     empty or incomplete (rejoin, late load, etc.) because it used a shipSet
//     lookup to confirm the coordinate before rendering the hit marker.
//   - Fix: in a 2-player game, any move by an opponent with result='hit' MUST
//     have landed on your board — there is no other target. We now render it
//     as a hit unconditionally, and only use shipSet to decide whether to ALSO
//     show the underlying ship cell beneath it (cosmetic, not functional).
//   - For N>2 player games we still use the shipSet to filter hits, but we no
//     longer silently drop them when myShips is empty. Instead we render all
//     opponent hits as hits and let the server be the source of truth.
//   - A myShips change listener triggers a rerender so a late-loaded ship list
//     (e.g. after a rejoin) immediately re-classifies all buffered moves.
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
  let firing = false;
  let moves = [];
  let playerNames = new Map();
  let lastShot = null;
  let lastOpponentShot = null;

  // Track the myShips value we last rendered with so we can detect changes.
  let lastMyShipsKey = '';

  const rerender = () => mount(mountEl, build());

  // ---- Player name lookup ----
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

  /** My hits and misses on opponents (for opponent-board rendering).
   *  Trusts m.result directly — no ship lookup needed here. */
  function myShotsFromMoves(myId) {
    const hits = [];
    const misses = [];
    for (const m of moves) {
      if (m.player_id !== myId) continue;
      if (m.result === 'hit')       hits.push({ row: m.row, col: m.col });
      else if (m.result === 'miss') misses.push({ row: m.row, col: m.col });
    }
    return { hits, misses };
  }

  /**
   * Opponent shots on me (for own-board rendering).
   *
   * FIX: We no longer gate hits behind a shipSet lookup. The server is the
   * authoritative source — if the server recorded result='hit' for a move made
   * by an opponent, that hit happened on someone's ship. In a 2-player game it
   * can only be my board, so we render it unconditionally. In N>2 games we
   * still use the shipSet to filter, BUT if myShips is empty we fall back to
   * showing all opponent hits rather than silently discarding them.
   *
   * The shipSet is still used for one cosmetic purpose: deciding whether to
   * show the underlying ship cell beneath a hit marker. That's handled by the
   * Board component's own-mode rendering which receives both `ships` and `hits`
   * separately — so even if shipSet is incomplete the hit marker still renders.
   */
  function opponentShotsOnMe(myId, myShips) {
    const playerCount = store.get().game?.max_players ?? 2;
    const isTwoPlayer = Number(playerCount) <= 2;
    const shipsKnown = myShips && myShips.length > 0;
    const shipSet = new Set(
      shipsKnown ? myShips.map(s => `${s.row},${s.col}`) : []
    );

    const hits = [];
    const misses = [];

    for (const m of moves) {
      if (m.player_id === myId) continue;
      const key = `${m.row},${m.col}`;

      if (m.result === 'hit') {
        if (isTwoPlayer) {
          // 2-player: every opponent hit MUST be on my board. Render it.
          hits.push({ row: m.row, col: m.col });
        } else {
          // N>2: use shipSet when available; fall back to showing all hits
          // rather than discarding when myShips hasn't loaded yet.
          if (!shipsKnown || shipSet.has(key)) {
            hits.push({ row: m.row, col: m.col });
          }
        }
      } else if (m.result === 'miss') {
        // Misses: only safe to show on my board in a 2-player game.
        // In N>2 we can't know which player was targeted by a miss.
        if (isTwoPlayer) {
          misses.push({ row: m.row, col: m.col });
        }
      }
    }

    // Deduplicate (multiple moves can reference the same cell in edge cases).
    const uniq = (arr) => {
      const seen = new Set();
      return arr.filter(c => {
        const k = `${c.row},${c.col}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    };

    return { hits: uniq(hits), misses: uniq(misses) };
  }

  // ---- Turn resolver ----
  function resolveCurrentPlayerId(gameState) {
    if (!gameState) return null;
    if (gameState.current_turn_player_id != null) return gameState.current_turn_player_id;
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

      // Optimistically append to moves; poll will reconcile.
      moves = [
        ...moves,
        {
          player_id: player.player_id,
          row,
          col,
          result: result.result,
          timestamp: new Date().toISOString(),
        },
      ];

      if (result.result === 'hit') toast.success(`Hit! ${coordLabel(row, col)}`);
      else toast.info(`Miss. ${coordLabel(row, col)}`);

      const latestGame = store.get().game || gameAtEntry;

      if (result.game_status === 'finished') {
        store.set({
          game: {
            ...latestGame,
            status: 'finished',
            winner_id: result.winner_id,
            current_turn_player_id: null,
          },
        });
        // Clean up persisted ships now that the game is over.
        store.clearShips(gameId, player.player_id);
        session.stopPolling();
        store.set({ screen: 'end' });
        return;
      }

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
    const { gameId, player } = store.get();
    if (!gameId || !player) return;
    const client = session.getClient(store.get().serverUrl);

    const [rawGame, movesList] = await Promise.all([
      client.getGame(gameId),
      client.getMoves(gameId),
    ]);

    const game = { ...rawGame };
    if (game.current_turn_player_id == null) {
      const resolved = resolveCurrentPlayerId(game);
      if (resolved != null) game.current_turn_player_id = resolved;
    }

    const prevMoveCount = moves.length;
    const prevStatus = store.get().game?.status;
    const prevTurnId = store.get().game?.current_turn_player_id;

    // Detect newly-arrived opponent shots to flash lastOpponentShot.
    const prevOppMoves = moves.filter(m => m.player_id !== player.player_id);
    moves = movesList;
    const newOppMoves = movesList.filter(m => m.player_id !== player.player_id);
    if (newOppMoves.length > prevOppMoves.length) {
      lastOpponentShot = newOppMoves[newOppMoves.length - 1];
    }

    store.set({ game });

    // Lazily resolve any unknown player names.
    const uniqueIds = new Set(movesList.map(m => m.player_id).filter(Boolean));
    for (const id of uniqueIds) {
      if (!playerNames.has(id)) {
        resolveName(id).then(() => rerender());
      }
    }

    if (game.status === 'finished') {
      store.clearShips(gameId, player.player_id);
      session.stopPolling();
      store.set({ screen: 'end' });
      return;
    }

    const moveCountChanged  = movesList.length !== prevMoveCount;
    const turnChanged       = String(game.current_turn_player_id ?? '') !== String(prevTurnId ?? '');
    const statusChanged     = game.status !== prevStatus;

    if (moveCountChanged || turnChanged || statusChanged) {
      rerender();
    }
  }

  // ---- myShips change watcher ----
  // If myShips loads or changes after the initial render (e.g. rejoin flow
  // completes asynchronously), we need to rerender so the board re-classifies
  // all buffered moves with the correct ship positions.
  function myShipsKey(ships) {
    if (!ships || ships.length === 0) return '';
    return ships.map(s => `${s.row},${s.col}`).sort().join('|');
  }

  const unsubscribe = store.subscribe(state => {
    const newKey = myShipsKey(state.myShips);
    if (newKey !== lastMyShipsKey) {
      lastMyShipsKey = newKey;
      rerender();
    }
  });

  // ---- Build ----
  function build() {
    const { game, gameId, player, myShips } = store.get();

    // Update the tracked key so the watcher doesn't immediately re-trigger.
    lastMyShipsKey = myShipsKey(myShips);

    if (!game || !player) {
      return h('div', { class: 'screen' }, Loader({ label: 'Loading game…', center: true }));
    }

    const gridSize = game.grid_size || 8;
    const myId = player.player_id;
    const turnPlayerId = resolveCurrentPlayerId(game);
    const isMyTurn = turnPlayerId != null && String(turnPlayerId) === String(myId);
    const turnPlayerName = isMyTurn
      ? player.username
      : (turnPlayerId != null ? nameLookup(turnPlayerId) : 'opponent');

    const myShots  = myShotsFromMoves(myId);
    const oppShots = opponentShotsOnMe(myId, myShips || []);

    const myMoves    = moves.filter(m => m.player_id === myId);
    const myHitCount = myMoves.filter(m => m.result === 'hit').length;
    const myShotCount = myMoves.length;
    const sessionAcc = myShotCount > 0 ? (myHitCount / myShotCount) * 100 : 0;

    return h('div', { class: 'screen screen--wide fade-in' },
      h('div', { class: 'screen__header row-between' },
        h('div', {},
          h('h1', {}, `Game #${gameId}`),
          h('div', { class: 'subtitle' },
            `${gridSize}×${gridSize} · ${game.active_players ?? '?'}/${game.max_players ?? '?'} players`,
          ),
        ),
        TurnIndicator({
          mode: game.status !== 'active' ? 'finished' : (isMyTurn ? 'mine' : 'theirs'),
          whoName: turnPlayerName,
        }),
      ),

      h('div', { class: 'game-screen' },
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

        h('aside', { class: 'sidebar stagger' },
          Card({
            children: h('div', { class: 'stack' },
              h('h3', { class: 'card__title' }, 'This game'),
              h('div', { class: 'stats-row' },
                StatPill({ label: 'Shots', value: myShotCount }),
                StatPill({ label: 'Hits',  value: myHitCount }),
                StatPill({ label: 'Accuracy', value: formatAccuracy(sessionAcc), small: true }),
              ),
            ),
          }),

          Card({
            children: h('div', { class: 'stack-sm' },
              h('div', { class: 'row-between' },
                h('h3', { class: 'card__title' }, 'Move log'),
                h('span', {
                  style: {
                    color: 'var(--color-text-mute)',
                    fontSize: 'var(--fs-xs)',
                    fontFamily: 'var(--font-mono)',
                  },
                }, `${moves.length}`),
              ),
              MoveLog({ moves, nameLookup, maxItems: 40 }),
            ),
          }),
        ),
      ),
    );
  }

  // ---- Kickoff ----
  // Seed the initial myShips key before the first render.
  lastMyShipsKey = myShipsKey(store.get().myShips);

  rerender();
  session.startPolling(pollOnce, POLL_INTERVAL_MS);

  // Clean up the store subscription when the screen unmounts.
  // main.js calls session.stopPolling() on screen transitions; we piggyback
  // cleanup here by hooking the store subscriber to detect screen changes.
  const cleanupSub = store.subscribe(state => {
    if (state.screen !== 'game') {
      unsubscribe();
      cleanupSub();
    }
  });
}